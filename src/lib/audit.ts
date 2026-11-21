import { getSupabase } from '@/lib/supabase';

/**
 * The record of what has happened on an account: who did what, to which note, and when.
 *
 * Only the account owner can read it, and the database enforces that -- this file just asks.
 * Nothing here ever holds the words of a meeting; the log is ids and fixed facts only, which
 * is why a row has to be turned into a sentence on the way out.
 */

/** The things that get written down. The database refuses anything not on this list. */
export type AuditAction =
  | 'sign_in'
  | 'note_view'
  | 'note_export'
  | 'note_share'
  | 'note_delete'
  | 'settings_change'
  | 'team_change'
  | 'account_delete'
  | 'retention_delete'
  | 'consent_accept'
  | 'two_factor_on'
  | 'two_factor_off'
  | 'data_export';

export type AuditEntry = {
  id: number;
  action: AuditAction;
  actorName: string;
  isYou: boolean;
  noteTitle: string | null;
  detail: Record<string, unknown>;
  at: string;
};

/** How many to show at once. More arrive when somebody asks for them. */
export const AUDIT_PAGE_SIZE = 25;

/**
 * Turns one row into a sentence.
 *
 * Written from the reader's side: what somebody DID, in the words a person would use.
 * "changed a setting" rather than "settings_change", and never the name of a database column.
 */
export function sentenceFor(entry: AuditEntry): string {
  const who = entry.isYou ? 'You' : entry.actorName;
  switch (entry.action) {
    case 'sign_in':
      return `${who} signed in`;
    case 'note_view':
      return `${who} opened a note`;
    case 'note_export':
      return `${who} exported a note`;
    case 'note_share':
      return `${who} emailed a recap`;
    case 'note_delete':
      return `${who} deleted a note`;
    case 'settings_change':
      return `${who} changed ${settingName(entry.detail)}`;
    case 'team_change':
      return `${who} changed who is on the team`;
    case 'account_delete':
      return `${who} deleted an account`;
    case 'retention_delete':
      // Nobody did this one: it happened because of the keeping time.
      return `A note was deleted automatically, after ${keepingTime(entry.detail)}`;
    case 'consent_accept':
      return `${who} agreed to the recording notice`;
    case 'two_factor_on':
      return `${who} turned on two-factor sign in`;
    case 'two_factor_off':
      return `${who} turned off two-factor sign in`;
    case 'data_export':
      return `${who} downloaded a copy of their data`;
    default:
      return `${who} did something`;
  }
}

function settingName(detail: Record<string, unknown>): string {
  switch (detail.setting) {
    case 'retention_days':
      return 'how long notes are kept';
    case 'email_summaries':
      return 'what emails may carry';
    case 'inactivity_minutes':
      return 'the automatic sign out time';
    default:
      return 'a setting';
  }
}

function keepingTime(detail: Record<string, unknown>): string {
  const days = Number(detail.retention_days);
  return Number.isFinite(days) && days > 0 ? `${days} days` : 'its keeping time';
}

/**
 * "2 hours ago". Written by hand rather than with a locale, so it reads the same wherever
 * it runs and a test can be sure of it.
 */
export function timeAgo(when: string, now: Date = new Date()): string {
  const then = new Date(when);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? 'yesterday' : `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.round(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/** Reads a page of the log. `before` continues from the oldest row already shown. */
export async function listAudit(
  options: { before?: string; myUserId?: string } = {},
): Promise<{ entries?: AuditEntry[]; error?: string }> {
  const { data, error } = await getSupabase().rpc('list_audit_log', {
    p_limit: AUDIT_PAGE_SIZE,
    p_before: options.before ?? null,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('not_owner')) return { error: 'not_owner' };
    return { error: 'Gyan could not read the record just now. Please try again.' };
  }

  const rows = (data ?? []) as {
    id: number;
    action: string;
    actor_user_id: string | null;
    actor_name: string;
    meeting_title: string | null;
    detail: Record<string, unknown> | null;
    created_at: string;
  }[];

  return {
    entries: rows.map((row) => ({
      id: row.id,
      action: row.action as AuditAction,
      actorName: row.actor_name,
      isYou: !!options.myUserId && row.actor_user_id === options.myUserId,
      noteTitle: row.meeting_title,
      detail: row.detail ?? {},
      at: row.created_at,
    })),
  };
}

/**
 * Writes down something the person just did. Fire and forget on purpose: the record is
 * worth having, and never worth stopping somebody from using the app over.
 */
export async function recordMyAction(action: 'sign_in' | 'note_view' | 'consent_accept', meetingId?: string): Promise<void> {
  try {
    await getSupabase().rpc('record_my_action', { p_action: action, p_meeting_id: meetingId ?? null });
  } catch {
    /* nothing to do, and nothing worth interrupting anybody for */
  }
}
