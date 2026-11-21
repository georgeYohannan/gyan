/**
 * The Security settings and the two-factor sign in, without a network.
 *
 * What matters here is the behaviour at the edges: what happens when a setting cannot be
 * read, what a person is told when something goes wrong, and -- most of all -- that the
 * app never decides on its own that somebody has passed a check they have not.
 */
import { sentenceFor, timeAgo, type AuditEntry } from '@/lib/audit';
import { CONSENT_LINES, CONSENT_VERSION, consentFingerprint, consentKey } from '@/lib/consent';

const mockRpc = jest.fn();
const mockMfa = {
  listFactors: jest.fn(),
  enroll: jest.fn(),
  challenge: jest.fn(),
  verify: jest.fn(),
  unenroll: jest.fn(),
  getAuthenticatorAssuranceLevel: jest.fn(),
};

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc: mockRpc, auth: { mfa: mockMfa } }),
}));

// Imported after the mock, so the library talks to the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const security = require('@/lib/security') as typeof import('@/lib/security');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reading the settings in force', () => {
  test('hands back what the database says', async () => {
    mockRpc.mockResolvedValue({
      data: [{ retention_days: 90, email_summaries: false, inactivity_minutes: 15, is_owner: true }],
      error: null,
    });
    expect(await security.getSecuritySettings()).toEqual({
      retentionDays: 90,
      emailSummaries: false,
      inactivityMinutes: 15,
      isOwner: true,
    });
  });

  test('A PROBLEM READING THEM STILL SIGNS PEOPLE OUT, after the same 30 minutes', async () => {
    // Failing the other way would leave somebody signed in for ever because of a database
    // hiccup, which is the opposite of what this feature is for.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const settings = await security.getSecuritySettings();
    expect(settings.inactivityMinutes).toBe(30);
    // And it does not guess that somebody is the owner.
    expect(settings.isOwner).toBe(false);
  });

  test('null keeping time means keep for ever, not zero days', async () => {
    mockRpc.mockResolvedValue({ data: [{ retention_days: null, email_summaries: true, inactivity_minutes: 30, is_owner: true }], error: null });
    expect((await security.getSecuritySettings()).retentionDays).toBeNull();
  });
});

describe('changing the settings', () => {
  test('only the keys that were asked for are sent', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await security.saveSecuritySettings({ emailSummaries: false });
    expect(mockRpc).toHaveBeenCalledWith('save_account_privacy', { p_settings: { email_summaries: false } });
  });

  test('"keep for ever" is sent as null, and can be told apart from "do not change"', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await security.saveSecuritySettings({ retentionDays: null });
    expect(mockRpc).toHaveBeenCalledWith('save_account_privacy', { p_settings: { retention_days: null } });
  });

  test.each([
    ['not_owner', 'Only the account owner can change this.'],
    ['bad_retention', 'Pick 30, 90 or 365 days, or keep notes for ever.'],
    ['bad_minutes', 'Pick a time between 5 minutes and 8 hours.'],
  ])('%s is explained in plain words', async (code, message) => {
    mockRpc.mockResolvedValue({ error: { message: `error: ${code} (P0001)` } });
    expect((await security.saveSecuritySettings({ emailSummaries: true })).error).toBe(message);
  });

  test('an error nobody expected says nothing about the inside', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'relation "account_privacy" does not exist' } });
    const { error } = await security.saveSecuritySettings({ emailSummaries: true });
    expect(error).toBe('That did not save. Please try again.');
    expect(error).not.toContain('relation');
  });
});

describe('two-factor sign in', () => {
  test('it is on only when a factor is really finished', async () => {
    mockMfa.listFactors.mockResolvedValue({
      data: { all: [{ id: 'f1', factor_type: 'totp', status: 'unverified' }] },
      error: null,
    });
    // Started and never finished does NOT count as on. Treating it as on would tell
    // somebody they are protected when they are not.
    const half = await security.getTwoFactor();
    expect(half.on).toBe(false);
    expect(half.unfinished).toEqual(['f1']);

    mockMfa.listFactors.mockResolvedValue({
      data: { all: [{ id: 'f2', factor_type: 'totp', status: 'verified' }] },
      error: null,
    });
    expect(await security.getTwoFactor()).toEqual({ on: true, factorId: 'f2', unfinished: [] });
  });

  test('a problem asking does not claim it is on', async () => {
    mockMfa.listFactors.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect((await security.getTwoFactor()).on).toBe(false);
  });

  test('setting up clears away anything half-started first', async () => {
    mockMfa.listFactors.mockResolvedValue({
      data: { all: [{ id: 'old', factor_type: 'totp', status: 'unverified' }] },
      error: null,
    });
    mockMfa.unenroll.mockResolvedValue({ error: null });
    mockMfa.enroll.mockResolvedValue({
      data: { id: 'new', totp: { qr_code: '<svg/>', secret: 'ABC', uri: 'otpauth://x' } },
      error: null,
    });

    const { setup } = await security.startTwoFactor();
    // Otherwise a second attempt is refused and the screen sticks with no way forward.
    expect(mockMfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' });
    expect(setup?.factorId).toBe('new');
    expect(setup?.secret).toBe('ABC');
    expect(setup?.qrImage).toBe('data:image/svg+xml;base64,PHN2Zy8+');
    expect(atob(setup!.qrImage.split('base64,')[1])).toBe('<svg/>');
  });

test('THE PICTURE WORKS EVEN THOUGH THE LIBRARY ALREADY ADDED A PREFIX', async () => {
    // Supabase's type notes say to prepend `data:image/svg+xml;utf-8,` yourself. Its code
    // already does it. Following the note gives the prefix twice and a picture that cannot
    // load -- which looks like a blank square, not like an error.
    mockMfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    mockMfa.enroll.mockResolvedValue({
      data: {
        id: 'f1',
        totp: {
          qr_code: 'data:image/svg+xml;utf-8,<svg fill="#fff"/>',
          secret: 'S',
          uri: 'otpauth://x',
        },
      },
      error: null,
    });

    const { setup } = await security.startTwoFactor();
    // One prefix, not two.
    expect(setup!.qrImage.match(/data:image/g)).toHaveLength(1);
    // And the SVG survives whole, including the # in the colour. Written straight into an
    // address, a # ends it, and everything after the first colour is thrown away.
    expect(atob(setup!.qrImage.split('base64,')[1])).toBe('<svg fill="#fff"/>');
  });

  test('A CODE THAT IS NOT SIX DIGITS NEVER REACHES THE SERVER', async () => {
    for (const code of ['', '12345', '1234567', 'abcdef']) {
      const { error } = await security.confirmTwoFactor('f1', code);
      expect(error).toBe('Type the 6 digits from your authenticator app.');
    }
    expect(mockMfa.challenge).not.toHaveBeenCalled();
  });

  test('a code typed with spaces still works', async () => {
    mockMfa.challenge.mockResolvedValue({ data: { id: 'c1' }, error: null });
    mockMfa.verify.mockResolvedValue({ error: null });
    expect(await security.confirmTwoFactor('f1', '123 456')).toEqual({});
    expect(mockMfa.verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'c1', code: '123456' });
  });

  test('a wrong code says what to do about it', async () => {
    mockMfa.challenge.mockResolvedValue({ data: { id: 'c1' }, error: null });
    mockMfa.verify.mockResolvedValue({ error: { message: 'Invalid TOTP code entered' } });
    const { error } = await security.confirmTwoFactor('f1', '000000');
    expect(error).toContain('did not work');
    expect(error).toContain('30 seconds');
  });

  test('THE APP NEVER DECIDES BY ITSELF THAT A CODE IS NOT NEEDED', async () => {
    // Supabase says where the session is and how far it could go. A code is needed only when
    // it could go further than it has AND there is a finished factor to use.
    mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    mockMfa.listFactors.mockResolvedValue({
      data: { all: [{ id: 'f9', factor_type: 'totp', status: 'verified' }] },
      error: null,
    });
    expect(await security.needsTwoFactor()).toEqual({ needed: true, factorId: 'f9' });

    // Already at the higher level: nothing more to ask for.
    mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });
    expect(await security.needsTwoFactor()).toEqual({ needed: false });

    // Nobody has set one up.
    mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    });
    expect(await security.needsTwoFactor()).toEqual({ needed: false });
  });

  test('a problem asking does not lock somebody out of their own notes', async () => {
    mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await security.needsTwoFactor()).toEqual({ needed: false });
  });
});

describe('the record, in words a person reads', () => {
  const entry = (over: Partial<AuditEntry>): AuditEntry => ({
    id: 1,
    action: 'sign_in',
    actorName: 'Priya Raman',
    isYou: false,
    noteTitle: null,
    detail: {},
    at: '2026-11-20T09:00:00Z',
    ...over,
  });

  test.each([
    ['sign_in', 'Priya Raman signed in'],
    ['note_delete', 'Priya Raman deleted a note'],
    ['note_share', 'Priya Raman emailed a recap'],
    ['team_change', 'Priya Raman changed who is on the team'],
    ['two_factor_on', 'Priya Raman turned on two-factor sign in'],
    ['data_export', 'Priya Raman downloaded a copy of their data'],
  ] as const)('%s reads as a sentence', (action, sentence) => {
    expect(sentenceFor(entry({ action }))).toBe(sentence);
  });

  test('it says "You" about yourself', () => {
    expect(sentenceFor(entry({ isYou: true, action: 'note_delete' }))).toBe('You deleted a note');
  });

  test('a settings change says WHICH setting, in the words of the screen', () => {
    expect(sentenceFor(entry({ action: 'settings_change', detail: { setting: 'retention_days' } }))).toBe(
      'Priya Raman changed how long notes are kept',
    );
    expect(sentenceFor(entry({ action: 'settings_change', detail: { setting: 'email_summaries' } }))).toBe(
      'Priya Raman changed what emails may carry',
    );
  });

  test('an automatic deletion blames nobody, because nobody did it', () => {
    const line = sentenceFor(entry({ action: 'retention_delete', detail: { retention_days: 90 } }));
    expect(line).toBe('A note was deleted automatically, after 90 days');
    expect(line).not.toContain('Priya');
  });

  test('a removed person is named as one, never left blank', () => {
    expect(sentenceFor(entry({ actorName: 'A removed person' }))).toBe('A removed person signed in');
  });

  test('times read the way people say them', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(timeAgo('2026-11-20T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-20T11:59:00Z', now)).toBe('1 minute ago');
    expect(timeAgo('2026-11-20T11:30:00Z', now)).toBe('30 minutes ago');
    expect(timeAgo('2026-11-20T11:00:00Z', now)).toBe('1 hour ago');
    expect(timeAgo('2026-11-19T12:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-11-15T12:00:00Z', now)).toBe('5 days ago');
    expect(timeAgo('2026-09-20T12:00:00Z', now)).toBe('2 months ago');
    expect(timeAgo('2025-11-20T12:00:00Z', now)).toBe('1 year ago');
  });

  test('a time that makes no sense shows nothing rather than "NaN"', () => {
    expect(timeAgo('not a date')).toBe('');
  });
});

describe('the consent record', () => {
  test('the fingerprint changes when the words change', () => {
    const now = consentFingerprint();
    expect(consentFingerprint([...CONSENT_LINES])).toBe(now);
    expect(consentFingerprint(['different words'])).not.toBe(now);
    // Even a small edit counts, which is the whole point.
    expect(consentFingerprint([CONSENT_LINES[0] + '.'])).not.toBe(now);
  });

  test('it carries the version, so a saved record says which wording it was', () => {
    expect(consentFingerprint().startsWith(`${CONSENT_VERSION}-`)).toBe(true);
  });

  test('the device key is per person and per version', () => {
    expect(consentKey('abc')).toBe(`gyan.consent.${CONSENT_VERSION}.abc`);
    expect(consentKey('abc')).not.toBe(consentKey('def'));
  });

  test('the words are the ones a lawyer still has to look at', () => {
    expect(CONSENT_LINES.length).toBeGreaterThanOrEqual(3);
    for (const line of CONSENT_LINES) expect(line.length).toBeGreaterThan(20);
    expect(CONSENT_LINES.join(' ')).toContain('recorded');
  });
});
