// Supabase server function: sends an invite email so somebody can join an account.
//
// It runs on Supabase's servers, which is the only reason it can do its job: it holds the
// mailbox password (the server secret SMTP_PASSWORD) and the invite token, and the app holds
// neither. The app asks for an address to be invited; the token only ever goes to that inbox.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { makeMailer } from '../_shared/mailer.ts';

import { RATE_LIMIT_MESSAGE, RateLimited, corsFor, pickKey, underRateLimit } from '../_shared/guard.ts';
import { MESSAGES, TeamError, messageForSendError } from './invite-email.ts';
import { runInvite, type Db } from './pipeline.ts';
import { APP_URL_FALLBACK } from './settings.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

/**
 * Is this an address Gyan is willing to send to?
 *
 * Deliberately stricter than the standard allows. An address with a quote or a comma in it
 * is technically legal and will never belong to a real customer, so refusing it costs
 * nothing and removes every character that could mean something inside an email header.
 */
function looksLikeEmail(value: string): boolean {
  const email = value.trim();
  if (email.length === 0 || email.length > 254) return false;
  if (/[\s"'<>,;:\\()[\]]/.test(email)) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;
  const [local, domain] = [email.slice(0, at), email.slice(at + 1)];
  if (local.length > 64 || domain.length > 253) return false;
  if (!/^[^@]+$/.test(local)) return false;
  // A domain is labels of letters, digits and hyphens, with a real ending on it.
  return /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(domain);
}

Deno.serve(async (req) => {
  // Which websites may read the answer is decided per request now, not handed out to
  // everybody with a star. A phone sends no Origin and is answered as before.
  const cors = corsFor(req);
  const reply = (body: Record<string, unknown>, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = pickKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
  const secretKey = pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  const appUrl = Deno.env.get('GYAN_APP_URL') || APP_URL_FALLBACK;
  const authHeader = req.headers.get('Authorization');
  if (!url || !publicKey || !secretKey) return reply({ error: 'server_not_set_up' }, 500);
  if (!authHeader) return reply({ error: 'not_signed_in' }, 401);

  let body: { email?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* handled below */
  }
  // The address goes into a real email envelope, so it is checked properly HERE as well as
  // in the database. Before, this function checked only "is it a non-empty string", and the
  // only real check was a loose pattern in SQL with no length limit at all -- an unbounded,
  // barely-checked string reaching a mail server.
  //
  // 254 characters is the longest an email address may be (RFC 5321). The pattern refuses
  // spaces, quotes, angle brackets, commas, semicolons and colons, which are the characters
  // that mean something in an email header.
  if (typeof body.email !== 'string' || !looksLikeEmail(body.email)) {
    return reply({ ok: false, message: MESSAGES.badEmail }, 400);
  }

  // WHO IS ASKING comes from their login, never from the request body. The database checks this
  // id really is the owner of an account before it makes anything.
  const asPerson = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await asPerson.auth.getUser();
  if (!who?.user) return reply({ error: 'not_signed_in' }, 401);

  if (!smtpPassword) return reply({ ok: false, message: MESSAGES.notSetUp }, 503);

  const admin = createClient(url, secretKey);

  // An invite sends an email, and the mailbox is shared by every account. Counted per
  // person; the account is not known until claim_invite has run, so there is nothing
  // honest to count it against yet.
  try {
    await underRateLimit(admin, 'invite', who.user.id, null);
  } catch (e) {
    if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
    throw e;
  }

  const mailer = makeMailer(smtpPassword);

  try {
    const result = await runInvite({
      db: admin as unknown as Db,
      send: async (message) => {
        try {
          await mailer.send(message);
        } catch (e) {
          // Log the KIND of problem only. Never log the password, the address, or the token.
          console.error('invite send refused by the mail server', e instanceof Error ? e.name : 'error');
          throw new TeamError(messageForSendError(e));
        }
      },
      userId: who.user.id,
      email: body.email,
      appUrl,
    });

    return reply({
      ok: true,
      email: result.email,
      seats_included: result.seatsIncluded,
      seats_used: result.seatsUsed,
    });
  } catch (e) {
    if (e instanceof TeamError) return reply({ ok: false, message: e.message }, 200);
    console.error('invite failed', e instanceof Error ? e.name : 'error');
    return reply({ ok: false, message: MESSAGES.problem }, 200);
  } finally {
    // Always let go of the mail connection, whatever happened.
    await mailer.close();
  }
});
