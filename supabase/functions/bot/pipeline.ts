// Sending a bot, and taking in the recording it made.
//
// Pure and injectable, like every other pipeline here: no Deno, no createClient, no secrets, no
// network of its own. Everything it talks to arrives as an argument, so the whole flow can be run
// in a Jest test with a stand-in database and a stand-in bot service and no network at all.

import { isPathInsideAccount, WRONG_PLACE_MESSAGE } from '../_shared/paths.ts';
import {
  BOT_MESSAGES,
  ProviderError,
  type MeetingBotProvider,
  type Platform,
} from '../_shared/meeting-bot/provider.ts';
import { readMeetingLink } from '../_shared/meeting-bot/platforms.ts';
import { botChatNotice, MAX_CHAT_NOTICE, RECORDING_FILE_NAME } from './settings.ts';

/**
 * The small part of the Supabase admin client this file uses.
 *
 * PromiseLike, not Promise, and that is not a detail. A Supabase call is a builder with a `then`
 * method and nothing else, so `.catch(...)` on one throws "catch is not a function" at runtime
 * while every test passes. Saying PromiseLike makes the type checker refuse it outright
 * (docs/decisions.md, 2026-11-20).
 */
export type Db = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export type Files = {
  upload(path: string, body: Blob | ArrayBuffer | Uint8Array, contentType: string): PromiseLike<{ error: unknown }>;
};

/** What a refusal looks like coming out of here: a code for the server, words for the person. */
export type Refusal = { ok: false; code: string; message: string };
export type StartResult = Refusal | { ok: true; noteId: string; platform: Platform; botName: string };

export type StartOptions = {
  db: Db;
  provider: MeetingBotProvider;
  /** The id Gyan has chosen for the note. Made by the caller so a retry cannot make two. */
  noteId: string;
  accountId: string;
  userId: string;
  /** Exactly what the person pasted. */
  link: string;
  consentVersion: string;
  consentHash: string;
  /** The display name of the person sending the bot, for the notice in the chat. */
  askedBy: string | null;
  apiKey: string;
  retentionHours: number;
  fetcher?: typeof fetch;
};

/**
 * Plain words for every way the database can say no.
 *
 * The codes come from `private.assert_bot_allowed` and `start_bot_note`. Each one gets its own
 * sentence, because "no" without a reason is the thing people write support emails about.
 */
export function messageForCode(code: string): string {
  if (code.includes('bot_not_enabled')) return BOT_MESSAGES.notEnabled;
  if (code.includes('bot_no_hours')) return BOT_MESSAGES.noHours;
  if (code.includes('bot_hours_used')) return BOT_MESSAGES.hoursUsed;
  if (code.includes('bot_day_cap_account')) return BOT_MESSAGES.dayCapAccount;
  if (code.includes('bot_day_cap_service')) return BOT_MESSAGES.dayCapService;
  if (code.includes('limit_reached')) {
    return 'You have used all your meetings for this month. They start again on the 1st.';
  }
  if (code.includes('bad_platform')) return BOT_MESSAGES.badLink;
  if (code.includes('no_consent')) return BOT_MESSAGES.notEnabled;
  if (code.includes('not_allowed')) return 'You are not on this account.';
  return BOT_MESSAGES.couldNotStart;
}

/** Which HTTP answer goes with a refusal, so the app can tell them apart. */
export function statusForCode(code: string): number {
  if (code.includes('bot_not_enabled') || code.includes('not_allowed')) return 403;
  if (
    code.includes('bot_no_hours') ||
    code.includes('bot_hours_used') ||
    code.includes('bot_day_cap') ||
    code.includes('limit_reached')
  ) {
    return 402;
  }
  if (code.includes('bad_platform') || code.includes('bad_request') || code.includes('no_consent')) return 400;
  return 500;
}

/**
 * Send a bot to a call.
 *
 * The order matters and is the whole design:
 *
 *   1. Read the link ourselves. The screen already did, and the screen cannot be trusted.
 *   2. Ask the DATABASE whether this is allowed -- the switch, the monthly meetings, the bot
 *      hours, both daily caps -- and write the note and the bot row in that same one step. One
 *      step, so two fast taps cannot both pass a cap neither has spent against yet.
 *   3. Only then spend money by asking the service for a bot.
 *   4. Write down the service's id for it.
 *
 * If step 3 refuses, the note is marked Failed with the plain reason straight away. Leaving it on
 * "Joining" for ever would be the worst outcome: a note that looks like it is working and never
 * will be.
 */
export async function runStartBot(o: StartOptions): Promise<StartResult> {
  const read = readMeetingLink(o.link);
  if (!read) return { ok: false, code: 'bad_link', message: BOT_MESSAGES.badLink };

  const started = await o.db.rpc('start_bot_note', {
    p_meeting_id: o.noteId,
    p_account_id: o.accountId,
    p_user_id: o.userId,
    p_provider: o.provider.name,
    p_platform: read.platform,
    p_meeting_url: read.url,
    p_consent_version: o.consentVersion,
    p_consent_hash: o.consentHash,
  });
  if (started.error) {
    const code = started.error.message ?? '';
    return { ok: false, code, message: messageForCode(code) };
  }
  const row = firstRow(started.data) as { bot_name?: unknown; max_minutes?: unknown } | null;
  const botName = typeof row?.bot_name === 'string' && row.bot_name !== '' ? row.bot_name : 'gyan Notetaker';
  const maxMinutes = typeof row?.max_minutes === 'number' ? row.max_minutes : null;

  // The notice the bot says in the chat. Cut to what the strictest platform accepts, rather than
  // sent long and silently refused by Google Meet.
  const notice = botChatNotice(botName, o.askedBy).slice(0, MAX_CHAT_NOTICE);

  try {
    const { externalId } = await o.provider.startBot({
      meetingUrl: read.url,
      platform: read.platform,
      botName,
      noteId: o.noteId,
      maxMinutes,
      consentMessage: notice,
      retentionHours: o.retentionHours,
      apiKey: o.apiKey,
      fetcher: o.fetcher,
    });
    await o.db.rpc('attach_bot', { p_meeting_id: o.noteId, p_external_id: externalId });
    return { ok: true, noteId: o.noteId, platform: read.platform, botName };
  } catch (e) {
    const message = e instanceof ProviderError ? e.message : BOT_MESSAGES.couldNotStart;
    // The note exists, so it has to be told the truth rather than left looking busy.
    await o.db.rpc('fail_bot', { p_meeting_id: o.noteId, p_reason: message });
    return { ok: false, code: 'provider_refused', message };
  }
}

// ---------------------------------------------------------------------------
// Taking in the recording
// ---------------------------------------------------------------------------

export type RecordingOptions = {
  db: Db;
  files: Files;
  provider: MeetingBotProvider;
  noteId: string;
  accountId: string;
  externalId: string;
  apiKey: string;
  /** How many seconds Gyan believes the recording is, when the service did not say. */
  fallbackSeconds?: number | null;
  fetcher?: typeof fetch;
  /** Hands the note to the ordinary transcript step, exactly as an upload would. */
  startTranscript: () => Promise<void>;
};

export type RecordingResult =
  | { ok: true; seconds: number; deletedAtProvider: boolean }
  | { ok: false; message: string };

/**
 * The call has ended and the service has the recording. Move it to our own storage and hand the
 * note to the pipeline every other note goes through.
 *
 * WHAT MATTERS HERE, in order:
 *
 *   1. Our own copy first. Nothing is deleted anywhere until the audio is really in our bucket.
 *   2. The path is checked before the service key goes anywhere near it. Three server functions
 *      read meetings.file_path with that key, which skips every storage rule, so a path that
 *      could climb out of an account folder is the one bug that would matter (prompt 11).
 *   3. The cost row is written by the database in the same step as the status change.
 *   4. THEN the service's copy is deleted. A failure there is written down and swallowed: the
 *      note is already safe, and the 24 hour retention clears the copy anyway.
 */
export async function runBotRecording(o: RecordingOptions): Promise<RecordingResult> {
  const found = await o.provider.findAudio({
    externalId: o.externalId,
    apiKey: o.apiKey,
    fetcher: o.fetcher,
  });
  if (!found) {
    await o.db.rpc('fail_bot', { p_meeting_id: o.noteId, p_reason: BOT_MESSAGES.noAudio });
    return { ok: false, message: BOT_MESSAGES.noAudio };
  }

  const path = `${o.accountId}/${o.noteId}/${RECORDING_FILE_NAME}`;
  // Built from two ids, so it cannot be wrong -- and checked anyway, because the check costs
  // nothing and the thing it stops is somebody's recording landing in another account's folder.
  if (!isPathInsideAccount(path, o.accountId)) {
    await o.db.rpc('fail_bot', { p_meeting_id: o.noteId, p_reason: WRONG_PLACE_MESSAGE });
    return { ok: false, message: WRONG_PLACE_MESSAGE };
  }

  const go = o.fetcher ?? fetch;
  let audio: ArrayBuffer;
  try {
    // The link is pre-signed by the service and must be fetched WITHOUT our key on it.
    const res = await go(found.url);
    if (!res.ok) throw new Error('download_failed');
    audio = await res.arrayBuffer();
  } catch {
    await o.db.rpc('fail_bot', { p_meeting_id: o.noteId, p_reason: BOT_MESSAGES.noAudio });
    return { ok: false, message: BOT_MESSAGES.noAudio };
  }

  const uploaded = await o.files.upload(path, audio, found.contentType);
  if (uploaded.error) {
    // The commonest reason is the bucket's 50 MB limit, which a very long call can pass.
    const message =
      'Gyan could not save that recording. It may be longer than Gyan can store in one note.';
    await o.db.rpc('fail_bot', { p_meeting_id: o.noteId, p_reason: message });
    return { ok: false, message };
  }

  const seconds = found.seconds ?? o.fallbackSeconds ?? 0;
  const ready = await o.db.rpc('bot_recording_ready', {
    p_meeting_id: o.noteId,
    p_file_path: path,
    p_recording_seconds: Math.max(0, Math.round(seconds)),
    p_cost: costFor(seconds, o.provider.usdPerHour),
    p_provider: o.provider.name,
  });
  if (ready.error) {
    return { ok: false, message: BOT_MESSAGES.noAudio };
  }

  // Our copy is safe and the note is queued. Now the service's copy can go.
  let deletedAtProvider = false;
  try {
    await o.provider.deleteRecording({ externalId: o.externalId, apiKey: o.apiKey, fetcher: o.fetcher });
    await o.db.rpc('mark_bot_media_deleted', { p_meeting_id: o.noteId });
    deletedAtProvider = true;
  } catch {
    // Written down, not raised. The note is already fine, and the retention set when the bot was
    // sent clears the copy by itself within a day.
    console.error('could not delete the recording at the bot service for', o.noteId);
  }

  // From here it is an ordinary note: transcript, summary, everything.
  try {
    await o.startTranscript();
  } catch {
    console.error('could not start the transcript for', o.noteId);
  }

  return { ok: true, seconds: Math.max(0, Math.round(seconds)), deletedAtProvider };
}

/** What the bot cost. Billed by the second, so this is not rounded up to an hour. */
export function costFor(seconds: number, usdPerHour: number): number {
  const hours = Math.max(0, seconds) / 3600;
  return Number((hours * usdPerHour).toFixed(6));
}

/** A function that returns a table hands back an array; one that returns a row hands back a row. */
function firstRow(data: unknown): unknown {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}
