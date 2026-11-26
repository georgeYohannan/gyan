// Supabase server function: turns an uploaded audio file into a transcript with speakers.
// Runs on Supabase's servers, so the Deepgram key never reaches the app.
// Set the key once with:  supabase secrets set DEEPGRAM_API_KEY=...   (see docs/testing/prompt-5.md)
import { createClient } from 'npm:@supabase/supabase-js@2';

import { SNIFF_BYTES } from '../_shared/filetype.ts';
import {
  RATE_LIMIT_MESSAGE,
  RateLimited,
  UUID,
  corsFor,
  isOurOwnServer,
  pickKey,
  underRateLimit,
} from '../_shared/guard.ts';
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
  let bodyUserId: string | undefined;
  try {
    const body = (await req.json()) ?? {};
    meetingId = body.meeting_id;
    bodyUserId = body.user_id;
  } catch {
    /* handled below */
  }
  // The old check here was /^[0-9a-f-]{36}$/i, which accepted thirty-six dashes.
  if (!meetingId || !UUID.test(meetingId)) return reply({ error: 'bad_request' }, 400);

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // 1. Who is calling? Either a signed-in person, or one of our own server functions.
  //
  // The second case is new in prompt 14, and it is the same trusted-internal door `translate` and
  // `recap` already have. A meeting-bot note arrives with nobody sitting there waiting for it: the
  // call ended, the bot-webhook function put the recording in our bucket, and the transcript has
  // to start with no login to read. Our own server code is the only thing holding the project's
  // secret key, so a request carrying it is ours.
  //
  // THIS WIDENS NOTHING. Such a call still has to name the person it is acting for, and
  // claim_transcription below still checks in SQL that that person is on the note's account. The
  // decision stays in the database.
  let userId: string;
  let accountId: string | null = null;
  if (await isOurOwnServer(authHeader, secretKey)) {
    if (!bodyUserId || !UUID.test(bodyUserId)) return reply({ error: 'bad_request' }, 400);
    userId = bodyUserId;
    const { data: note } = await admin
      .from('meetings')
      .select('account_id')
      .eq('id', meetingId)
      .maybeSingle();
    accountId = (note as { account_id?: string } | null)?.account_id ?? null;
  } else {
    // A person. Ask with THEIR login, so the database rules decide what they may see.
    const asUser = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await asUser.auth.getUser();
    if (authError || !auth.user) return reply({ error: 'not_signed_in' }, 401);
    userId = auth.user.id;
    // The account comes back from the same question, so counting the limit per account as
    // well as per person costs nothing extra.
    const { data: visible } = await asUser
      .from('meetings')
      .select('id, account_id')
      .eq('id', meetingId)
      .maybeSingle();
    if (!visible) return reply({ error: 'not_allowed' }, 403);
    accountId = (visible as { account_id?: string }).account_id ?? null;
  }

  // 2. Take the note: Queued (or Failed, for a retry) -> Transcribing. Only one run can win.

  // Has this person had their turn for the hour? Counted BEFORE anything is spent. Every
  // number comes from the security_settings table, never from this file.
  try {
    await underRateLimit(admin, 'transcribe', userId, accountId);
  } catch (e) {
    if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
    throw e;
  }
  const { data: claimed, error: claimError } = await admin
    .rpc('claim_transcription', { p_meeting_id: meetingId, p_user_id: userId })
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
    //
    // For a meeting-bot note there is no login: the header being passed along is the project's own
    // secret key, which is what `summarize` reads as "this is our own server". In that case the
    // person being acted for has to be named, exactly as it was named to this function.
    startSummary: async () => {
      await fetch(`${url}/functions/v1/summarize`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_id: noteId, user_id: userId }),
      });
    },
  });
  EdgeRuntime.waitUntil(work);

  return reply({ status: 'transcribing' }, 202);
});
