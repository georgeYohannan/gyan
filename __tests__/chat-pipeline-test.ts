/**
 * One chat answer end to end, with a fake database and a FAKE Claude.
 * No test here ever calls the real AI, so no test ever costs money.
 */
import { ChatError, MESSAGES } from '../supabase/functions/chat/chat';
import { runChat, type Ask, type ChatOptions, type Reply } from '../supabase/functions/chat/pipeline';

type Call = { name: string; args: Record<string, unknown> };

const SEGMENTS = [
  { id: 's1', speaker_label: 'Speaker 1', start_ms: 500, text: 'Thanks for joining. Let us start with the sign up screen.' },
  { id: 's2', speaker_label: 'Speaker 2', start_ms: 4200, text: 'It still feels slow on my phone.' },
  { id: 's3', speaker_label: 'Speaker 1', start_ms: 65000, text: 'Priya will send the test plan on Friday, then we ship.' },
];

function fakeAdmin(
  options: {
    segments?: unknown[];
    history?: unknown[];
    segmentsError?: boolean;
    historyError?: boolean;
    finishError?: boolean;
    downloadText?: string;
    downloadError?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const failed = options.finishError && name === 'finish_chat_message';
      return Promise.resolve({ error: failed ? { message: 'boom' } : null });
    },
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  if (table === 'transcript_segments') {
                    return Promise.resolve({
                      data: options.segmentsError ? null : (options.segments ?? SEGMENTS),
                      error: options.segmentsError ? { message: 'no' } : null,
                    });
                  }
                  return Promise.resolve({
                    data: options.historyError ? null : (options.history ?? []),
                    error: options.historyError ? { message: 'no' } : null,
                  });
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          download() {
            if (options.downloadError) return Promise.resolve({ data: null, error: { message: 'no' } });
            return Promise.resolve({ data: { text: async () => options.downloadText ?? '' }, error: null });
          },
        };
      },
    },
  };
  return { admin: admin as unknown as ChatOptions['admin'], calls };
}

/** A fake Claude that answers with whatever we tell it to, in order. */
function fakeClaude(replies: Partial<Reply>[]) {
  const asks: Ask[] = [];
  let i = 0;
  const call = jest.fn(async (ask: Ask): Promise<Reply> => {
    asks.push(ask);
    const r = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return {
      text: r.text ?? '',
      refused: r.refused ?? false,
      tokensIn: r.tokensIn ?? 1000,
      cachedTokensIn: r.cachedTokensIn ?? 0,
      tokensOut: r.tokensOut ?? 200,
    };
  });
  return { call, asks };
}

const base = {
  meetingId: 'm1',
  threadId: 't1',
  accountId: 'acc1',
  source: 'upload',
  filePath: 'acc1/m1/call.mp3',
  bucket: 'notes-files',
  noteTitle: 'Weekly team call',
  noteDate: '2026-11-17T10:00:00Z',
  question: 'What were the decisions?',
  language: 'en',
  maxInputTokens: 150_000,
  maxHistoryMessages: 20,
  usdPerMtokIn: 2,
  usdPerMtokOut: 10,
  usdPerMtokCacheRead: 0.1,
};

describe('answering a question', () => {
  test('the answer is saved once, with the lines it used and what it cost', async () => {
    const { admin, calls } = fakeAdmin();
    const { call, asks } = fakeClaude([
      { text: 'We ship the sign up screen on Friday [3].', tokensIn: 5000, tokensOut: 100 },
    ]);

    const result = await runChat({ ...base, admin, call });

    expect(result.answer).toBe('We ship the sign up screen on Friday [3].');
    expect(result.sources).toEqual([{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' }]);

    const finish = calls.filter((c) => c.name === 'finish_chat_message');
    expect(finish).toHaveLength(1);
    expect(finish[0].args).toMatchObject({
      p_thread_id: 't1',
      p_account_id: 'acc1',
      p_meeting_id: 'm1',
      p_content: 'We ship the sign up screen on Friday [3].',
      p_language: 'en',
      p_tokens: 5100,
    });
    // 5,000 in at $2 per million + 100 out at $10 per million.
    expect(finish[0].args.p_cost).toBeCloseTo(0.011, 6);

    // The whole transcript went in as numbered passages, and the question on its own.
    // The note is named once, above the fence, instead of on every line.
    expect(asks[0].system).toContain('[1] 17 November 2026, at 0:00:');
    expect(asks[0].system).toContain('The note is called "Weekly team call".');
    expect(asks[0].question).toMatch(
      /^USER QUESTION\n<<<BEGIN_QUESTION_[0-9a-f]{16}>>>\nWhat were the decisions\?\n<<<END_QUESTION_[0-9a-f]{16}>>>$/,
    );
    expect(call).toHaveBeenCalledTimes(1);
  });

  test('an honest "could not find that" answer is saved like any other', async () => {
    const { admin, calls } = fakeAdmin();
    const honest = 'I could not find that in your notes. Try asking who tested the sign up screen.';
    const { call } = fakeClaude([{ text: honest }]);

    const result = await runChat({ ...base, question: 'What is the budget?', admin, call });

    expect(result.answer).toBe(honest);
    expect(result.sources).toEqual([]);
    const finish = calls.filter((c) => c.name === 'finish_chat_message');
    expect(finish).toHaveLength(1);
    expect(finish[0].args.p_content).toBe(honest);
    expect(finish[0].args.p_sources).toEqual([]);
  });

  test('a passage number that points at no line never becomes a link', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ text: 'Something was agreed [99].' }]);
    const result = await runChat({ ...base, admin, call });
    expect(result.sources).toEqual([]);
  });

  test('the conversation so far is sent back, so follow-up questions make sense', async () => {
    const { admin } = fakeAdmin({
      history: [
        { role: 'user', content: 'What were the decisions?' },
        { role: 'assistant', content: 'Ship on Friday [3].' },
        { role: 'user', content: 'Who is doing it?' },
      ],
    });
    const { call, asks } = fakeClaude([{ text: 'Priya [3].' }]);

    await runChat({ ...base, question: 'Who is doing it?', admin, call });

    // The question being answered right now is NOT in the history as well.
    expect(asks[0].history).toEqual([
      { role: 'user', content: 'What were the decisions?' },
      { role: 'assistant', content: 'Ship on Friday [3].' },
    ]);
  });

  test('only the last few messages are sent back, so a long chat stays small', async () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
    }));
    const { admin } = fakeAdmin({ history });
    const { call, asks } = fakeClaude([{ text: 'Yes [1].' }]);

    await runChat({ ...base, maxHistoryMessages: 6, admin, call });

    expect(asks[0].history).toHaveLength(6);
    expect(asks[0].history[0]).toEqual({ role: 'user', content: 'message 24' });
    // The conversation we send always starts with a question, never with an answer.
    expect(asks[0].history[0].role).toBe('user');
  });

  test('the conversation never starts with an answer', async () => {
    const { admin } = fakeAdmin({
      history: [
        { role: 'assistant', content: 'Ship on Friday [3].' },
        { role: 'user', content: 'Who is doing it?' },
        { role: 'assistant', content: 'Priya [3].' },
      ],
    });
    const { call, asks } = fakeClaude([{ text: 'Yes [1].' }]);
    await runChat({ ...base, maxHistoryMessages: 2, admin, call });
    expect(asks[0].history[0].role).toBe('user');
  });
});

describe('when it cannot answer', () => {
  test('NO TRANSCRIPT: a note with no words is not sent to the AI at all', async () => {
    const { admin, calls } = fakeAdmin({ segments: [] });
    const { call } = fakeClaude([{ text: 'should never be asked' }]);

    await expect(runChat({ ...base, admin, call })).rejects.toThrow(MESSAGES.noTranscript);
    expect(call).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.name === 'finish_chat_message')).toHaveLength(0);
  });

  test('TOO LONG: a note too big for one request is refused, and nothing is cut off', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ text: 'should never be asked' }]);
    const countTokens = jest.fn(async () => 200_000);

    await expect(runChat({ ...base, admin, call, countTokens })).rejects.toThrow(MESSAGES.tooLong);
    expect(call).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.name === 'finish_chat_message')).toHaveLength(0);
  });

  test('a note that fits is asked as normal', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ text: 'Ship on Friday [3].' }]);
    const countTokens = jest.fn(async () => 1_000);

    await expect(runChat({ ...base, admin, call, countTokens })).resolves.toMatchObject({
      answer: 'Ship on Friday [3].',
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  test('REFUSED: a safety decline gets a plain message and saves no answer', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ refused: true }]);

    await expect(runChat({ ...base, admin, call })).rejects.toThrow(MESSAGES.declined);
    expect(calls.filter((c) => c.name === 'finish_chat_message')).toHaveLength(0);
  });

  test('EMPTY: an answer with no words in it gets a plain message', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ text: '   ' }]);
    await expect(runChat({ ...base, admin, call })).rejects.toThrow(MESSAGES.empty);
  });

  test('a problem reading the words gets a plain message', async () => {
    const { admin } = fakeAdmin({ segmentsError: true });
    const { call } = fakeClaude([{ text: 'x' }]);
    await expect(runChat({ ...base, admin, call })).rejects.toThrow(MESSAGES.unknown);
  });

  test('a problem saving the answer gets a plain message', async () => {
    const { admin } = fakeAdmin({ finishError: true });
    const { call } = fakeClaude([{ text: 'Ship on Friday [3].' }]);
    await expect(runChat({ ...base, admin, call })).rejects.toThrow(MESSAGES.unknown);
  });

  test('every problem it reports is a plain-words one, safe to show a person', async () => {
    const { admin } = fakeAdmin({ segments: [] });
    const { call } = fakeClaude([{ text: 'x' }]);
    await expect(runChat({ ...base, admin, call })).rejects.toBeInstanceOf(ChatError);
  });
});

describe('privacy', () => {
  test('the words of the meeting and the question are never written to the log', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { admin } = fakeAdmin({ finishError: true });
    const { call } = fakeClaude([{ text: 'Priya will send the test plan [3].' }]);

    await expect(runChat({ ...base, admin, call })).rejects.toThrow();

    const written = log.mock.calls.flat().join(' ');
    expect(written).not.toContain('Priya');
    expect(written).not.toContain('sign up screen');
    expect(written).not.toContain('What were the decisions?');
    log.mockRestore();
  });

  test('it only ever reads the lines of the note it was asked about', async () => {
    const seen: string[] = [];
    const admin = {
      rpc: () => Promise.resolve({ error: null }),
      from(table: string) {
        return {
          select() {
            return {
              eq(_column: string, value: string) {
                seen.push(`${table}:${value}`);
                return { order: () => Promise.resolve({ data: table === 'transcript_segments' ? SEGMENTS : [], error: null }) };
              },
            };
          },
        };
      },
    } as unknown as ChatOptions['admin'];
    const { call } = fakeClaude([{ text: 'Ship on Friday [3].' }]);

    await runChat({ ...base, admin, call });

    expect(seen).toContain('transcript_segments:m1');
    expect(seen).toContain('chat_messages:t1');
    expect(seen.some((s) => !s.endsWith(':m1') && !s.endsWith(':t1'))).toBe(false);
  });
});

describe('a pasted-text note', () => {
  const PASTED = 'The module ingests financial documents.\n\nAudience: forensic accountants and family-law attorneys.\n\nFrontend: React 18 and TypeScript.';

  const text = { ...base, source: 'text', filePath: 'acc1/m1/notes.txt' };

  test('its paragraphs become the numbered passages', async () => {
    const { admin } = fakeAdmin({ downloadText: PASTED });
    const { call, asks } = fakeClaude([{ text: 'Forensic accountants and family-law attorneys [2].' }]);

    await runChat({ ...text, question: 'Who is it for?', admin, call });

    // Paragraph 1 is passage 1, paragraph 2 is passage 2, and so on.
    expect(asks[0].system).toContain('[1] 17 November 2026: The module ingests financial documents.');
    expect(asks[0].system).toContain('[2] 17 November 2026: Audience: forensic accountants and family-law attorneys.');
    // Nobody spoke these words, so there is no speaker and no time to invent.
    expect(asks[0].system).not.toContain('Speaker');
    expect(asks[0].system).not.toContain(' at 0:00');
  });

  test('a passage number points at the right paragraph, so the app can jump to it', async () => {
    const { admin } = fakeAdmin({ downloadText: PASTED });
    const { call } = fakeClaude([{ text: 'Forensic accountants and family-law attorneys [2].' }]);

    const result = await runChat({ ...text, question: 'Who is it for?', admin, call });

    expect(result.sources).toEqual([{ n: 2, segment_id: 'p2', start_ms: 0, speaker_label: null }]);
  });

  test('it never asks the database for transcript lines it does not have', async () => {
    const seen: string[] = [];
    const admin = {
      rpc: () => Promise.resolve({ error: null }),
      from(table: string) {
        seen.push(table);
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) };
      },
      storage: { from: () => ({ download: () => Promise.resolve({ data: { text: async () => PASTED }, error: null }) }) },
    } as unknown as ChatOptions['admin'];
    const { call } = fakeClaude([{ text: 'Yes [1].' }]);

    await runChat({ ...text, admin, call });

    expect(seen).not.toContain('transcript_segments');
  });

  test('EMPTY: a text note with nothing in it is not sent to the AI at all', async () => {
    const { admin } = fakeAdmin({ downloadText: '   \n  \n ' });
    const { call } = fakeClaude([{ text: 'should never be asked' }]);

    await expect(runChat({ ...text, admin, call })).rejects.toThrow(MESSAGES.noText);
    expect(call).not.toHaveBeenCalled();
  });

  test('a text note whose words will not open gets a plain message', async () => {
    const { admin } = fakeAdmin({ downloadError: true });
    const { call } = fakeClaude([{ text: 'x' }]);
    await expect(runChat({ ...text, admin, call })).rejects.toThrow(MESSAGES.noText);
  });

  test('a text note with no file at all gets a plain message', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ text: 'x' }]);
    await expect(runChat({ ...text, filePath: null, admin, call })).rejects.toThrow(MESSAGES.noText);
  });
});
