/**
 * One Ask answer end to end, with a fake database, a fake search and a FAKE Claude.
 * No test here ever calls the real AI, so no test ever costs money.
 */
import { ASK_MESSAGES } from '../supabase/functions/chat/ask';
import { NOTHING_FOUND, runAsk, type AskCandidate, type AskOptions } from '../supabase/functions/chat/ask-pipeline';
import { ChatError, MESSAGES } from '../supabase/functions/chat/chat';
import type { Ask, Reply } from '../supabase/functions/chat/pipeline';

type Call = { name: string; args: Record<string, unknown> };

const CALL_NOTE: AskCandidate = {
  id: 'note-a',
  title: 'Weekly team call',
  source: 'upload',
  created_at: '2026-11-17T10:00:00Z',
  file_path: null,
};

const PRICING_NOTE: AskCandidate = {
  id: 'note-b',
  title: 'Pricing chat',
  source: 'upload',
  created_at: '2026-11-18T09:00:00Z',
  file_path: null,
};

const PASTED_NOTE: AskCandidate = {
  id: 'note-c',
  title: 'Pasted plan',
  source: 'text',
  created_at: '2026-11-19T09:00:00Z',
  file_path: 'acc/note-c/plan.txt',
};

const SEGMENTS: Record<string, unknown[]> = {
  'note-a': [
    { id: 'a1', speaker_label: 'Speaker 1', start_ms: 500, text: 'Let us start with the sign up screen.' },
    { id: 'a2', speaker_label: 'Priya', start_ms: 65000, text: 'I will send the test plan on Friday.' },
  ],
  'note-b': [{ id: 'b1', speaker_label: 'Sam', start_ms: 1000, text: 'Nine dollars a seat, we agreed.' }],
};

function fakeAdmin(
  options: {
    segments?: Record<string, unknown[]>;
    history?: unknown[];
    segmentsError?: string[];
    historyError?: boolean;
    finishError?: boolean;
    downloadText?: string;
    downloadError?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  const segments = options.segments ?? SEGMENTS;
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const failed = options.finishError && name === 'finish_ask_message';
      return Promise.resolve({ error: failed ? { message: 'boom' } : null });
    },
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                order() {
                  if (table === 'transcript_segments') {
                    const broken = (options.segmentsError ?? []).includes(value);
                    return Promise.resolve({
                      data: broken ? null : (segments[value] ?? []),
                      error: broken ? { message: 'no' } : null,
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
  return { admin: admin as unknown as AskOptions['admin'], calls };
}

const REPLY: Reply = { text: '', refused: false, tokensIn: 1000, cachedTokensIn: 0, tokensOut: 100 };

function options(
  over: Partial<AskOptions> & { found?: AskCandidate[]; admin?: AskOptions['admin'] } = {},
): { o: AskOptions; asked: Ask[] } {
  const asked: Ask[] = [];
  const { found, ...rest } = over;
  const o: AskOptions = {
    admin: fakeAdmin().admin,
    threadId: 't1',
    accountId: 'acc1',
    bucket: 'notes-files',
    question: 'What did Priya promise?',
    language: 'en',
    maxNotes: 4,
    maxInputTokens: 150_000,
    maxHistoryMessages: 20,
    usdPerMtokIn: 2,
    usdPerMtokOut: 10,
    usdPerMtokCacheRead: 0.1,
    findNotes: async () => found ?? [CALL_NOTE, PRICING_NOTE],
    call: async (ask) => {
      asked.push(ask);
      return { ...REPLY, text: 'Priya sends the test plan on Friday [2].' };
    },
    ...rest,
  };
  return { o, asked };
}

describe('when no note has any of the question words in it', () => {
  test('it answers plainly, saves that answer, and never calls Claude', async () => {
    let called = false;
    const { admin, calls } = fakeAdmin();
    const { o } = options({
      admin,
      found: [],
      call: async () => {
        called = true;
        return REPLY;
      },
    });

    const result = await runAsk(o);

    expect(result.answer).toBe(NOTHING_FOUND);
    expect(result.answer).toContain('I could not find that in your notes.');
    expect(result.sources).toEqual([]);
    expect(called).toBe(false);
    // The answer still belongs beside the question, and it cost nothing.
    const finish = calls.find((c) => c.name === 'finish_ask_message');
    expect(finish?.args).toMatchObject({ p_thread_id: 't1', p_tokens: 0, p_cost: 0 });
  });

  test('a note the search found but which has no words yet does not count', async () => {
    const { admin } = fakeAdmin({ segments: { 'note-a': [] } });
    const { o } = options({ admin, found: [CALL_NOTE] });
    expect((await runAsk(o)).answer).toBe(NOTHING_FOUND);
  });
});

describe('answering from several notes at once', () => {
  test('every note goes into ONE request, numbered straight through', async () => {
    const { o, asked } = options();
    await runAsk(o);
    expect(asked).toHaveLength(1);
    expect(asked[0].system).toContain('NOTE A: "Weekly team call"');
    expect(asked[0].system).toContain('NOTE B: "Pricing chat"');
    expect(asked[0].system).toContain('[3] at 0:01: Sam: Nine dollars a seat, we agreed.');
  });

  test('the answer is saved with the note each number came from', async () => {
    const { admin, calls } = fakeAdmin();
    const { o } = options({ admin });
    const result = await runAsk(o);
    expect(result.sources).toEqual([
      { n: 2, segment_id: 'a2', start_ms: 65000, speaker_label: 'Priya', meeting_id: 'note-a', note_title: 'Weekly team call' },
    ]);
    const finish = calls.find((c) => c.name === 'finish_ask_message');
    expect(finish?.args.p_sources).toEqual(result.sources);
    // There is no one meeting to attach an all-notes answer to, so none is sent.
    expect(finish?.args).not.toHaveProperty('p_meeting_id');
  });

  test('a pasted-text note is read from its file and numbered as paragraphs', async () => {
    const { admin } = fakeAdmin({ downloadText: 'First paragraph.\n\nSecond paragraph.' });
    const { o, asked } = options({ admin, found: [PASTED_NOTE] });
    await runAsk(o);
    expect(asked[0].system).toContain('[1] First paragraph.');
    expect(asked[0].system).toContain('[2] Second paragraph.');
    expect(asked[0].system).not.toContain('Speaker');
  });

  test('one unreadable note is left out, and the rest still answer the question', async () => {
    const { admin } = fakeAdmin({ segmentsError: ['note-a'] });
    const { o, asked } = options({ admin });
    await runAsk(o);
    expect(asked[0].system).not.toContain('Weekly team call');
    expect(asked[0].system).toContain('Pricing chat');
  });

  test('what it cost is logged, cached words counted at their own price', async () => {
    const { admin, calls } = fakeAdmin();
    const { o } = options({
      admin,
      call: async () => ({ text: 'Friday [2].', refused: false, tokensIn: 1_000_000, cachedTokensIn: 1_000_000, tokensOut: 100_000 }),
    });
    await runAsk(o);
    const finish = calls.find((c) => c.name === 'finish_ask_message');
    // 1M in at $2 + 1M cached at $0.10 + 0.1M out at $10 = $3.10
    expect(finish?.args.p_cost).toBeCloseTo(3.1, 6);
    expect(finish?.args.p_tokens).toBe(2_100_000);
  });
});

describe('when there are more words than fit', () => {
  test('whole notes are dropped from the least relevant end, never cut in half', async () => {
    const seen: number[] = [];
    const { o, asked } = options({
      maxInputTokens: 100,
      // The first try is too big; with one note fewer it fits.
      countTokens: async (ask) => {
        const tokens = ask.system.includes('Pricing chat') ? 200 : 50;
        seen.push(tokens);
        return tokens;
      },
    });
    await runAsk(o);
    expect(seen).toEqual([200, 50]);
    // The search ranked "Weekly team call" first, so it is the one that survives.
    expect(asked[0].system).toContain('Weekly team call');
    expect(asked[0].system).not.toContain('Pricing chat');
  });

  test('a single note too big to read says so instead of being cut short', async () => {
    const { o } = options({ maxInputTokens: 10, countTokens: async () => 999_999 });
    await expect(runAsk(o)).rejects.toThrow(ChatError);
    await expect(runAsk(o)).rejects.toThrow(ASK_MESSAGES.tooLong);
  });
});

describe('the conversation so far', () => {
  test('the question being answered now is not asked twice', async () => {
    const { admin } = fakeAdmin({
      history: [
        { role: 'user', content: 'What were the decisions?' },
        { role: 'assistant', content: 'Ship on Friday [1].' },
        { role: 'user', content: 'What did Priya promise?' },
      ],
    });
    const { o, asked } = options({ admin });
    await runAsk(o);
    expect(asked[0].history.map((m) => m.content)).toEqual([
      'What were the decisions?',
      'Ship on Friday [1].',
    ]);
  });

  test('the conversation never starts with an answer', async () => {
    const { admin } = fakeAdmin({ history: [{ role: 'assistant', content: 'An answer with no question.' }] });
    const { o, asked } = options({ admin });
    await runAsk(o);
    expect(asked[0].history).toEqual([]);
  });
});

describe('when something goes wrong', () => {
  test('a declined request says so in plain words', async () => {
    const { o } = options({ call: async () => ({ ...REPLY, refused: true }) });
    await expect(runAsk(o)).rejects.toThrow(MESSAGES.declined);
  });

  test('an empty answer is not shown as an answer', async () => {
    const { o } = options({ call: async () => ({ ...REPLY, text: '   ' }) });
    await expect(runAsk(o)).rejects.toThrow(MESSAGES.empty);
  });

  test('a conversation that will not load stops, rather than answering without it', async () => {
    const { admin } = fakeAdmin({ historyError: true });
    const { o } = options({ admin });
    await expect(runAsk(o)).rejects.toThrow(MESSAGES.unknown);
  });

  test('an answer that will not save is reported, not quietly lost', async () => {
    const { admin } = fakeAdmin({ finishError: true });
    const { o } = options({ admin });
    await expect(runAsk(o)).rejects.toThrow(MESSAGES.unknown);
  });

  test('the search is asked for at most the number of notes the settings allow', async () => {
    const seen: number[] = [];
    const { o } = options({
      maxNotes: 4,
      findNotes: async (_question, limit) => {
        seen.push(limit);
        return [CALL_NOTE];
      },
    });
    await runAsk(o);
    expect(seen).toEqual([4]);
  });
});
