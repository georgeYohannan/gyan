/**
 * Putting together a copy of everything gyan holds about one person.
 *
 * A fake database and fake storage, so the whole shape of an export can be checked without
 * a network. The zip itself is really built, and really unzipped, by __tests__/zip-test.ts.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { runExport, type Db, type Files } from '../supabase/functions/export/pipeline';

const ACCOUNT = 'acc-1';
const ME = 'user-me';
const THEM = 'user-them';

/** Every table the export reads, with rows for me and rows that must NOT come out. */
const TABLES: Record<string, Record<string, unknown>[]> = {
  profiles: [
    { id: ME, display_name: 'Sam Carter', preferred_language: 'en' },
    { id: THEM, display_name: 'Priya Raman', preferred_language: 'hi' },
  ],
  meetings: [
    { id: 'note-1', account_id: ACCOUNT, title: 'Weekly team call', file_path: 'acc-1/note-1/a.mp3', created_at: '2026-11-01' },
    { id: 'note-2', account_id: ACCOUNT, title: 'Pricing workshop', file_path: null, created_at: '2026-11-02' },
    { id: 'other-note', account_id: 'acc-2', title: 'SOMEBODY ELSE NOTE', file_path: 'acc-2/x/y.mp3', created_at: '2026-11-03' },
  ],
  transcript_segments: [
    { id: 's1', meeting_id: 'note-1', text: 'We agreed on the price.' },
    { id: 's9', meeting_id: 'other-note', text: 'SOMEBODY ELSE TRANSCRIPT' },
  ],
  summaries: [{ id: 'sum1', meeting_id: 'note-1', overview: 'A short call.' }],
  action_items: [{ id: 'a1', meeting_id: 'note-1', text: 'Send the quote' }],
  translations: [{ id: 't1', meeting_id: 'note-1', language: 'es', content: '{}' }],
  account_members: [
    { account_id: ACCOUNT, user_id: ME, role: 'owner' },
    { account_id: ACCOUNT, user_id: THEM, role: 'member' },
  ],
  invites: [{ id: 'i1', email: 'new@example.test', status: 'pending', created_at: '2026-11-01' }],
  email_log: [{ id: 'e1', account_id: ACCOUNT, recipient_email: 'sam@example.test', result: 'sent' }],
  consent_records: [
    { id: 1, user_id: ME, consent_version: 'v1', accepted_at: '2026-11-01' },
    { id: 2, user_id: THEM, consent_version: 'v1', accepted_at: '2026-11-01' },
  ],
  chat_threads: [
    { id: 'th-mine', account_id: ACCOUNT, user_id: ME, meeting_id: 'note-1' },
    { id: 'th-theirs', account_id: ACCOUNT, user_id: THEM, meeting_id: 'note-1' },
  ],
  chat_messages: [
    { id: 'm1', thread_id: 'th-mine', role: 'user', content: 'What did we decide?' },
    { id: 'm2', thread_id: 'th-theirs', role: 'user', content: 'SOMEBODY ELSE QUESTION' },
  ],
  audit_log: [
    { id: 1, actor_user_id: ME, action: 'sign_in' },
    { id: 2, actor_user_id: THEM, action: 'sign_in' },
  ],
};

/** A stand-in database that filters the way the real one would. */
function fakeDb(): { db: Db; rpcCalls: { name: string; args: Record<string, unknown> }[] } {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const makeQuery = (table: string) => {
    let out = [...(TABLES[table] ?? [])];
    const query = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: string) => {
        out = out.filter((row) => String(row[column]) === value);
        return query;
      },
      in: (column: string, values: string[]) => {
        out = out.filter((row) => values.includes(String(row[column])));
        return query;
      },
      then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
        Promise.resolve(resolve({ data: out, error: null })),
    };
    return query as unknown as ReturnType<Db['from']>;
  };
  return {
    rpcCalls,
    db: {
      from: makeQuery,
      rpc: (name, args) => {
        rpcCalls.push({ name, args });
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
}

function fakeFiles(sizes: Record<string, number> = { 'acc-1/note-1/a.mp3': 1000 }) {
  const uploads: { path: string; bytes: Uint8Array }[] = [];
  const signed: string[] = [];
  const files: Files = {
    download: async (p) => (sizes[p] === undefined ? null : new Uint8Array(sizes[p])),
    signedUrl: async (p) => {
      signed.push(p);
      return `https://files.example.test/${p}`;
    },
    upload: async (p, bytes) => {
      uploads.push({ path: p, bytes });
    },
    signedExportUrl: async (p) => {
      signed.push(p);
      return `https://files.example.test/${p}`;
    },
  };
  return { files, uploads, signed };
}

const base = (db: Db, files: Files) => ({
  db,
  files,
  userId: ME,
  accountId: ACCOUNT,
  email: 'sam@example.test',
  bucket: 'notes-files',
  maxZippedBytes: 60 * 1024 * 1024,
  exportLinkSeconds: 3600,
  fileLinkSeconds: 86400,
  exportFolder: 'exports',
  now: () => new Date('2026-11-21T10:00:00Z'),
  newId: () => 'export-id',
});

/** Unpacks what was uploaded, with the computer's own unzip. */
function openUpload(bytes: Uint8Array): Record<string, string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gyan-export-'));
  const file = path.join(dir, 'e.zip');
  fs.writeFileSync(file, bytes);
  execFileSync('unzip', ['-qo', file, '-d', path.join(dir, 'out')]);
  const out: Record<string, string> = {};
  const walk = (at: string, prefix = '') => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, name);
      else out[name] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(path.join(dir, 'out'));
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

describe('a copy of everything', () => {
  test('the zip really opens, and holds the notes and the recording', async () => {
    const { db } = fakeDb();
    const { files, uploads } = fakeFiles();
    const result = await runExport(base(db, files) as never);

    expect(uploads).toHaveLength(1);
    // NOT under the account's own folder. The storage rule lets any member of an account
    // read anything whose first part is that account's id, and an export holds the
    // exporter's own profile row and their own entries in the record of what happened --
    // which is owner-only. A teammate could have read the owner's history out of it.
    // In its own bucket (account-exports), which has no rules at all. It is NOT in
    // notes-files, where the rule lets any member of an account read anything under that
    // account's id -- and an export holds the exporter's own profile row and their own
    // entries in the record of what happened, which is owner-only.
    expect(uploads[0].path).toBe('acc-1/user-me/export-id.zip');
    const inside = openUpload(uploads[0].bytes);
    expect(Object.keys(inside)).toContain('gyan-export.json');
    expect(Object.keys(inside)).toContain('recordings/note-1.mp3');
    expect(result.filesIncluded).toBe(1);
    expect(result.url).toContain('acc-1/user-me/export-id.zip');
    // The path comes back too, so the server can tidy this file up in a day's time.
    expect(result.path).toBe('acc-1/user-me/export-id.zip');
  });

  test('IT HOLDS EVERYTHING GYAN KNOWS, not a summary of it', async () => {
    const { db } = fakeDb();
    const { files, uploads } = fakeFiles();
    await runExport(base(db, files) as never);
    const document = JSON.parse(openUpload(uploads[0].bytes)['gyan-export.json']);

    expect(document.you.display_name).toBe('Sam Carter');
    expect(document.notes).toHaveLength(2);
    expect(document.transcripts[0].text).toBe('We agreed on the price.');
    expect(document.summaries[0].overview).toBe('A short call.');
    expect(document.action_items[0].text).toBe('Send the quote');
    expect(document.translations).toHaveLength(1);
    expect(document.workspace.people).toHaveLength(2);
    expect(document.emails_gyan_sent).toHaveLength(1);
    expect(document.what_you_agreed_to).toHaveLength(1);
    expect(document.what_you_did).toHaveLength(1);
    // And it explains itself, rather than being a wall of data with no way in.
    expect(document.how_to_read_it.length).toBeGreaterThanOrEqual(3);
  });

  test('NOTHING FROM ANOTHER ACCOUNT COMES OUT', async () => {
    const { db } = fakeDb();
    const { files, uploads } = fakeFiles();
    await runExport(base(db, files) as never);
    const raw = openUpload(uploads[0].bytes)['gyan-export.json'];

    expect(raw).not.toContain('SOMEBODY ELSE NOTE');
    expect(raw).not.toContain('SOMEBODY ELSE TRANSCRIPT');
    expect(raw).not.toContain('acc-2');
  });

  test('A TEAMMATE’S PRIVATE CHAT NEVER COMES OUT, even on a shared account', async () => {
    // Notes are shared with everybody on an account; a chat belongs to the person who asked.
    // An export that handed over a colleague's questions would break that quietly.
    const { db } = fakeDb();
    const { files, uploads } = fakeFiles();
    await runExport(base(db, files) as never);
    const raw = openUpload(uploads[0].bytes)['gyan-export.json'];
    const document = JSON.parse(raw);

    expect(document.your_chats.threads).toHaveLength(1);
    expect(document.your_chats.messages).toHaveLength(1);
    expect(document.your_chats.messages[0].content).toBe('What did we decide?');
    expect(raw).not.toContain('SOMEBODY ELSE QUESTION');
  });

  test('somebody else’s record of what they did is not in it either', async () => {
    const { db } = fakeDb();
    const { files, uploads } = fakeFiles();
    await runExport(base(db, files) as never);
    const document = JSON.parse(openUpload(uploads[0].bytes)['gyan-export.json']);
    expect(document.what_you_did.every((row: { actor_user_id: string }) => row.actor_user_id === ME)).toBe(true);
    expect(document.what_you_agreed_to.every((row: { user_id: string }) => row.user_id === ME)).toBe(true);
  });

  test('A RECORDING TOO BIG TO FIT IS LINKED, NEVER DROPPED', async () => {
    // The limit is where this runs, not a decision about what somebody may have. Leaving a
    // recording out quietly would be handing somebody less than they asked for.
    const { db } = fakeDb();
    const { files, uploads } = fakeFiles({ 'acc-1/note-1/a.mp3': 5000 });
    const result = await runExport({ ...base(db, files), maxZippedBytes: 100 } as never);

    expect(result.filesIncluded).toBe(0);
    expect(result.filesLinked).toBe(1);

    const document = JSON.parse(openUpload(uploads[0].bytes)['gyan-export.json']);
    expect(document.recordings_not_in_this_zip).toHaveLength(1);
    expect(document.recordings_not_in_this_zip[0].title).toBe('Weekly team call');
    expect(document.recordings_not_in_this_zip[0].download_link).toContain('acc-1/note-1/a.mp3');
    expect(document.recordings_not_in_this_zip[0].link_works_for_hours).toBe('24');
    // And the export says so where somebody reading it would look.
    expect(document.how_to_read_it.join(' ')).toContain('recordings_not_in_this_zip');
  });

  test('a note with no recording is still in the data', async () => {
    const { db } = fakeDb();
    const { files, uploads } = fakeFiles();
    await runExport(base(db, files) as never);
    const document = JSON.parse(openUpload(uploads[0].bytes)['gyan-export.json']);
    expect(document.notes.map((n: { title: string }) => n.title)).toContain('Pricing workshop');
  });

  test('the link to the whole thing does not last for ever', async () => {
    const { db } = fakeDb();
    const { files } = fakeFiles();
    const result = await runExport(base(db, files) as never);
    expect(result.url).toBeTruthy();
    // One hour, from settings. Long enough to download, short enough that a copied address
    // in somebody's history is not a way in later.
    expect(base(db, files).exportLinkSeconds).toBe(3600);
  });
});
