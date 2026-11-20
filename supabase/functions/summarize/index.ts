// Supabase server function: writes the summary and the action items for one note.
// Runs on Supabase's servers, so the Anthropic key never reaches the app.
// Set the key once with:  supabase secrets set ANTHROPIC_API_KEY=...   (see docs/testing/prompt-6.md)
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { RATE_LIMIT_MESSAGE, RateLimited, UUID, corsFor, pickKey, underRateLimit } from '../_shared/guard.ts';
import { messageForStatus, SUMMARY_SCHEMA, SummaryError, MESSAGES } from './claude.ts';
import { runSummary, type Ask, type Reply } from './pipeline.ts';
import {
  CLAUDE_EFFORT,
  CLAUDE_MAX_TOKENS,
  CLAUDE_MODEL,
  MAX_INPUT_TOKENS,
  USD_PER_MTOK_IN,
  USD_PER_MTOK_OUT,
  USE_REFUSAL_FALLBACK,
} from './settings.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const BUCKET = 'notes-files';

/** The request we send Claude. Same for the real call and for counting tokens first. */
function requestFor(ask: Ask) {
  return {
    model: CLAUDE_MODEL,
    system: ask.system,
    messages: [{ role: 'user' as const, content: ask.user }],
  };
}

/** Turns an Anthropic problem into a plain message a person can read. */
function toSummaryError(e: unknown): Error {
  if (e instanceof Anthropic.APIError && typeof e.status === 'number') {
    return new SummaryError(messageForStatus(e.status));
  }
  if (e instanceof Anthropic.APIConnectionError) return new SummaryError(MESSAGES.busy);
  return e instanceof Error ? e : new SummaryError(MESSAGES.unknown);
}

/** Asks Claude for the summary, in the strict shape from claude.ts. */
function makeCaller(client: Anthropic) {
  return async function call(ask: Ask): Promise<Reply> {
    const base = {
      ...requestFor(ask),
      max_tokens: CLAUDE_MAX_TOKENS,
      // effort sets how hard the model thinks; format makes it answer in our exact shape.
      output_config: { effort: CLAUDE_EFFORT, format: { type: 'json_schema' as const, schema: SUMMARY_SCHEMA } },
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
        tokensIn: (res.usage?.input_tokens ?? 0) + (res.usage?.cache_read_input_tokens ?? 0),
        tokensOut: res.usage?.output_tokens ?? 0,
      };
    } catch (e) {
      throw toSummaryError(e);
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
  // The Anthropic key is checked AFTER the note is claimed, further down. That way a note never
  // sits on Summarizing forever when the key is missing: it fails with a message a person can read.
  if (!url || !publicKey || !secretKey) return reply({ error: 'server_not_set_up' }, 500);
  if (!authHeader) return reply({ error: 'not_signed_in' }, 401);

  let meetingId: string | undefined;
  try {
    meetingId = (await req.json())?.meeting_id;
  } catch {
    /* handled below */
  }
  // The old check here was /^[0-9a-f-]{36}$/i, which accepted thirty-six dashes.
  if (!meetingId || !UUID.test(meetingId)) return reply({ error: 'bad_request' }, 400);

  // 1. Who is calling? Ask with THEIR login, so the database rules decide what they may see.
  const asUser = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await asUser.auth.getUser();
  if (authError || !auth.user) return reply({ error: 'not_signed_in' }, 401);
  // The account comes back from the same question, so counting the limit per account as
  // well as per person costs nothing extra.
  const { data: visible } = await asUser
    .from('meetings')
    .select('id, account_id')
    .eq('id', meetingId)
    .maybeSingle();
  if (!visible) return reply({ error: 'not_allowed' }, 403);
  const accountId = (visible as { account_id?: string }).account_id ?? null;

  // 2. Take the note -> Summarizing. Only one run can win, so we never pay for two summaries.
  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // Has this person had their turn for the hour? Counted BEFORE anything is spent. Every
  // number comes from the security_settings table, never from this file.
  try {
    await underRateLimit(admin, 'summarize', auth.user.id, accountId);
  } catch (e) {
    if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
    throw e;
  }
  const { data: claimed, error: claimError } = await admin
    .rpc('claim_summary', { p_meeting_id: meetingId, p_user_id: auth.user.id })
    .single<{ source: string; file_path: string | null; language: string }>();
  if (claimError || !claimed) {
    const m = claimError?.message ?? '';
    if (m.includes('wrong_status')) return reply({ error: 'already_started' }, 409);
    if (m.includes('limit_reached')) return reply({ error: 'limit_reached' }, 402);
    if (m.includes('no_transcript')) return reply({ error: 'no_transcript' }, 400);
    return reply({ error: 'not_allowed' }, 403);
  }

  // 3. No key means Gyan cannot write summaries at all. Say so on the note, rather than leaving
  // it on Summarizing with nothing happening. A failed note is never counted.
  if (!anthropicKey) {
    await admin.rpc('fail_summary', { p_meeting_id: meetingId, p_message: MESSAGES.notSetUp });
    return reply({ error: 'server_not_set_up' }, 500);
  }

  // 4. Do the slow work in the background, so the app does not have to wait.
  const client = new Anthropic({ apiKey: anthropicKey });
  const work = runSummary({
    admin,
    meetingId,
    source: claimed.source,
    filePath: claimed.file_path,
    language: claimed.language,
    bucket: BUCKET,
    maxInputTokens: MAX_INPUT_TOKENS,
    usdPerMtokIn: USD_PER_MTOK_IN,
    usdPerMtokOut: USD_PER_MTOK_OUT,
    call: makeCaller(client),
    countTokens: makeCounter(client),
    // 5. The note is now Ready, so hand it to the recap function. That function decides whether
    // anybody is actually emailed: it checks the account's own settings, and it refuses to send
    // twice for the same note, so Regenerate can never email everybody again.
    onReady: async () => {
      await admin.functions.invoke('recap', { body: { meeting_id: meetingId, auto: true } });
    },
  });
  EdgeRuntime.waitUntil(work);

  return reply({ status: 'summarizing' }, 202);
});
