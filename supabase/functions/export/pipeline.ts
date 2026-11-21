// Gathering everything Gyan holds about one person, and packing it into a zip.
//
// Pure code apart from the database and storage handed to it, so Jest can test the whole
// shape of an export with a fake database and no network.

import { isPathInsideAccount } from '../_shared/paths.ts';
import { makeZip, safeZipName, type ZipEntry } from '../_shared/zip.ts';

export class ExportError extends Error {}

export const MESSAGES = {
  problem: 'Gyan could not put your copy together just now. Please try again.',
  noAccount: 'There is nothing to export yet.',
};

/** Anything that reads rows. Narrow on purpose, so the tests can stand in for it. */
type Query = {
  select(columns: string): Query;
  eq(column: string, value: string): Query;
  in(column: string, values: string[]): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  then<T>(resolve: (value: { data: unknown[] | null; error: unknown }) => T): PromiseLike<T>;
};

export type Db = {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export type Files = {
  download(path: string): Promise<Uint8Array | null>;
  signedUrl(path: string, seconds: number): Promise<string | null>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** A link to the finished export, which lives in its own bucket. */
  signedExportUrl(path: string, seconds: number): Promise<string | null>;
};

export type ExportOptions = {
  db: Db;
  files: Files;
  userId: string;
  accountId: string;
  /** The person's own email, which they obviously already know. */
  email: string;
  bucket: string;
  maxZippedBytes: number;
  exportLinkSeconds: number;
  fileLinkSeconds: number;
  exportFolder: string;
  /** Overridable so a test can be sure of the name and the time. */
  now?: () => Date;
  newId?: () => string;
};

export type ExportResult = {
  /** Where to download it. Short lived on purpose. */
  url: string;
  /** How big the zip is, so the screen can say. */
  bytes: number;
  /** How many recordings went inside it. */
  filesIncluded: number;
  /** How many were too big to go inside, and are linked instead. */
  filesLinked: number;
};

async function rows(query: Query): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  if (error) throw new ExportError(MESSAGES.problem);
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * Builds the whole export.
 *
 * WHAT GOES IN. Everything Gyan holds that is about this person or the account they are on:
 * their profile, every note on the account with its transcript, summary, to-dos and
 * translations, their own chats, who is on the team, what they agreed to and when, the
 * record of what has happened, and every email Gyan sent about their notes.
 *
 * WHAT DOES NOT. Other people's private chats, which are theirs and not this person's, and
 * nothing at all from another account.
 */
export async function runExport(o: ExportOptions): Promise<ExportResult> {
  const now = (o.now ?? (() => new Date()))();
  const newId = o.newId ?? (() => crypto.randomUUID());

  const [profile] = await rows(o.db.from('profiles').select('*').eq('id', o.userId));
  const meetings = await rows(
    o.db.from('meetings').select('*').eq('account_id', o.accountId).order('created_at', { ascending: true }),
  );
  const meetingIds = meetings.map((m) => String(m.id));

  const forMeetings = async (table: string, columns = '*') =>
    meetingIds.length === 0 ? [] : await rows(o.db.from(table).select(columns).in('meeting_id', meetingIds));

  const [segments, summaries, actionItems, translations, members, invites, emails, consent] = await Promise.all([
    forMeetings('transcript_segments'),
    forMeetings('summaries'),
    forMeetings('action_items'),
    forMeetings('translations'),
    rows(o.db.from('account_members').select('*').eq('account_id', o.accountId)),
    rows(o.db.from('invites').select('id, email, status, created_at').eq('account_id', o.accountId)),
    rows(o.db.from('email_log').select('*').eq('account_id', o.accountId)),
    rows(o.db.from('consent_records').select('*').eq('user_id', o.userId)),
  ]);

  // Chats are private to the person who asked, so only their own threads come out -- never
  // a teammate's, even on a shared account.
  const threads = await rows(o.db.from('chat_threads').select('*').eq('user_id', o.userId));
  const threadIds = threads.map((t) => String(t.id));
  const chatMessages =
    threadIds.length === 0 ? [] : await rows(o.db.from('chat_messages').select('*').in('thread_id', threadIds));

  const auditRows = await rows(o.db.from('audit_log').select('*').eq('actor_user_id', o.userId));

  // --- the recordings -------------------------------------------------------------------
  const entries: ZipEntry[] = [];
  const includedFiles: Record<string, string>[] = [];
  const linkedFiles: Record<string, string>[] = [];
  let budget = o.maxZippedBytes;

  for (const meeting of meetings) {
    const path = typeof meeting.file_path === 'string' ? meeting.file_path : '';
    if (path === '') continue;

    // THE PATH HAS TO BE REALLY INSIDE THIS ACCOUNT, not merely start with it.
    //
    // meetings.file_path is written by the app, and what follows hands it to storage with
    // the SERVICE KEY, which skips every rule. A path like
    // "<account>/<note>/../../<other account>/<their note>/x.m4a" starts with the right
    // prefix and becomes somebody else's file once it is turned into a web address.
    // Skipped quietly rather than failing the whole export: one odd row must not stop
    // somebody getting the rest of their data.
    if (!isPathInsideAccount(path, o.accountId)) continue;
    const title = typeof meeting.title === 'string' && meeting.title.trim() !== '' ? meeting.title : 'Untitled note';
    const ending = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
    const insideName = safeZipName(`recordings/${String(meeting.id)}${ending}`);

    const bytes = budget > 0 ? await o.files.download(path) : null;
    if (bytes && bytes.length <= budget) {
      entries.push({ name: insideName, bytes, at: now });
      includedFiles.push({ note_id: String(meeting.id), title, in_this_zip: insideName });
      budget -= bytes.length;
    } else {
      // Too big for one zip, so it is linked instead. Nothing is left out quietly.
      const url = await o.files.signedUrl(path, o.fileLinkSeconds);
      linkedFiles.push({
        note_id: String(meeting.id),
        title,
        download_link: url ?? '',
        link_works_for_hours: String(Math.round(o.fileLinkSeconds / 3600)),
      });
    }
  }

  // --- the JSON -------------------------------------------------------------------------
  const document = {
    what_this_is: 'Everything gyan holds about you and the workspace you are on.',
    made_at: now.toISOString(),
    made_for: { user_id: o.userId, email: o.email },
    how_to_read_it: [
      'gyan-export.json is this file. Every note, transcript, summary and message is in it as plain data.',
      'The recordings folder holds the audio and files that were uploaded.',
      'A recording too large to fit in one download is not in the folder. It is listed under recordings_not_in_this_zip, with a link.',
      'Nothing here is secret to gyan: it is your own information, written out in full.',
    ],
    you: profile ?? null,
    workspace: { account_id: o.accountId, people: members, invites },
    notes: meetings,
    transcripts: segments,
    summaries,
    action_items: actionItems,
    translations,
    your_chats: { threads, messages: chatMessages },
    emails_gyan_sent: emails,
    what_you_agreed_to: consent,
    what_you_did: auditRows,
    recordings_in_this_zip: includedFiles,
    recordings_not_in_this_zip: linkedFiles,
  };

  entries.unshift({
    name: 'gyan-export.json',
    bytes: new TextEncoder().encode(JSON.stringify(document, null, 2)),
    at: now,
  });

  const zip = makeZip(entries);
  // In its own bucket, which has no rules at all, so nobody can reach it through the app.
  // The person's id is in the path as well as the account's, so one teammate's export is
  // never another's even if a rule were ever added to that bucket by mistake.
  const path = `${o.accountId}/${o.userId}/${newId()}.zip`;
  await o.files.upload(path, zip, 'application/zip');

  const url = await o.files.signedExportUrl(path, o.exportLinkSeconds);
  if (!url) throw new ExportError(MESSAGES.problem);

  return { url, bytes: zip.length, filesIncluded: includedFiles.length, filesLinked: linkedFiles.length };
}
