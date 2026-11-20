// Posting email through Gyan's own Hostinger mailbox.
//
// This file knows how to send an email and nothing else. It does not know what a recap is, what
// an invite is, or how to say "that did not work" in plain words: each function that uses it
// catches the error and puts it in its own words. The only secret it is ever handed is the
// mailbox password, and it never writes that anywhere.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

import { SENDER, SMTP, fromHeader } from './sender.ts';

/** One email, ready to go. `text` is the plain words version, `html` the pretty one. */
export type OutgoingMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type Mailer = {
  send(message: OutgoingMessage): Promise<void>;
  close(): Promise<void>;
};

/**
 * Opens ONE connection for a whole send, not one per person: a mail server treats a fresh sign
 * in for every message as something close to abuse, and it is far slower. `close` must be
 * called when the sending is done, which is why this hands back both halves. `close` is always
 * safe to call, even if nothing was ever sent.
 *
 * The mailbox Gyan signs in as IS the address it sends from, so there is still only one place
 * the address is written down.
 */
export function makeMailer(password: string): Mailer {
  let client: SMTPClient | undefined;

  function open(): SMTPClient {
    if (!client) {
      client = new SMTPClient({
        connection: {
          hostname: SMTP.hostname,
          port: SMTP.port,
          // Port 465 is encrypted from the very first byte, rather than starting in the clear
          // and turning encryption on afterwards. The password is never sent in the open.
          tls: true,
          auth: { username: SENDER.email, password },
        },
      });
    }
    return client;
  }

  return {
    async send(message: OutgoingMessage): Promise<void> {
      await open().send({
        from: fromHeader(SENDER),
        to: message.to,
        replyTo: SENDER.replyTo,
        subject: message.subject,
        // denomailer calls the plain words `content` and the pretty version `html`.
        content: message.text,
        html: message.html,
      });
    },

    async close(): Promise<void> {
      try {
        await client?.close();
      } catch {
        // Already shut, or never opened. Nothing to do, and nothing worth failing a send over.
      }
    },
  };
}
