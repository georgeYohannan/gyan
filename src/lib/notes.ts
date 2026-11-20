/**
 * Everything about notes (the "meetings" table): file rules, the monthly limit,
 * the list, and adding a note. The limit always comes from the plans table.
 */
import type { Status } from '@/components/ui/status-badge';
import { startSummary } from '@/lib/summaries';
import { getSupabase } from '@/lib/supabase';
import { startTranscription } from '@/lib/transcripts';
import { uploadFile } from '@/lib/upload';

/** The most Supabase's Free plan lets one file be (50 MB). The bucket enforces the same number. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** The most video we try to take audio out of in the browser (it is unpacked in memory). */
export const MAX_VIDEO_BYTES_TO_EXTRACT = 300 * 1024 * 1024;

export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'oga', 'opus', 'flac', 'webm'];
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];
export const TEXT_EXTENSIONS = ['txt', 'md'];

export type FileKind = 'audio' | 'video' | 'text';

/** What kind of file is this? Returns undefined for files Gyan cannot use. */
export function classifyFile(name: string, mimeType?: string | null): FileKind | undefined {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('video/') && ext !== 'webm') return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'text/plain' || mime === 'text/markdown') return 'text';
  if (TEXT_EXTENSIONS.includes(ext)) return 'text';
  if (ext === 'webm') return mime.startsWith('video/') ? 'video' : 'audio';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return undefined;
}

export const ACCEPTED_TYPES_TEXT = 'Audio (MP3, M4A, WAV), video (MP4, MOV), or a text file (TXT, MD)';

/** A file the person picked. `file` is the browser File on the web. */
export type PickedFile = { name: string; size: number; mimeType?: string | null; uri: string; file?: File };

/** The note sources saved in the database. */
export type Source = 'upload' | 'phone' | 'bot' | 'text';

export const SOURCE_LABEL: Record<Source, string> = {
  upload: 'Upload',
  phone: 'Recording',
  bot: 'Meeting link',
  text: 'Pasted text',
};

export type NoteRow = {
  id: string;
  title: string | null;
  source: Source;
  status: Status;
  error_message: string | null;
  created_at: string;
};

const STATUS_FROM_DB: Record<string, Status> = {
  uploading: 'Uploading',
  queued: 'Queued',
  transcribing: 'Transcribing',
  summarizing: 'Summarizing',
  ready: 'Ready',
  failed: 'Failed',
};

/** True when the account has used all of its meetings this month. */
export function isLimitReached(used: number, limit: number): boolean {
  return used >= limit;
}

export type Usage = { accountId: string; planName: string; used: number; limit: number };

/** Supabase gives nested rows back as an object or a one item list. Handle both. */
function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

/** First day of this month in UTC, like "2026-11-01". Matches the usage table. */
export function currentMonthStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** The person's account, its plan limit (from the plans table), and meetings used this month. */
export async function getUsage(): Promise<Usage> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not_signed_in');

  const { data, error } = await supabase
    .from('account_members')
    .select('account_id, accounts(plan_id, plans(name, meetings_per_month))')
    .eq('user_id', auth.user.id)
    .order('role', { ascending: false })
    .limit(1);
  if (error) throw error;

  const row = data?.[0] as unknown as
    | { account_id: string; accounts: unknown }
    | undefined;
  const account = one(row?.accounts as { plans: unknown } | { plans: unknown }[] | undefined);
  const plan = one(account?.plans as { name: string; meetings_per_month: number } | { name: string; meetings_per_month: number }[] | undefined);
  if (!row || !plan) throw new Error('no_account');

  const { data: usageRows, error: usageError } = await supabase
    .from('usage')
    .select('meetings_used')
    .eq('account_id', row.account_id)
    .eq('month', currentMonthStart());
  if (usageError) throw usageError;
  const used = (usageRows ?? []).reduce((sum, r) => sum + (r.meetings_used as number), 0);

  return { accountId: row.account_id, planName: plan.name, used, limit: plan.meetings_per_month };
}

/** All notes the person can see, newest first. */
export async function listNotes(): Promise<NoteRow[]> {
  const { data, error } = await getSupabase()
    .from('meetings')
    .select('id, title, source, status, error_message, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m) => ({ ...m, status: STATUS_FROM_DB[m.status as string] ?? 'Queued' })) as NoteRow[];
}

/** A plain-words title for a note that has none. */
export function noteTitle(note: Pick<NoteRow, 'title' | 'source'>): string {
  return note.title?.trim() || (note.source === 'text' ? 'Pasted text' : 'Untitled note');
}

/** Keeps file names safe for a storage path. Still used to work out the ending. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (cleaned || 'file').slice(-120);
}

/**
 * THE NAME A FILE IS STORED UNDER IS RANDOM, not the name it arrived with.
 *
 * The file somebody picked might be called "Acme layoffs Q3 - confidential.m4a". Storing it
 * under that name writes the contents of the meeting into the file path, and a path travels
 * further than the file does: into logs, into error reports, into the address of a signed
 * link. Only people on the account can reach the files either way, so this is not a hole
 * being closed -- it is not writing private information into a name that does not need it.
 *
 * The ending is kept, because it is the only part anything downstream looks at, and it is
 * taken from a short list rather than from the name. The name the person chose is still
 * shown everywhere: it is the note's title.
 */
export function storedFileName(originalName: string): string {
  const safe = safeFileName(originalName).toLowerCase();
  const dot = safe.lastIndexOf('.');
  const ending = dot > 0 ? safe.slice(dot + 1) : '';
  const known = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS, ...TEXT_EXTENSIONS].includes(ending);
  return known ? `${newId()}.${ending}` : newId();
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** The reasons adding a note can fail, in words the app can turn into friendly sentences. */
export type NoteErrorCode = 'limit_reached' | 'too_big' | 'bad_type' | 'network' | 'unknown';

export class NoteError extends Error {
  constructor(public code: NoteErrorCode) {
    super(code);
  }
}

export const NOTE_ERROR_TEXT: Record<NoteErrorCode, string> = {
  limit_reached: 'You have used all your meetings for this month. They reset on the 1st.',
  too_big: 'That file is bigger than 50 MB. Try a shorter one, or send just the audio.',
  bad_type: 'Gyan cannot use that kind of file. Try an audio, video, or text file.',
  network: 'The upload did not finish. Check your internet and try again.',
  unknown: 'Something went wrong. Please try again.',
};

function toNoteError(e: unknown): NoteError {
  if (e instanceof NoteError) return e;
  const message = (e as { message?: string })?.message ?? '';
  if (message.includes('limit_reached')) return new NoteError('limit_reached');
  if (/maximum allowed size|payload too large|too_big/i.test(message)) return new NoteError('too_big');
  if (/network|failed to fetch|timeout/i.test(message)) return new NoteError('network');
  return new NoteError('unknown');
}

/** What is needed to send (or re-send) one note. */
export type Attempt = {
  meetingId: string;
  accountId: string;
  source: 'upload' | 'text';
  title: string;
  path: string;
  body: Blob | { uri: string };
  contentType: string;
  /** True once the note row exists in the database. Retry then restarts it instead of making a new one. */
  created: boolean;
};

/** Gets a text or file ready to send. Nothing is sent yet. */
export function prepareAttempt(
  accountId: string,
  input: { kind: 'text'; title: string; text: string } | { kind: 'file'; title: string; name: string; contentType: string; body: Blob | { uri: string } },
): Attempt {
  const meetingId = newId();
  if (input.kind === 'text') {
    return {
      meetingId,
      accountId,
      source: 'text',
      title: input.title,
      path: `${accountId}/${meetingId}/pasted-text.txt`,
      body: new Blob([input.text], { type: 'text/plain' }),
      contentType: 'text/plain',
      created: false,
    };
  }
  const isText = input.contentType.startsWith('text/');
  return {
    meetingId,
    accountId,
    source: isText ? 'text' : 'upload',
    title: input.title,
    // A random name, not the one the file arrived with. See storedFileName.
    path: `${accountId}/${meetingId}/${storedFileName(input.name)}`,
    body: input.body,
    contentType: input.contentType,
    created: false,
  };
}

/**
 * Sends a note: makes the row (Uploading), sends the file, sets Queued, then starts the transcript.
 * If anything fails, the row is marked Failed and a NoteError is thrown. Calling again retries.
 */
export async function sendAttempt(attempt: Attempt, onProgress?: (fraction: number | undefined) => void): Promise<void> {
  const supabase = getSupabase();
  try {
    if (!attempt.created) {
      const { error } = await supabase.rpc('create_note', {
        p_meeting_id: attempt.meetingId,
        p_account_id: attempt.accountId,
        p_source: attempt.source,
        p_title: attempt.title,
        p_file_path: attempt.path,
      });
      if (error) throw error;
      attempt.created = true;
    } else {
      const { error } = await supabase.rpc('restart_note_upload', { p_meeting_id: attempt.meetingId });
      if (error && !error.message.includes('not_allowed')) throw error;
    }
  } catch (e) {
    throw toNoteError(e);
  }

  try {
    await uploadFile(attempt.path, attempt.body, attempt.contentType, onProgress);
    const { error } = await supabase.rpc('mark_note_queued', { p_meeting_id: attempt.meetingId });
    if (error) throw error;
  } catch (e) {
    const err = toNoteError(e);
    await supabase.rpc('mark_note_failed', { p_meeting_id: attempt.meetingId, p_message: NOTE_ERROR_TEXT[err.code] });
    throw err;
  }

  // The file is safe in storage. Ask the server to get going.
  // Sound and video start with the transcript. Pasted text has no audio, so it goes straight to
  // the summary. If this call fails, the note stays Queued and the person can start it from the
  // note page.
  try {
    if (attempt.source === 'upload') await startTranscription(attempt.meetingId);
    else await startSummary(attempt.meetingId);
  } catch {
    /* stays Queued */
  }
}
