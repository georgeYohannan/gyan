/**
 * @jest-environment node
 */
/**
 * Sending a bot, and taking in the recording it made, end to end with nothing real.
 *
 * The stand-in database answers like a real Supabase call -- a builder with a `then` and nothing
 * else -- because standing in with a real promise is what hid a crash for a whole day on
 * 2026-11-20. See __mocks__/supabase-answer.ts.
 */
import { answer } from '../__mocks__/supabase-answer';
import { costFor, messageForCode, runBotRecording, runStartBot, statusForCode } from '../supabase/functions/bot/pipeline';
import type { MeetingBotProvider } from '../supabase/functions/_shared/meeting-bot/provider';
import { ProviderError } from '../supabase/functions/_shared/meeting-bot/provider';

const NOTE = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
const LINK = 'https://meet.google.com/abc-defg-hij';

/** A database that answers what it is told and remembers what it was asked. */
function fakeDb(answers: Record<string, { data?: unknown; error?: { message: string } }> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    db: {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        const given = answers[name];
        return answer({ data: given?.data ?? null, error: given?.error ?? null });
      },
    },
  };
}

function fakeProvider(over: Partial<MeetingBotProvider> = {}): MeetingBotProvider {
  return {
    name: 'test-service',
    usdPerHour: 0.5,
    startBot: async () => ({ externalId: 'bot-1' }),
    stopBot: async () => undefined,
    verifyEvent: async () => ({ kind: 'ignore', why: 'not used here' }),
    findAudio: async () => ({ url: 'https://files.example/a', contentType: 'audio/mpeg', seconds: 600 }),
    deleteRecording: async () => undefined,
    ...over,
  };
}

const startOptions = (over: Record<string, unknown> = {}) => ({
  noteId: NOTE,
  accountId: ACCOUNT,
  userId: USER,
  link: LINK,
  consentVersion: 'v1',
  consentHash: 'v1-abc-100',
  askedBy: 'Sam Carter',
  apiKey: 'test-key',
  retentionHours: 24,
  ...over,
});

const started = { start_bot_note: { data: [{ bot_name: 'gyan Notetaker (Sam Carter)', max_minutes: 60 }] } };

describe('sending a bot', () => {
  test('writes the note and the bot row BEFORE anything is spent', async () => {
    const { db, calls } = fakeDb(started);
    const result = await runStartBot({ ...startOptions(), db, provider: fakeProvider() });
    expect(result.ok).toBe(true);
    // The database decides, then the money is spent, then the id is written down.
    expect(calls.map((c) => c.name)).toEqual(['start_bot_note', 'attach_bot']);
  });

  test('tells the database which platform the link is for, not the app', async () => {
    const { db, calls } = fakeDb(started);
    await runStartBot({ ...startOptions(), db, provider: fakeProvider() });
    expect(calls[0].args.p_platform).toBe('meet');
    expect(calls[0].args.p_meeting_url).toBe(LINK);
  });

  test('the consent travels with it, and is what the database stores', async () => {
    const { db, calls } = fakeDb(started);
    await runStartBot({ ...startOptions(), db, provider: fakeProvider() });
    expect(calls[0].args.p_consent_version).toBe('v1');
    expect(calls[0].args.p_consent_hash).toBe('v1-abc-100');
  });

  test('A LINK WE DO NOT SUPPORT NEVER REACHES THE DATABASE, let alone the service', async () => {
    for (const bad of [
      'not a link at all',
      'https://example.com/meeting/1',
      'http://meet.google.com/abc-defg-hij',
      'https://zoom.us/about',
      '',
    ]) {
      const { db, calls } = fakeDb(started);
      const result = await runStartBot({ ...startOptions({ link: bad }), db, provider: fakeProvider() });
      expect(result.ok).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  test('THE SWITCH BEING OFF STOPS IT, and nothing is spent', async () => {
    let asked = false;
    const { db, calls } = fakeDb({ start_bot_note: { error: { message: 'bot_not_enabled' } } });
    const result = await runStartBot({
      ...startOptions(),
      db,
      provider: fakeProvider({
        startBot: async () => {
          asked = true;
          return { externalId: 'bot-1' };
        },
      }),
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('not switched on') });
    expect(asked).toBe(false);
    expect(calls.map((c) => c.name)).toEqual(['start_bot_note']);
  });

  test.each([
    ['bot_no_hours', 'does not include'],
    ['bot_hours_used', 'used all your meeting bot hours'],
    ['bot_day_cap_account', 'used its meeting bot time for today'],
    ['bot_day_cap_service', 'safety limit'],
    ['limit_reached', 'all your meetings for this month'],
  ])('%s stops it, and says which limit it was', async (code, words) => {
    const { db } = fakeDb({ start_bot_note: { error: { message: `error: ${code}` } } });
    const result = await runStartBot({ ...startOptions(), db, provider: fakeProvider() });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining(words) });
  });

  test('A NOTE IS NEVER LEFT LOOKING BUSY when the service refuses', async () => {
    // The worst outcome would be a note sitting on "Joining" for ever, which looks like it is
    // working and never will be. So the note is told the truth immediately.
    const { db, calls } = fakeDb(started);
    const result = await runStartBot({
      ...startOptions(),
      db,
      provider: fakeProvider({
        startBot: async () => {
          throw new ProviderError('Gyan cannot join Zoom calls yet.');
        },
      }),
    });
    expect(result).toMatchObject({ ok: false, message: 'Gyan cannot join Zoom calls yet.' });
    expect(calls.map((c) => c.name)).toEqual(['start_bot_note', 'fail_bot']);
    expect(calls[1].args.p_reason).toBe('Gyan cannot join Zoom calls yet.');
  });

  test('a problem that is not the service saying no still fails the note, with plain words', async () => {
    const { db, calls } = fakeDb(started);
    const result = await runStartBot({
      ...startOptions(),
      db,
      provider: fakeProvider({
        startBot: async () => {
          throw new Error('socket hang up');
        },
      }),
    });
    expect(result.ok).toBe(false);
    // Never the raw problem. A person does not need to read "socket hang up".
    expect((result as { message: string }).message).not.toContain('socket');
    expect(calls[1].name).toBe('fail_bot');
  });

  test('the bot is named by the DATABASE, never by this code', async () => {
    const { db } = fakeDb({ start_bot_note: { data: [{ bot_name: 'A Different Name', max_minutes: null }] } });
    const result = await runStartBot({ ...startOptions(), db, provider: fakeProvider() });
    expect(result).toMatchObject({ ok: true, botName: 'A Different Name' });
  });

  test('the notice said in the meeting is cut to what the strictest platform accepts', async () => {
    let said = '';
    const { db } = fakeDb({
      start_bot_note: { data: [{ bot_name: 'x'.repeat(400), max_minutes: 60 }] },
    });
    await runStartBot({
      ...startOptions({ askedBy: 'y'.repeat(400) }),
      db,
      provider: fakeProvider({
        startBot: async (r) => {
          said = r.consentMessage;
          return { externalId: 'bot-1' };
        },
      }),
    });
    // Google Meet refuses anything longer, and a notice that silently fails on one platform
    // would be worse than no feature at all.
    expect(said.length).toBeLessThanOrEqual(500);
  });
});

describe('which answer the app gets', () => {
  test.each([
    ['bot_not_enabled', 403],
    ['not_allowed', 403],
    ['bot_no_hours', 402],
    ['bot_hours_used', 402],
    ['bot_day_cap_account', 402],
    ['bot_day_cap_service', 402],
    ['limit_reached', 402],
    ['bad_platform', 400],
    ['no_consent', 400],
    ['something_else', 500],
  ])('%s answers %i', (code, status) => {
    expect(statusForCode(code)).toBe(status);
  });

  test('every refusal is a sentence, with no code in it', () => {
    for (const code of [
      'bot_not_enabled', 'bot_no_hours', 'bot_hours_used', 'bot_day_cap_account',
      'bot_day_cap_service', 'limit_reached', 'bad_platform', 'not_allowed', 'anything_else',
    ]) {
      const message = messageForCode(code);
      expect(message.endsWith('.')).toBe(true);
      expect(message).not.toContain('_');
    }
  });
});

describe('taking in the recording', () => {
  const files = () => {
    const uploads: { path: string; contentType: string }[] = [];
    return {
      uploads,
      files: {
        upload: (path: string, _body: unknown, contentType: string) => {
          uploads.push({ path, contentType });
          return answer({ error: null });
        },
      },
    };
  };

  /** A fetch that hands back some bytes, standing in for the download. */
  const downloader = (() => {
    const calls: string[] = [];
    const go = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1024) } as Response;
    }) as unknown as typeof fetch;
    return { go, calls };
  })();

  const options = (over: Record<string, unknown> = {}) => ({
    noteId: NOTE,
    accountId: ACCOUNT,
    externalId: 'bot-1',
    apiKey: 'test-key',
    fetcher: downloader.go,
    startTranscript: async () => undefined,
    ...over,
  });

  test('OUR OWN COPY COMES FIRST, and only then is the service\'s copy deleted', async () => {
    const order: string[] = [];
    const { db } = fakeDb();
    const f = files();
    const result = await runBotRecording({
      ...options(),
      db,
      files: {
        upload: (path, body, contentType) => {
          order.push('upload');
          return f.files.upload(path, body, contentType);
        },
      },
      provider: fakeProvider({
        deleteRecording: async () => {
          order.push('delete at the service');
        },
      }),
      startTranscript: async () => {
        order.push('start the transcript');
      },
    });
    expect(result.ok).toBe(true);
    expect(order).toEqual(['upload', 'delete at the service', 'start the transcript']);
  });

  test('stores it inside the account\'s own folder, as audio', async () => {
    const { db } = fakeDb();
    const f = files();
    await runBotRecording({ ...options(), db, files: f.files, provider: fakeProvider() });
    expect(f.uploads).toEqual([
      { path: `${ACCOUNT}/${NOTE}/meeting.mp3`, contentType: 'audio/mpeg' },
    ]);
  });

  test('hands the note to the ordinary pipeline, with the cost in minutes', async () => {
    const { db, calls } = fakeDb();
    const f = files();
    await runBotRecording({ ...options(), db, files: f.files, provider: fakeProvider() });
    const ready = calls.find((c) => c.name === 'bot_recording_ready');
    expect(ready?.args).toMatchObject({
      p_meeting_id: NOTE,
      p_file_path: `${ACCOUNT}/${NOTE}/meeting.mp3`,
      p_recording_seconds: 600,
      p_provider: 'test-service',
    });
    // Ten minutes at fifty cents an hour.
    expect(ready?.args.p_cost).toBeCloseTo(0.083333, 5);
  });

  test('a call with no recording fails the note with plain words, rather than hanging', async () => {
    const { db, calls } = fakeDb();
    const f = files();
    const result = await runBotRecording({
      ...options(),
      db,
      files: f.files,
      provider: fakeProvider({ findAudio: async () => null }),
    });
    expect(result.ok).toBe(false);
    expect(calls.map((c) => c.name)).toEqual(['fail_bot']);
    expect(f.uploads).toEqual([]);
  });

  test('a recording too big to store fails the note, and says what to think about it', async () => {
    const { db, calls } = fakeDb();
    const result = await runBotRecording({
      ...options(),
      db,
      files: { upload: () => answer({ error: { message: 'exceeded the maximum allowed size' } }) },
      provider: fakeProvider(),
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('longer than Gyan can store') });
    expect(calls.map((c) => c.name)).toEqual(['fail_bot']);
  });

  test('a download that will not come fails the note rather than storing nothing quietly', async () => {
    const broken = (async () => ({ ok: false, status: 403 }) as Response) as unknown as typeof fetch;
    const { db, calls } = fakeDb();
    const f = files();
    const result = await runBotRecording({
      ...options({ fetcher: broken }),
      db,
      files: f.files,
      provider: fakeProvider(),
    });
    expect(result.ok).toBe(false);
    expect(calls.map((c) => c.name)).toEqual(['fail_bot']);
  });

  test('A FAILURE TO DELETE THE SERVICE\'S COPY NEVER UNDOES THE NOTE', async () => {
    // The note is already safe and queued. The retention set when the bot was sent clears the
    // copy by itself within a day, so this is written down and swallowed.
    const { db, calls } = fakeDb();
    const f = files();
    const result = await runBotRecording({
      ...options(),
      db,
      files: f.files,
      provider: fakeProvider({
        deleteRecording: async () => {
          throw new Error('nope');
        },
      }),
    });
    expect(result).toMatchObject({ ok: true, deletedAtProvider: false });
    expect(calls.map((c) => c.name)).toContain('bot_recording_ready');
    expect(calls.map((c) => c.name)).not.toContain('mark_bot_media_deleted');
  });

  test('and a transcript that will not start does not undo it either', async () => {
    const { db } = fakeDb();
    const f = files();
    const result = await runBotRecording({
      ...options({
        startTranscript: async () => {
          throw new Error('nope');
        },
      }),
      db,
      files: f.files,
      provider: fakeProvider(),
    });
    expect(result.ok).toBe(true);
  });

  test('uses its own guess at the length only when the service did not say', async () => {
    const { db, calls } = fakeDb();
    const f = files();
    await runBotRecording({
      ...options({ fallbackSeconds: 300 }),
      db,
      files: f.files,
      provider: fakeProvider({
        findAudio: async () => ({ url: 'https://files.example/a', contentType: 'audio/mpeg', seconds: null }),
      }),
    });
    expect(calls.find((c) => c.name === 'bot_recording_ready')?.args.p_recording_seconds).toBe(300);
  });
});

describe('what a bot costs', () => {
  test('is charged by the second, not rounded up to an hour', () => {
    expect(costFor(3600, 0.5)).toBeCloseTo(0.5, 6);
    expect(costFor(1800, 0.5)).toBeCloseTo(0.25, 6);
    expect(costFor(60, 0.5)).toBeCloseTo(0.008333, 6);
  });

  test('a call that never happened costs nothing, and never goes negative', () => {
    expect(costFor(0, 0.5)).toBe(0);
    expect(costFor(-10, 0.5)).toBe(0);
  });
});

describe('a recording of unknown length still costs what it cost', () => {
  test('Gyan falls back to its own clock rather than logging nothing', async () => {
    // The service does not always say how long a recording is. Without a fallback the cost row
    // would be zero, which would under-count the bill AND let the daily caps drift upward,
    // because the caps are counted from those same rows.
    const { db, calls } = fakeDb();
    const uploaded = { upload: () => answer({ error: null }) };
    const go = (async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }) as Response) as unknown as typeof fetch;
    await runBotRecording({
      db,
      files: uploaded,
      provider: fakeProvider({
        findAudio: async () => ({ url: 'https://files.example/a', contentType: 'audio/mpeg', seconds: null }),
      }),
      noteId: NOTE,
      accountId: ACCOUNT,
      externalId: 'bot-1',
      apiKey: 'test-key',
      fallbackSeconds: 1800,
      fetcher: go,
      startTranscript: async () => undefined,
    });
    const ready = calls.find((c) => c.name === 'bot_recording_ready');
    expect(ready?.args.p_recording_seconds).toBe(1800);
    expect(ready?.args.p_cost).toBeCloseTo(0.25, 5);
  });
});
