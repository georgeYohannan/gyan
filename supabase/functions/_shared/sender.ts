// WHO GYAN'S EMAILS COME FROM, and the mailbox they go through.
//
// The one and only place the sender, the mail server and the port are written down. Every
// function that sends email reads them from here: recap (a note's summary) and team (an invite).

/**
 * WHO THE EMAIL COMES FROM.
 *
 * Both halves live together on purpose: `email` is what people see it came from, and `replyTo`
 * is where a reply lands. They are the same address today, which is why keeping them in one
 * object matters: change one and you will see the other right next to it.
 *
 * gyan@gyantechai.com is the app's OWN Hostinger mailbox, kept apart from hello@gyantechai.com,
 * which is the founder's own address for talking to people. An email sent by the app says so,
 * and a reply lands in the app's mailbox rather than among human conversations.
 *
 * This address is also the mailbox Gyan signs in to in order to send, so it has to be a real
 * mailbox with a real password, not a made up address.
 */
export const SENDER = {
  name: 'gyan',
  email: 'gyan@gyantechai.com',
  replyTo: 'gyan@gyantechai.com',
} as const;

/**
 * THE MAILBOX GYAN SENDS THROUGH: Hostinger's outgoing mail server.
 *
 * Port 465 is not a free choice. Hostinger offers 465 (SSL) and 587 (STARTTLS), and Supabase
 * says plainly that its server functions may not make outgoing connections on ports 25 and 587
 * (supabase.com/docs/guides/functions/limits, checked 2026-11-19). That leaves 465, which the
 * same page no longer lists as blocked. 465 uses TLS from the very first byte, which is what
 * `tls: true` means where this is used.
 *
 * If a send ever fails with nothing reaching the mailbox at all, this port is the first thing
 * to suspect: Supabase could close it, and it is the one part of this that their documentation
 * does not promise. The fall back would be an email service that works over the web instead of
 * a mail port, which is a change to _shared/mailer.ts alone.
 */
export const SMTP = {
  hostname: 'smtp.hostinger.com',
  port: 465,
} as const;

/** "gyan <gyan@gyantechai.com>", the way a mail server wants the From line written. */
export function fromHeader(sender: { name: string; email: string }): string {
  return `${sender.name} <${sender.email}>`;
}

/**
 * How many emails the mailbox may send in a day.
 * Hostinger counts this per mailbox over a rolling 24 hours: 1,000 a day on Business Starter
 * and 3,000 on Business Premium, with at most 100 recipients on one message
 * (hostinger.com Parameters and Limits, checked 2026-11-19). Nothing in the code enforces it;
 * it is written down here so the number is somewhere when sends start being refused.
 */
export const MAILBOX_DAILY_LIMIT = 1_000;
