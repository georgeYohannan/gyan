// Supabase server function: sends a bot to a meeting, and stops one.
//
// Runs on Supabase's servers, so the bot service's key never reaches the app.
// Set the key once with:  supabase secrets set MEETING_BOT_API_KEY=...   (see docs/testing/prompt-14.md)
//
// THE SWITCH IS THE FIRST THING THAT HAPPENS, and it happens in the DATABASE, not here. There is
// no path through this file that can send a bot for an account whose switch is off, because the
// check lives inside start_bot_note along with everything else that has to be true.
//
// The secret is named for the JOB, not the vendor (MEETING_BOT_API_KEY, not RECALL_API_KEY), so
// changing bot service does not even change a secret name.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { RATE_LIMIT_MESSAGE, RateLimited, UUID, corsFor, pickKey, underRateLimit } from '../_shared/guard.ts';
import { provider } from '../_shared/meeting-bot/index.ts';
import { BOT_MESSAGES } from '../_shared/meeting-bot/provider.ts';
import { runStartBot, statusForCode } from './pipeline.ts';
import { BOT_CONSENT_HASH, BOT_CONSENT_VERSION, PROVIDER_RETENTION_HOURS } from './settings.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const reply = (body: Record<string, unknown>, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = pickKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
  const secretKey = pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const botKey = Deno.env.get('MEETING_BOT_API_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!url || !publicKey || !secretKey || !botKey) return reply({ error: 'server_not_set_up' }, 500);
  if (!authHeader) return reply({ error: 'not_signed_in' }, 401);

  let body: {
    action?: unknown;
    meeting_id?: unknown;
    meeting_url?: unknown;
    consent?: { version?: unknown; hash?: unknown };
  } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return reply({ error: 'bad_request' }, 400);
  }

  const action = body.action === 'stop' ? 'stop' : 'start';
  const meetingId = typeof body.meeting_id === 'string' ? body.meeting_id : '';
  if (!UUID.test(meetingId)) return reply({ error: 'bad_request' }, 400);

  // 1. Who is calling? Ask with THEIR login, so the database rules decide what they may see.
  const asUser = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await asUser.auth.getUser();
  if (authError || !auth.user) return reply({ error: 'not_signed_in' }, 401);

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // ---------------------------------------------------------------------------
  // Stop recording.
  // ---------------------------------------------------------------------------
  if (action === 'stop') {
    const { data: bot, error: botError } = await admin
      .rpc('bot_for_stop', { p_meeting_id: meetingId, p_user_id: auth.user.id })
      .single<{ external_id: string }>();
    if (botError || !bot) {
      const m = botError?.message ?? '';
      if (m.includes('not_found')) return reply({ ok: false, message: BOT_MESSAGES.notFound }, 404);
      if (m.includes('wrong_status') || m.includes('not_started')) {
        return reply({ ok: false, message: BOT_MESSAGES.alreadyFinished }, 409);
      }
      return reply({ error: 'not_allowed' }, 403);
    }
    try {
      await provider.stopBot({ externalId: bot.external_id, apiKey: botKey });
    } catch {
      return reply({ ok: false, message: BOT_MESSAGES.couldNotStop }, 502);
    }
    // The bot leaving produces the service's own "call ended" event, which is what moves the note
    // on. Nothing is written here, so there is only ever one place a phase changes.
    return reply({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // Send a bot.
  // ---------------------------------------------------------------------------
  const link = typeof body.meeting_url === 'string' ? body.meeting_url : '';
  if (link === '') return reply({ ok: false, message: BOT_MESSAGES.badLink }, 400);

  // The consent, checked against the words that are actually on the screen today. An old client,
  // or a request made by hand, cannot send a bot with a confirmation nobody gave.
  const version = typeof body.consent?.version === 'string' ? body.consent.version : '';
  const hash = typeof body.consent?.hash === 'string' ? body.consent.hash : '';
  if (version !== BOT_CONSENT_VERSION || hash !== BOT_CONSENT_HASH) {
    return reply(
      { ok: false, message: 'Gyan has changed what it asks you to confirm. Please reload and try again.' },
      400,
    );
  }

  // Which account, and what this person is called. Asked with THEIR login, so the answer can only
  // ever be an account they are really on.
  const { data: membership } = await asUser
    .from('account_members')
    .select('account_id, role')
    .order('role', { ascending: true })
    .limit(5);
  const accountId = pickAccount(membership);
  if (!accountId) return reply({ error: 'no_account' }, 403);

  const { data: me } = await asUser
    .from('profiles')
    .select('display_name')
    .eq('id', auth.user.id)
    .maybeSingle();
  const askedBy = (me as { display_name?: string | null } | null)?.display_name ?? null;

  // Has this person had their turn for the hour? Counted BEFORE anything is spent. Every number
  // comes from the security_settings table, never from this file.
  try {
    await underRateLimit(admin, 'meeting_bot', auth.user.id, accountId);
  } catch (e) {
    if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
    throw e;
  }

  const result = await runStartBot({
    db: admin,
    provider,
    noteId: meetingId,
    accountId,
    userId: auth.user.id,
    link,
    consentVersion: version,
    consentHash: hash,
    askedBy,
    apiKey: botKey,
    retentionHours: PROVIDER_RETENTION_HOURS,
  });

  if (!result.ok) {
    // The kind of refusal only. Never the link, the key, or anything anybody said.
    console.error('bot refused for', meetingId, result.code.slice(0, 40));
    if (result.code.includes('duplicate key')) {
      return reply({ ok: false, message: 'That bot has already been sent.' }, 409);
    }
    return reply({ ok: false, message: result.message }, statusForCode(result.code));
  }

  return reply({ ok: true, meeting_id: result.noteId, platform: result.platform, bot_name: result.botName }, 202);
});

/**
 * Which account this person is acting on.
 *
 * Owner first, which is the order every other function in this project uses, so the Meeting link
 * screen and Settings can never disagree about which account somebody is on.
 */
function pickAccount(rows: unknown): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const list = rows as { account_id?: string; role?: string }[];
  const owned = list.find((r) => r.role === 'owner');
  return (owned ?? list[0]).account_id ?? null;
}
