// Settings for the team function. Change them here, not inside the code.

/**
 * Where the app lives, for the "Join" button inside an invite email.
 * The server secret GYAN_APP_URL wins when it is set, so this can be pointed at a test address
 * without changing any code.
 */
export const APP_URL_FALLBACK = 'https://app.gyantechai.com';

/** The page an invite link opens. The token is added after it as ?token=... */
export const INVITE_PATH = '/join';

/**
 * How long an invite is good for.
 * A key that never goes stale is a permanent way into somebody's workspace, so one that is not
 * used inside two weeks stops working and the owner sends a fresh one.
 *
 * THIS NUMBER IS WRITTEN IN TWO PLACES: here, for the words in the email, and as
 * `interval '14 days'` inside accept_invite in the migration, which is what actually enforces
 * it. A test keeps the two in step.
 */
export const INVITE_MAX_AGE_DAYS = 14;
