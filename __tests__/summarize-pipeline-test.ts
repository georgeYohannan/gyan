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
                : {
                    // The stand-in behaves like the real thing, slice() and all. A stand-in
                    // that is more helpful than reality is how the 2026-11-20 invite bug
                    // passed every test and then broke in front of a real customer.
                    data: fakeFile(options.downloadText ?? 'Some pasted notes.'),
                    error: null,
                  },
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
  accountId: 'acc',
  source: 'upload',
  filePath: 'acc/m1/call.mp3',
  language: 'en',
  bucket: 'notes-files',
  maxInputTokens: 150_000,
  usdPerMtokIn: 2,
  usdPerMtokOut: 10,
};

/**
 * Stands in for a file that comes back from storage. It answers text() like the real one,
 * and slice().arrayBuffer() too, which is what the kind-of-file check reads.
 */
function fakeFile(text: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    text: async () => text,
    slice: (start = 0, end = bytes.length) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer as ArrayBuffer,
    }),
  };
}

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

describe('a file that is not what it says it is', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('A PICTURE SAVED AS A TEXT NOTE NEVER REACHES CLAUDE', async () => {
    // This is the hole the byte check closes. A note marked as text has its raw contents put
    // straight into the AI prompt, with no transcription step in between -- so before this
    // check, uploading a file and calling it text was the shortest route from "upload
    // anything" to "put anything I like in front of the model".
    const png = '\u0089PNG\r\n\u001a\n' + '\u0000\u0001\u0002binary rubbish';
    const { admin, calls } = fakeAdmin({ downloadText: png });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);

    const ok = await runSummary({ ...base, admin, call, source: 'text' });

    expect(ok).toBe(false);
    // Claude was never asked anything at all.
    expect(call).not.toHaveBeenCalled();
    // And the note says so in plain words, with nothing about bytes or signatures in it.
    const message = String(calls[0].args.p_message);
    expect(message).toContain('not the kind of file it says it is');
    expect(message).not.toMatch(/byte|signature|utf|magic|sniff/i);
  });

  test('a recording renamed to .txt never reaches Claude either', async () => {
    // An MP3 saved as a text note would have had its raw audio bytes read as words.
    const { admin, calls } = fakeAdmin({ downloadText: 'ID3\u0003\u0000\u0000\u0000audio frames here' });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);

    await runSummary({ ...base, admin, call, source: 'text' });

    expect(call).not.toHaveBeenCalled();
    expect(String(calls[0].args.p_message)).toContain('not the kind of file it says it is');
  });

  test('REAL WRITING IN ANY SCRIPT STILL WORKS', async () => {
    // The check must not become a reason somebody's notes are refused.
    for (const words of [
      'Notes from the meeting. We agreed to ship on Friday.',
      '\u4f1a\u8b70\u306e\u8a18\u9332\u3002\u91d1\u66dc\u65e5\u306b\u51fa\u8377\u3059\u308b\u3053\u3068\u3067\u5408\u610f\u3057\u307e\u3057\u305f\u3002',
      '\u092c\u0948\u0920\u0915 \u0915\u0947 \u0928\u094b\u091f\u0964 \u0939\u092e \u0936\u0941\u0915\u094d\u0930\u0935\u093e\u0930 \u0915\u094b \u092d\u0947\u091c\u0928\u0947 \u092a\u0930 \u0938\u0939\u092e\u0924 \u0939\u0941\u0908\u0964',
      '\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0627\u062c\u062a\u0645\u0627\u0639. \u0627\u062a\u0641\u0642\u0646\u0627 \u0639\u0644\u0649 \u0627\u0644\u0634\u062d\u0646 \u064a\u0648\u0645 \u0627\u0644\u062c\u0645\u0639\u0629.',
      '# Heading\n\n- a bullet\n- another\n\n\tindented, with a tab',
    ]) {
      const { admin } = fakeAdmin({ downloadText: words });
      const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
      await runSummary({ ...base, admin, call, source: 'text' });
      expect(call).toHaveBeenCalled();
    }
  });

  test('a recording is NOT byte-checked by the summary step, because it has a transcript', async () => {
    // An upload goes through Deepgram first, and the summary reads the saved transcript
    // lines rather than the file. The byte check for recordings lives in the transcribe
    // step, where the file is actually used.
    const { admin } = fakeAdmin({});
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    await runSummary({ ...base, admin, call, source: 'upload' });
    expect(call).toHaveBeenCalled();
  });
});

describe('a file path that climbs out of the account', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test('A NOTE POINTING AT ANOTHER ACCOUNT\u2019S FILE NEVER REACHES CLAUDE', async () => {
    // meetings.file_path is written by the app, and this download uses the SERVICE KEY,
    // which skips every rule. "acc/m1/../../other-acc/their-note/secret.txt" starts with
    // the right account and becomes somebody else's file once it is made into an address.
    const { admin, calls } = fakeAdmin({ downloadText: 'SOMEBODY ELSE PRIVATE NOTES' });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);

    const ok = await runSummary({
      ...base,
      admin,
      call,
      source: 'text',
      filePath: 'acc/m1/../../other-acc/their-note/secret.txt',
    });

    expect(ok).toBe(false);
    expect(call).not.toHaveBeenCalled();
    expect(String(calls[0].args.p_message)).toContain('could not open that file');
  });

  test('and nor does one that names another account outright', async () => {
    const { admin } = fakeAdmin({ downloadText: 'SOMEBODY ELSE PRIVATE NOTES' });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    await runSummary({ ...base, admin, call, source: 'text', filePath: 'other-acc/their-note/secret.txt' });
    expect(call).not.toHaveBeenCalled();
  });

  test('WITHOUT AN ACCOUNT TO CHECK AGAINST, nothing is read at all', async () => {
    // Fail closed. A missing account must never mean "any path is fine".
    const { admin } = fakeAdmin({ downloadText: 'notes' });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    await runSummary({ ...base, accountId: undefined, admin, call, source: 'text' });
    expect(call).not.toHaveBeenCalled();
  });

  test('an ordinary path still works', async () => {
    const { admin } = fakeAdmin({ downloadText: 'Notes from the meeting.' });
    const { call } = fakeClaude([{ text: JSON.stringify(good) }]);
    await runSummary({ ...base, admin, call, source: 'text', filePath: 'acc/m1/pasted-text.txt' });
    expect(call).toHaveBeenCalled();
  });
});
