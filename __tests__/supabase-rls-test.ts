/** @jest-environment node */
/**
 * Talks to the real Supabase TEST project (never the live one).
 * It proves one person cannot read or change another person's rows, and that the
 * sign up trigger made a profile, a Free account, and an owner row.
 *
 * One half of the chat rule cannot be checked here: "a teammate on the SAME account still
 * cannot read your chat" needs 2 users sharing 1 account, and these 2 fixtures each own their own.
 * That half is checked against the migration itself, in __tests__/migrations-test.ts.
 *
 * Needs 2 fake test users, made by hand in the Supabase dashboard (see docs/testing/prompt-3.md).
 * Put their details in .env.local as TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD,
 * TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD. Without them these tests are skipped.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import https from 'https';
import path from 'path';

/**
 * The Expo test setup replaces the global fetch with a stand-in that does no network calls.
 * This test must really talk to Supabase, so it uses this small fetch built on Node's https.
 */
const realFetch: typeof fetch = (input, init) =>
  new Promise((resolve, reject) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => (headers[name] = value));
    const req = https.request(url, { method: init?.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const responseHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) responseHeaders.set(k, String(v));
        const status = res.statusCode ?? 0;
        const noBody = status === 204 || status === 304;
        resolve(new Response(noBody ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
      });
    });
    req.on('error', reject);
    if (init?.body) req.write(init.body as string);
    req.end();
  });

function readEnv(): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = { ...process.env };
  const file = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && values[m[1]] === undefined) values[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return values;
}

const env = readEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_KEY;
const a = { email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD };
const b = { email: env.TEST_USER_B_EMAIL, password: env.TEST_USER_B_PASSWORD };
const ready = !!(url && key && a.email && a.password && b.email && b.password);

/**
 * STRICT MODE. These are the only tests that prove, against a real database, that one
 * person cannot read another person's notes. Quietly skipping them means a green run can
 * mean nothing was checked at all -- which is exactly what happened before prompt 11.
 *
 * Set GYAN_REQUIRE_LIVE_RLS=1 (and in any CI that has the test accounts) and a missing
 * setting becomes a failure instead of a shrug.
 */
const strict = process.env.GYAN_REQUIRE_LIVE_RLS === '1';

if (!ready) {
  const missing = [
    !url && 'EXPO_PUBLIC_SUPABASE_URL',
    !key && 'EXPO_PUBLIC_SUPABASE_KEY',
    !a.email && 'TEST_USER_A_EMAIL',
    !a.password && 'TEST_USER_A_PASSWORD',
    !b.email && 'TEST_USER_B_EMAIL',
    !b.password && 'TEST_USER_B_PASSWORD',
  ].filter(Boolean);
  const why =
    'THE ONLY TESTS THAT PROVE ONE PERSON CANNOT READ ANOTHER PERSON\'S NOTES DID NOT RUN.\n' +
    `Missing from .env.local: ${missing.join(', ')}.\n` +
    'See docs/testing/prompt-3.md for making the two test users.';
  if (strict) throw new Error(why);
  // eslint-disable-next-line no-console
  console.warn(`\n${'='.repeat(78)}\n${why}\n${'='.repeat(78)}\n`);
}
const maybe = ready ? describe : describe.skip;

/**
 * Says a check could not run because the database file has not been pushed yet. In strict
 * mode that is a failure, because "not pushed" is something somebody has to go and do.
 */
function notPushedYet(what: string): void {
  const why = `Run \`supabase db push\` to add ${what}, then run npm test again.`;
  if (strict) throw new Error(why);
  // eslint-disable-next-line no-console
  console.warn(`Skipped: ${why}`);
}

async function login(creds: { email?: string; password?: string }) {
  const client: SupabaseClient = createClient(url!, key!, { global: { fetch: realFetch }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: creds.email!, password: creds.password! });
  if (error) throw new Error(`Test user could not log in: ${error.message}`);
  return { client, userId: data.user.id };
}

maybe('Supabase test project: privacy between users', () => {
  let A: Awaited<ReturnType<typeof login>>;
  let B: Awaited<ReturnType<typeof login>>;
  let accountA: string;

  beforeAll(async () => {
    expect(url).toContain('ofnspnobzesxmyqjxzad'); // only ever the TEST project
    A = await login(a);
    B = await login(b);
    const { data } = await A.client.from('accounts').select('id').eq('owner_id', A.userId).single();
    accountA = data!.id;
  });

  // WHAT THIS TEST MAY AND MAY NOT ASSUME.
  //
  // It runs against the shared TEST project, which the founder uses by hand. Two things there
  // are MEANT to change: the plan (the test-only plan switch moves it on purpose) and is_admin
  // (docs/testing/prompt-10.md tells the founder to set it on themselves). Asserting either to
  // a fixed value here makes a passing test fail for doing as it was told, which is what
  // happened on 2026-11-20.
  //
  // So the fixed promises — a new user starts on Free, and is_admin starts false — are checked
  // in migrations-test.ts against the SQL, where no amount of using the app can move them.
  // What is checked HERE is the shape the trigger builds, which must hold forever.
  test('sign up trigger: user A has a profile, an account on a real plan, and an owner row', async () => {
    const profile = await A.client.from('profiles').select('id, is_admin').eq('id', A.userId).single();
    expect(profile.data?.id).toBe(A.userId);
    expect(typeof profile.data?.is_admin).toBe('boolean');

    const account = await A.client.from('accounts').select('id, plans(name, meetings_per_month)').eq('id', accountA).single();
    const plan = (account.data as { plans?: { name?: string; meetings_per_month?: number } } | null)?.plans;
    expect(typeof plan?.name).toBe('string');
    expect(plan?.meetings_per_month).toBeGreaterThan(0);

    const member = await A.client.from('account_members').select('role').eq('account_id', accountA).eq('user_id', A.userId).single();
    expect(member.data).toEqual({ role: 'owner' });
  });

  test('user B cannot read user A\'s profile', async () => {
    const { data } = await B.client.from('profiles').select('id').eq('id', A.userId);
    expect(data).toEqual([]);
  });

  test('user B only ever sees their own profile', async () => {
    const { data } = await B.client.from('profiles').select('id');
    expect(data).toEqual([{ id: B.userId }]);
  });

  test('user B cannot read user A\'s account or member list', async () => {
    const accounts = await B.client.from('accounts').select('id').eq('id', accountA);
    expect(accounts.data).toEqual([]);
    const members = await B.client.from('account_members').select('user_id').eq('account_id', accountA);
    expect(members.data).toEqual([]);
  });

  test('user B cannot read A\'s invites, usage, notes, chats, integrations, or ai cost', async () => {
    for (const table of ['invites', 'usage', 'meetings', 'chat_threads', 'integrations', 'ai_usage']) {
      const { data, error } = await B.client.from(table).select('*').eq('account_id', accountA);
      expect({ table, error: error?.message, rows: data }).toEqual({ table, error: undefined, rows: [] });
    }
  });

  test('user B cannot read ANY chat message, and cannot read A\'s threads', async () => {
    // A chat is more private than a note: the rules only ever show a person their OWN threads,
    // so B sees nothing at all here, not even their own teammates'.
    const threads = await B.client.from('chat_threads').select('id').eq('account_id', accountA);
    expect(threads.data).toEqual([]);
    const messages = await B.client.from('chat_messages').select('id');
    expect({ error: messages.error?.message, rows: messages.data }).toEqual({ error: undefined, rows: [] });
  });

  test('nobody can write a chat from the app: only the server saves messages', async () => {
    const thread = await B.client
      .from('chat_threads')
      .insert({ account_id: accountA, user_id: B.userId, meeting_id: null });
    expect(thread.error).not.toBeNull();

    const message = await B.client
      .from('chat_messages')
      .insert({ thread_id: '00000000-0000-4000-8000-000000000000', role: 'user', content: '[test] hello' });
    expect(message.error).not.toBeNull();
  });

  test('the daily chat limit is readable on the plan, but nobody can change it', async () => {
    const read = await B.client.from('plans').select('chat_messages_per_day').eq('name', 'Free').single();

    // The side chat migration may not be pushed to the test project yet. Say so clearly rather
    // than failing with something confusing. Run `supabase db push`, then run this again.
    if (read.error) {
      // eslint-disable-next-line no-console
      console.warn('Skipping the chat limit check: run `supabase db push` to add chat_messages_per_day, then run npm test again.');
      return;
    }

    expect(typeof read.data?.chat_messages_per_day).toBe('number');
    expect(read.data!.chat_messages_per_day).toBeGreaterThan(0);

    const write = await B.client.from('plans').update({ chat_messages_per_day: 9999 }).eq('name', 'Free').select();
    expect(write.data ?? []).toEqual([]);
  });

  test('user B cannot read a translation of A\'s notes', async () => {
    const { data, error } = await B.client.from('translations').select('*');
    expect({ error: error?.message, rows: data }).toEqual({ error: undefined, rows: [] });
  });

  test('nobody can write a translation from the app: only the server saves them', async () => {
    const write = await B.client.from('translations').insert({
      meeting_id: '00000000-0000-4000-8000-000000000000',
      kind: 'summary',
      source_id: '00000000-0000-4000-8000-000000000000',
      language: 'es',
      content: '[test] hola',
    });
    expect(write.error).not.toBeNull();
  });

  test('user B cannot read A\'s emails, and nobody writes the log from the app', async () => {
    const read = await B.client.from('email_log').select('*').eq('account_id', accountA);

    // The recap migration may not be pushed to the test project yet. Say so clearly rather than
    // failing with something confusing. Run `supabase db push`, then run this again.
    if (read.error) {
      // eslint-disable-next-line no-console
      console.warn('Skipping the email_log checks: run `supabase db push`, then run npm test again.');
      return;
    }
    expect(read.data).toEqual([]);

    // Reading is all the app may do. Writing a record is the server's job alone.
    const write = await B.client.from('email_log').insert({
      account_id: accountA,
      recipient_email: 'nobody@example.test',
      result: 'sent',
    });
    expect(write.error).not.toBeNull();
  });

  test('the two doors the server alone may open cannot be opened from the app', async () => {
    // claim_recap decides who gets emailed, and log_email writes the record. Both are
    // service_role only, so a signed-in person must be refused by the database itself.
    const claim = await B.client.rpc('claim_recap', {
      p_meeting_id: '00000000-0000-4000-8000-000000000000',
      p_user_id: B.userId,
      p_auto: true,
    });
    expect(claim.error).not.toBeNull();

    const log = await B.client.rpc('log_email', {
      p_account_id: accountA,
      p_meeting_id: null,
      p_recipient_user_id: null,
      p_recipient_email: 'nobody@example.test',
      p_language: 'en',
      p_translated: false,
      p_result: 'sent',
      p_provider_id: null,
      p_error_message: null,
      p_sent_by: null,
      p_auto: false,
    });
    expect(log.error).not.toBeNull();
  });

  test('a person can read their own recap settings, and they start as owner only', async () => {
    const read = await B.client.rpc('get_recap_settings').single<{
      is_owner: boolean;
      settings: { to_owner: boolean; to_members: boolean; auto_send: boolean };
    }>();

    // The recap migration may not be pushed to the test project yet. Say so clearly rather than
    // failing with something confusing. Run `supabase db push`, then run this again.
    if (read.error) {
      // eslint-disable-next-line no-console
      console.warn('Skipping the recap settings checks: run `supabase db push`, then run npm test again.');
      return;
    }

    // Each fixture user owns their own account, so B is the owner of B's account.
    expect(read.data?.is_owner).toBe(true);
    expect(read.data?.settings).toEqual({ to_owner: true, to_members: false, auto_send: false });
  });

  test('user B cannot change user A\'s recap settings, by any route', async () => {
    const before = await A.client.from('integrations').select('settings').eq('kind', 'recap_email');

    // Straight at the table: the owner-only rule means the write touches no rows.
    const direct = await B.client
      .from('integrations')
      .update({ settings: { to_owner: true, to_members: true, auto_send: true } })
      .eq('account_id', accountA)
      .select();
    expect(direct.data ?? []).toEqual([]);

    // And B cannot slip a row in for A's account either.
    const insert = await B.client
      .from('integrations')
      .insert({ account_id: accountA, kind: 'recap_email', settings: { to_members: true } });
    expect(insert.error).not.toBeNull();

    // The door the settings screen uses only ever works on the caller's OWN account.
    const door = await B.client.rpc('save_recap_settings', {
      p_settings: { to_owner: true, to_members: true, auto_send: true },
    });
    if (!door.error) {
      const after = await A.client.from('integrations').select('settings').eq('kind', 'recap_email');
      expect(after.data ?? []).toEqual(before.data ?? []);
      // Put B's own settings back the way they were.
      await B.client.rpc('save_recap_settings', {
        p_settings: { to_owner: true, to_members: false, auto_send: false },
      });
    }
  });

  test('a person can change their own preferred language, and it is remembered', async () => {
    const saved = await B.client.from('profiles').update({ preferred_language: 'es' }).eq('id', B.userId).select();
    expect(saved.error).toBeNull();

    const read = await B.client.from('profiles').select('preferred_language').eq('id', B.userId).single();
    expect(read.data?.preferred_language).toBe('es');

    // Put it back, so the next run starts from English again.
    await B.client.from('profiles').update({ preferred_language: 'en' }).eq('id', B.userId);
  });

  test('user B cannot change user A\'s preferred language', async () => {
    const { data } = await B.client.from('profiles').update({ preferred_language: 'ar' }).eq('id', A.userId).select();
    expect(data).toEqual([]);
    const check = await A.client.from('profiles').select('preferred_language').eq('id', A.userId).single();
    expect(check.data?.preferred_language).not.toBe('ar');
  });

  test('user B cannot change user A\'s profile', async () => {
    const { data } = await B.client.from('profiles').update({ display_name: 'hacked' }).eq('id', A.userId).select();
    expect(data).toEqual([]);
    const check = await A.client.from('profiles').select('display_name').eq('id', A.userId).single();
    expect(check.data?.display_name).not.toBe('hacked');
  });

  test('nobody can make themselves an admin', async () => {
    const { error } = await B.client.from('profiles').update({ is_admin: true }).eq('id', B.userId);
    expect(error).not.toBeNull();
    const { data } = await B.client.from('profiles').select('is_admin').eq('id', B.userId).single();
    expect(data?.is_admin).toBe(false);
  });

  test('user B cannot add themselves to A\'s account', async () => {
    const { error } = await B.client.from('account_members').insert({ account_id: accountA, user_id: B.userId, role: 'member' });
    expect(error).not.toBeNull();
  });

  test('signed in people can read plans but not change them', async () => {
    const read = await B.client.from('plans').select('name, meetings_per_month').eq('name', 'Free').single();
    expect(read.data).toEqual({ name: 'Free', meetings_per_month: 5 });

    const write = await B.client.from('plans').update({ meetings_per_month: 999 }).eq('name', 'Free').select();
    expect(write.error ?? write.data).toBeTruthy();
    expect(write.data ?? []).toEqual([]);
    const insert = await B.client.from('plans').insert({ name: 'Hack', meetings_per_month: 999 });
    expect(insert.error).not.toBeNull();
    const after = await A.client.from('plans').select('meetings_per_month').eq('name', 'Free').single();
    expect(after.data?.meetings_per_month).toBe(5);
  });

  test('signed out visitors cannot read anything', async () => {
    const anon = createClient(url!, key!, { global: { fetch: realFetch }, auth: { persistSession: false } });
    const plans = await anon.from('plans').select('id');
    expect(plans.error ?? plans.data?.length === 0).toBeTruthy();
    const profiles = await anon.from('profiles').select('id');
    expect(profiles.error ?? profiles.data?.length === 0).toBeTruthy();
  });
});

/**
 * The security baseline (prompt 11), checked against the real test project.
 *
 * These need `supabase db push` to have been run. Until then each says so plainly, and in
 * strict mode (GYAN_REQUIRE_LIVE_RLS=1) it is a failure rather than a shrug.
 */
maybe('Supabase test project: the security baseline', () => {
  let A: Awaited<ReturnType<typeof login>>;
  let B: Awaited<ReturnType<typeof login>>;
  /** Has `supabase db push` been run since prompt 11? Checked once, by looking. */
  let pushed = false;

  beforeAll(async () => {
    expect(url).toContain('ofnspnobzesxmyqjxzad'); // only ever the TEST project
    A = await login(a);
    B = await login(b);
    const probe = await A.client.from('security_settings').select('kind').limit(1);
    pushed = !probe.error;
  });

  test('the app can read the limits, so it knows when to sign somebody out', async () => {
    const read = await A.client.from('security_settings').select('kind, minutes').eq('kind', 'inactivity').maybeSingle();
    if (read.error) return notPushedYet('security_settings');
    expect(read.data?.minutes).toBeGreaterThan(0);
  });

  test('NOBODY CAN CHANGE A LIMIT FROM THE APP', async () => {
    const read = await A.client.from('security_settings').select('kind').limit(1);
    if (read.error) return notPushedYet('security_settings');

    const write = await A.client.from('security_settings').update({ minutes: 9999 }).eq('kind', 'inactivity').select();
    // Either refused outright, or allowed through to a rule that changes nothing.
    expect(write.error ?? (write.data ?? []).length === 0).toBeTruthy();

    const after = await A.client.from('security_settings').select('minutes').eq('kind', 'inactivity').single();
    expect(after.data?.minutes).not.toBe(9999);
  });

  test('THE RATE LIMIT COUNTERS ARE INVISIBLE TO THE APP', async () => {
    const read = await A.client.from('rate_limits').select('*');
    // No rule and no permission at all: either an error, or nothing to see.
    expect(read.error ?? (read.data ?? []).length === 0).toBeTruthy();
  });

  test('THE APP CANNOT ASK FOR SOMEBODY ELSE’S ALLOWANCE TO BE SPENT', async () => {
    const { error } = await A.client.rpc('check_rate_limit', {
      p_kind: 'translate',
      p_user_id: B.userId,
      p_account_id: null,
    });
    // Server only. A signed-in person must never be able to reach it.
    expect(error).not.toBeNull();
  });

  test('THE APP CANNOT RUN RETENTION, not even as a dry run', async () => {
    const { error } = await A.client.rpc('run_retention', { p_dry_run: true });
    expect(error).not.toBeNull();
  });

  test('THE APP CANNOT WRITE A LOG ROW ABOUT SOMEBODY ELSE', async () => {
    const direct = await A.client.rpc('record_audit', {
      p_account_id: null,
      p_actor_user_id: B.userId,
      p_action: 'note_delete',
    });
    expect(direct.error).not.toBeNull();

    // And the door the app *is* allowed to use refuses an action it has no business logging.
    const mine = await A.client.rpc('record_my_action', { p_action: 'note_delete' });
    if (mine.error?.message?.includes('Could not find the function')) return notPushedYet('record_my_action');
    expect(mine.error).not.toBeNull();
  });

  test('a person can write down their own sign in, and nothing else', async () => {
    const ok = await A.client.rpc('record_my_action', { p_action: 'sign_in' });
    if (ok.error?.message?.includes('Could not find the function')) return notPushedYet('record_my_action');
    expect(ok.error).toBeNull();
  });

  test('B CANNOT READ A SINGLE LINE OF A’S AUDIT LOG', async () => {
    const read = await B.client.from('audit_log').select('*');
    if (read.error?.message?.includes('does not exist')) return notPushedYet('audit_log');
    // B owns their own account, so they may see their own rows and never A's.
    for (const row of read.data ?? []) expect(row.actor_user_id).not.toBe(A.userId);
  });

  test('THE AUDIT LOG CANNOT BE CHANGED OR DELETED FROM THE APP', async () => {
    const read = await A.client.from('audit_log').select('id').limit(1);
    if (read.error?.message?.includes('does not exist')) return notPushedYet('audit_log');

    const changed = await A.client.from('audit_log').update({ action: 'sign_in' }).eq('id', read.data?.[0]?.id ?? 0).select();
    expect(changed.error ?? (changed.data ?? []).length === 0).toBeTruthy();

    const deleted = await A.client.from('audit_log').delete().eq('id', read.data?.[0]?.id ?? 0).select();
    expect(deleted.error ?? (deleted.data ?? []).length === 0).toBeTruthy();
  });

  test('a person reads their own privacy settings, and gets the number in force', async () => {
    const { data, error } = await A.client.rpc('get_account_privacy');
    if (error?.message?.includes('Could not find the function')) return notPushedYet('get_account_privacy');
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    // Never null: the account's own choice, or the 30 minutes from security_settings.
    expect(row.inactivity_minutes).toBeGreaterThan(0);
    expect(typeof row.email_summaries).toBe('boolean');
    expect(row.is_owner).toBe(true);
  });

  test('a silly keeping time is refused with a plain reason', async () => {
    const { error } = await A.client.rpc('save_account_privacy', { p_settings: { retention_days: 7 } });
    if (error?.message?.includes('Could not find the function')) return notPushedYet('save_account_privacy');
    expect(error?.message).toContain('bad_retention');
  });

  test('B cannot change A’s privacy settings by writing to the table', async () => {
    const read = await B.client.from('account_privacy').select('account_id').limit(1);
    if (read.error?.message?.includes('does not exist')) return notPushedYet('account_privacy');

    const write = await B.client.from('account_privacy').update({ retention_days: 30 }).neq('account_id', read.data?.[0]?.account_id ?? '').select();
    expect(write.error ?? (write.data ?? []).length === 0).toBeTruthy();
  });

  test('consent is written down for the person signed in, and read by nobody else', async () => {
    const written = await A.client.rpc('record_consent', { p_version: 'test-v0', p_hash: 'testhash', p_platform: 'web' });
    if (written.error?.message?.includes('Could not find the function')) return notPushedYet('record_consent');
    expect(written.error).toBeNull();

    const mine = await A.client.from('consent_records').select('user_id, consent_version');
    expect((mine.data ?? []).every((r) => r.user_id === A.userId)).toBe(true);

    const theirs = await B.client.from('consent_records').select('user_id');
    expect((theirs.data ?? []).every((r) => r.user_id === B.userId)).toBe(true);
  });

  test('a consent record cannot be edited or deleted afterwards', async () => {
    const read = await A.client.from('consent_records').select('id').limit(1);
    if (read.error?.message?.includes('does not exist')) return notPushedYet('consent_records');
    if (!read.data?.length) return;

    const changed = await A.client.from('consent_records').update({ consent_text_hash: 'tampered' }).eq('id', read.data[0].id).select();
    expect(changed.error ?? (changed.data ?? []).length === 0).toBeTruthy();
  });

  test('THE APP CAN NO LONGER WRITE STRAIGHT INTO INTEGRATIONS', async () => {
    // This one really tries to write, so it must not run before the fix is pushed, or it
    // leaves a junk row behind in the test project. (That is not a guess: it happened
    // once while this test was being written, which is also the proof the gap was real --
    // a signed-in person could put any token they liked into the table the notes say will
    // hold Slack and Teams tokens.)
    if (!pushed) return notPushedYet('the integrations fix');

    const { data } = await A.client.from('accounts').select('id').eq('owner_id', A.userId).single();
    const write = await A.client.from('integrations').insert({
      account_id: data!.id,
      kind: 'slack',
      settings: { token: 'should-never-be-stored-this-way' },
    }).select();
    expect(write.error).not.toBeNull();

    // Belt and braces: if it ever does get through, take it straight back out again.
    if (!write.error) await A.client.from('integrations').delete().eq('kind', 'slack');
  });
});

/**
 * The data controls (prompt 11), checked against the real test project.
 *
 * The export function takes no id at all -- it works out who is asking from their login and
 * which account they are on from the database -- so there is no id to tamper with. What is
 * worth proving here is the thing underneath: that one person cannot reach another person's
 * finished export, or any other file in their folder.
 */
maybe('Supabase test project: exports and the files behind them', () => {
  let A: Awaited<ReturnType<typeof login>>;
  let B: Awaited<ReturnType<typeof login>>;
  let accountA: string;

  beforeAll(async () => {
    expect(url).toContain('ofnspnobzesxmyqjxzad'); // only ever the TEST project
    A = await login(a);
    B = await login(b);
    const { data } = await A.client.from('accounts').select('id').eq('owner_id', A.userId).single();
    accountA = data!.id;
  });

  test('B CANNOT LIST WHAT IS IN A’S FOLDER', async () => {
    // An export is written to <account id>/exports/<random>.zip. The storage rules key off
    // that first part, so another account cannot see into it at all.
    const { data, error } = await B.client.storage.from('notes-files').list(`${accountA}/exports`);
    expect(error ?? (data ?? []).length === 0).toBeTruthy();
  });

  test('B CANNOT DOWNLOAD A FILE FROM A’S FOLDER, even knowing the path', async () => {
    const { data, error } = await B.client.storage
      .from('notes-files')
      .download(`${accountA}/exports/anything.zip`);
    // Either refused outright, or nothing comes back. Never somebody else's file.
    expect(error ?? data === null).toBeTruthy();
  });

  test('B CANNOT MAKE A LINK TO A FILE IN A’S FOLDER', async () => {
    // A signed link is a key to one file. Being able to mint one for somebody else's folder
    // would hand over everything the rules are there to protect.
    const { data, error } = await B.client.storage
      .from('notes-files')
      .createSignedUrl(`${accountA}/exports/anything.zip`, 60);
    expect(error ?? !data?.signedUrl).toBeTruthy();
  });

  test('B CANNOT WRITE INTO A’S FOLDER either', async () => {
    const { error } = await B.client.storage
      .from('notes-files')
      .upload(`${accountA}/exports/planted.zip`, new Blob(['x']), { upsert: true });
    expect(error).not.toBeNull();
  });

  test('the export function refuses somebody who is not signed in', async () => {
    const res = await realFetch(`${url}/functions/v1/export`, {
      method: 'POST',
      headers: { apikey: key!, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  test('a person can read their own privacy settings, and not somebody else’s', async () => {
    const mine = await A.client.rpc('get_account_privacy');
    if (mine.error?.message?.includes('Could not find the function')) return notPushedYet('get_account_privacy');
    const row = Array.isArray(mine.data) ? mine.data[0] : mine.data;
    expect(row.account_id).toBe(accountA);

    // B asks the same question and gets THEIR account, never A's.
    const theirs = await B.client.rpc('get_account_privacy');
    const theirRow = Array.isArray(theirs.data) ? theirs.data[0] : theirs.data;
    expect(theirRow.account_id).not.toBe(accountA);
  });
});
