// Supabase server function: answers one question about one note, from that note's transcript only.
// Runs on Supabase's servers, so the Anthropic key never reaches the app.
// The key is the same one the summary uses (ANTHROPIC_API_KEY), set in prompt 6. Nothing new.
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { RATE_LIMIT_MESSAGE, RateLimited, UUID, corsFor, pickKey, underRateLimit } from '../_shared/guard.ts';
import { runAsk, type AskCandidate } from './ask-pipeline.ts';
import { ChatError, MESSAGES, messageForStatus } from './chat.ts';
import { runChat, type Ask, type Reply } from './pipeline.ts';
import {
  CLAUDE_EFFORT,
  MAX_ASK_NOTES,
  CLAUDE_MAX_TOKENS,
  CLAUDE_MODEL,
  MAX_HISTORY_MESSAGES,
  MAX_INPUT_TOKENS,
  USD_PER_MTOK_CACHE_READ,
  USD_PER_MTOK_IN,
  USD_PER_MTOK_OUT,
  USE_REFUSAL_FALLBACK,
} from './settings.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const BUCKET = 'notes-files';

const MAX_QUESTION_LENGTH = 1000;

/**
 * The request we send Claude. Same for the real call and for counting tokens first.
 * The passages sit in the system half and are marked as worth remembering, so a follow-up question
 * about the same note does not pay full price for the transcript again.
 */
function requestFor(ask: Ask) {
  return {
    model: CLAUDE_MODEL,
    system: [{ type: 'text' as const, text: ask.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [
      ...ask.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: ask.question },
    ],
  };
}

/** Turns an Anthropic problem into a plain message a person can read. */
function toChatError(e: unknown): Error {
  if (e instanceof Anthropic.APIError && typeof e.status === 'number') {
    return new ChatError(messageForStatus(e.status));
  }
  if (e instanceof Anthropic.APIConnectionError) return new ChatError(MESSAGES.busy);
  return e instanceof Error ? e : new ChatError(MESSAGES.unknown);
}

/** Asks Claude the question. Claude Sonnet 5.5 thinks by default, so only the effort is set. */
function makeCaller(client: Anthropic) {
  return async function call(ask: Ask): Promise<Reply> {
    const base = {
      ...requestFor(ask),
      max_tokens: CLAUDE_MAX_TOKENS,
      output_config: { effort: CLAUDE_EFFORT },
    };
    try {
      // With the fallback on, a rare safety decline is retried on another model inside this call.
      const res = USE_REFUSAL_FALLBACK
        ? await client.beta.messages.create({
            ...base,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          })
        : await client.messages.create(base);

      const text = (res.content ?? [])
        .filter((block: { type: string }) => block.type === 'text')
        .map((block: { text: string }) => block.text)
        .join('');
      return {
        text,
        refused: res.stop_reason === 'refusal',
        tokensIn: res.usage?.input_tokens ?? 0,
        cachedTokensIn: (res.usage?.cache_read_input_tokens ?? 0) + (res.usage?.cache_creation_input_tokens ?? 0),
        tokensOut: res.usage?.output_tokens ?? 0,
      };
    } catch (e) {
      throw toChatError(e);
    }
  };
}

/** Counts the tokens of a request before we send it, so a huge note is refused, never cut short. */
function makeCounter(client: Anthropic) {
  return async function countTokens(ask: Ask): Promise<number> {
    try {
      const res = await client.messages.countTokens(requestFor(ask));
      return res.input_tokens ?? 0;
    } catch {
      // If counting is not available, let the request itself decide. We still never cut text off.
      return 0;
    }
  };
}

/** What claim_chat_message and claim_chat_retry both hand back. */
type Claimed = {
  thread_id: string;
  message_id: string;
  account_id: string;
  language: string;
  remaining: number;
  meeting_id?: string;
  question?: string;
};

Deno.serve(async (req) => {
  // Which websites may read the answer is decided per request now, not handed out to
  // everybody with a star. A phone sends no Origin and is answered as before.
  const cors = corsFor(req);
  const reply = (body: Record<string, unknown>, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = pickKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
  const secretKey = pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !publicKey || !secretKey) return reply({ error: 'server_not_set_up' }, 500);
  if (!authHeader) return reply({ error: 'not_signed_in' }, 401);

  let body: { meeting_id?: string; question?: string; retry_message_id?: string; scope?: string } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* handled below */
  }

  // Two jobs through one door. 'all' is the Ask destination: one question answered from
  // several notes at once. Anything else is the side chat on one note, exactly as before.
  // It is an explicit word rather than "no meeting_id was sent", because a missing id is
  // far more likely to be a mistake than a request to read somebody's whole account.
  const allNotes = body.scope === 'all';

  const isRetry = typeof body.retry_message_id === 'string';
  if (isRetry) {
    if (!UUID.test(body.retry_message_id!)) return reply({ error: 'bad_request' }, 400);
  } else {
    if (!allNotes && (!body.meeting_id || !UUID.test(body.meeting_id))) return reply({ error: 'bad_request' }, 400);
    if (typeof body.question !== 'string' || body.question.trim() === '') return reply({ error: 'bad_request' }, 400);
    if (body.question.length > MAX_QUESTION_LENGTH) return reply({ error: 'question_too_long' }, 400);
  }

  // 1. Who is calling? Ask with THEIR login, so the database rules decide what they may see.
  const asUser = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await asUser.auth.getUser();
  if (authError || !auth.user) return reply({ error: 'not_signed_in' }, 401);

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // ---------------------------------------------------------------------------
  // THE ASK DESTINATION: one question, answered from several notes at once.
  // ---------------------------------------------------------------------------
  // It is its own path from here down rather than more branches inside the per-note path,
  // because almost nothing is shared: a different claim, a different thread, a different way
  // of finding the words, and a different prompt. What IS shared is everything that matters --
  // the model settings, the fence around words somebody said, the citation reader and the cost
  // sum all come from the same files the side chat uses.
  if (allNotes) {
    let claimed: Claimed;
    let accountId: string | null = null;

    if (isRetry) {
      const { data, error } = await admin
        .rpc('claim_ask_retry', { p_message_id: body.retry_message_id, p_user_id: auth.user.id })
        .single<Claimed>();
      // claim_ask_retry refuses a thread that is not the caller's own, and refuses a thread
      // that belongs to ONE note -- so a note chat's message cannot be retried through here.
      if (error || !data) return reply({ error: 'not_allowed' }, 403);
      claimed = data;
      accountId = claimed.account_id;

      try {
        await underRateLimit(admin, 'chat', auth.user.id, accountId);
      } catch (e) {
        if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
        throw e;
      }
    } else {
      // There is no note to take the account from, so find it under the person's OWN login:
      // the account they own if they own one, else the first they are on. The same choice
      // getUsage() makes in the app, and claim_ask_message makes again in SQL.
      const { data: mine } = await asUser
        .from('account_members')
        .select('account_id, role')
        .eq('user_id', auth.user.id)
        .order('role', { ascending: false })
        .limit(1);
      accountId = ((mine ?? [])[0] as { account_id?: string } | undefined)?.account_id ?? null;
      if (!accountId) return reply({ error: 'not_allowed' }, 403);

      // The hourly limit is checked BEFORE the question is saved, so being turned away here
      // does not spend one of the day's questions.
      try {
        await underRateLimit(admin, 'chat', auth.user.id, accountId);
      } catch (e) {
        if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
        throw e;
      }

      const { data, error } = await admin
        .rpc('claim_ask_message', { p_user_id: auth.user.id, p_question: body.question })
        .single<Claimed>();
      if (error || !data) {
        const m = error?.message ?? '';
        if (m.includes('limit_reached')) return reply({ error: 'limit_reached', message: MESSAGES.limit }, 402);
        if (m.includes('empty_question')) return reply({ error: 'bad_request' }, 400);
        return reply({ error: 'not_allowed' }, 403);
      }
      claimed = data;
    }

    const question = isRetry ? claimed.question! : body.question!;

    if (!anthropicKey) {
      return reply({ ok: false, message: MESSAGES.notSetUp, message_id: claimed.message_id, remaining: claimed.remaining });
    }

    const client = new Anthropic({ apiKey: anthropicKey });
    try {
      const { answer, sources } = await runAsk({
        admin,
        threadId: claimed.thread_id,
        accountId: claimed.account_id,
        bucket: BUCKET,
        question,
        language: claimed.language,
        maxNotes: MAX_ASK_NOTES,
        maxInputTokens: MAX_INPUT_TOKENS,
        maxHistoryMessages: MAX_HISTORY_MESSAGES,
        usdPerMtokIn: USD_PER_MTOK_IN,
        usdPerMtokOut: USD_PER_MTOK_OUT,
        usdPerMtokCacheRead: USD_PER_MTOK_CACHE_READ,
        // WHICH NOTES: asked as the PERSON, never with the server key, so the same Row Level
        // Security rule that guards the notes list guards what a question can reach.
        findNotes: async (asked, limit) => {
          const { data, error } = await asUser.rpc('find_ask_notes', { p_question: asked, p_limit: limit });
          if (error) throw new ChatError(MESSAGES.unknown);
          return (data ?? []) as AskCandidate[];
        },
        call: makeCaller(client),
        countTokens: makeCounter(client),
      });
      return reply({ ok: true, answer, sources, remaining: claimed.remaining, message_id: claimed.message_id });
    } catch (e) {
      // The KIND of problem only. Never the key, the question, or the words of a meeting.
      console.error('ask failed', e instanceof Error ? e.name : 'error');
      const message = e instanceof ChatError ? e.message : MESSAGES.unknown;
      return reply({ ok: false, message, message_id: claimed.message_id, remaining: claimed.remaining });
    }
  }

  // 2. Take a question: check the person may use the note, check today's limit, and save the
  // question. All in one database step, so two fast taps cannot slip past the limit.
  let claimed: Claimed | null = null;
  let accountId: string | null = null;
  if (isRetry) {
    const { data, error } = await admin
      .rpc('claim_chat_retry', { p_message_id: body.retry_message_id, p_user_id: auth.user.id })
      .single<Claimed>();
    if (error || !data) return reply({ error: 'not_allowed' }, 403);
    claimed = data;

    // SECOND LOCK ON THE RETRY PATH. claim_chat_retry does check in SQL that the chat
    // belongs to the person asking, and that check is correct. But this was the one place
    // where an id chosen by the caller went to the SERVER key with only one lock on it,
    // while the path right below it had two. So the note the retry points at is now also
    // checked under the person's OWN login, exactly as a new question is.
    const { data: visible } = await asUser
      .from('meetings')
      .select('id, account_id')
      .eq('id', claimed.meeting_id!)
      .maybeSingle();
    if (!visible) return reply({ error: 'not_allowed' }, 403);
    accountId = (visible as { account_id?: string }).account_id ?? null;

    // A retry used to be FREE and unlimited: claim_chat_retry reuses the question that is
    // already saved, so it never touched the daily allowance, yet every go paid Claude
    // again. The hourly limit now covers it.
    try {
      await underRateLimit(admin, 'chat', auth.user.id, accountId);
    } catch (e) {
      if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
      throw e;
    }
  } else {
    // The note must be one this person can really see, under their own login.
    const { data: visible } = await asUser
      .from('meetings')
      .select('id, account_id')
      .eq('id', body.meeting_id!)
      .maybeSingle();
    if (!visible) return reply({ error: 'not_allowed' }, 403);
    accountId = (visible as { account_id?: string }).account_id ?? null;

    try {
      await underRateLimit(admin, 'chat', auth.user.id, accountId);
    } catch (e) {
      if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
      throw e;
    }

    const { data, error } = await admin
      .rpc('claim_chat_message', {
        p_meeting_id: body.meeting_id,
        p_user_id: auth.user.id,
        p_question: body.question,
      })
      .single<Claimed>();
    if (error || !data) {
      const m = error?.message ?? '';
      if (m.includes('limit_reached')) return reply({ error: 'limit_reached', message: MESSAGES.limit }, 402);
      if (m.includes('empty_question')) return reply({ error: 'bad_request' }, 400);
      return reply({ error: 'not_allowed' }, 403);
    }
    claimed = data;
  }

  const meetingId = isRetry ? claimed.meeting_id! : body.meeting_id!;
  const question = isRetry ? claimed.question! : body.question!;

  // 3. No key means Gyan cannot answer at all. Say so in plain words rather than hanging.
  if (!anthropicKey) {
    return reply({ ok: false, message: MESSAGES.notSetUp, message_id: claimed.message_id, remaining: claimed.remaining });
  }

  // 4. The note's title and date go into every passage line.
  const { data: note } = await admin
    .from('meetings')
    .select('title, source, created_at, file_path')
    .eq('id', meetingId)
    .maybeSingle<{ title: string | null; source: string; created_at: string; file_path: string | null }>();
  const noteTitle = note?.title?.trim() || (note?.source === 'text' ? 'Pasted text' : 'Untitled note');

  // 5. Answer the question. The app is waiting, so this is not sent to the background.
  const client = new Anthropic({ apiKey: anthropicKey });
  try {
    const { answer, sources } = await runChat({
      admin,
      meetingId,
      threadId: claimed.thread_id,
      accountId: claimed.account_id,
      source: note?.source ?? 'upload',
      filePath: note?.file_path ?? null,
      bucket: BUCKET,
      noteTitle,
      noteDate: note?.created_at ?? null,
      question,
      language: claimed.language,
      maxInputTokens: MAX_INPUT_TOKENS,
      maxHistoryMessages: MAX_HISTORY_MESSAGES,
      usdPerMtokIn: USD_PER_MTOK_IN,
      usdPerMtokOut: USD_PER_MTOK_OUT,
      usdPerMtokCacheRead: USD_PER_MTOK_CACHE_READ,
      call: makeCaller(client),
      countTokens: makeCounter(client),
    });
    return reply({ ok: true, answer, sources, remaining: claimed.remaining, message_id: claimed.message_id });
  } catch (e) {
    // Log the KIND of problem only. Never log the key, the question, or the words of the meeting.
    console.error('chat failed for note', meetingId, e instanceof Error ? e.name : 'error');
    const message = e instanceof ChatError ? e.message : MESSAGES.unknown;
    return reply({ ok: false, message, message_id: claimed.message_id, remaining: claimed.remaining });
  }
});
