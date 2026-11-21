import { getSupabase } from '@/lib/supabase';

/**
 * The Security settings, and the two-factor sign in.
 *
 * Everything here goes through Supabase's own two-factor support, which is free on every
 * project (checked against the installed @supabase/auth-js, not from memory). Gyan stores
 * no codes and no secrets of its own: it asks Supabase to make a factor, shows it once, and
 * from then on only ever passes a six-digit code back.
 */

/** How long somebody may sit still before Gyan signs them out, and who may change it. */
export type SecuritySettings = {
  inactivityMinutes: number;
  isOwner: boolean;
  /** Null means notes are kept for ever. */
  retentionDays: number | null;
  /** False means a recap email carries no summary, only a link to the note. */
  emailSummaries: boolean;
};

/** The two-factor state of the person signed in. */
export type TwoFactor = {
  /** True when an authenticator app is set up and working. */
  on: boolean;
  /** The factor to remove, when there is one. */
  factorId?: string;
  /**
   * Factors that were started and never finished. Gyan tidies these up rather than leaving
   * them to pile up: an unfinished factor does nothing, but it makes the screen confusing.
   */
  unfinished: string[];
};

/** What somebody needs on screen to add an authenticator app. */
export type TwoFactorSetup = {
  factorId: string;
  /** A picture of the code, ready to put straight into an Image. */
  qrImage: string;
  /** The same thing in letters, for anybody who cannot scan a picture. */
  secret: string;
};

const DEFAULT_INACTIVITY_MINUTES = 30;

/**
 * Reads the privacy and security settings in force for this account.
 *
 * Falls back to the same 30 minutes the database uses, so a problem reading the settings
 * makes the app no less careful than it would otherwise be.
 */
export async function getSecuritySettings(): Promise<SecuritySettings> {
  const { data, error } = await getSupabase().rpc('get_account_privacy');
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return {
      inactivityMinutes: DEFAULT_INACTIVITY_MINUTES,
      isOwner: false,
      retentionDays: null,
      emailSummaries: true,
    };
  }
  return {
    inactivityMinutes: Number(row.inactivity_minutes) || DEFAULT_INACTIVITY_MINUTES,
    isOwner: row.is_owner === true,
    retentionDays: row.retention_days ?? null,
    emailSummaries: row.email_summaries !== false,
  };
}

/** Saves one or more of the settings. Owner only; the database says so out loud. */
export async function saveSecuritySettings(
  changes: { retentionDays?: number | null; emailSummaries?: boolean; inactivityMinutes?: number | null },
): Promise<{ error?: string }> {
  const settings: Record<string, unknown> = {};
  if ('retentionDays' in changes) settings.retention_days = changes.retentionDays;
  if ('emailSummaries' in changes) settings.email_summaries = changes.emailSummaries;
  if ('inactivityMinutes' in changes) settings.inactivity_minutes = changes.inactivityMinutes;

  const { error } = await getSupabase().rpc('save_account_privacy', { p_settings: settings });
  if (!error) return {};
  const message = error.message ?? '';
  if (message.includes('not_owner')) return { error: 'Only the account owner can change this.' };
  if (message.includes('bad_retention')) return { error: 'Pick 30, 90 or 365 days, or keep notes for ever.' };
  if (message.includes('bad_minutes')) return { error: 'Pick a time between 5 minutes and 8 hours.' };
  return { error: 'That did not save. Please try again.' };
}

// ---------------------------------------------------------------------------
// Two-factor sign in
// ---------------------------------------------------------------------------

/**
 * Turns what the library hands back into a picture address that actually works.
 *
 * TWO TRAPS HERE, both found by looking at a screenshot rather than by a test.
 *
 * 1. THE LIBRARY HAS ALREADY ADDED A PREFIX. Its own type notes say to prepend
 *    `data:image/svg+xml;utf-8,` yourself -- but the code does it for you
 *    (GoTrueClient.js, `data.totp.qr_code = ...`). Following the note gives you the prefix
 *    twice, and a picture that cannot load.
 *
 * 2. THE PREFIX IT ADDS IS FRAGILE. It writes the SVG into the address unescaped, and an
 *    SVG is full of `#` characters (`fill="#fff"`). A `#` ends the address as far as a
 *    browser is concerned, so everything after the first colour is thrown away.
 *
 * Both show up the same way: A BLANK SQUARE where the code should be. That is worse than an
 * error, because the screen looks finished and the words next to it say "scan this".
 *
 * So: take off whatever prefix is there, and write the SVG out again as base64, which has
 * nothing in it that any browser has to be lenient about.
 */
function svgToImageUri(fromLibrary: string): string {
  const svg = fromLibrary.replace(/^data:image\/svg\+xml[^,]*,/, '');
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/** Base64, without assuming btoa or Buffer exists on every platform Gyan runs on. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += alphabet[a >> 2];
    out += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : alphabet[c & 63];
  }
  return out;
}

/** Is an authenticator app set up for the person signed in? */
export async function getTwoFactor(): Promise<TwoFactor> {
  const { data, error } = await getSupabase().auth.mfa.listFactors();
  if (error || !data) return { on: false, unfinished: [] };
  const all = data.all ?? [];
  const working = all.find((f) => f.factor_type === 'totp' && f.status === 'verified');
  const unfinished = all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified').map((f) => f.id);
  return { on: !!working, factorId: working?.id, unfinished };
}

/**
 * Starts adding an authenticator app. Nothing is switched on yet: the person has to type a
 * code back first, which is what proves their app really holds the secret.
 */
export async function startTwoFactor(): Promise<{ setup?: TwoFactorSetup; error?: string }> {
  const supabase = getSupabase();

  // Clear away anything half-started from a previous attempt, or Supabase refuses a second
  // factor with the same name and the screen gets stuck with no way forward.
  const existing = await getTwoFactor();
  for (const id of existing.unfinished) {
    await supabase.auth.mfa.unenroll({ factorId: id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Authenticator app',
    issuer: 'gyan',
  });
  if (error || !data) return { error: friendlyTwoFactorError(error?.message) };

  return {
    setup: {
      factorId: data.id,
      qrImage: svgToImageUri(data.totp.qr_code),
      secret: data.totp.secret,
    },
  };
}

/**
 * Finishes adding an authenticator app, or finishes signing in with one. Both are the same
 * two steps: ask for a challenge, then send the code back against it.
 */
export async function confirmTwoFactor(factorId: string, code: string): Promise<{ error?: string }> {
  const supabase = getSupabase();
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 6) return { error: 'Type the 6 digits from your authenticator app.' };

  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) return { error: friendlyTwoFactorError(challenge.error?.message) };

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: digits,
  });
  return error ? { error: friendlyTwoFactorError(error.message) } : {};
}

/** Turns the authenticator app off again. */
export async function stopTwoFactor(factorId: string): Promise<{ error?: string }> {
  const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
  return error ? { error: friendlyTwoFactorError(error.message) } : {};
}

/**
 * Does this sign in still need a code?
 *
 * Supabase answers with where the session is now and how far it could go. When it could go
 * further than it has, there is a factor waiting to be used.
 */
export async function needsTwoFactor(): Promise<{ needed: boolean; factorId?: string }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { needed: false };
  if (data.nextLevel !== 'aal2' || data.currentLevel === 'aal2') return { needed: false };

  const factors = await supabase.auth.mfa.listFactors();
  const waiting = (factors.data?.all ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
  return waiting ? { needed: true, factorId: waiting.id } : { needed: false };
}

/** Plain words for the handful of things that can go wrong. */
function friendlyTwoFactorError(message?: string): string {
  const text = (message ?? '').toLowerCase();
  if (text.includes('invalid') || text.includes('incorrect')) {
    return 'That code did not work. Codes last about 30 seconds, so try the one showing now.';
  }
  if (text.includes('rate') || text.includes('too many')) {
    return 'Too many tries. Wait a minute and try again.';
  }
  if (text.includes('already') || text.includes('exists')) {
    return 'An authenticator app is already set up. Turn it off first if you want to add a different one.';
  }
  return 'Two-factor sign in is not working just now. Please try again.';
}
