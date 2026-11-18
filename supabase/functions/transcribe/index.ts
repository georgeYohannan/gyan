// Supabase server function: turns an uploaded audio file into a transcript with speakers.
// Runs on Supabase's servers, so the Deepgram key never reaches the app.
// Set the key once with:  supabase secrets set DEEPGRAM_API_KEY=...   (see docs/testing/prompt-5.md)
import { createClient } from 'npm:@supabase/supabase-js@2';

import { runTranscription } from './pipeline.ts';
import { DEEPGRAM_MODEL, DEEPGRAM_USD_PER_MINUTE, SIGNED_LINK_SECONDS } from './settings.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = pickKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
  const secretKey = pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !publicKey || !secretKey || !deepgramKey) return reply({ error: 'server_not_set_up' }, 500);
  if (!authHeader) return reply({ error: 'not_signed_in' }, 401);

  let meetingId: string | undefined;
  try {
    meetingId = (await req.json())?.meeting_id;
  } catch {
    /* handled below */
  }
  if (!meetingId || !/^[0-9a-f-]{36}$/i.test(meetingId)) return reply({ error: 'bad_request' }, 400);

  // 1. Who is calling? Ask with THEIR login, so the database rules decide what they may see.
  const asUser = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await asUser.auth.getUser();
  if (authError || !auth.user) return reply({ error: 'not_signed_in' }, 401);
  const { data: visible } = await asUser.from('meetings').select('id').eq('id', meetingId).maybeSingle();
  if (!visible) return reply({ error: 'not_allowed' }, 403);

  // 2. Take the note: Queued (or Failed, for a retry) -> Transcribing. Only one run can win.
  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const { data: claimed, error: claimError } = await admin
    .rpc('claim_transcription', { p_meeting_id: meetingId, p_user_id: auth.user.id })
    .single<{ file_path: string }>();
  if (claimError || !claimed) {
    const m = claimError?.message ?? '';
    if (m.includes('wrong_status')) return reply({ error: 'already_started' }, 409);
    if (m.includes('limit_reached')) return reply({ error: 'limit_reached' }, 402);
    if (m.includes('no_audio')) return reply({ error: 'no_audio' }, 400);
    return reply({ error: 'not_allowed' }, 403);
  }

  // 3. Do the slow work in the background, so the app does not have to wait.
  const noteId = meetingId;
  const work = runTranscription({
    admin,
    meetingId,
    filePath: claimed.file_path,
    deepgramKey,
    model: DEEPGRAM_MODEL,
    usdPerMinute: DEEPGRAM_USD_PER_MINUTE,
    bucket: BUCKET,
    signedLinkSeconds: SIGNED_LINK_SECONDS,
    // When the transcript is done, the summary step carries on by itself, using the same login.
    startSummary: async () => {
      await fetch(`${url}/functions/v1/summarize`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_id: noteId }),
      });
    },
  });
  EdgeRuntime.waitUntil(work);

  return reply({ status: 'transcribing' }, 202);
});
