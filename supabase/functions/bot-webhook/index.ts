// Supabase server function: receives status events from the meeting-bot service.
//
// THIS IS THE ONLY FUNCTION IN GYAN THAT IS NOT OPENED WITH A SUPABASE LOGIN, because the bot
// service does not hold one. Deploy it with:
//
//     supabase functions deploy bot-webhook --no-verify-jwt
//
// (supabase/config.toml says the same thing, so a plain deploy does the right thing too.)
//
// THE SIGNATURE IS THE ONLY IDENTITY. The body is read as RAW TEXT before anything parses it,
// checked against the shared secret, and ANY failure means this function does nothing whatsoever:
// no row read, no row written, nothing logged but the word "rejected". Nothing below the check can
// be reached by somebody who cannot sign a message.
//
// Set the secret once with:  supabase secrets set MEETING_BOT_WEBHOOK_SECRET=whsec_...
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsFor, pickKey } from '../_shared/guard.ts';
import { provider } from '../_shared/meeting-bot/index.ts';
import { runBotRecording } from '../bot/pipeline.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const BUCKET = 'notes-files';

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const reply = (body: Record<string, unknown>, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const secretKey = pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const botKey = Deno.env.get('MEETING_BOT_API_KEY');
  const webhookSecret = Deno.env.get('MEETING_BOT_WEBHOOK_SECRET');
  if (!url || !secretKey || !botKey || !webhookSecret) return reply({ error: 'server_not_set_up' }, 500);

  // The raw bytes, exactly as they arrived. A signature is over bytes, so anything that parses the
  // JSON and prints it again would change them and nothing would ever verify.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return reply({ error: 'rejected' }, 401);
  }

  const event = await provider.verifyEvent({ headers: req.headers, rawBody, secret: webhookSecret });
  if (!event) {
    // No detail, on purpose. Saying WHY a signature failed helps somebody work out how to forge
    // one, and there is nothing here a real caller would need to be told.
    console.error('bot webhook rejected');
    return reply({ error: 'rejected' }, 401);
  }

  if (event.kind === 'ignore') {
    // The service's own documentation says not to treat its codes as a fixed list, so a code
    // nobody has seen before is dropped quietly rather than turning a meeting into a failed note.
    console.error('bot webhook ignored:', event.why.slice(0, 60));
    return reply({ ok: true, ignored: true });
  }

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // Which note is this about? By the service's own id for the bot, or -- only in the moment before
  // that id has been written down -- by the note id the service was handed and echoed back.
  const { data: noteId, error: findError } = await admin.rpc('bot_note_for_event', {
    p_provider: provider.name,
    p_external_id: event.externalId,
    p_note_id: event.noteId && /^[0-9a-f-]{36}$/i.test(event.noteId) ? event.noteId : null,
  });
  if (findError || typeof noteId !== 'string' || noteId === '') {
    // Verified, but about a bot Gyan has no record of. Answered 200 so the service stops trying:
    // retrying for a day would not make a note appear.
    console.error('bot webhook was about a bot we do not know');
    return reply({ ok: true, ignored: true });
  }

  if (event.kind === 'phase') {
    const { error } = await admin.rpc('record_bot_phase', {
      p_meeting_id: noteId,
      p_phase: event.phase,
      p_reason: event.reason,
    });
    if (error) {
      console.error('could not write the bot phase for', noteId);
      // 500 so the service tries again. This one really is worth retrying: a note stuck on
      // "Joining" because one write failed is the worst-looking outcome there is.
      return reply({ error: 'could_not_record' }, 500);
    }
    return reply({ ok: true, phase: event.phase });
  }

  // ---------------------------------------------------------------------------
  // The recording is finished. Move it into our own storage.
  // ---------------------------------------------------------------------------
  // This is slow: a download and an upload. The service's own handler timeout is 15 seconds, so it
  // is answered immediately and the work carries on in the background.
  const { data: bot } = await admin
    .from('meeting_bots')
    .select('account_id, requested_by, external_id, phase, max_minutes, recording_started_at, ended_at')
    .eq('meeting_id', noteId)
    .maybeSingle();
  const row = bot as
    | {
        account_id: string;
        requested_by: string | null;
        external_id: string | null;
        phase: string;
        recording_started_at: string | null;
        ended_at: string | null;
      }
    | null;
  if (!row || row.phase === 'ready' || row.phase === 'failed') {
    return reply({ ok: true, ignored: true });
  }

  const work = (async () => {
    // Who the transcript is bought for. The person who sent the bot, or -- if they have since been
    // deleted -- the account owner, which is what claim_recap already does for an automatic send.
    let actingFor = row.requested_by;
    if (!actingFor) {
      const { data: owner } = await admin
        .from('accounts')
        .select('owner_id')
        .eq('id', row.account_id)
        .maybeSingle();
      actingFor = (owner as { owner_id?: string } | null)?.owner_id ?? null;
    }

    await runBotRecording({
      db: admin,
      files: {
        upload: (path, body, contentType) =>
          admin.storage.from(BUCKET).upload(path, body, { contentType, upsert: true }),
      },
      provider,
      noteId,
      accountId: row.account_id,
      externalId: row.external_id ?? event.externalId,
      apiKey: botKey,
      // Gyan's own measurement, used only when the service does not say how long the recording
      // is. Without it a recording of unknown length would be logged as costing nothing, which
      // would quietly under-count the bill and let the daily caps drift.
      fallbackSeconds: secondsBetween(row.recording_started_at, row.ended_at),
      startTranscript: async () => {
        if (!actingFor) return;
        // The ordinary transcript step, through its own trusted-internal door. There is nobody
        // sitting here waiting, so there is no login to pass on -- the project's secret key says
        // this is our own server, and claim_transcription still checks in SQL that the person
        // named is really on the note's account.
        await fetch(`${url.replace(/\/+$/, '')}/functions/v1/transcribe`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            apikey: secretKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ meeting_id: noteId, user_id: actingFor }),
        });
      },
    });
  })();
  EdgeRuntime.waitUntil(work);

  return reply({ ok: true, accepted: true }, 202);
});

/** How long the bot was recording, by Gyan's own clock. Null when it cannot be worked out. */
function secondsBetween(from: string | null, to: string | null): number | null {
  const started = from ? Date.parse(from) : NaN;
  // The call may have ended a moment ago without that having been written down yet.
  const finished = to ? Date.parse(to) : Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return null;
  return Math.round((finished - started) / 1000);
}
