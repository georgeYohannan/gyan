// Deleting somebody's gyan account: the order things happen in, with no network of its own.
//
// THE ORDER IS THE FEATURE HERE, so everything that touches the outside world is handed in and
// a test can prove the order is right. Getting it wrong does not throw an error, it quietly
// leaves somebody's recordings sitting on a server that nobody can ever reach again.

export class AccountError extends Error {}

export const MESSAGES = {
  teamNotEmpty:
    'You still have people on your account. Remove everybody on the Team screen first, then you can delete your account.',
  invitesWaiting:
    'You have invites still waiting to be accepted. Take them back on the Team screen first.',
  noAccount: 'Gyan could not find your account.',
  filesProblem:
    'Gyan could not remove your files, so nothing has been deleted. Please try again in a minute.',
  problem: 'Gyan could not delete your account just now. Nothing has been deleted. Please try again.',
  loginProblem:
    'Your notes and files are deleted, but your login could not be removed. Please tell us so we can finish it.',
} as const;

export type Db = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
};

/** The two things this needs from storage. Handed in, so a test can stand in for them. */
export type Files = {
  /** Every file under this folder, as full paths. */
  list(prefix: string): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
};

export type DeleteOptions = {
  db: Db;
  files: Files;
  deleteLogin: (userId: string) => Promise<void>;
  userId: string;
};

export type DeleteResult = {
  workspacesDeleted: number;
  filesRemoved: number;
  noteCount: number;
};

export function deleteProblem(error: { message?: string } | null): string {
  const text = error?.message ?? '';
  if (text.includes('team_not_empty')) return MESSAGES.teamNotEmpty;
  if (text.includes('invites_waiting')) return MESSAGES.invitesWaiting;
  if (text.includes('no_account')) return MESSAGES.noAccount;
  return MESSAGES.problem;
}

type Claim = { owned_accounts: unknown; note_count: number; person_email: string | null };

function firstRow(data: unknown): Claim | undefined {
  if (Array.isArray(data)) return data[0] as Claim | undefined;
  return (data ?? undefined) as Claim | undefined;
}

/**
 * Deletes one person's gyan account.
 *
 * The order, and why each step is where it is:
 *
 *   1. ASK THE DATABASE IF THIS MAY HAPPEN AT ALL. It changes nothing; it checks the same two
 *      things the screen checked (no team, no waiting invites) in a place the app cannot skip,
 *      and hands back which workspaces this person owns.
 *
 *   2. REMOVE THE FILES FIRST, BEFORE ANY ROW IS DELETED. Database rules do not reach storage.
 *      Once the rows are gone there is nothing left that knows the file paths, and the bucket
 *      is private, so those recordings could never be seen or removed by anybody again. If this
 *      step fails we stop, and NOTHING has been deleted: the person can simply try again.
 *
 *   3. Delete the workspaces. One delete; everything inside them follows.
 *
 *   4. DELETE THE LOGIN LAST, because it is the only step that cannot be retried. While the
 *      login still exists the person can sign in and press the button again. Deleting it also
 *      takes their name off any note they made on somebody else's team, and those notes stay
 *      with that team, which is what the founder decided.
 */
export async function runDeleteAccount(o: DeleteOptions): Promise<DeleteResult> {
  // 1.
  const claim = await o.db.rpc('claim_account_deletion', { p_user_id: o.userId });
  if (claim.error) throw new AccountError(deleteProblem(claim.error));
  const gate = firstRow(claim.data);
  if (!gate) throw new AccountError(MESSAGES.problem);

  const owned = Array.isArray(gate.owned_accounts) ? (gate.owned_accounts as string[]) : [];

  // 2.
  let filesRemoved = 0;
  try {
    for (const accountId of owned) {
      const paths = await o.files.list(accountId);
      if (paths.length > 0) {
        await o.files.remove(paths);
        filesRemoved += paths.length;
      }
    }
  } catch {
    // Nothing has been deleted yet. Say so plainly rather than carrying on half way.
    throw new AccountError(MESSAGES.filesProblem);
  }

  // 3.
  const gone = await o.db.rpc('delete_account', { p_user_id: o.userId });
  if (gone.error) throw new AccountError(deleteProblem(gone.error));

  // 4.
  try {
    await o.deleteLogin(o.userId);
  } catch {
    throw new AccountError(MESSAGES.loginProblem);
  }

  return {
    workspacesDeleted: typeof gone.data === 'number' ? gone.data : owned.length,
    filesRemoved,
    noteCount: gate.note_count ?? 0,
  };
}
