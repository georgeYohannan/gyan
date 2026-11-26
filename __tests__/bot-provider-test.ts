/**
 * @jest-environment node
 */
/**
 * What Gyan asks the bot service for, and what it makes of the answers.
 *
 * Three things are worth proving here rather than reading:
 *
 *   1. The request asks for AUDIO ONLY and NO TRANSCRIPTION. Deepgram already does that job and
 *      is already paid for; asking the bot service as well would quietly double the bill and send
 *      every recording through a second speech provider.
 *   2. An unknown status code is IGNORED, never failed. The service's own documentation says not
 *      to treat its codes as a fixed list, and a code nobody has seen before must not turn
 *      somebody's meeting into a failed note.
 *   3. The audio is FOUND BY LOOKING, not by a guessed key name. Their download-schemas page does
 *      not document an audio shortcut at all, so the name is not something to rely on.
 *
 * No network call is made: a stand-in fetch answers everything.
 */
import {
  audioFromBot,
  messageForStartStatus,
  provider,
  readEvent,
  reasonForSubCode,
} from '../supabase/functions/_shared/meeting-bot/recall';

const KEY = 'test-key-not-a-real-one';

/** A stand-in fetch that records what it was asked and answers what it is told to. */
function fakeFetch(answer: { ok?: boolean; status?: number; body?: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const go = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      json: async () => answer.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { go, calls };
}

const request = {
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  platform: 'meet' as const,
  botName: 'gyan Notetaker (Sam Carter)',
  noteId: '33333333-3333-4333-8333-333333333333',
  maxMinutes: 60,
  consentMessage: 'gyan Notetaker is recording this meeting.',
  retentionHours: 24,
  apiKey: KEY,
};

describe('sending a bot', () => {
  test('asks for AUDIO ONLY, with no transcription and no video', async () => {
    const { go, calls } = fakeFetch({ body: { id: 'bot-1' } });
    await provider.startBot({ ...request, fetcher: go });
    const sent = JSON.parse(String(calls[0].init?.body));

    expect(sent.recording_config.audio_mixed_mp3).toEqual({});
    // Not merely absent: explicitly null, because video is on by default at the service.
    expect(sent.recording_config.video_mixed_mp4).toBeNull();
    // THE IMPORTANT ONE. Their transcription costs $0.15 an hour and Gyan does not want it.
    expect(sent.recording_config.transcript).toBeNull();
  });

  test('tells the service to delete its own copy after a day', async () => {
    const { go, calls } = fakeFetch({ body: { id: 'bot-1' } });
    await provider.startBot({ ...request, fetcher: go });
    const sent = JSON.parse(String(calls[0].init?.body));
    // Leaving this out would mean "keep it indefinitely", which is the service's own default.
    expect(sent.recording_config.retention).toEqual({ type: 'timed', hours: 24 });
  });

  test('MAKES THE BOT LEAVE AT THE LIMIT THE PLAN ALLOWS, so a long call cannot run up a bill', async () => {
    const { go, calls } = fakeFetch({ body: { id: 'bot-1' } });
    await provider.startBot({ ...request, maxMinutes: 60, fetcher: go });
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.automatic_leave.in_call_recording_timeout).toBe(3600);
  });

  test('and leaves that out entirely when the plan has no limit', async () => {
    const { go, calls } = fakeFetch({ body: { id: 'bot-1' } });
    await provider.startBot({ ...request, maxMinutes: null, fetcher: go });
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.automatic_leave.in_call_recording_timeout).toBeUndefined();
  });

  test('says in the meeting chat that it is recording, to everybody, and again to each arrival', async () => {
    const { go, calls } = fakeFetch({ body: { id: 'bot-1' } });
    await provider.startBot({ ...request, fetcher: go });
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.chat.on_bot_join).toEqual({ send_to: 'everyone', message: request.consentMessage });
    // Somebody who joins after the first message never sees it, so it is said again.
    expect(sent.chat.on_participant_join).toEqual({ message: request.consentMessage });
  });

  test('carries the note id, so an event can be matched before the bot has an id of its own', async () => {
    const { go, calls } = fakeFetch({ body: { id: 'bot-1' } });
    await provider.startBot({ ...request, fetcher: go });
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.metadata.note_id).toBe(request.noteId);
  });

  test('waits a different length of time per platform, because the platforms differ', async () => {
    for (const [platform, seconds] of [
      ['meet', 600],
      ['teams', 1800],
      ['zoom', 1200],
    ] as const) {
      const { go, calls } = fakeFetch({ body: { id: 'bot-1' } });
      await provider.startBot({ ...request, platform, fetcher: go });
      const sent = JSON.parse(String(calls[0].init?.body));
      expect(sent.automatic_leave.waiting_room_timeout).toBe(seconds);
    }
  });

  test('refuses to believe an answer with no bot id in it', async () => {
    const { go } = fakeFetch({ body: { not_an_id: true } });
    await expect(provider.startBot({ ...request, fetcher: go })).rejects.toThrow();
  });

  test('a refusal comes back as words, and says whether trying again is worth it', async () => {
    const { go } = fakeFetch({ ok: false, status: 507 });
    await expect(provider.startBot({ ...request, fetcher: go })).rejects.toMatchObject({
      retryable: true,
    });
    const flat = fakeFetch({ ok: false, status: 400 });
    await expect(provider.startBot({ ...request, fetcher: flat.go })).rejects.toMatchObject({
      retryable: false,
    });
  });

  test('no refusal message has a status code or a vendor name in it', () => {
    for (const status of [400, 401, 403, 404, 422, 429, 500, 507]) {
      const message = messageForStartStatus(status);
      expect(message).not.toMatch(/\d{3}/);
      expect(message.toLowerCase()).not.toContain('recall');
      expect(message.endsWith('.')).toBe(true);
    }
  });
});

describe('reading a status event', () => {
  const event = (code: string, subCode: string | null = null, name = `bot.${code}`) =>
    readEvent(JSON.stringify({ event: name, data: { data: { code, sub_code: subCode }, bot: { id: 'b1' } } }));

  test.each([
    ['joining_call', 'joining'],
    ['in_waiting_room', 'waiting'],
    ['in_call_not_recording', 'joining'],
    ['recording_permission_allowed', 'recording'],
    ['in_call_recording', 'recording'],
    ['call_ended', 'processing'],
    ['fatal', 'failed'],
    ['recording_permission_denied', 'failed'],
  ])('%s means %s', (code, phase) => {
    expect(event(code)).toMatchObject({ kind: 'phase', phase });
  });

  test('"done" is the one event that is not a phase: the recording can be fetched', () => {
    expect(event('done')).toMatchObject({ kind: 'recording_ready', externalId: 'b1' });
  });

  test('A CODE NOBODY HAS SEEN BEFORE IS IGNORED, never turned into a failure', () => {
    // Their documentation says plainly not to treat the codes as a fixed list. A new one must
    // not become a failed note on somebody's meeting.
    expect(event('some_new_thing_they_added').kind).toBe('ignore');
    expect(event('').kind).toBe('ignore');
  });

  test('the code in the body wins over the name of the event', () => {
    // The name is only a fallback for an event shaped differently from their one example.
    expect(event('in_call_recording', null, 'bot.something_else')).toMatchObject({ phase: 'recording' });
  });

  test('a failure always arrives with a plain reason on it', () => {
    const failed = event('fatal', 'meeting_link_invalid');
    expect(failed).toMatchObject({ phase: 'failed' });
    expect((failed as { reason: string }).reason).toContain('link');
  });
});

describe('a failure said in plain words', () => {
  test.each([
    ['meeting_link_invalid', 'link'],
    ['meeting_not_found', 'link'],
    ['bot_kicked_from_waiting_room', 'let Gyan into'],
    ['timeout_exceeded_waiting_room', 'let Gyan into'],
    ['meeting_ended', 'already ended'],
    ['meeting_not_started', 'never started'],
    ['timeout_exceeded_in_call_recording', 'longest length your plan allows'],
    ['zoom_sdk_credentials_missing', 'cannot join Zoom calls yet'],
    ['google_meet_knocking_disabled', 'turned off letting new people in'],
  ])('%s says "%s"', (subCode, words) => {
    expect(reasonForSubCode('fatal', subCode)).toContain(words);
  });

  test('every reason is a sentence, with no code in it for anybody to puzzle over', () => {
    const codes = [
      'meeting_link_invalid', 'meeting_password_incorrect', 'meeting_requires_sign_in',
      'meeting_not_accessible', 'meeting_full', 'meeting_ended', 'meeting_not_started',
      'bot_not_accepted', 'bot_kicked_from_call', 'timeout_exceeded_noone_joined',
      'timeout_exceeded_everyone_left', 'timeout_exceeded_silence_detected',
      'timeout_exceeded_in_call_recording', 'recording_permission_denied',
      'zoom_local_recording_disabled', 'something_nobody_has_seen', '',
    ];
    for (const code of codes) {
      const reason = reasonForSubCode('fatal', code);
      expect(reason.endsWith('.')).toBe(true);
      expect(reason).not.toContain('_');
      expect(reason.toLowerCase()).not.toContain('recall');
    }
  });
});

describe('finding the recording', () => {
  const withShortcut = (name: string, format: string) => ({
    recordings: [
      {
        started_at: '2026-11-25T12:00:00Z',
        completed_at: '2026-11-25T12:10:00Z',
        media_shortcuts: { [name]: { format, data: { download_url: 'https://files.example/a' } } },
      },
    ],
  });

  test('IS FOUND BY LOOKING, whatever the shortcut happens to be called', () => {
    // Their download-schemas page documents no audio shortcut at all, so the key name is not
    // something to build on. Any of these must work.
    for (const name of ['audio_mixed', 'audio_mixed_mp3', 'mixed_audio', 'audio']) {
      expect(audioFromBot(withShortcut(name, 'mp3'))).toEqual({
        url: 'https://files.example/a',
        contentType: 'audio/mpeg',
        seconds: 600,
      });
    }
  });

  test('works out how long the recording is from the two times on it', () => {
    expect(audioFromBot(withShortcut('audio_mixed', 'mp3'))?.seconds).toBe(600);
  });

  test('says nothing rather than guessing when the times are missing', () => {
    const noTimes = {
      recordings: [{ media_shortcuts: { audio_mixed: { format: 'mp3', data: { download_url: 'https://x/a' } } } }],
    };
    expect(audioFromBot(noTimes)?.seconds).toBeNull();
  });

  test('IGNORES A VIDEO, deliberately, rather than handing over a file too big to store', () => {
    // Gyan switched video off. If one turned up anyway it could be hundreds of megabytes, which
    // would not fit the bucket and would not finish inside the time a server function gets.
    // Failing with a plain message is the better outcome than a mystery timeout.
    expect(audioFromBot(withShortcut('video_mixed', 'mp4'))).toBeNull();
  });

  test('ignores a format whose container we were never told', () => {
    // `raw` lands here on purpose: their pages never say what container it is.
    expect(audioFromBot(withShortcut('audio_mixed', 'raw'))).toBeNull();
  });

  test('ignores a shortcut with no download link on it yet', () => {
    const notReady = { recordings: [{ media_shortcuts: { audio_mixed: { format: 'mp3', data: {} } } }] };
    expect(audioFromBot(notReady)).toBeNull();
  });

  test('and answers nothing at all for a bot with no recordings', () => {
    expect(audioFromBot({})).toBeNull();
    expect(audioFromBot({ recordings: [] })).toBeNull();
  });
});

describe('making the bot leave, and deleting its copy', () => {
  test('leaving asks the right place, and is happy when the bot has already gone', async () => {
    const { go, calls } = fakeFetch({});
    await provider.stopBot({ externalId: 'bot-1', apiKey: KEY, fetcher: go });
    expect(calls[0].url).toContain('/bot/bot-1/leave_call/');

    // 400 and 404 both mean "it is not in the call", which is the outcome being asked for.
    for (const status of [400, 404]) {
      const gone = fakeFetch({ ok: false, status });
      await expect(
        provider.stopBot({ externalId: 'bot-1', apiKey: KEY, fetcher: gone.go }),
      ).resolves.toBeUndefined();
    }
  });

  test('deleting the service\'s copy asks the right place, and is happy when it is already gone', async () => {
    const { go, calls } = fakeFetch({});
    await provider.deleteRecording({ externalId: 'bot-1', apiKey: KEY, fetcher: go });
    expect(calls[0].url).toContain('/bot/bot-1/delete_media/');

    for (const status of [404, 409]) {
      const gone = fakeFetch({ ok: false, status });
      await expect(
        provider.deleteRecording({ externalId: 'bot-1', apiKey: KEY, fetcher: gone.go }),
      ).resolves.toBeUndefined();
    }
  });

  test('a bot id is put into the address safely, not pasted in', async () => {
    const { go, calls } = fakeFetch({});
    await provider.stopBot({ externalId: 'a/../../b', apiKey: KEY, fetcher: go });
    expect(calls[0].url).not.toContain('a/../../b');
  });
});

describe('what the rest of Gyan is told about the service', () => {
  test('it has a name for the cost rows, and a price per hour', () => {
    expect(provider.name).toBe('recall');
    expect(provider.usdPerHour).toBeGreaterThan(0);
  });

  test('the key is never put anywhere it could be read back', async () => {
    const { go, calls } = fakeFetch({ body: { id: 'bot-1' } });
    await provider.startBot({ ...request, fetcher: go });
    expect(calls[0].url).not.toContain(KEY);
    expect(String(calls[0].init?.body)).not.toContain(KEY);
  });
});
