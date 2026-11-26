// THE ONLY FILE IN GYAN THAT KNOWS ANYTHING ABOUT RECALL.AI.
//
// Every URL, every field name, every status code, the signature scheme and the price live here and
// nowhere else. Swapping to Vexa, Attendee or MeetingBaaS later is: write one file like this one,
// and change the single line in index.ts. __tests__/one-file-names-recall-test.ts reads the whole
// project and fails if the word "recall" appears anywhere it should not, so that is a promise
// rather than a hope. docs/decisions/bot-provider.md has the comparison.
//
// Written from Recall.ai's own documentation, read on 2026-11-25. THREE THINGS THEIR PAGES DO NOT
// SAY, which this file is deliberately defensive about:
//
//   1. The key name for mixed audio inside `media_shortcuts`. Their download-schemas page lists
//      video_mixed, participant_events and transcript, and no audio shortcut at all. So findAudio
//      SCANS for any audio artifact carrying a download_url rather than trusting a name.
//   2. What container `audio_mixed_raw` produces. So Gyan asks for `audio_mixed_mp3`, which is
//      named, is small, and is something both Deepgram and our own bucket already accept.
//   3. How old a webhook may be. Their own sample does not check the timestamp at all, so the five
//      minutes below is GYAN'S choice, not their documented number.

import {
  BOT_MESSAGES,
  ProviderError,
  type BotPhase,
  type FoundAudio,
  type MeetingBotProvider,
  type Platform,
  type ProviderEvent,
  type StartBotRequest,
} from './provider.ts';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * US East. Recall runs four completely separate services and the region is fixed when the account
 * is made -- it CANNOT be changed later without a new account and a new key. The founder chose US
 * East on 2026-11-25: the first market is the United States, and Supabase and Anthropic already
 * hold data there, so there is one story to tell rather than three.
 */
const BASE = 'https://us-east-1.recall.ai';

/** What goes in ai_usage.provider. */
const NAME = 'recall';

/**
 * $0.50 an hour of recording, pay as you go, from recall.ai/pricing (checked 2026-11-25). Billed
 * by the second. This is a VENDOR cost, not a plan price, so it is not in the plans table -- the
 * same rule transcribe/settings.ts states for Deepgram.
 *
 * Not included here, because Gyan does not buy them: their own transcription ($0.15/hr -- Deepgram
 * does that job), four-core Zoom bots (+$0.10/hr) and GPU bots (+$1/hr). Worth asking them about
 * the startup rate of $0.25/hr for the first 10,000 hours.
 */
const USD_PER_HOUR = 0.5;

/**
 * How long Gyan will let a bot sit in a waiting room before it gives up, per platform.
 *
 * Recall's own pages disagree about Google Meet -- one says the waiting room never times out, one
 * says ten minutes, and the bot-create schema says the SETTING may not exceed 600 seconds for
 * Meet. 600 is valid under all three readings, so that is what is used. Teams is capped at 1800 by
 * Teams itself. Zoom gets Recall's own default.
 */
const WAITING_ROOM_SECONDS: Record<Platform, number> = { meet: 600, teams: 1800, zoom: 1200 };

/** How long after everybody else has left before the bot gives up and goes. */
const EVERYONE_LEFT_SECONDS = 60;

/** How old a signed event may be. Gyan's choice; see the note at the top of this file. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------------------
// Sending a bot
// ---------------------------------------------------------------------------

async function startBot(request: StartBotRequest): Promise<{ externalId: string }> {
  const go = request.fetcher ?? fetch;
  const body: Record<string, unknown> = {
    meeting_url: request.meetingUrl,
    // 1 to 100 characters. The name is built from the account owner in the database.
    bot_name: request.botName.slice(0, 100),
    // Handed back on EVERY status event, which is how an event that arrives before the bot's own
    // id has been written down can still be matched to its note. Values must be strings.
    metadata: { note_id: request.noteId, app: 'gyan' },
    recording_config: {
      // Audio only, as small as they offer by name.
      audio_mixed_mp3: {},
      // Video is on by default and Gyan has no use for it. Setting it to null to switch it off is
      // INFERRED from the field being nullable in their schema; their pages show no example of it.
      // If a recording ever comes back with a video artifact anyway, nothing breaks -- findAudio
      // below only ever takes audio.
      video_mixed_mp4: null,
      // NO `transcript` FIELD AT ALL. Their transcription is opt-in and costs $0.15 an hour;
      // Deepgram already does that job and Gyan already pays for it. Leaving this out is what
      // makes sure the recording never goes through a second speech service.
      transcript: null,
      // Their copy is deleted by Gyan within seconds of storing its own. This is the backstop if
      // that delete ever fails. The founder chose 24 hours on 2026-11-25. Omitting the field would
      // mean "keep it indefinitely", which is their default since June 2025.
      retention: { type: 'timed', hours: request.retentionHours },
    },
    automatic_leave: {
      waiting_room_timeout: WAITING_ROOM_SECONDS[request.platform],
      everyone_left_timeout: { timeout: EVERYONE_LEFT_SECONDS },
    },
    chat: {
      // THE CONSENT NOTICE, said out loud in the meeting, to everybody. Gyan never records a
      // meeting without a notice for the people in it (CLAUDE.md hard rule 8).
      on_bot_join: { send_to: 'everyone', message: request.consentMessage },
      // Recall warns that somebody who joins AFTER the first message never sees it. So it is said
      // again to each person who arrives.
      on_participant_join: { message: request.consentMessage },
    },
  };

  // The longest the bot may record for, from the plans table. This is what makes
  // plans.max_meeting_minutes bite on a bot: the bot leaves by itself and stops costing money,
  // rather than Gyan finding out afterwards that it ran for four hours.
  if (request.maxMinutes && request.maxMinutes > 0) {
    (body.automatic_leave as Record<string, unknown>).in_call_recording_timeout =
      Math.round(request.maxMinutes * 60);
  }

  let res: Response;
  try {
    res = await go(`${BASE}/api/v1/bot/`, {
      method: 'POST',
      headers: { Authorization: `Token ${request.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError(BOT_MESSAGES.couldNotStart, true);
  }

  if (!res.ok) {
    // 507 means their pool of ready bots is empty just now, which is worth trying again for.
    throw new ProviderError(messageForStartStatus(res.status), res.status === 507 || res.status >= 500);
  }

  const answer = (await res.json().catch(() => null)) as { id?: unknown } | null;
  if (!answer || typeof answer.id !== 'string' || answer.id === '') {
    throw new ProviderError(BOT_MESSAGES.couldNotStart, true);
  }
  return { externalId: answer.id };
}

/** Plain words for a refusal, with no code in them for anybody to argue about. */
export function messageForStartStatus(status: number): string {
  if (status === 401 || status === 403) {
    // Our key, not the person's problem. They still get a message they can act on.
    return BOT_MESSAGES.couldNotStart;
  }
  if (status === 400 || status === 422) {
    return 'Gyan could not join that call. Check the link is the whole invitation link and that the meeting has not been cancelled.';
  }
  if (status === 429) {
    return 'Gyan is sending a lot of bots just now. Please try again in a minute.';
  }
  return BOT_MESSAGES.couldNotStart;
}

// ---------------------------------------------------------------------------
// Making it leave
// ---------------------------------------------------------------------------

async function stopBot(o: { externalId: string; apiKey: string; fetcher?: typeof fetch }): Promise<void> {
  const go = o.fetcher ?? fetch;
  let res: Response;
  try {
    res = await go(`${BASE}/api/v1/bot/${encodeURIComponent(o.externalId)}/leave_call/`, {
      method: 'POST',
      headers: { Authorization: `Token ${o.apiKey}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    throw new ProviderError(BOT_MESSAGES.couldNotStop, true);
  }
  // 400 here usually means the bot has already gone, which is the outcome being asked for.
  if (!res.ok && res.status !== 400 && res.status !== 404) {
    throw new ProviderError(BOT_MESSAGES.couldNotStop, res.status >= 500);
  }
}

// ---------------------------------------------------------------------------
// Status events
// ---------------------------------------------------------------------------

/**
 * Their status codes, in Gyan's words. Everything not in here is IGNORED, never failed: their own
 * documentation says "You should not treat the data.code and data.sub_code as an enum", and a code
 * nobody has seen before must not turn somebody's meeting into a failed note.
 */
const PHASE_FOR_CODE: Record<string, BotPhase> = {
  joining_call: 'joining',
  in_waiting_room: 'waiting',
  in_call_not_recording: 'joining',
  recording_permission_allowed: 'recording',
  in_call_recording: 'recording',
  recording_permission_denied: 'failed',
  call_ended: 'processing',
  fatal: 'failed',
};

/**
 * Why a bot never recorded, in words somebody can act on.
 *
 * Taken from their sub-codes page. The point of translating them is that "timeout_exceeded_
 * waiting_room" tells a person nothing, and "Nobody let Gyan into the meeting" tells them exactly
 * what to do differently next time.
 */
export function reasonForSubCode(code: string, subCode: string | null): string {
  const sub = subCode ?? '';

  // Zoom needs its own app, submitted to Zoom and approved, before it can join anybody else's
  // meeting. Until that is done this is the commonest failure there is, so it says so plainly.
  if (sub.startsWith('zoom_sdk_') || sub === 'zoom_web_disallowed' || sub === 'zoom_bot_blocked') {
    return 'Gyan cannot join Zoom calls yet. Google Meet and Microsoft Teams work now.';
  }
  if (sub.startsWith('zoom_local_recording') || sub === 'zoom_local_recording_denied') {
    return 'The Zoom host did not allow recording.';
  }
  if (sub === 'google_meet_knocking_disabled') {
    return 'The host has turned off letting new people in, so Gyan could not even ask to join.';
  }

  switch (sub) {
    case 'meeting_link_invalid':
    case 'meeting_link_expired':
    case 'meeting_not_found':
      return 'That link did not work. Check you pasted the whole invitation link.';
    case 'meeting_password_incorrect':
      return 'That meeting needs a password, which Gyan cannot use yet.';
    case 'meeting_requires_sign_in':
    case 'meeting_requires_registration':
      return 'That meeting only lets signed-in people in, so Gyan could not join.';
    case 'meeting_not_accessible':
    case 'meeting_locked':
      return 'The meeting settings did not let Gyan in. The organiser can allow outside people to join.';
    case 'meeting_full':
      return 'The meeting was full, so there was no room for Gyan.';
    case 'meeting_ended':
      return 'The meeting had already ended.';
    case 'meeting_not_started':
      return 'The meeting never started, so there was nothing to record.';
    case 'bot_not_accepted':
    case 'bot_kicked_from_waiting_room':
    case 'timeout_exceeded_waiting_room':
    case 'call_ended_by_platform_waiting_room_timeout':
      return 'Nobody let Gyan into the meeting. Somebody in the call has to admit it from the waiting room.';
    case 'bot_kicked_from_call':
      return 'Gyan was removed from the call.';
    case 'timeout_exceeded_noone_joined':
      return 'Nobody else joined the call, so there was nothing to record.';
    case 'timeout_exceeded_everyone_left':
    case 'call_ended_by_host':
    case 'bot_received_leave_call':
      return 'The call ended.';
    case 'timeout_exceeded_silence_detected':
      return 'Nobody said anything for a long time, so Gyan left the call.';
    case 'timeout_exceeded_in_call_recording':
    case 'call_ended_by_platform_max_length':
      return 'The meeting reached the longest length your plan allows for one note.';
    case 'recording_permission_denied':
      return 'The host did not allow recording.';
    default:
      break;
  }

  if (code === 'recording_permission_denied') return 'The host did not allow recording.';
  if (code === 'fatal') return 'Gyan could not join that call.';
  return 'The call ended before Gyan could finish recording.';
}

/**
 * Is this really from Recall, and what does it say?
 *
 * Recall delivers through Svix. WHICH HEADERS ARRIVE DEPENDS ON WHEN THE ACCOUNT WAS MADE: their
 * verification page says accounts created before 15 December 2025 sign with a per-endpoint Svix
 * secret and `svix-*` headers, and accounts created on or after that date use a workspace secret
 * and `webhook-*` headers. Gyan's account is new, so it will be the second -- but both spellings
 * are read, because getting this wrong would mean dropping every event and nothing saying why.
 *
 * Returns null for ANY failure, and the caller then does nothing whatsoever: no row read, no row
 * written, nothing logged but the word "rejected".
 */
async function verifyEvent(o: {
  headers: Headers;
  rawBody: string;
  secret: string;
  now?: Date;
}): Promise<ProviderEvent | null> {
  const id = o.headers.get('webhook-id') ?? o.headers.get('svix-id');
  const timestamp = o.headers.get('webhook-timestamp') ?? o.headers.get('svix-timestamp');
  const signature = o.headers.get('webhook-signature') ?? o.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return null;
  if (!(await signatureMatches({ id, timestamp, signature, rawBody: o.rawBody, secret: o.secret, now: o.now }))) {
    return null;
  }
  return readEvent(o.rawBody);
}

/** The signature check on its own, so it can be tried for real in a test. */
export async function signatureMatches(o: {
  id: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  secret: string;
  now?: Date;
}): Promise<boolean> {
  // An old message replayed is still a real message, so the age is checked. Their own sample does
  // not do this; see the note at the top of the file.
  const sent = Number(o.timestamp);
  if (!Number.isFinite(sent)) return false;
  const nowSeconds = Math.floor((o.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - sent) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await signingKey(o.secret);
  if (!key) return false;

  // Signed over the raw bytes that arrived. Anything that parses the JSON and prints it again
  // changes those bytes and the signature stops matching, which is why the caller reads text.
  const signed = `${o.id}.${o.timestamp}.${o.rawBody}`;
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed)),
  );
  const expected = base64(digest);

  // The header is a space-separated list. More than one means the secret was rotated recently;
  // Recall keeps an old one valid for 24 hours. Any match is a match.
  for (const part of o.signature.split(' ')) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    if (sameString(value, expected)) return true;
  }
  return false;
}

/** The secret is `whsec_` plus the key in base64. */
async function signingKey(secret: string): Promise<CryptoKey | null> {
  if (typeof secret !== 'string' || !secret.startsWith('whsec_')) return null;
  // An ArrayBuffer rather than a bare Uint8Array, because importKey wants one that is certainly
  // not shared, and TypeScript cannot tell that from Uint8Array alone.
  let bytes: ArrayBuffer;
  try {
    const raw = atob(secret.slice('whsec_'.length));
    const view = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
    bytes = view.buffer;
  } catch {
    return null;
  }
  if (bytes.byteLength === 0) return null;
  try {
    return await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    return null;
  }
}

function base64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

/**
 * Compares two strings without letting the time taken give the answer away.
 *
 * `===` stops at the first character that differs, so how long it takes leaks how much of a guess
 * was right. The same reasoning, and the same fix, as sameSecret in _shared/guard.ts.
 */
function sameString(given: string, real: string): boolean {
  if (given.length !== real.length) return false;
  let difference = 0;
  for (let i = 0; i < given.length; i++) difference |= given.charCodeAt(i) ^ real.charCodeAt(i);
  return difference === 0;
}

/** What a verified event actually says. Separated out so a test can feed it any body. */
export function readEvent(rawBody: string): ProviderEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { kind: 'ignore', why: 'not json' };
  }
  const envelope = parsed as {
    event?: unknown;
    data?: { data?: { code?: unknown; sub_code?: unknown }; bot?: { id?: unknown; metadata?: unknown } };
  };
  const bot = envelope.data?.bot;
  const externalId = typeof bot?.id === 'string' ? bot.id : '';
  if (externalId === '') return { kind: 'ignore', why: 'no bot id' };

  // The note id Gyan handed over when it sent the bot. This is only a hint: the database only
  // accepts it for a bot whose own id has not been written down yet.
  const metadata = bot?.metadata as { note_id?: unknown } | undefined;
  const noteId = typeof metadata?.note_id === 'string' ? metadata.note_id : null;

  const code = typeof envelope.data?.data?.code === 'string' ? envelope.data.data.code : '';
  const subCode = typeof envelope.data?.data?.sub_code === 'string' ? envelope.data.data.sub_code : null;
  // The event name is `bot.<code>`, and the code is also in the body. The body wins; the name is
  // the fallback for an event shaped differently from the one example in their docs.
  const name = typeof envelope.event === 'string' ? envelope.event : '';
  const effective = code !== '' ? code : name.replace(/^bot\./, '');

  // The one event that is not a phase: the recording is finished and can be fetched.
  if (effective === 'done' || name === 'bot.done') {
    return { kind: 'recording_ready', externalId, noteId };
  }

  const phase = PHASE_FOR_CODE[effective];
  if (!phase) return { kind: 'ignore', why: `unknown code ${effective.slice(0, 40)}` };

  return {
    kind: 'phase',
    externalId,
    noteId,
    phase,
    reason: phase === 'failed' ? reasonForSubCode(effective, subCode) : null,
  };
}

// ---------------------------------------------------------------------------
// Getting the recording
// ---------------------------------------------------------------------------

/** What Gyan will accept as audio, and what to call it in our own storage. */
const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

async function findAudio(o: {
  externalId: string;
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<FoundAudio | null> {
  const go = o.fetcher ?? fetch;
  let res: Response;
  try {
    res = await go(`${BASE}/api/v1/bot/${encodeURIComponent(o.externalId)}/`, {
      headers: { Authorization: `Token ${o.apiKey}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const answer = (await res.json().catch(() => null)) as { recordings?: unknown } | null;
  if (!answer) return null;
  return audioFromBot(answer);
}

/**
 * Picks the audio out of a bot's recordings.
 *
 * SCANS rather than reading a known key, because Recall's download-schemas page lists only
 * video_mixed, participant_events and transcript -- their audio shortcut is not documented. The
 * schema is called AudioMixedArtifactShortcut, so `audio_mixed` is the likely name, but a feature
 * must not break because a key was guessed. So: look at every shortcut, take the first that has a
 * download link and a format Gyan can hand to Deepgram.
 *
 * It deliberately does NOT fall back to video. Gyan switched video off; if one turned up anyway it
 * could be hundreds of megabytes, which would not fit our bucket and would not finish inside the
 * time a server function gets. Failing with a plain message is the better outcome.
 */
export function audioFromBot(bot: { recordings?: unknown }): FoundAudio | null {
  const recordings = Array.isArray(bot.recordings) ? bot.recordings : [];
  for (const recording of recordings) {
    const row = recording as {
      media_shortcuts?: Record<string, unknown>;
      started_at?: unknown;
      completed_at?: unknown;
    };
    const shortcuts = row.media_shortcuts;
    if (!shortcuts || typeof shortcuts !== 'object') continue;

    // Anything whose name mentions audio first, then anything else that looks like audio.
    const names = Object.keys(shortcuts);
    const ordered = [...names.filter((n) => n.includes('audio')), ...names.filter((n) => !n.includes('audio'))];

    for (const name of ordered) {
      const shortcut = shortcuts[name] as { data?: { download_url?: unknown }; format?: unknown } | undefined;
      const url = shortcut?.data?.download_url;
      if (typeof url !== 'string' || url === '') continue;
      const format = typeof shortcut?.format === 'string' ? shortcut.format.toLowerCase() : '';
      const contentType = AUDIO_TYPES[format];
      // A shortcut with no format we know is skipped rather than guessed at. `raw` lands here on
      // purpose: their pages never say what container it is, and Gyan never asks for it.
      if (!contentType) continue;
      return { url, contentType, seconds: lengthOf(row) };
    }
  }
  return null;
}

/** How long the recording is, when the two timestamps are both there. */
function lengthOf(recording: { started_at?: unknown; completed_at?: unknown }): number | null {
  const started = typeof recording.started_at === 'string' ? Date.parse(recording.started_at) : NaN;
  const finished = typeof recording.completed_at === 'string' ? Date.parse(recording.completed_at) : NaN;
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return null;
  return Math.round((finished - started) / 1000);
}

// ---------------------------------------------------------------------------
// Deleting their copy
// ---------------------------------------------------------------------------

/**
 * "Deletes bot media stored by Recall. This is irreversible." Called the moment Gyan has its own
 * copy in its own bucket, so a customer's meeting is not sitting on somebody else's servers for
 * any longer than it has to be. If this fails, the 24 hour retention set at create time is what
 * eventually clears it.
 */
async function deleteRecording(o: {
  externalId: string;
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const go = o.fetcher ?? fetch;
  const res = await go(`${BASE}/api/v1/bot/${encodeURIComponent(o.externalId)}/delete_media/`, {
    method: 'POST',
    headers: { Authorization: `Token ${o.apiKey}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  // 409 means there was nothing left to delete, which is the outcome being asked for.
  if (!res.ok && res.status !== 404 && res.status !== 409) {
    throw new ProviderError('Gyan could not delete its copy of the recording at the bot service.');
  }
}

export const provider: MeetingBotProvider = {
  name: NAME,
  usdPerHour: USD_PER_HOUR,
  startBot,
  stopBot,
  verifyEvent,
  findAudio,
  deleteRecording,
};
