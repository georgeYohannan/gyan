/**
 * Checking that a stored file really is where it claims to be.
 *
 * This guards a REAL hole, found by the security review of this round's own code:
 * `meetings.file_path` is written by the app, and three server functions hand it to storage
 * with the service key, which skips every rule. A path like
 *
 *   "<account>/<note>/../../<other account>/<their note>/recording.m4a"
 *
 * starts with the right prefix, so a check on the start of the string passes it -- and the
 * "../.." is then removed by the thing that turns a path into a web address, so storage is
 * handed an ordinary key belonging to somebody else.
 */
import { isPathInsideAccount, WRONG_PLACE_MESSAGE } from '../supabase/functions/_shared/paths';

const ACCOUNT = '00e242a9-6ded-4eec-9d86-2de27fb5f384';
const OTHER = '11111111-1111-4111-8111-111111111111';

describe('a path inside the account', () => {
  test.each([
    `${ACCOUNT}/note-1/recording.mp3`,
    `${ACCOUNT}/note-1/pasted-text.txt`,
    `${ACCOUNT}/exports/abc.zip`,
    `${ACCOUNT}/a/b/c/d.mp3`,
  ])('%s is allowed', (path) => {
    expect(isPathInsideAccount(path, ACCOUNT)).toBe(true);
  });
});

describe('CLIMBING OUT OF THE FOLDER IS REFUSED', () => {
  test('the exact attack: a prefix that is right, then two steps up', () => {
    const attack = `${ACCOUNT}/note-1/../../${OTHER}/their-note/recording.m4a`;
    // It really does start with the account, which is why a prefix check was not enough.
    expect(attack.startsWith(`${ACCOUNT}/`)).toBe(true);
    // And it really does become somebody else's file once it is made into an address.
    expect(new URL(`https://h/object/notes-files/${attack}`).pathname).toContain(OTHER);
    // So it has to be refused here.
    expect(isPathInsideAccount(attack, ACCOUNT)).toBe(false);
  });

  test.each([
    ['one step up', `${ACCOUNT}/../${OTHER}/x.mp3`],
    ['a step up at the end', `${ACCOUNT}/note/..`],
    ['a current-folder step', `${ACCOUNT}/./note/x.mp3`],
    ['many steps', `${ACCOUNT}/a/../../../../../etc/passwd`],
    ['an empty segment', `${ACCOUNT}//x.mp3`],
    ['a leading slash', `/${ACCOUNT}/note/x.mp3`],
    ['a backslash', `${ACCOUNT}\\..\\${OTHER}\\x.mp3`],
    ['a null byte', `${ACCOUNT}/note/x.mp3\u0000.txt`],
  ])('%s is refused', (_name, path) => {
    expect(isPathInsideAccount(path, ACCOUNT)).toBe(false);
  });

  test('ANOTHER ACCOUNT’S FOLDER IS REFUSED OUTRIGHT', () => {
    expect(isPathInsideAccount(`${OTHER}/their-note/x.mp3`, ACCOUNT)).toBe(false);
  });

  test('an account id that is only a PREFIX of ours is refused', () => {
    // The oldest trick in the book: a folder whose name starts the same way.
    expect(isPathInsideAccount(`${ACCOUNT}-evil/note/x.mp3`, ACCOUNT)).toBe(false);
  });

  test.each([
    ['nothing', ''],
    ['a bare name', 'recording.mp3'],
    ['just the account', ACCOUNT],
  ])('%s is refused', (_name, path) => {
    expect(isPathInsideAccount(path, ACCOUNT)).toBe(false);
  });

  test('it refuses everything when the account is not known', () => {
    // Fail closed. A missing account must never mean "anything goes".
    expect(isPathInsideAccount(`${ACCOUNT}/note/x.mp3`, '')).toBe(false);
  });
});

describe('what a person is told', () => {
  test('the message says what to do, and nothing about the inside', () => {
    expect(WRONG_PLACE_MESSAGE).toContain('could not open that file');
    expect(WRONG_PLACE_MESSAGE).not.toMatch(/path|traversal|account id|storage|bucket/i);
  });
});
