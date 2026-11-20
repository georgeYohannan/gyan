// Settings for the recap function. Change them here, not inside the code.

// WHO THE EMAIL COMES FROM, and the mailbox it goes through.
//
// Both now live in _shared/sender.ts, because the invite email sends through the same mailbox
// and the address must not be written down twice. They are handed straight back out here, so
// anything that already reads them from this file keeps working.
export { SENDER, SMTP, MAILBOX_DAILY_LIMIT } from '../_shared/sender.ts';

/**
 * Where the app lives, for the "Open in gyan" button and the "Turn off recaps" link.
 * The server secret GYAN_APP_URL wins when it is set, so this can be pointed at a test address
 * without changing any code.
 */
export const APP_URL_FALLBACK = 'https://app.gyantechai.com';

/**
 * The most people one recap may go to.
 * Everybody gets their own email, so their own language and name is right, which means this is
 * really a guard against a runaway send rather than a limit of the mail server.
 */
export const MAX_RECIPIENTS = 50;

/**
 * The most translations one recap may buy.
 * Every recipient gets the recap in their own language, and a language nobody has translated
 * into yet is bought (about a cent, then saved for good and free after that). A team where
 * everybody reads a different language would buy one each, with nobody pressing anything, so
 * there is a ceiling. Past it, the remaining people get the note in the language it was written
 * in rather than no email at all.
 */
export const MAX_TRANSLATIONS_PER_SEND = 5;
