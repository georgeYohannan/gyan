/** @jest-environment node */
/**
 * Talks to the real Supabase TEST project. Proves:
 *  - a person can add a note and a file to their own account,
 *  - another person cannot see, download, change, or add to those files or notes.
 * Needs the 2 fake test users in .env.local (see docs/testing/prompt-3.md). Otherwise skipped.
 * Test notes are titled "[test] ..." so they are easy to spot and clean up.
 */
import { createClient } from '@supabase/supabase-js';

import { loginAs, readEnv, realFetch } from '../__mocks__/real-supabase';

const env = readEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_KEY;
const a = { email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD };
const b = { email: env.TEST_USER_B_EMAIL, password: env.TEST_USER_B_PASSWORD };
const ready = !!(url && key && a.email && a.password && b.email && b.password);
if (!ready) {
  // eslint-disable-next-line no-console
  console.warn('Skipping storage tests: add TEST_USER_A_* and TEST_USER_B_* to .env.local.');
}
const maybe = ready ? describe : describe.skip;

const BUCKET = 'notes-files';

maybe('Supabase test project: adding notes and file privacy', () => {
  let A: Awaited<ReturnType<typeof loginAs>>;
  let B: Awaited<ReturnType<typeof loginAs>>;
  let accountA: string;
  let accountB: string;
  const meetingId = globalThis.crypto.randomUUID();
  let path: string;

  beforeAll(async () => {
    expect(url).toContain('ofnspnobzesxmyqjxzad'); // only ever the TEST project
    A = await loginAs(url!, key!, a as { email: string; password: string });
    B = await loginAs(url!, key!, b as { email: string; password: string });
    accountA = (await A.client.from('accounts').select('id').eq('owner_id', A.userId).single()).data!.id;
    accountB = (await B.client.from('accounts').select('id').eq('owner_id', B.userId).single()).data!.id;
    path = `${accountA}/${meetingId}/hello.txt`;
  });

  afterAll(async () => {
    await A.client.storage.from(BUCKET).remove([path]);
  });

  test('user A makes a text note, uploads its file, and it becomes Queued', async () => {
    const made = await A.client.rpc('create_note', {
      p_meeting_id: meetingId, p_account_id: accountA, p_source: 'text', p_title: '[test] storage rules', p_file_path: path,
    });
    expect(made.error).toBeNull();

    const early = await A.client.from('meetings').select('status, source, file_path').eq('id', meetingId).single();
    expect(early.data).toEqual({ status: 'uploading', source: 'text', file_path: path });

    // Queued is refused until the file really exists.
    const tooEarly = await A.client.rpc('mark_note_queued', { p_meeting_id: meetingId });
    expect(tooEarly.error?.message).toContain('file_missing');

    const up = await A.client.storage.from(BUCKET).upload(path, new Blob(['hello from a test'], { type: 'text/plain' }), { contentType: 'text/plain', upsert: true });
    expect(up.error).toBeNull();

    const queued = await A.client.rpc('mark_note_queued', { p_meeting_id: meetingId });
    expect(queued.error).toBeNull();
    const after = await A.client.from('meetings').select('status').eq('id', meetingId).single();
    expect(after.data?.status).toBe('queued');
  });

  test('user A can download their own file', async () => {
    const { data, error } = await A.client.storage.from(BUCKET).download(path);
    expect(error).toBeNull();
    expect(await data!.text()).toBe('hello from a test');
  });

  test('user B cannot see, list, or download user A\'s file', async () => {
    const download = await B.client.storage.from(BUCKET).download(path);
    expect(download.data).toBeNull();
    expect(download.error).not.toBeNull();

    const list = await B.client.storage.from(BUCKET).list(`${accountA}/${meetingId}`);
    expect(list.data ?? []).toEqual([]);

    const signed = await B.client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.data).toBeNull();
  });

  test('user B cannot upload into, replace, or delete in user A\'s folder', async () => {
    const intoA = await B.client.storage.from(BUCKET).upload(`${accountA}/${globalThis.crypto.randomUUID()}/evil.txt`, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' });
    expect(intoA.error).not.toBeNull();

    const replace = await B.client.storage.from(BUCKET).upload(path, new Blob(['hacked'], { type: 'text/plain' }), { contentType: 'text/plain', upsert: true });
    expect(replace.error).not.toBeNull();

    await B.client.storage.from(BUCKET).remove([path]);
    const still = await A.client.storage.from(BUCKET).download(path);
    expect(await still.data!.text()).toBe('hello from a test');
  });

  test('user B cannot see or change user A\'s note', async () => {
    const seen = await B.client.from('meetings').select('id').eq('id', meetingId);
    expect(seen.data ?? []).toEqual([]);

    const failed = await B.client.rpc('mark_note_failed', { p_meeting_id: meetingId, p_message: 'hacked' });
    expect(failed.error).toBeNull(); // quietly does nothing
    const check = await A.client.from('meetings').select('status, error_message').eq('id', meetingId).single();
    expect(check.data).toEqual({ status: 'queued', error_message: null });
  });

  test('user B cannot make a note in user A\'s account', async () => {
    const id = globalThis.crypto.randomUUID();
    const { error } = await B.client.rpc('create_note', {
      p_meeting_id: id, p_account_id: accountA, p_source: 'text', p_title: '[test] sneaky', p_file_path: `${accountA}/${id}/x.txt`,
    });
    expect(error?.message).toContain('not_allowed');
  });

  test('a note cannot point at another account\'s folder', async () => {
    const id = globalThis.crypto.randomUUID();
    const { error } = await B.client.rpc('create_note', {
      p_meeting_id: id, p_account_id: accountB, p_source: 'text', p_title: '[test] bad path', p_file_path: `${accountA}/${id}/x.txt`,
    });
    expect(error?.message).toContain('bad_file_path');
  });

  test('the app cannot write to the meetings table directly', async () => {
    const { error } = await A.client.from('meetings').insert({ account_id: accountA, created_by: A.userId, source: 'text', status: 'ready' });
    expect(error).not.toBeNull();
  });

  test('signed out visitors cannot add notes', async () => {
    const anon = createClient(url!, key!, { global: { fetch: realFetch }, auth: { persistSession: false } });
    const id = globalThis.crypto.randomUUID();
    const { error } = await anon.rpc('create_note', { p_meeting_id: id, p_account_id: accountA, p_source: 'text', p_title: 'x', p_file_path: `${accountA}/${id}/x.txt` });
    expect(error).not.toBeNull();
  });
});
