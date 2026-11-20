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

if (!ready) {
  // eslint-disable-next-line no-console
  console.warn('Skipping Supabase isolation tests: add TEST_USER_A_* and TEST_USER_B_* to .env.local.');
}
const maybe = ready ? describe : describe.skip;

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
