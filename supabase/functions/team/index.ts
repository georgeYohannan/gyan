// Supabase server function: sends an invite email so somebody can join an account.
//
// It runs on Supabase's servers, which is the only reason it can do its job: it holds the
// mailbox password (the server secret SMTP_PASSWORD) and the invite token, and the app holds
// neither. The app asks for an address to be invited; the token only ever goes to that inbox.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { makeMailer } from '../_shared/mailer.ts';

import { MESSAGES, TeamError, messageForSendError } from './invite-email.ts';
import { runInvite, type Db } from './pipeline.ts';
import { APP_URL_FALLBACK } from './settings.ts';

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

  let body: { email?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* handled below */
  }
  if (typeof body.email !== 'string' || body.email.trim() === '') {
    return reply({ ok: false, message: MESSAGES.badEmail }, 400);
  }

  // WHO IS ASKING comes from their login, never from the request body. The database checks this
  // id really is the owner of an account before it makes anything.
  const asPerson = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await asPerson.auth.getUser();
  if (!who?.user) return reply({ error: 'not_signed_in' }, 401);

  if (!smtpPassword) return reply({ ok: false, message: MESSAGES.notSetUp }, 503);

  const admin = createClient(url, secretKey);
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
