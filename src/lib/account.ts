/**
 * Deleting things: one note, or the whole account.
 *
 * Both are permanent, so both are built the same way: the screen asks first, the database
 * decides, and the app itself is never the thing that says yes.
 */
import { getSupabase } from '@/lib/supabase';

export const CONFIRM_WORD = 'DELETE';

export const MESSAGES = {
  loadProblem: 'Gyan could not check your account just now. Please try again.',
  noAccount: 'Gyan could not find your account.',
  notYours: 'You can only delete a note you made. Ask the account owner to delete this one.',
  notAllowed: 'You cannot delete this note.',
  noSuchNote: 'That note has already been deleted.',
  noteProblem: 'Gyan could not delete that note just now. Please try again.',
  deleteProblem: 'Gyan could not delete your account just now. Nothing has been deleted. Please try again.',
  typeToConfirm: `Type ${CONFIRM_WORD} to confirm.`,
} as const;

/** Why somebody can or cannot delete their account, in words straight from the server. */
export type DeleteCheck = {
  isOwner: boolean;
  canDelete: boolean;
  /** Set only when they cannot: what is in the way, and how to clear it. */
  reason?: string;
  /** Set only when they can: exactly what will go. */
  whatGoes?: string;
  noteCount: number;
  otherMemberCount: number;
  pendingInviteCount: number;
};

type Raw = Record<string, unknown>;

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function readDeleteCheck(value: unknown): DeleteCheck {
  const row = (value && typeof value === 'object' ? value : {}) as Raw;
  return {
    isOwner: row.is_owner === true,
    canDelete: row.can_delete === true,
    reason: typeof row.reason === 'string' && row.reason !== '' ? row.reason : undefined,
    whatGoes: typeof row.what_goes === 'string' && row.what_goes !== '' ? row.what_goes : undefined,
    noteCount: num(row.note_count),
    otherMemberCount: num(row.other_member_count),
    pendingInviteCount: num(row.pending_invite_count),
  };
}

/** Asks whether this person may delete their account, and what would happen if they did. */
export async function canDeleteAccount(): Promise<DeleteCheck> {
  const { data, error } = await getSupabase().rpc('can_delete_account').single();
  if (error) throw new Error(MESSAGES.loadProblem);
  return readDeleteCheck(data);
}

/**
 * Deletes one note, and the recording it came from.
 *
 * The note's rows go first, in one step, because the database can do that atomically and hands
 * back where the file is. The file goes second. If the file will not go, the note is still
 * gone from the person's view, and the stray file is swept up later if the whole account is
 * ever deleted. Saying "that did not work" after the note has already gone would be worse.
 */
export async function deleteNote(meetingId: string): Promise<void> {
  const { data, error } = await getSupabase().rpc('delete_note', { p_meeting_id: meetingId });
  if (error) {
    const text = error.message ?? '';
    if (text.includes('not_yours')) throw new Error(MESSAGES.notYours);
    if (text.includes('not_allowed')) throw new Error(MESSAGES.notAllowed);
    if (text.includes('no_such_note')) throw new Error(MESSAGES.noSuchNote);
    throw new Error(MESSAGES.noteProblem);
  }

  const path = typeof data === 'string' ? data : '';
  if (path !== '') {
    // The app is allowed to remove its own account's files, so no server function is needed.
    await getSupabase().storage.from('notes-files').remove([path]);
  }
}

/**
 * Deletes the whole account. THERE IS NO WAY BACK FROM THIS.
 *
 * It goes to the server function, because only the server may remove a login and sweep a whole
 * workspace out of the files bucket. Every guard lives in the database, not here: this function
 * cannot talk its way past anything.
 */
export async function deleteAccount(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = (await getSupabase().functions.invoke('account', {
    body: { confirm: true },
  })) as { data: Raw | null; error: { message?: string } | null };

  if (error) return { ok: false, message: MESSAGES.deleteProblem };
  if (data?.ok === true) return { ok: true };
  return {
    ok: false,
    message: typeof data?.message === 'string' ? data.message : MESSAGES.deleteProblem,
  };
}

/** True only when the person has typed the confirm word exactly. Spaces around it are fine. */
export function confirmed(typed: string): boolean {
  return typed.trim() === CONFIRM_WORD;
}
