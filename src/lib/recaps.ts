// Sending a note's recap by email, and the account's recap settings.
//
// The app never holds an email address it typed itself and never holds the email key. It asks
// the `recap` server function who would get a recap, and then asks it to send to a list of
// PEOPLE (by id). The server only ever emails people who are really on the account.
import { getSupabase } from '@/lib/supabase';

/** One person who could get a recap. Everybody in this list is on the same account. */
export type Recipient = {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'member';
  /** Their preferred language code, for example 'es'. */
  language: string;
  /** True when the account's saved settings already include this person. */
  defaultOn: boolean;
  /** True when this row is the person looking at the dialog. The server decides, not the app. */
  isYou: boolean;
};

/** The three switches the account owner controls. */
export type RecapSettings = {
  toOwner: boolean;
  toMembers: boolean;
  autoSend: boolean;
};

export const DEFAULT_SETTINGS: RecapSettings = { toOwner: true, toMembers: false, autoSend: false };

export const MESSAGES = {
  problem: 'Gyan could not send the recap just now. Please try again.',
  notSetUp: 'Gyan cannot send emails yet. The email service is not set up on the server.',
  notAllowed: 'You cannot send a recap for this note.',
  loadProblem: 'Gyan could not work out who would get this recap. Please try again.',
  nobody: 'Nobody is picked. Tick at least one person.',
  settingsProblem: 'Gyan could not save that just now. Please try again.',
  notOwner: 'Only the account owner can change who gets recap emails.',
  noAccount: 'Gyan could not find your account.',
} as const;

/** How one person's email turned out. */
export type RecapOutcome = {
  email: string;
  name: string;
  language: string;
  translated: boolean;
  ok: boolean;
};

export type PreviewResult =
  | {
      ok: true;
      recipients: Recipient[];
      settings: RecapSettings;
      canSend: boolean;
      /** Set when canSend is false: why nothing can be sent, in plain words from the server. */
      sendProblem?: string;
    }
  | { ok: false; message: string };

export type SendResult =
  | { ok: true; sent: number; failed: number; outcomes: RecapOutcome[] }
  | { ok: false; message: string };

type RawRecipient = {
  user_id?: unknown;
  email?: unknown;
  name?: unknown;
  role?: unknown;
  language?: unknown;
  default_on?: unknown;
  is_you?: unknown;
};

function readRecipients(value: unknown): Recipient[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is RawRecipient => !!row && typeof row === 'object')
    .filter((row) => typeof row.user_id === 'string' && typeof row.email === 'string')
    .map((row) => ({
      userId: row.user_id as string,
      email: row.email as string,
      name: typeof row.name === 'string' && row.name.trim() !== '' ? row.name : (row.email as string),
      role: row.role === 'owner' ? 'owner' : 'member',
      language: typeof row.language === 'string' && row.language !== '' ? row.language : 'en',
      defaultOn: row.default_on === true,
      isYou: row.is_you === true,
    }));
}

/** Reads the three switches out of whatever the server sent, falling back to the safe defaults. */
export function readSettings(value: unknown): RecapSettings {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    toOwner: row.to_owner === undefined ? DEFAULT_SETTINGS.toOwner : row.to_owner === true,
    toMembers: row.to_members === undefined ? DEFAULT_SETTINGS.toMembers : row.to_members === true,
    autoSend: row.auto_send === undefined ? DEFAULT_SETTINGS.autoSend : row.auto_send === true,
  };
}

function readOutcomes(value: unknown): RecapOutcome[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => ({
      email: typeof row.email === 'string' ? row.email : '',
      name: typeof row.name === 'string' ? row.name : '',
      language: typeof row.language === 'string' ? row.language : '',
      translated: row.translated === true,
      ok: row.ok === true,
    }));
}

/**
 * Who would get a recap of this note, and which of them the settings already pick.
 * Sends nothing. The Send recap dialog opens with this.
 */
export async function previewRecap(meetingId: string): Promise<PreviewResult> {
  const { data, error, response } = (await getSupabase().functions.invoke('recap', {
    body: { meeting_id: meetingId, preview: true },
  })) as {
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
    response?: Response;
  };

  if (error) {
    if (response?.status === 403) return { ok: false, message: MESSAGES.notAllowed };
    return { ok: false, message: MESSAGES.loadProblem };
  }
  if (data?.ok === true) {
    return {
      ok: true,
      recipients: readRecipients(data.recipients),
      settings: readSettings(data.settings),
      canSend: data.can_send !== false,
      sendProblem: typeof data.send_problem === 'string' ? data.send_problem : undefined,
    };
  }
  return { ok: false, message: typeof data?.message === 'string' ? data.message : MESSAGES.loadProblem };
}

/**
 * Sends the recap to the people whose ids are given.
 * Ids, never addresses: the server matches each id against the people really on the account and
 * drops anything else, so a recap can never reach somebody outside it.
 */
export async function sendRecap(meetingId: string, recipientUserIds: string[]): Promise<SendResult> {
  if (recipientUserIds.length === 0) return { ok: false, message: MESSAGES.nobody };

  const { data, error, response } = (await getSupabase().functions.invoke('recap', {
    body: { meeting_id: meetingId, recipient_user_ids: recipientUserIds },
  })) as {
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
    response?: Response;
  };

  if (error) {
    if (response?.status === 403) return { ok: false, message: MESSAGES.notAllowed };
    return { ok: false, message: MESSAGES.problem };
  }
  if (data?.ok === true) {
    return {
      ok: true,
      sent: typeof data.sent === 'number' ? data.sent : 0,
      failed: typeof data.failed === 'number' ? data.failed : 0,
      outcomes: readOutcomes(data.outcomes),
    };
  }
  return { ok: false, message: typeof data?.message === 'string' ? data.message : MESSAGES.problem };
}

/**
 * The account's recap settings, and whether the person looking at them is the owner.
 * Any member may read them. Only the owner may change them.
 */
export async function getRecapSettings(): Promise<{ isOwner: boolean; settings: RecapSettings }> {
  const { data, error } = await getSupabase().rpc('get_recap_settings').single();
  if (error) throw error;
  const row = (data ?? {}) as { is_owner?: unknown; settings?: unknown };
  return { isOwner: row.is_owner === true, settings: readSettings(row.settings) };
}

/** Saves the settings. The server refuses anybody who is not the account owner. */
export async function saveRecapSettings(settings: RecapSettings): Promise<RecapSettings> {
  const { data, error } = await getSupabase().rpc('save_recap_settings', {
    p_settings: {
      to_owner: settings.toOwner,
      to_members: settings.toMembers,
      auto_send: settings.autoSend,
    },
  });
  if (error) {
    if (error.message?.includes('not_owner')) throw new Error(MESSAGES.notOwner);
    if (error.message?.includes('no_account')) throw new Error(MESSAGES.noAccount);
    throw new Error(MESSAGES.settingsProblem);
  }
  return readSettings(data);
}

/** "2 people" / "1 person", so the confirm question reads like a sentence. */
export function peopleCount(n: number): string {
  return n === 1 ? '1 person' : `${n} people`;
}

/** Who recaps go to, in a few words, for the one-line row in the Your account box. */
export function shortRecipients(settings: RecapSettings): string {
  if (settings.toOwner && settings.toMembers) return 'The account owner and the team';
  if (settings.toOwner) return 'The account owner only';
  if (settings.toMembers) return 'The team only';
  return 'Nobody, unless picked by hand';
}

/** When they go out, in a few words, to sit under shortRecipients. */
export function shortWhen(settings: RecapSettings): string {
  return settings.autoSend
    ? 'Who gets a recap by email. Sent on its own as soon as a note is ready.'
    : 'Who gets a recap by email. Only sent when somebody presses Send recap.';
}
