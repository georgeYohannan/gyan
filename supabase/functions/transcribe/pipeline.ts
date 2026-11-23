// The slow part of a transcript: link -> Deepgram -> save (or fail). Pure code, so Jest can test it
// with a fake database and a fake Deepgram.
import { sniffKind, WRONG_TYPE_MESSAGE } from '../_shared/filetype.ts';
import { isPathInsideAccount, WRONG_PLACE_MESSAGE } from '../_shared/paths.ts';

import { costFor, MESSAGES, TranscribeError, transcribeUrl } from './deepgram.ts';

/** The small part of the Supabase admin client that we use. */
export type AdminLike = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, seconds: number): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

export type PipelineOptions = {
  admin: AdminLike;
  meetingId: string;
  filePath: string;
  deepgramKey: string;
  model: string;
  usdPerMinute: number;
  bucket: string;
  signedLinkSeconds: number;
  fetcher?: typeof fetch;
  /**
   * Hands the note on to the summarize function. index.ts passes the real one in.
   * Left out in tests, and in that case the note simply waits on Summarizing.
   */
  startSummary?: () => Promise<void>;
  /** The account the note belongs to, so the file path can be checked against it. */
  accountId?: string;
  /**
   * Reads the first few thousand bytes of the stored file, so its real kind can be worked
   * out. Injected rather than called directly, so the tests stay free of storage.
   * Undefined means "cannot check", and the note carries on as before.
   */
  readFirstBytes?: (filePath: string) => Promise<Uint8Array | null>;
};

/**
 * Makes the transcript. On success the note becomes Summarizing and the summary step is asked to
 * carry on (the meeting is counted at the very end, when it becomes Ready).
 * On any problem the note becomes Failed with a plain message and nothing is counted.
 * Returns true when the transcript was made.
 */
export async function runTranscription(o: PipelineOptions): Promise<boolean> {
  try {
    // Belt and braces. mark_note_queued already refuses a note whose file does not really
    // exist under that exact name, which closes this route -- but the signed link below is
    // made with the service key, so the check costs nothing and the rule is the same
    // everywhere a stored path is used.
    if (o.accountId && !isPathInsideAccount(o.filePath, o.accountId)) {
      throw new TranscribeError(WRONG_PLACE_MESSAGE);
    }

    // IS THIS REALLY A RECORDING? The kind of file was taken on trust from the app, which
    // reads it from the file's name. Nearly every audio and video format starts with a few
    // fixed bytes, so the first few thousand bytes are read and checked before anything
    // else happens. A file that is not a recording fails the note with a plain message
    // instead of being sent to a paid service.
    if (o.readFirstBytes) {
      const bytes = await o.readFirstBytes(o.filePath);
      if (bytes && !sniffKind(bytes)) throw new TranscribeError(WRONG_TYPE_MESSAGE);
    }

    const { data: signed, error: signError } = await o.admin.storage.from(o.bucket).createSignedUrl(o.filePath, o.signedLinkSeconds);
    if (signError || !signed?.signedUrl) throw new TranscribeError(MESSAGES.missing);

    const result = await transcribeUrl(signed.signedUrl, o.deepgramKey, o.model, o.fetcher);
    const { error } = await o.admin.rpc('finish_transcription', {
      p_meeting_id: o.meetingId,
      p_language: result.language,
      p_audio_seconds: result.audioSeconds,
      p_cost: costFor(result.audioSeconds, o.usdPerMinute),
      p_segments: result.segments,
    });
    if (error) throw new Error('finish_failed');

    // The transcript is saved and the note now says Summarizing. Ask the summary step to carry on.
    // If that call does not get through, the note waits on Summarizing and the note page can start
    // it again, so this must never turn a good transcript into a Failed note.
    if (o.startSummary) {
      try {
        await o.startSummary();
      } catch {
        /* the note waits on Summarizing */
      }
    }
    return true;
  } catch (e) {
    const message = e instanceof TranscribeError ? e.message : MESSAGES.unknown;
    // Log the kind of problem only. Never log the key or the audio link.
    console.error('transcribe failed for', o.meetingId, e instanceof Error ? e.name : 'error');
    await o.admin.rpc('fail_transcription', { p_meeting_id: o.meetingId, p_message: message });
    return false;
  }
}
