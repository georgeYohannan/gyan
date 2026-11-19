// Supabase server function: translates one note's summary or transcript into another language.
// Runs on Supabase's servers, so the Anthropic key never reaches the app.
// The key is the same one the summary and the chat use (ANTHROPIC_API_KEY), set in prompt 6.
// Nothing new to set up.
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  MESSAGES,
  messageForStatus,
  SUMMARY_TRANSLATION_SCHEMA,
  TRANSCRIPT_TRANSLATION_SCHEMA,
  TRANSLATE_KINDS,
  TranslateError,
  type TranslateKind,
} from './translate.ts';
import { runTranslate, TranslateNotAllowedError, type Ask, type Reply } from './pipeline.ts';
import {
  CLAUDE_EFFORT,
  CLAUDE_MAX_TOKENS,
  CLAUDE_MODEL,
  MAX_TRANSCRIPT_TOKENS,
  USD_PER_MTOK_IN,
  USD_PER_MTOK_OUT,
  USE_REFUSAL_FALLBACK,
} from './settings.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const BUCKET = 'notes-files';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Supabase gives keys either as one plain value (older) or as a small JSON list (newer). */
function pickKey(plainName: string, jsonName: string): string | undefined {
  const plain = Deno.env.get(plainName);
  if (plain) return plain;
  try {
    return JSON.parse(Deno.env.get(jsonName) ?? '{}').default;
  } catch {
    return undefined;
  }
}

const UUID = /^[0-9a-f-]{36}$/i;
/** 'en', 'pt-BR'. Short on purpose: the picker only ever sends a code from our own list. */
const LANGUAGE_CODE = /^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/;

/**
 * The request we send Claude. The same one is used for the real call and for counting tokens first.
 * No prompt caching here: a translation is paid for once and then saved for good, so there is
 * never a second request with the same words to save money on.
 */
function requestFor(ask: Ask) {
  return {
    model: CLAUDE_MODEL,
    system: ask.system,
    messages: [{ role: 'user' as const, content: ask.content }],
  };
}

/** Turns an Anthropic problem into a plain message a person can read. */
function toTranslateError(e: unknown): Error {
  if (e instanceof Anthropic.APIError && typeof e.status === 'number') {
    return new TranslateError(messageForStatus(e.status));
  }
  if (e instanceof Anthropic.APIConnectionError) return new TranslateError(MESSAGES.busy);
  return e instanceof Error ? e : new TranslateError(MESSAGES.unknown);
}

/**
 * Asks Claude to translate. The answer is held to a strict shape, so the app always gets a list of
 * the same length it sent and can line each translated piece up with its original.
 */
function makeCaller(client: Anthropic) {
  return async function call(ask: Ask): Promise<Reply> {
    const base = {
      ...requestFor(ask),
      max_tokens: CLAUDE_MAX_TOKENS,
      output_config: {
        effort: CLAUDE_EFFORT,
        format: {
          type: 'json_schema' as const,
          schema: ask.kind === 'summary' ? SUMMARY_TRANSLATION_SCHEMA : TRANSCRIPT_TRANSLATION_SCHEMA,
        },
      },
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
      throw toTranslateError(e);
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = pickKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
  const secretKey = pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !publicKey || !secretKey) return reply({ error: 'server_not_set_up' }, 500);
  if (!authHeader) return reply({ error: 'not_signed_in' }, 401);

  let body: { meeting_id?: string; kind?: string; language?: string } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* handled below */
  }

  if (!body.meeting_id || !UUID.test(body.meeting_id)) return reply({ error: 'bad_request' }, 400);
  if (!body.kind || !TRANSLATE_KINDS.includes(body.kind as TranslateKind)) return reply({ error: 'bad_request' }, 400);
  if (!body.language || !LANGUAGE_CODE.test(body.language)) return reply({ error: 'bad_request' }, 400);

  // 1. Who is calling? Ask with THEIR login, so the database rules decide what they may see.
  const asUser = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await asUser.auth.getUser();
  if (authError || !auth.user) return reply({ error: 'not_signed_in' }, 401);

  // 2. The note must be one this person can really see, under their own login.
  const { data: visible } = await asUser.from('meetings').select('id').eq('id', body.meeting_id).maybeSingle();
  if (!visible) return reply({ error: 'not_allowed' }, 403);

  // 3. No key means Gyan cannot translate at all. Say so in plain words rather than hanging.
  if (!anthropicKey) return reply({ ok: false, message: MESSAGES.notSetUp });

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const client = new Anthropic({ apiKey: anthropicKey });

  // 4. Translate. The app is waiting, so this is not sent to the background.
  try {
    const result = await runTranslate({
      admin,
      meetingId: body.meeting_id,
      userId: auth.user.id,
      kind: body.kind as TranslateKind,
      language: body.language,
      bucket: BUCKET,
      maxTranscriptTokens: MAX_TRANSCRIPT_TOKENS,
      usdPerMtokIn: USD_PER_MTOK_IN,
      usdPerMtokOut: USD_PER_MTOK_OUT,
      call: makeCaller(client),
      countTokens: makeCounter(client),
    });
    return reply({ ok: true, ...result });
  } catch (e) {
    if (e instanceof TranslateNotAllowedError) return reply({ error: 'not_allowed' }, 403);
    // Log the KIND of problem only. Never log the key or the words of the meeting.
    console.error('translation failed for note', body.meeting_id, e instanceof Error ? e.name : 'error');
    const message = e instanceof TranslateError ? e.message : MESSAGES.unknown;
    return reply({ ok: false, message });
  }
});
