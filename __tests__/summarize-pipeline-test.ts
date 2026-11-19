/**
 * The summary step end to end, with a fake database and a FAKE Claude.
 * No test here ever calls the real AI, so no test ever costs money.
 */
import { MESSAGES } from '../supabase/functions/summarize/claude';
import { runSummary, type Ask, type Reply, type SummarizeOptions } from '../supabase/functions/summarize/pipeline';

const good = {
  title: 'Sign up screen review',
  overview: 'The team looked at the sign up screen. They agreed to ship it on Friday.',
  key_points: ['Sign up is slow on phones'],
  decisions: ['Ship on Friday'],
  action_items: [{ text: 'Send the test plan', owner: 'Priya', due: 'Friday', start_ms: 65000 }],
  open_questions: ['Who writes the release note?'],
};

const lines = [
  { speaker_label: 'Speaker 1', start_ms: 500, text: 'Sign up feels slow on my phone.' },
  { speaker_label: 'Speaker 2', start_ms: 65000, text: 'Priya will send the test plan on Friday.' },
];

type Call = { name: string; args: Record<string, unknown> };

function fakeAdmin(
  options: { segments?: unknown[]; selectError?: boolean; downloadText?: string; downloadError?: boolean; finishError?: boolean } = {},
) {
  const calls: Call[] = [];
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const failed = options.finishError && name === 'finish_summary';
      return Promise.resolve({ error: failed ? { message: 'boom' } : null });
    },
    from() {
      return {
        select: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve(
                options.selectError ? { data: null, error: { message: 'down' } } : { data: options.segments ?? lines, error: null },
              ),
          }),
        }),
      };
    },
    storage: {
      from() {
        return {
          download: () =>
            Promise.resolve(
              options.downloadError
                ? { data: null, error: { message: 'missing' } }
                : { data: { text: async () => options.downloadText ?? 'Some pasted notes.' }, error: null },
            ),
        };
      },
    },
  };
  return { admin: admin as unknown as SummarizeOptions['admin'], calls };
}

/** A fake Claude that answers with whatever we tell it to, in order. */
function fakeClaude(replies: Partial<Reply>[]) {
  const asks: Ask[] = [];
  let i = 0;
  const call = jest.fn(async (ask: Ask): Promise<Reply> => {
    asks.push(ask);
    const r = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return { text: r.text ?? '', refused: r.refused ?? false, tokensIn: r.tokensIn ?? 1000, tokensOut: r.tokensOut ?? 200 };
  });
  return { call, asks };
}

const base = {
  meetingId: 'm1',
  source: 'upload',
  filePath: 'acc/m1/call.mp3',
  language: 'en',
  bucket: 'notes-files',
  maxInputTokens: 150_000,
  usdPerMtokIn: 2,
  usdPerMtokOut: 10,
};

describe('writing a summary end to end (fake Claude, fake database)', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('success saves the summary, the action items, the tokens and the cost in one finish step', async () => {
    const { admin, calls } = fakeAdmin();
    const { call, asks } = fakeClaude([{ text: JSON.stringify(good), tokensIn: 10_000, tokensOut: 1_000 }]);

    const ok = await runSummary({ ...base, admin, call });

    expect(ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(['finish_summary']);
    const args = calls[0].args;
    expect(args.p_language).toBe('en');
    expect(args.p_title).toBe('Sign up screen review');
    expect(args.p_overview).toContain('agreed to ship it on Friday');
    expect(args.p_key_points).toEqual(['Sign up is slow on phones']);
    expect(args.p_decisions).toEqual(['Ship on Friday']);
    expect(args.p_open_questions).toEqual(['Who writes the release note?']);
    expect(args.p_action_items).toEqual([{ text: 'Send the test plan', owner: 'Priya', due: 'Friday', start_ms: 65000 }]);
    expect(args.p_tokens).toBe(11_000);
    expect(args.p_cost).toBeCloseTo(10_000 / 1e6 * 2 + 1_000 / 1e6 * 10, 6);
    // The real transcript lines, with their times, were sent.
    expect(asks[0].user).toContain('[Speaker 2, 65000] Priya will send the test plan on Friday.');
  });

  test('INVALID ANSWER: a bad answer is tried once more, and a good second answer is saved', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([
      { text: 'Sure! Here is the summary.', tokensIn: 900, tokensOut: 100 },
      { text: JSON.stringify(good), tokensIn: 900, tokensOut: 300 },
    ]);

    const ok = await runSummary({ ...base, admin, call });

    expect(ok).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
    expect(calls.map((c) => c.name)).toEqual(['finish_summary']);
    // Both tries were paid for, so both are in the cost row.
    expect(calls[0].args.p_tokens).toBe(2200);
  });

  test('INVALID ANSWER: two bad answers end as Failed, and nothing is saved or counted', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ text: 'not json at all' }, { text: '{"title": 5}' }]);

    const ok = await runSummary({ ...base, admin, call });

    expect(ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(2); // tried twice, never a third time
    expect(calls.map((c) => c.name)).toEqual(['fail_summary']); // never finish: no usage, no ai_usage
    expect(calls[0].args.p_message).toBe(MESSAGES.badShape);
  });

  test('FAILED PATH: a declined request ends as Failed and is not tried again', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ refused: true, text: '' }]);

    const ok = await runSummary({ ...base, admin, call });

    expect(ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.name)).toEqual(['fail_summary']);
    expect(calls[0].args.p_message).toBe(MESSAGES.declined);
  });

  test('TOO LONG: a huge note is refused before anything is sent, and the text is never cut short', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    const countTokens = jest.fn().mockResolvedValue(200_000);

    const ok = await runSummary({ ...base, admin, call, countTokens, maxInputTokens: 150_000 });

    expect(ok).toBe(false);
    expect(call).not.toHaveBeenCalled(); // nothing was sent, so nothing was paid for
    expect(calls.map((c) => c.name)).toEqual(['fail_summary']);
    expect(calls[0].args.p_message).toBe(MESSAGES.tooLong);
  });

  test('a note that fits is sent as it is', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    const countTokens = jest.fn().mockResolvedValue(12_000);

    await runSummary({ ...base, admin, call, countTokens });

    expect(call).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.name)).toEqual(['finish_summary']);
  });

  test('FAILED PATH: a note with no transcript fails plainly and Claude is never called', async () => {
    const { admin, calls } = fakeAdmin({ segments: [] });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);

    await runSummary({ ...base, admin, call });

    expect(call).not.toHaveBeenCalled();
    expect(calls).toEqual([{ name: 'fail_summary', args: { p_meeting_id: 'm1', p_message: MESSAGES.empty } }]);
  });

  test('FAILED PATH: if the lines cannot be read, the note fails with a safe message', async () => {
    const { admin, calls } = fakeAdmin({ selectError: true });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);

    await runSummary({ ...base, admin, call });

    expect(call).not.toHaveBeenCalled();
    expect(calls[0].args.p_message).toBe(MESSAGES.unknown);
  });

  test('FAILED PATH: if saving fails, the note is marked Failed with a safe message', async () => {
    const { admin, calls } = fakeAdmin({ finishError: true });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);

    const ok = await runSummary({ ...base, admin, call });

    expect(ok).toBe(false);
    expect(calls.map((c) => c.name)).toEqual(['finish_summary', 'fail_summary']);
    expect(calls[1].args.p_message).toBe(MESSAGES.unknown);
  });

  test('PASTED TEXT: the words come from the file, and no times are invented', async () => {
    const { admin, calls } = fakeAdmin({ downloadText: '  We agreed to ship on Friday.  ' });
    const { call, asks } = fakeClaude([{ text: JSON.stringify(good) }]);

    const ok = await runSummary({ ...base, admin, call, source: 'text', filePath: 'acc/m1/pasted-text.txt' });

    expect(ok).toBe(true);
    expect(asks[0].user).toContain('We agreed to ship on Friday.');
    expect(asks[0].system).toContain('always use 0 for start_ms');
    expect(calls.map((c) => c.name)).toEqual(['finish_summary']);
  });

  test('PASTED TEXT: an empty file fails plainly and Claude is never called', async () => {
    const { admin, calls } = fakeAdmin({ downloadText: '   ' });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);

    await runSummary({ ...base, admin, call, source: 'text' });

    expect(call).not.toHaveBeenCalled();
    expect(calls[0].args.p_message).toBe(MESSAGES.empty);
  });

  test('PASTED TEXT: a missing file fails plainly', async () => {
    const { admin, calls } = fakeAdmin({ downloadError: true });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);

    await runSummary({ ...base, admin, call, source: 'text' });

    expect(call).not.toHaveBeenCalled();
    expect(calls[0].args.p_message).toBe(MESSAGES.empty);
  });

  test('the summary is asked for in the language the person chose', async () => {
    const { admin } = fakeAdmin();
    const { call, asks } = fakeClaude([{ text: JSON.stringify(good) }]);

    await runSummary({ ...base, admin, call, language: 'hi' });

    expect(asks[0].system).toContain('Write all text in Hindi.');
  });

  test('what people said is never written to the logs', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ text: 'nope' }, { text: 'still nope' }]);
    const spy = console.error as jest.Mock;

    await runSummary({ ...base, admin, call });

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('Priya will send the test plan');
    expect(logged).not.toContain('Sign up feels slow');
  });
});

/**
 * The step that runs the moment a note becomes Ready. This is where the recap email goes out,
 * so these tests are really about "a failed note never emails anybody".
 */
describe('handing the note on once it is Ready', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('it runs exactly once, after the note is saved as Ready', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    const onReady = jest.fn(async () => {});

    expect(await runSummary({ ...base, admin, call, onReady })).toBe(true);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.name)).toEqual(['finish_summary']);
  });

  test('A NOTE THAT FAILS NEVER EMAILS ANYBODY', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ text: 'not json at all' }, { text: 'still not json' }]);
    const onReady = jest.fn(async () => {});

    expect(await runSummary({ ...base, admin, call, onReady })).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });

  test('a note that cannot be saved as Ready never emails anybody either', async () => {
    const { admin } = fakeAdmin({ finishError: true });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    const onReady = jest.fn(async () => {});

    expect(await runSummary({ ...base, admin, call, onReady })).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });

  test('an email problem never undoes a note that is already Ready', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    const onReady = jest.fn(async () => {
      throw new Error('the email service was down');
    });

    // The note is still Ready, and it was never marked Failed.
    expect(await runSummary({ ...base, admin, call, onReady })).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(['finish_summary']);
  });

  test('nothing breaks when there is no step to run', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    expect(await runSummary({ ...base, admin, call })).toBe(true);
  });
});
