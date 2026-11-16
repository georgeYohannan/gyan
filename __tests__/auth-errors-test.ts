import { friendlyAuthError, looksLikeEmail } from '@/lib/auth-errors';

describe('friendlyAuthError', () => {
  test.each([
    ['invalid_credentials', /do not match/],
    ['email_not_confirmed', /confirm your email/],
    ['user_already_exists', /already has an account/],
    ['weak_password', /at least 8/],
    ['over_email_send_rate_limit', /Wait a few minutes/],
  ])('%s gives plain words', (code, pattern) => {
    expect(friendlyAuthError({ code })).toMatch(pattern);
  });

  test('network problems are explained', () => {
    expect(friendlyAuthError({ message: 'Failed to fetch' })).toMatch(/internet/);
  });

  test('unknown errors never show raw technical text', () => {
    expect(friendlyAuthError({ code: 'x', message: 'PGRST301 jwt expired' })).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('looksLikeEmail', () => {
  test('accepts and rejects', () => {
    expect(looksLikeEmail('a@b.co')).toBe(true);
    expect(looksLikeEmail(' a@b.co ')).toBe(true);
    expect(looksLikeEmail('nope')).toBe(false);
    expect(looksLikeEmail('a@b')).toBe(false);
  });
});
