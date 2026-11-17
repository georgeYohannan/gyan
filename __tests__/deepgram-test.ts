import { buildListenUrl, costFor, MESSAGES, messageForStatus, parseDeepgram, TranscribeError, transcribeUrl } from '../supabase/functions/transcribe/deepgram';
import { runTranscription, type AdminLike } from '../supabase/functions/transcribe/pipeline';

// A fake Deepgram answer for a 2 person talk. No real Deepgram call is ever made in tests.
const twoPeople = {
  metadata: { duration: 12.4 },
  results: {
    channels: [{ detected_language: 'en' }],
    utterances: [
      { start: 0.5, end: 3.2, transcript: 'Hi, thanks for joining.', speaker: 0 },
      { start: 3.6, end: 7.1, transcript: 'Happy to be here.', speaker: 1 },
      { start: 7.4, end: 12.4, transcript: 'Let us start with the budget.', speaker: 0 },
    ],
  },
};

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const errResponse = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;

describe('Deepgram request', () => {
  test('uses Nova-3, speaker labels, and language detection, and never carries a key', () => {
    const url = new URL(buildListenUrl('nova-3'));
    expect(url.origin + url.pathname).toBe('https://api.deepgram.com/v1/listen');
    expect(url.searchParams.get('model')).toBe('nova-3');
    expect(url.searchParams.get('diarize_model')).toBe('latest');
    expect(url.searchParams.has('diarize')).toBe(false); // Deepgram rejects both together
    expect(url.searchParams.get('detect_language')).toBe('true');
    expect(url.searchParams.get('utterances')).toBe('true');
    expect(url.toString()).not.toMatch(/token|key/i);
  });

  test('the key goes in a header and the file goes in as a link', async () => {
    const fetcher = jest.fn().mockResolvedValue(okResponse(twoPeople));
    await transcribeUrl('https://example.test/file.mp3', 'FAKE-KEY', 'nova-3', fetcher);
    const [, init] = fetcher.mock.calls[0];
    expect(init.headers.Authorization).toBe('Token FAKE-KEY');
    expect(JSON.parse(init.body)).toEqual({ url: 'https://example.test/file.mp3' });
  });
});

describe('Deepgram answer', () => {
  test('2 speakers become Speaker 1 and Speaker 2 with times in milliseconds', () => {
    const r = parseDeepgram(twoPeople);
    expect(r.segments.map((s) => s.speaker_label)).toEqual(['Speaker 1', 'Speaker 2', 'Speaker 1']);
    expect(r.segments[0]).toEqual({ speaker_label: 'Speaker 1', start_ms: 500, end_ms: 3200, text: 'Hi, thanks for joining.' });
    expect(r.segments[1].start_ms).toBe(3600);
    expect(r.language).toBe('en');
    expect(r.audioSeconds).toBe(12.4);
  });

  test('no speech gives a clear message', () => {
    expect(() => parseDeepgram({ results: { utterances: [] } })).toThrow(MESSAGES.noSpeech);
    expect(() => parseDeepgram({})).toThrow(TranscribeError);
  });

  test('a missing language is saved as empty, not guessed', () => {
    const body = { ...twoPeople, results: { ...twoPeople.results, channels: [{}] } };
    expect(parseDeepgram(body).language).toBeNull();
  });

  test('cost is minutes times the rate', () => {
    expect(costFor(120, 0.0052)).toBeCloseTo(0.0104, 6);
  });
});

describe('Deepgram errors become plain messages', () => {
  test.each([
    [400, MESSAGES.unreadable],
    [401, MESSAGES.service],
    [402, MESSAGES.service],
    [429, MESSAGES.busy],
    [503, MESSAGES.busy],
    [418, MESSAGES.unknown],
  ])('status %i', (status, message) => {
    expect(messageForStatus(status)).toBe(message);
  });

  test('a network problem says the service is busy', async () => {
    await expect(transcribeUrl('u', 'k', 'nova-3', jest.fn().mockRejectedValue(new Error('boom')))).rejects.toThrow(MESSAGES.busy);
  });
});

/** A fake database. It records every call so tests can check what was (not) saved. */
function fakeAdmin(opts: { signError?: boolean; finishError?: boolean } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const admin: AdminLike = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { error: name === 'finish_transcription' && opts.finishError ? { message: 'db down' } : null };
    },
    storage: {
      from: () => ({
        createSignedUrl: async () =>
          opts.signError ? { data: null, error: { message: 'not found' } } : { data: { signedUrl: 'https://example.test/signed' }, error: null },
      }),
    },
  };
  return { admin, calls };
}

const base = { meetingId: 'm1', filePath: 'a/m1/file.mp3', deepgramKey: 'FAKE', model: 'nova-3', usdPerMinute: 0.0052, bucket: 'notes-files', signedLinkSeconds: 600 };

describe('making a transcript end to end (fake Deepgram, fake database)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('success saves lines, language, audio seconds, and cost in one finish step', async () => {
    const { admin, calls } = fakeAdmin();
    const ok = await runTranscription({ ...base, admin, fetcher: jest.fn().mockResolvedValue(okResponse(twoPeople)) });
    expect(ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(['finish_transcription']);
    const args = calls[0].args;
    expect(args.p_language).toBe('en');
    expect(args.p_audio_seconds).toBe(12.4);
    expect(args.p_cost).toBeCloseTo((12.4 / 60) * 0.0052, 6);
    expect(args.p_segments).toHaveLength(3);
  });

  test('FAILED PATH: a broken file ends as Failed with a clear message and nothing is counted', async () => {
    const { admin, calls } = fakeAdmin();
    const ok = await runTranscription({ ...base, admin, fetcher: jest.fn().mockResolvedValue(errResponse(400)) });
    expect(ok).toBe(false);
    expect(calls.map((c) => c.name)).toEqual(['fail_transcription']); // never finish: no usage, no ai_usage
    expect(calls[0].args.p_message).toBe(MESSAGES.unreadable);
  });

  test('FAILED PATH: a file with no speech fails and is not counted', async () => {
    const { admin, calls } = fakeAdmin();
    await runTranscription({ ...base, admin, fetcher: jest.fn().mockResolvedValue(okResponse({ results: { utterances: [] } })) });
    expect(calls.map((c) => c.name)).toEqual(['fail_transcription']);
    expect(calls[0].args.p_message).toBe(MESSAGES.noSpeech);
  });

  test('FAILED PATH: a missing file fails with a plain message and Deepgram is never called', async () => {
    const { admin, calls } = fakeAdmin({ signError: true });
    const fetcher = jest.fn();
    await runTranscription({ ...base, admin, fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(calls[0]).toEqual({ name: 'fail_transcription', args: { p_meeting_id: 'm1', p_message: MESSAGES.missing } });
  });

  test('FAILED PATH: if saving fails, the note is marked Failed with a safe message (no technical words)', async () => {
    const { admin, calls } = fakeAdmin({ finishError: true });
    await runTranscription({ ...base, admin, fetcher: jest.fn().mockResolvedValue(okResponse(twoPeople)) });
    expect(calls.map((c) => c.name)).toEqual(['finish_transcription', 'fail_transcription']);
    expect(calls[1].args.p_message).toBe(MESSAGES.unknown);
  });

  test('the key never appears in a saved message or in the logs', async () => {
    const { admin, calls } = fakeAdmin();
    const spy = console.error as jest.Mock;
    await runTranscription({ ...base, admin, deepgramKey: 'SECRET-123', fetcher: jest.fn().mockResolvedValue(errResponse(401)) });
    expect(JSON.stringify(calls)).not.toContain('SECRET-123');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-123');
  });
});
