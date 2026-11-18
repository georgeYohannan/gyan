/**
 * Reading one note and its transcript, and asking the server function to make the transcript.
 * The Deepgram key is never here. It lives only on the server.
 */
import type { Status } from '@/components/ui/status-badge';
import { getSupabase } from '@/lib/supabase';

export type NoteDetail = {
  id: string;
  title: string | null;
  source: 'upload' | 'phone' | 'bot' | 'text';
  status: Status;
  error_message: string | null;
  created_at: string;
  spoken_language: string | null;
  duration_seconds: number | null;
  /** Where the file sits in the private bucket. Pasted text keeps its words there too. */
  file_path: string | null;
};

export type TranscriptLine = {
  id: string;
  speaker_label: string | null;
  start_ms: number;
  end_ms: number;
  text: string;
};

const STATUS_FROM_DB: Record<string, Status> = {
  uploading: 'Uploading',
  queued: 'Queued',
  transcribing: 'Transcribing',
  summarizing: 'Summarizing',
  ready: 'Ready',
  failed: 'Failed',
};

/** One note, or undefined when it does not exist (or is not the person's). */
export async function getNote(id: string): Promise<NoteDetail | undefined> {
  const { data, error } = await getSupabase()
    .from('meetings')
    .select('id, title, source, status, error_message, created_at, spoken_language, duration_seconds, file_path')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return { ...data, status: STATUS_FROM_DB[data.status as string] ?? 'Queued' } as NoteDetail;
}

/** The transcript lines of a note, in time order. */
export async function listSegments(meetingId: string): Promise<TranscriptLine[]> {
  const { data, error } = await getSupabase()
    .from('transcript_segments')
    .select('id, speaker_label, start_ms, end_ms, text')
    .eq('meeting_id', meetingId)
    .order('start_ms', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TranscriptLine[];
}

/** 65000 -> "1:05". 3725000 -> "1:02:05". */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Asks the server to start the transcript. Resolves when the server has accepted the job. */
export async function startTranscription(meetingId: string): Promise<void> {
  const { error, response } = (await getSupabase().functions.invoke('transcribe', { body: { meeting_id: meetingId } })) as {
    error: { message?: string } | null;
    response?: Response;
  };
  if (!error) return;
  // 409 means it already started (for example a double tap). That is fine.
  if (response?.status === 409) return;
  throw new Error(error.message ?? 'transcribe_failed');
}
