// Supabase server function: emails one note's recap to people on the same account.
//
// The emails go out through Gyan's OWN Hostinger mailbox, gyan@gyantechai.com, over the normal
// outgoing mail server. Runs on Supabase's servers, so the mailbox password never reaches the
// app. Needs the server secret SMTP_PASSWORD (see docs/testing/prompt-9.md).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { makeMailer } from '../_shared/mailer.ts';

import {
  MESSAGES,
  RecapError,
  messageForSendError,
} from './email.ts';
import {
  previewRecap,
  runRecap,
  RecapNotAllowedError,
  RecapSkippedError,
  type OutgoingEmail,
  type TranslateSummary,
} from './pipeline.ts';
import {
  APP_URL_FALLBACK,
  MAX_RECIPIENTS,
  MAX_TRANSLATIONS_PER_SEND,
  SENDER,
} from './settings.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Supabase gives keys either as one plain value (older) or as a small JSON list (newer). */
function pickKey(plainName: string, jsonName: string): string | undefined {
  const plain = Deno.env.get(plainName);
  if (plain) return plain;
  try {
    return JSON.parse(Deno.env.get(jsonName) ?? '{}').default;
  } catch {
    return undefined;
  }
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * True when this call came from one of our OWN server functions, not from a person.
 *
 * The only thing that carries the project's secret key is our own server code, so a request
 * holding it is ours. The automatic send uses this, because no person starts it and so there is
 * no login to read. It does NOT widen what may happen: the database still decides who may be
 * emailed, inside claim_recap.
 */
function isOurOwnServer(authHeader: string, secretKey: string): boolean {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return token !== '' && token === secretKey;
}

/**
 * Posts the emails through Gyan's own Hostinger mailbox.
 *
 * The sending itself lives in _shared/mailer.ts, because the invite email goes through the same
 * mailbox. All that is left here is turning a refusal from the mail server into words a person
 * can read, which is the recap's own job and nobody else's.
 */
function makeRecapMailer(password: string) {
  const mailer = makeMailer(password);

  async function send(message: OutgoingEmail): Promise<string> {
    try {
      await mailer.send(message);
    } catch (e) {
      // Log the KIND of problem only. Never log the password, an address, or the note's words.
      console.error('recap send refused by the mail server', e instanceof Error ? e.name : 'error');
      throw new RecapError(messageForSendError(e));
    }
    // A mail server gives back no id we can keep, unlike a web service. The email is still
    // written down in email_log; there is simply nothing to look it up by at the other end.
    return '';
  }

  return { send, close: mailer.close };
}

/**
 * Buys a translation of this note's summary, by asking the translate function that already
 * exists. Reusing it means the translating rules live in exactly one place, and the translation
 * is saved there too, so the next person who wants that language gets it free.
 */
function makeTranslator(url: string, secretKey: string, meetingId: string): TranslateSummary {
  return async function translate(language: string, asUserId: string): Promise<unknown | null> {
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/functions/v1/translate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          apikey: secretKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ meeting_id: meetingId, kind: 'summary', language, user_id: asUserId }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { ok?: boolean; content?: unknown };
      return body.ok === true ? (body.content ?? null) : null;
    } catch {
      return null;
    }
  };
}

Deno.serve(async (req) => {
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

  let body: {
    meeting_id?: string;
    recipient_user_ids?: unknown;
    auto?: unknown;
    preview?: unknown;
  } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* handled below */
  }

  if (!body.meeting_id || !UUID.test(body.meeting_id)) return reply({ error: 'bad_request' }, 400);

  // An address is never an input. Only ids, and only ids that are really on the account, which
  // claim_recap decides. Anything that is not a list of ids is refused outright.
  let picked: string[] | undefined;
  if (body.recipient_user_ids !== undefined) {
    if (!Array.isArray(body.recipient_user_ids)) return reply({ error: 'bad_request' }, 400);
    if (!body.recipient_user_ids.every((id) => typeof id === 'string' && UUID.test(id))) {
      return reply({ error: 'bad_request' }, 400);
    }
    picked = body.recipient_user_ids as string[];
  }

  const internal = isOurOwnServer(authHeader, secretKey);
  const auto = body.auto === true;
  // Only our own server may run the automatic send, because only it has nobody to check.
  if (auto && !internal) return reply({ error: 'not_allowed' }, 403);

  let userId: string | null = null;
  if (!internal) {
    // 1. Who is calling? Ask with THEIR login, so the database rules decide what they may see.
    const asUser = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await asUser.auth.getUser();
    if (authError || !auth.user) return reply({ error: 'not_signed_in' }, 401);

    // 2. The note must be one this person can really see, under their own login.
    const { data: visible } = await asUser.from('meetings').select('id').eq('id', body.meeting_id).maybeSingle();
    if (!visible) return reply({ error: 'not_allowed' }, 403);
    userId = auth.user.id;
  }

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // Showing who would get a recap sends nothing, so it needs no email key.
  if (body.preview === true) {
    try {
      const seen = await previewRecap({ admin, meetingId: body.meeting_id, userId, auto: false });
      // Working out who WOULD get a recap needs no email key, so this still answers without one.
      // But say plainly why nothing can be sent, rather than leaving the screen to guess.
      return reply({
        ok: true,
        ...seen,
        can_send: !!smtpPassword,
        send_problem: smtpPassword ? null : MESSAGES.notSetUp,
      });
    } catch (e) {
      if (e instanceof RecapNotAllowedError) return reply({ error: 'not_allowed' }, 403);
      const message = e instanceof RecapError ? e.message : MESSAGES.unknown;
      return reply({ ok: false, message });
    }
  }

  // 3. No password means Gyan cannot get into its mailbox at all. Say so in plain words.
  if (!smtpPassword) return reply({ ok: false, message: MESSAGES.notSetUp });

  // 4. Send. The app is waiting on a hand-pressed send, so this is not put in the background.
  const mailer = makeRecapMailer(smtpPassword);
  try {
    const result = await runRecap({
      admin,
      meetingId: body.meeting_id,
      userId,
      auto,
      recipientUserIds: picked,
      appUrl,
      sender: SENDER,
      maxRecipients: MAX_RECIPIENTS,
      maxTranslations: MAX_TRANSLATIONS_PER_SEND,
      send: mailer.send,
      translate: makeTranslator(url, secretKey, body.meeting_id),
    });
    return reply({ ok: true, ...result });
  } catch (e) {
    // The automatic send having nothing to do is not a problem anybody needs to see.
    if (e instanceof RecapSkippedError) return reply({ ok: true, skipped: e.message, sent: 0, failed: 0, outcomes: [] });
    if (e instanceof RecapNotAllowedError) return reply({ error: 'not_allowed' }, 403);
    // Log the KIND of problem only. Never log the key, an address, or the words of the note.
    console.error('recap failed for note', body.meeting_id, e instanceof Error ? e.name : 'error');
    const message = e instanceof RecapError ? e.message : MESSAGES.unknown;
    return reply({ ok: false, message });
  } finally {
    // Always hang up, including when a send went wrong. A mail connection left open keeps the
    // function alive until Supabase stops it.
    await mailer.close();
  }
});
