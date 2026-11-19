/**
 * The app's side of sending a recap: what it asks the server for, and how it reads the answer.
 * No real server, no real email. Every address is made up.
 */
import {
  DEFAULT_SETTINGS,
  getRecapSettings,
  MESSAGES,
  peopleCount,
  previewRecap,
  readSettings,
  saveRecapSettings,
  sendRecap,
  shortRecipients,
  shortWhen,
} from '@/lib/recaps';

const mockInvoke = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
  }),
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockRpc.mockReset();
});

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

describe('showing who would get a recap', () => {
  test('it asks the recap function for a preview, which sends nothing', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, recipients: [], settings: {} }, error: null });
    await previewRecap('note-1');
    expect(mockInvoke).toHaveBeenCalledWith('recap', {
      body: { meeting_id: 'note-1', preview: true },
    });
  });

  test('it reads each person, and which of them the settings already pick', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        ok: true,
        recipients: [
          { user_id: OWNER_ID, email: 'owner@example.test', name: 'Sam Carter', role: 'owner', language: 'en', default_on: true, is_you: true },
          { user_id: MEMBER_ID, email: 'priya@example.test', name: '', role: 'member', language: 'hi', default_on: false },
        ],
        settings: { to_owner: true, to_members: false, auto_send: true },
        can_send: true,
      },
      error: null,
    });
    const result = await previewRecap('note-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipients[0]).toEqual({
      userId: OWNER_ID,
      email: 'owner@example.test',
      name: 'Sam Carter',
      role: 'owner',
      language: 'en',
      defaultOn: true,
      isYou: true,
    });
    // With no name of their own, a person is shown by address rather than as a blank.
    expect(result.recipients[1].name).toBe('priya@example.test');
    // The server says which row is you. The app never guesses from an address.
    expect(result.recipients[1].isYou).toBe(false);
    expect(result.settings).toEqual({ toOwner: true, toMembers: false, autoSend: true });
    expect(result.canSend).toBe(true);
  });

  test('WHEN EMAIL IS NOT SET UP, it says so instead of blaming a send', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        ok: true,
        recipients: [],
        settings: {},
        can_send: false,
        send_problem: 'Gyan cannot send emails yet. The email service is not set up on the server.',
      },
      error: null,
    });
    const result = await previewRecap('note-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canSend).toBe(false);
    expect(result.sendProblem).toBe(
      'Gyan cannot send emails yet. The email service is not set up on the server.',
    );
  });

  test('a note somebody may not see says so, rather than giving a vague error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'no' }, response: { status: 403 } });
    expect(await previewRecap('note-1')).toEqual({ ok: false, message: MESSAGES.notAllowed });
  });

  test('anything else is a plain message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'offline' }, response: { status: 500 } });
    expect(await previewRecap('note-1')).toEqual({ ok: false, message: MESSAGES.loadProblem });
  });

  test('a message from the server is passed through as it is', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false, message: 'The email service is busy.' }, error: null });
    expect(await previewRecap('note-1')).toEqual({ ok: false, message: 'The email service is busy.' });
  });

  test('junk rows are thrown away instead of breaking the list', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, recipients: [null, 'nope', { email: 'no id@example.test' }, 7], settings: {} },
      error: null,
    });
    const result = await previewRecap('note-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipients).toEqual([]);
  });
});

describe('sending a recap', () => {
  test('IT SENDS IDS, NEVER ADDRESSES', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, sent: 1, failed: 0, outcomes: [] }, error: null });
    await sendRecap('note-1', [OWNER_ID]);
    expect(mockInvoke).toHaveBeenCalledWith('recap', {
      body: { meeting_id: 'note-1', recipient_user_ids: [OWNER_ID] },
    });
    // Nothing that looks like an email address is ever in what we send.
    expect(JSON.stringify(mockInvoke.mock.calls)).not.toContain('@');
  });

  test('nobody picked means nothing is even asked for', async () => {
    expect(await sendRecap('note-1', [])).toEqual({ ok: false, message: MESSAGES.nobody });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('it reads back how many went and what happened to each one', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        ok: true,
        sent: 1,
        failed: 1,
        outcomes: [
          { email: 'owner@example.test', name: 'Sam Carter', language: 'English', translated: false, ok: true },
          { email: 'priya@example.test', name: 'Priya Shah', language: 'Hindi', translated: true, ok: false },
        ],
      },
      error: null,
    });
    const result = await sendRecap('note-1', [OWNER_ID, MEMBER_ID]);
    expect(result).toEqual({
      ok: true,
      sent: 1,
      failed: 1,
      outcomes: [
        { email: 'owner@example.test', name: 'Sam Carter', language: 'English', translated: false, ok: true },
        { email: 'priya@example.test', name: 'Priya Shah', language: 'Hindi', translated: true, ok: false },
      ],
    });
  });

  test('a refusal and a breakdown read differently', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'no' }, response: { status: 403 } });
    expect(await sendRecap('note-1', [OWNER_ID])).toEqual({ ok: false, message: MESSAGES.notAllowed });
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'no' }, response: { status: 500 } });
    expect(await sendRecap('note-1', [OWNER_ID])).toEqual({ ok: false, message: MESSAGES.problem });
  });
});

describe('the recap settings', () => {
  test('reading them says what is set and whether this person may change it', async () => {
    mockRpc.mockReturnValue({
      single: async () => ({
        data: { account_id: 'a', is_owner: true, settings: { to_owner: false, to_members: true, auto_send: true } },
        error: null,
      }),
    });
    expect(await getRecapSettings()).toEqual({
      isOwner: true,
      settings: { toOwner: false, toMembers: true, autoSend: true },
    });
    expect(mockRpc).toHaveBeenCalledWith('get_recap_settings');
  });

  test('saving sends the three switches and nothing else', async () => {
    mockRpc.mockResolvedValue({ data: { to_owner: true, to_members: true, auto_send: false }, error: null });
    const saved = await saveRecapSettings({ toOwner: true, toMembers: true, autoSend: false });
    expect(mockRpc).toHaveBeenCalledWith('save_recap_settings', {
      p_settings: { to_owner: true, to_members: true, auto_send: false },
    });
    expect(saved).toEqual({ toOwner: true, toMembers: true, autoSend: false });
  });

  test('A MEMBER WHO IS NOT THE OWNER IS TOLD WHY IT DID NOT SAVE', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_owner' } });
    await expect(saveRecapSettings(DEFAULT_SETTINGS)).rejects.toThrow(MESSAGES.notOwner);
  });

  test('any other problem is a plain message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection lost' } });
    await expect(saveRecapSettings(DEFAULT_SETTINGS)).rejects.toThrow(MESSAGES.settingsProblem);
  });

  test('the safe default is the owner only, and no sending on its own', () => {
    expect(DEFAULT_SETTINGS).toEqual({ toOwner: true, toMembers: false, autoSend: false });
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(readSettings('junk')).toEqual(DEFAULT_SETTINGS);
  });

  test('anything that is not plainly true counts as off', () => {
    expect(readSettings({ to_owner: 'yes', to_members: 1, auto_send: null })).toEqual({
      toOwner: false,
      toMembers: false,
      autoSend: false,
    });
  });
});

describe('the words the screens use', () => {
  test('one person reads as one person', () => {
    expect(peopleCount(1)).toBe('1 person');
    expect(peopleCount(2)).toBe('2 people');
    expect(peopleCount(0)).toBe('0 people');
  });

  test('the row on Home says who gets a recap, in a few plain words', () => {
    expect(shortRecipients({ toOwner: true, toMembers: false, autoSend: false })).toBe('The account owner only');
    expect(shortRecipients({ toOwner: true, toMembers: true, autoSend: false })).toBe('The account owner and the team');
    expect(shortRecipients({ toOwner: false, toMembers: true, autoSend: false })).toBe('The team only');
    expect(shortRecipients({ toOwner: false, toMembers: false, autoSend: false })).toBe('Nobody, unless picked by hand');
  });

  test('and the line under it says when they go out', () => {
    expect(shortWhen({ toOwner: true, toMembers: false, autoSend: true })).toContain('as soon as a note is ready');
    expect(shortWhen({ toOwner: true, toMembers: false, autoSend: false })).toContain('presses Send recap');
  });
});
