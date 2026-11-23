// Pure helpers for talking to Deepgram. No Deno-only code here, so Jest can test this file.
// Docs: developers.deepgram.com/docs/diarization, /language-detection, /pre-recorded-audio

export type Segment = { speaker_label: string; start_ms: number; end_ms: number; text: string };

export type TranscriptResult = {
  segments: Segment[];
  language: string | null;
  audioSeconds: number;
};

/** The web address to call, with every setting we chose. The key is NOT in the address. */
export function buildListenUrl(model: string): string {
  const params = new URLSearchParams({
    model,
    diarize_model: 'latest', // speaker labels ("diarize=true" is deprecated)
    detect_language: 'true', // finds the spoken language
    utterances: 'true', // one line per speaker turn, with start and end times
    smart_format: 'true', // punctuation and tidy numbers

    // KEEP OUR CUSTOMERS' MEETINGS OUT OF DEEPGRAM'S TRAINING DATA.
    //
    // This one is not a preference, and it must never be taken out. Deepgram's own
    // documentation says requests "participate in the Model Improvement Program (MIP) by
    // default, and Deepgram retains them" -- the audio AND the transcript. For an app whose
    // whole job is private conversations, that is not an acceptable default.
    //
    // With this set, Deepgram says data is "Retained only for the duration needed to
    // process the request."
    //
    // Checked on developers.deepgram.com (the Model Improvement Partnership Program page
    // and trust-security/your-data) on 2026-11-21, not from memory. The console shows
    // mip_opt_out as true under Usage > Logs, which is how to confirm it is really working.
    mip_opt_out: 'true',
  });
  return `https://api.deepgram.com/v1/listen?${params.toString()}`;
}

type DeepgramResponse = {
  metadata?: { duration?: number };
  results?: {
    channels?: { detected_language?: string }[];
    utterances?: { start: number; end: number; transcript: string; speaker?: number }[];
  };
};

/** A plain-words error that is safe to show to a person. */
export class TranscribeError extends Error {}

export const MESSAGES = {
  unreadable: 'We could not read this audio file. It may be damaged, or it may not be real audio. Please try another file.',
  noSpeech: 'We could not hear any speech in this file. Check that the recording has voices in it, then try again.',
  service: 'Gyan could not reach its speech service right now. Please tap Retry in a little while.',
  busy: 'The speech service is busy. Please tap Retry in a minute.',
  missing: 'We could not find the audio file for this note. Please upload it again.',
  unknown: 'Something went wrong while making the transcript. Please tap Retry.',
} as const;

/** Turns a Deepgram error status into a plain message. */
export function messageForStatus(status: number): string {
  if (status === 400 || status === 415 || status === 422) return MESSAGES.unreadable;
  if (status === 401 || status === 402 || status === 403) return MESSAGES.service;
  if (status === 408 || status === 429 || status === 504 || status >= 500) return MESSAGES.busy;
  return MESSAGES.unknown;
}

/** Turns Deepgram's answer into our transcript lines. Speakers 0, 1, 2 become "Speaker 1", "Speaker 2", "Speaker 3". */
export function parseDeepgram(body: unknown): TranscriptResult {
  const r = body as DeepgramResponse;
  const utterances = r?.results?.utterances ?? [];
  const segments: Segment[] = utterances
    .filter((u) => typeof u.transcript === 'string' && u.transcript.trim() !== '')
    .map((u) => ({
      speaker_label: `Speaker ${(u.speaker ?? 0) + 1}`,
      start_ms: Math.round(u.start * 1000),
      end_ms: Math.max(Math.round(u.end * 1000), Math.round(u.start * 1000)),
      text: u.transcript.trim(),
    }));
  if (segments.length === 0) throw new TranscribeError(MESSAGES.noSpeech);

  const duration = r?.metadata?.duration;
  const audioSeconds = typeof duration === 'number' && duration > 0 ? duration : segments[segments.length - 1].end_ms / 1000;
  return { segments, language: r?.results?.channels?.[0]?.detected_language ?? null, audioSeconds };
}

/** What Deepgram cost for this much audio. */
export function costFor(audioSeconds: number, usdPerMinute: number): number {
  return Math.round((audioSeconds / 60) * usdPerMinute * 1_000_000) / 1_000_000;
}

/**
 * Sends the audio link to Deepgram and returns the lines.
 * `fetcher` is fetch in real life and a fake in tests (so tests never call Deepgram).
 */
export async function transcribeUrl(
  audioUrl: string,
  apiKey: string,
  model: string,
  fetcher: typeof fetch = fetch,
): Promise<TranscriptResult> {
  let res: Response;
  try {
    res = await fetcher(buildListenUrl(model), {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: audioUrl }),
    });
  } catch {
    throw new TranscribeError(MESSAGES.busy);
  }
  if (!res.ok) throw new TranscribeError(messageForStatus(res.status));
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new TranscribeError(MESSAGES.unknown);
  }
  return parseDeepgram(json);
}
