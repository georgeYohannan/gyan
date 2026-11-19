// Settings for the recap function. Change them here, not inside the code.

/**
 * WHO THE EMAIL COMES FROM. The one and only place the sender is written down.
 *
 * Both halves live together on purpose: `email` is what people see it came from, and `replyTo`
 * is where a reply lands. They are the same address today, which is why keeping them in one
 * object matters: change one and you will see the other right next to it.
 *
 * gyan@gyantechai.com is the app's OWN mailbox, kept apart from hello@gyantechai.com, which is
 * the founder's own address for talking to people. A recap is sent by the app, so it says so,
 * and a reply lands in the app's mailbox rather than in the middle of human conversations.
 *
 * Sending: gyantechai.com is verified with Resend, which covers EVERY address at the domain, so
 * no DNS record changes when this address does. Receiving: gyantechai.com's mail still goes to
 * Hostinger, so a reply to this address arrives in the Hostinger inbox as normal.
 *
 * To move to a sending subdomain later (for example gyan@mail.gyantechai.com, which keeps the
 * product's sending reputation apart from the founder's own mailbox), change `email` here and
 * add that subdomain in Resend. Nothing else in the code has to change.
 */
export const SENDER = {
  name: 'gyan',
  email: 'gyan@gyantechai.com',
  replyTo: 'gyan@gyantechai.com',
} as const;

/** Resend's send endpoint (resend.com/docs/api-reference/emails/send-email, checked 2026-11-19). */
export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend refuses a request with no User-Agent (a 403 with code 1010). This one names the
 * software and nothing else: never a person's name, email or project.
 */
export const USER_AGENT = 'gyan-recap/1';

/**
 * Where the app lives, for the "Open in gyan" button and the "Turn off recaps" link.
 * The server secret GYAN_APP_URL wins when it is set, so this can be pointed at a test address
 * without changing any code.
 */
export const APP_URL_FALLBACK = 'https://app.gyantechai.com';

/**
 * The most people one recap may go to. Resend allows 50 addresses in one request; we send one
 * email each (so every person's own language and name is right), so this is really a guard
 * against a runaway send.
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

/**
 * Resend's free plan allows 100 emails a day and 3,000 a month (resend.com/pricing, checked
 * 2026-11-19). Nothing in the code enforces that; it is here so the number is written down
 * somewhere when a send starts failing.
 */
export const PROVIDER_DAILY_LIMIT = 100;
