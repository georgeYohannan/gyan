/**
 * Sending a bot to a meeting, from the app's side.
 *
 * The app knows nothing about which service sends the bot. It pastes a link, confirms the consent,
 * and reads back a phase. Everything about the service -- its address, its field names, its prices,
 * its signature scheme -- lives in ONE file on the server
 * (`supabase/functions/_shared/meeting-bot/recall.ts`), and `__tests__/one-file-names-recall-test.ts`
 * fails if that ever stops being true.
 *
 * Nothing in here is a limit. The hours, the longest meeting and whether the feature is on at all
 * all come out of the database, which is what makes them changeable without a new release.
 */
import { BOT_CONSENT_VERSION, botConsentFingerprint } from '@/content/bot-consent';
import { readMeetingLink, type Platform } from '@/lib/meeting-links';
import { getSupabase } from '@/lib/supabase';

export type { Platform } from '@/lib/meeting-links';
export { PLATFORM_LABEL, platformFor, readMeetingLink } from '@/lib/meeting-links';

/** Whether this account may send a bot, and what the bot is called. */
export type BotSettings = {
  accountId: string;
  isOwner: boolean;
  /** Turned on by hand, per account, in the Supabase dashboard. Off for everybody by default. */
  enabled: boolean;
  /** What the owner has typed, or empty for the default. */
  botName: string;
  /** What the bot will actually be called, default included. */
  effectiveName: string;
};

export const MESSAGES = {
  loadProblem: 'Gyan could not check whether Meeting link is switched on. Please try again.',
  comingSoon: 'Meeting link is coming soon.',
  comingSoonWhy:
    'Gyan can send a bot to a Zoom, Google Meet or Microsoft Teams call. It is switched off until the wording it shows everybody in the meeting has been checked by a lawyer.',
  badLink:
    'Gyan could not read that as a meeting link. Paste the whole link to a Zoom, Google Meet or Microsoft Teams call.',
  notTicked: 'Tick the box to confirm, and Gyan will send the bot.',
  sendProblem: 'Gyan could not send a bot to that call just now. Please try again.',
  stopProblem: 'Gyan could not reach the bot to stop it. It will leave by itself when the call ends.',
  stopped: 'Gyan is leaving the call. The note will be ready in a few minutes.',
  alreadyFinished: 'That bot has already finished.',
  outOfHours:
    'You have used all your meeting bot hours this month. They start again on the 1st. Uploading a recording still works.',
  comingSoonHours:
    'Your plan does not include meeting bot hours, so Gyan cannot send a bot yet. Uploading a recording still works.',
  nameProblem: 'Gyan could not save that name. Please try again.',
  notOwner: 'Only the account owner can change what the bot is called.',
} as const;

/** What to tell somebody about getting the bot admitted, per platform. */
export const WAITING_ROOM_ADVICE: Record<Platform, string> = {
  meet: 'Somebody already in the call has to let Gyan in. In Google Meet that has to be somebody signed in to the host’s Google Workspace, so often only the host or a co-host sees the request.',
  teams: 'Somebody already in the call has to let Gyan in from the lobby. If the organiser has blocked outside people, Gyan cannot join at all.',
  zoom: 'Somebody already in the call has to let Gyan in from the waiting room, and the host has to allow recording.',
};

/** Is this account allowed to send a bot, and what is the bot called? */
export async function getBotSettings(): Promise<BotSettings> {
  const { data, error } = await getSupabase().rpc('get_meeting_bot_settings').single();
  if (error) throw new Error(MESSAGES.loadProblem);
  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    accountId: typeof row.account_id === 'string' ? row.account_id : '',
    isOwner: row.is_owner === true,
    // Anything other than a definite true is off. Forgetting the setting keeps the feature shut,
    // which is the same way round src/lib/environment.ts reads the builders' switch.
    enabled: row.enabled === true,
    botName: typeof row.bot_name === 'string' ? row.bot_name : '',
    effectiveName: typeof row.effective_name === 'string' ? row.effective_name : 'gyan Notetaker',
  };
}

/** Changes what the bot is called. Owner only; the database says no out loud if it is not them. */
export async function saveBotName(name: string): Promise<string> {
  const { error } = await getSupabase().rpc('save_meeting_bot_settings', {
    p_settings: { bot_name: name.trim() },
  });
  if (error) {
    throw new Error((error.message ?? '').includes('not_owner') ? MESSAGES.notOwner : MESSAGES.nameProblem);
  }
  return name.trim();
}

/** The longest one note may be, in minutes, or undefined when the plan does not limit it. */
export async function getMeetingMinutesAllowed(): Promise<number | undefined> {
  const { data, error } = await getSupabase().rpc('meeting_minutes_allowed');
  if (error) return undefined;
  return typeof data === 'number' && Number.isFinite(data) ? data : undefined;
}

export type SendResult =
  | { ok: true; meetingId: string; platform: Platform }
  | { ok: false; message: string };

/**
 * Sends a bot to a call.
 *
 * The note's id is made HERE and passed to the server, so pressing Send twice cannot make two
 * bots: the second one hits the same primary key and comes back as "already sent". The same
 * reasoning `create_note` uses for an upload.
 *
 * The consent travels with the request, as the version and a fingerprint of the exact words that
 * were on the screen. The server refuses anything that is not the current pair, so an old copy of
 * the app cannot send a bot on a confirmation nobody gave.
 */
export async function startBot(link: string): Promise<SendResult> {
  const read = readMeetingLink(link);
  if (!read) return { ok: false, message: MESSAGES.badLink };

  const meetingId = newId();
  const { data, error, response } = (await getSupabase().functions.invoke('bot', {
    body: {
      meeting_id: meetingId,
      meeting_url: read.url,
      consent: { version: BOT_CONSENT_VERSION, hash: botConsentFingerprint() },
    },
  })) as {
    data: { ok?: boolean; message?: string } | null;
    error: { message?: string } | null;
    response?: Response;
  };

  if (!error && data?.ok !== false) return { ok: true, meetingId, platform: read.platform };

  // The server's own words, when it sent any. They say WHICH limit was reached, which is the
  // difference between a message somebody can act on and a shrug.
  const said = await messageFrom(response);
  return { ok: false, message: said ?? data?.message ?? MESSAGES.sendProblem };
}

/** Makes the bot leave the call now. Anybody on the account may do it. */
export async function stopBot(meetingId: string): Promise<{ ok: boolean; message: string }> {
  const { error, response } = (await getSupabase().functions.invoke('bot', {
    body: { action: 'stop', meeting_id: meetingId },
  })) as { error: { message?: string } | null; response?: Response };

  if (!error) return { ok: true, message: MESSAGES.stopped };
  if (response?.status === 409) return { ok: false, message: MESSAGES.alreadyFinished };
  const said = await messageFrom(response);
  return { ok: false, message: said ?? MESSAGES.stopProblem };
}

/** What a bot note is doing, for the note page. */
export type BotState = {
  phase: 'joining' | 'waiting' | 'recording' | 'processing' | 'ready' | 'failed';
  platform: Platform;
  botName: string;
  failureReason: string | null;
  /** True while the bot is still in the call, so Stop recording is worth offering. */
  canStop: boolean;
};

/** Reads the bot behind one note, or undefined when the note did not come from one. */
export async function getBotState(meetingId: string): Promise<BotState | undefined> {
  const { data, error } = await getSupabase()
    .from('meeting_bots')
    .select('phase, platform, bot_name, failure_reason, external_id')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error || !data) return undefined;
  const row = data as Record<string, unknown>;
  const phase = row.phase as BotState['phase'];
  return {
    phase,
    platform: (row.platform as Platform) ?? 'meet',
    botName: typeof row.bot_name === 'string' ? row.bot_name : 'gyan Notetaker',
    failureReason: typeof row.failure_reason === 'string' ? row.failure_reason : null,
    // Only once the service has given the bot an id is there anything to reach.
    canStop:
      (phase === 'joining' || phase === 'waiting' || phase === 'recording') &&
      typeof row.external_id === 'string' &&
      row.external_id !== '',
  };
}

/**
 * A server function answers a refusal with a plain message in the body, and supabase-js turns any
 * non-2xx into an error without handing the body over. So the body is read off the response.
 */
async function messageFrom(response: Response | undefined): Promise<string | undefined> {
  if (!response) return undefined;
  try {
    const body = (await response.clone().json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message !== '' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

/** A new note id. The same shape the database makes, so nothing has to be told the difference. */
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Older web views have getRandomValues but not randomUUID.
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
