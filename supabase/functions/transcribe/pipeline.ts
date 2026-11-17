// The slow part of a transcript: link -> Deepgram -> save (or fail). Pure code, so Jest can test it
// with a fake database and a fake Deepgram.
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
};

/**
 * Makes the transcript. On success the note becomes Ready (+1 usage, ai_usage row, in one database step).
 * On any problem the note becomes Failed with a plain message and nothing is counted.
 * Returns true when it worked.
 */
export async function runTranscription(o: PipelineOptions): Promise<boolean> {
  try {
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
    return true;
  } catch (e) {
    const message = e instanceof TranscribeError ? e.message : MESSAGES.unknown;
    // Log the kind of problem only. Never log the key or the audio link.
    console.error('transcribe failed for', o.meetingId, e instanceof Error ? e.name : 'error');
    await o.admin.rpc('fail_transcription', { p_meeting_id: o.meetingId, p_message: message });
    return false;
  }
}
