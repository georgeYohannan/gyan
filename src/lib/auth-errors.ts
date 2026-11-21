/** Turns Supabase login errors into short, friendly sentences. */
export function friendlyAuthError(error: { code?: string; message?: string; status?: number }): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'That email and password do not match. Check them and try again.';
    case 'email_not_confirmed':
      return 'Please confirm your email first. Open the email we sent you and tap the link.';
    case 'user_already_exists':
    case 'email_exists':
      return 'That email already has an account. Try logging in instead.';
    case 'weak_password':
      return `That password is too easy to guess. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    case 'email_address_invalid':
    case 'validation_failed':
      return 'That email does not look right. Check it and try again.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many tries. Wait a few minutes, then try again.';
    case 'signup_disabled':
      return 'Sign ups are turned off right now.';
  }
  if (error.status === 0 || /network|fetch/i.test(error.message ?? '')) {
    return 'We could not reach the internet. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** Basic email shape check, so people get a quick hint before we ask the server. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * The shortest password Gyan accepts.
 *
 * Twelve, not eight. Supabase's own guidance says anything under eight is not recommended,
 * and length is what actually makes a password hard to guess -- far more than forcing a
 * capital letter and a symbol, which mostly produces "Password1!" and a sticky note.
 *
 * Gyan only checks this BEFORE asking the server, so somebody gets a quick answer instead of
 * a round trip. The real rule is the one set in the Supabase dashboard, which is in the
 * hand-over list, because no amount of app code can enforce it.
 */
export const MIN_PASSWORD_LENGTH = 12;
