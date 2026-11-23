// Supabase server function: turns an uploaded audio file into a transcript with speakers.
// Runs on Supabase's servers, so the Deepgram key never reaches the app.
// Set the key once with:  supabase secrets set DEEPGRAM_API_KEY=...   (see docs/testing/prompt-5.md)
import { createClient } from 'npm:@supabase/supabase-js@2';

import { SNIFF_BYTES } from '../_shared/filetype.ts';
import { RATE_LIMIT_MESSAGE, RateLimited, UUID, corsFor, pickKey, underRateLimit } from '../_shared/guard.ts';
import { runTranscription } from './pipeline.ts';
import { DEEPGRAM_MODEL, DEEPGRAM_USD_PER_MINUTE, SIGNED_LINK_SECONDS } from './settings.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const BUCKET = 'notes-files';

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

  // 2. Take the note: Queued (or Failed, for a retry) -> Transcribing. Only one run can win.
  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // Has this person had their turn for the hour? Counted BEFORE anything is spent. Every
  // number comes from the security_settings table, never from this file.
  try {
    await underRateLimit(admin, 'transcribe', auth.user.id, accountId);
  } catch (e) {
    if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
    throw e;
  }
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
    // The account comes from the note the caller was allowed to see, so the stored file
    // path can be checked against it before a link is made with the service key.
    accountId: accountId ?? undefined,
    signedLinkSeconds: SIGNED_LINK_SECONDS,
    // Reads JUST the first few thousand bytes, so the real kind of the file can be worked
    // out before it is sent to a paid service.
    //
    // It asks for a byte range over the signed link rather than using download(), which
    // would pull the WHOLE file into the function. A recording can be 50 MB, and this runs
    // inside a call Supabase stops after 150 seconds -- downloading all of it to look at
    // the first four thousand bytes would be a self-inflicted timeout on exactly the long
    // recordings most likely to matter.
    //
    // A problem reading them is not treated as a problem with the FILE: it returns null and
    // the note carries on exactly as it did before this check existed.
    readFirstBytes: async (filePath: string) => {
      try {
        const { data: signed, error } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(filePath, SIGNED_LINK_SECONDS);
        if (error || !signed?.signedUrl) return null;
        const res = await fetch(signed.signedUrl, { headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` } });
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    },
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
