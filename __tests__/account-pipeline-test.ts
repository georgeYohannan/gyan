/**
 * Deleting an account: the order things happen in.
 *
 * THE ORDER IS THE WHOLE FEATURE. Getting it wrong does not throw an error, it quietly leaves
 * somebody's recordings on a server where nobody can ever reach them again. So every test here
 * is about order, and about stopping cleanly when a step will not work.
 */
import {
  AccountError,
  MESSAGES,
  deleteProblem,
  runDeleteAccount,
  type Db,
  type Files,
} from '../supabase/functions/account/pipeline';

import { answer } from '../__mocks__/supabase-answer';

const GATE = { owned_accounts: ['a1'], note_count: 4, person_email: 'lone@example.test' };

function setUp(options: {
  claim?: { data?: unknown; error?: { message?: string } | null };
  deleteAccount?: { data?: unknown; error?: { message?: string } | null };
  listThrows?: boolean;
  removeThrows?: boolean;
  loginThrows?: boolean;
} = {}) {
  const steps: string[] = [];

  const db: Db = {
    rpc(name) {
      steps.push(name);
      if (name === 'claim_account_deletion') {
        return answer({
          data: options.claim?.data ?? [GATE],
          error: options.claim?.error ?? null,
        });
      }
      if (name === 'delete_account') {
        return answer({
          data: options.deleteAccount?.data ?? 1,
          error: options.deleteAccount?.error ?? null,
        });
      }
      return answer({ data: null, error: null });
    },
  };

  const files: Files = {
    async list(prefix) {
      steps.push('files.list');
      if (options.listThrows) throw new Error('storage is unhappy');
      return [`${prefix}/n1/one.mp3`, `${prefix}/n2/two.mp3`];
    },
    async remove() {
      steps.push('files.remove');
      if (options.removeThrows) throw new Error('storage is unhappy');
    },
  };

  const deleteLogin = async () => {
    steps.push('deleteLogin');
    if (options.loginThrows) throw new Error('auth is unhappy');
  };

  return { db, files, deleteLogin, steps };
}

describe('deleting an account', () => {
  test('THE FILES GO BEFORE THE ROWS, AND THE LOGIN GOES LAST', async () => {
    const { db, files, deleteLogin, steps } = setUp();

    const result = await runDeleteAccount({ db, files, deleteLogin, userId: 'u1' });

    expect(steps).toEqual([
      'claim_account_deletion',
      'files.list',
      'files.remove',
      'delete_account',
      'deleteLogin',
    ]);
    expect(result).toEqual({ workspacesDeleted: 1, filesRemoved: 2, noteCount: 4 });
  });

  test('the gate is asked first, and nothing at all happens when it says no', async () => {
    const { db, files, deleteLogin, steps } = setUp({
      claim: { error: { message: 'team_not_empty' } },
    });

    await expect(runDeleteAccount({ db, files, deleteLogin, userId: 'u1' })).rejects.toThrow(
      MESSAGES.teamNotEmpty,
    );
    expect(steps).toEqual(['claim_account_deletion']);
  });

  test('WHEN THE FILES WILL NOT GO, NOTHING IS DELETED and the person can try again', async () => {
    const { db, files, deleteLogin, steps } = setUp({ removeThrows: true });

    await expect(runDeleteAccount({ db, files, deleteLogin, userId: 'u1' })).rejects.toThrow(
      MESSAGES.filesProblem,
    );
    expect(steps).not.toContain('delete_account');
    expect(steps).not.toContain('deleteLogin');
  });

  test('the same when the files cannot even be listed', async () => {
    const { db, files, deleteLogin, steps } = setUp({ listThrows: true });

    await expect(runDeleteAccount({ db, files, deleteLogin, userId: 'u1' })).rejects.toThrow(
      MESSAGES.filesProblem,
    );
    expect(steps).toEqual(['claim_account_deletion', 'files.list']);
  });

  test('a person who owns no workspace keeps their team notes, and no files are touched', async () => {
    // A team member leaving: they own nothing, so there is nothing to sweep.
    const { db, files, deleteLogin, steps } = setUp({
      claim: { data: [{ owned_accounts: [], note_count: 0, person_email: 'mate@example.test' }] },
      deleteAccount: { data: 0 },
    });

    const result = await runDeleteAccount({ db, files, deleteLogin, userId: 'u2' });

    expect(steps).toEqual(['claim_account_deletion', 'delete_account', 'deleteLogin']);
    expect(steps).not.toContain('files.list');
    expect(result.filesRemoved).toBe(0);
  });

  test('every workspace the person owns is swept, not just the first', async () => {
    const { db, files, deleteLogin, steps } = setUp({
      claim: { data: [{ owned_accounts: ['a1', 'a2'], note_count: 9, person_email: 'x@example.test' }] },
    });

    const result = await runDeleteAccount({ db, files, deleteLogin, userId: 'u1' });

    expect(steps.filter((s) => s === 'files.list')).toHaveLength(2);
    expect(result.filesRemoved).toBe(4);
  });

  test('losing the login at the very end says so honestly, rather than pretending it worked', async () => {
    const { db, files, deleteLogin } = setUp({ loginThrows: true });

    await expect(runDeleteAccount({ db, files, deleteLogin, userId: 'u1' })).rejects.toThrow(
      MESSAGES.loginProblem,
    );
  });

  test.each([
    ['team_not_empty', MESSAGES.teamNotEmpty],
    ['invites_waiting', MESSAGES.invitesWaiting],
    ['no_account', MESSAGES.noAccount],
    ['something nobody planned for', MESSAGES.problem],
  ])('the database saying %s becomes one plain sentence', (code, words) => {
    expect(deleteProblem({ message: code })).toBe(words);
  });

  test('every message is a whole sentence a person could act on', () => {
    for (const words of Object.values(MESSAGES)) {
      expect(words.length).toBeGreaterThan(20);
      expect(words.trim()).toMatch(/\.$/);
    }
  });

  test('the error it throws is its own kind, so the door can tell it apart from a crash', async () => {
    const { db, files, deleteLogin } = setUp({ claim: { error: { message: 'team_not_empty' } } });
    await expect(runDeleteAccount({ db, files, deleteLogin, userId: 'u1' })).rejects.toBeInstanceOf(
      AccountError,
    );
  });
});
