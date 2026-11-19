/**
 * One translation from start to end, with a fake database and a fake Claude.
 * The real Claude is NEVER called here, so these tests cost nothing.
 *
 * The most important test in this file is "PAID ONCE": asking for the same translation a second
 * time must not call Claude and must not write a cost row.
 */
import { MESSAGES, TranslateError, type SummaryContent } from '../supabase/functions/translate/translate';
import {
  runTranslate,
  TranslateNotAllowedError,
  type Ask,
  type Reply,
  type TranslateOptions,
} from '../supabase/functions/translate/pipeline';

type Call = { name: string; args: Record<string, unknown> };

const SUMMARY_ROW = {
  overview: 'The team agreed to ship the new sign up screen on Friday.',
  key_points: ['Sign up is slow on phones', 'Two people tested it'],
  decisions: ['Ship on Friday'],
  open_questions: ['Who writes the release note?'],
};

const ITEMS = [
  { id: 'i1', text: 'Send the test plan', due_text: 'by Friday', start_ms: 65000 },
  { id: 'i2', text: 'Book the review', due_text: null, start_ms: null },
];

const LINES = [
  { id: 'a', start_ms: 500, text: 'Thanks for joining.' },
  { id: 'b', start_ms: 4200, text: 'It still feels slow on my phone.' },
];

const SPANISH_SUMMARY = JSON.stringify({
  overview: 'El equipo acordó lanzar la nueva pantalla de registro el viernes.',
  key_points: ['El registro es lento en los teléfonos', 'Dos personas lo probaron'],
  decisions: ['Lanzar el viernes'],
  open_questions: ['¿Quién escribe la nota de lanzamiento?'],
  action_items: [
    { text: 'Enviar el plan de pruebas', due: 'para el viernes' },
    { text: 'Reservar la revisión', due: null },
  ],
});

const SPANISH_LINES = JSON.stringify({ lines: ['Gracias por venir.', 'Sigue lento en mi teléfono.'] });

type FakeOptions = {
  /** What claim_translation hands back. */
  claim?: Record<string, unknown> | null;
  /** The message a failing claim_translation raises. */
  claimError?: string;
  summaryRow?: Record<string, unknown> | null;
  items?: Record<string, unknown>[];
  lines?: Record<string, unknown>[];
  linesError?: boolean;
  saveError?: boolean;
  downloadText?: string;
  downloadError?: boolean;
  /** Every table and value that was looked up, as "table:value", for the privacy tests. */
  seen?: string[];
};

function fakeAdmin(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const claim = options.claim === undefined ? { account_id: 'acc1', source_id: 's1', existing: null, note_source: 'upload', file_path: null } : options.claim;

  const rpc = (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    const result =
      name === 'claim_translation'
        ? options.claimError
          ? { data: null, error: { message: options.claimError } }
          : { data: claim, error: null }
        : { data: null, error: options.saveError ? { message: 'save_failed' } : null };
    return {
      then: <T,>(onDone: (r: typeof result) => T) => Promise.resolve(result).then(onDone),
      single: () => Promise.resolve(result),
    };
  };

  const admin = {
    rpc,
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              options.seen?.push(`${table}:${value}`);
              const rows =
                table === 'action_items'
                  ? { data: options.items ?? ITEMS, error: null }
                  : table === 'transcript_segments'
                    ? options.linesError
                      ? { data: null, error: { message: 'boom' } }
                      : { data: options.lines ?? LINES, error: null }
                    : { data: [], error: null };
              const ordered = {
                then: <T,>(onDone: (r: typeof rows) => T) => Promise.resolve(rows).then(onDone),
                order: () => ordered,
              };
              return {
                order: () => ordered,
                maybeSingle: () =>
                  Promise.resolve(
                    options.summaryRow === null
                      ? { data: null, error: null }
                      : { data: options.summaryRow ?? SUMMARY_ROW, error: null },
                  ),
              };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          download: () =>
            Promise.resolve(
              options.downloadError
                ? { data: null, error: { message: 'gone' } }
                : { data: { text: async () => options.downloadText ?? '' }, error: null },
            ),
        };
      },
    },
  };
  return { admin: admin as unknown as TranslateOptions['admin'], calls };
}

/** A fake Claude that answers from a list. The last answer repeats if it is asked again. */
function fakeClaude(replies: Partial<Reply>[]) {
  const asks: Ask[] = [];
  const call = jest.fn(async (ask: Ask) => {
    asks.push(ask);
    const picked = replies[Math.min(asks.length - 1, replies.length - 1)] ?? {};
    return { text: '', refused: false, tokensIn: 1000, tokensOut: 1200, ...picked } as Reply;
  });
  return { call, asks };
}

const base = {
  meetingId: 'm1',
  userId: 'u1',
  language: 'es',
  bucket: 'notes-files',
  maxTranscriptTokens: 6000,
  usdPerMtokIn: 2,
  usdPerMtokOut: 10,
};

describe('translating a summary', () => {
  test('it asks Claude once, saves the translation, and logs the cost', async () => {
    const { admin, calls } = fakeAdmin();
    const { call, asks } = fakeClaude([{ text: SPANISH_SUMMARY }]);

    const result = await runTranslate({ ...base, kind: 'summary', admin, call });

    expect(call).toHaveBeenCalledTimes(1);
    expect(asks[0].system).toContain('Translate the content into Spanish.');
    expect(result.reused).toBe(false);
    expect(result.language).toBe('es');
    expect((result.content as SummaryContent).action_items[0].text).toBe('Enviar el plan de pruebas');

    const saved = calls.filter((c) => c.name === 'save_translation');
    expect(saved).toHaveLength(1);
    expect(saved[0].args.p_kind).toBe('summary');
    expect(saved[0].args.p_source_id).toBe('s1');
    expect(saved[0].args.p_language).toBe('es');
    // 1000 in + 1200 out tokens, and the cost of both at the rates above.
    expect(saved[0].args.p_tokens).toBe(2200);
    expect(saved[0].args.p_cost).toBeCloseTo(1000 / 1e6 * 2 + 1200 / 1e6 * 10, 6);
  });

  test('the to-dos are sent and come back in the order the screen shows them', async () => {
    const { admin } = fakeAdmin();
    const { call, asks } = fakeClaude([{ text: SPANISH_SUMMARY }]);
    await runTranslate({ ...base, kind: 'summary', admin, call });
    const sent = JSON.parse(asks[0].content);
    expect(sent.action_items).toEqual([
      { text: 'Send the test plan', due: 'by Friday' },
      { text: 'Book the review', due: null },
    ]);
  });

  test('NO SUMMARY: it says so and never asks Claude', async () => {
    const { admin, calls } = fakeAdmin({ claimError: 'no_summary' });
    const { call } = fakeClaude([]);
    await expect(runTranslate({ ...base, kind: 'summary', admin, call })).rejects.toThrow(MESSAGES.noSummary);
    expect(call).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.name === 'save_translation')).toHaveLength(0);
  });

  test('NOT YOURS: somebody else’s note is refused before anything is read', async () => {
    const { admin } = fakeAdmin({ claimError: 'not_allowed' });
    const { call } = fakeClaude([]);
    await expect(runTranslate({ ...base, kind: 'summary', admin, call })).rejects.toBeInstanceOf(
      TranslateNotAllowedError,
    );
    expect(call).not.toHaveBeenCalled();
  });

  test('AN EMPTY SUMMARY has nothing to translate', async () => {
    const { admin } = fakeAdmin({
      summaryRow: { overview: null, key_points: [], decisions: [], open_questions: [] },
      items: [],
    });
    const { call } = fakeClaude([]);
    await expect(runTranslate({ ...base, kind: 'summary', admin, call })).rejects.toThrow(MESSAGES.noWords);
    expect(call).not.toHaveBeenCalled();
  });
});

describe('PAID ONCE: the same translation is never bought twice', () => {
  test('a saved translation comes straight back, with no Claude call and no cost row', async () => {
    const { admin, calls } = fakeAdmin({
      claim: { account_id: 'acc1', source_id: 's1', existing: SPANISH_SUMMARY, note_source: 'upload', file_path: null },
    });
    const { call } = fakeClaude([{ text: 'should never be used' }]);

    const result = await runTranslate({ ...base, kind: 'summary', admin, call });

    expect(result.reused).toBe(true);
    expect((result.content as SummaryContent).overview).toContain('viernes');
    expect(call).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.name === 'save_translation')).toHaveLength(0);
  });

  test('asking twice costs one Claude call and writes one cost row', async () => {
    // First time: nothing is saved yet, so it is made and paid for.
    const first = fakeAdmin();
    const firstClaude = fakeClaude([{ text: SPANISH_SUMMARY }]);
    await runTranslate({ ...base, kind: 'summary', admin: first.admin, call: firstClaude.call });

    // Second time: the database now has it, so claim_translation hands it straight back.
    const saved = String(first.calls.find((c) => c.name === 'save_translation')!.args.p_content);
    const second = fakeAdmin({
      claim: { account_id: 'acc1', source_id: 's1', existing: saved, note_source: 'upload', file_path: null },
    });
    const secondClaude = fakeClaude([{ text: SPANISH_SUMMARY }]);
    const again = await runTranslate({ ...base, kind: 'summary', admin: second.admin, call: secondClaude.call });

    expect(firstClaude.call).toHaveBeenCalledTimes(1);
    expect(secondClaude.call).not.toHaveBeenCalled();
    expect(first.calls.filter((c) => c.name === 'save_translation')).toHaveLength(1);
    expect(second.calls.filter((c) => c.name === 'save_translation')).toHaveLength(0);
    expect(again.reused).toBe(true);
  });

  test('a saved translation that cannot be read is simply made again', async () => {
    const { admin, calls } = fakeAdmin({
      claim: { account_id: 'acc1', source_id: 's1', existing: 'not readable', note_source: 'upload', file_path: null },
    });
    const { call } = fakeClaude([{ text: SPANISH_SUMMARY }]);
    const result = await runTranslate({ ...base, kind: 'summary', admin, call });
    expect(result.reused).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.name === 'save_translation')).toHaveLength(1);
  });
});

describe('translating a transcript', () => {
  test('every line is translated, and the speakers and times are never sent', async () => {
    const { admin, calls } = fakeAdmin();
    const { call, asks } = fakeClaude([{ text: SPANISH_LINES }]);
    const result = await runTranslate({ ...base, kind: 'transcript', admin, call });

    expect(JSON.parse(asks[0].content)).toEqual({ lines: ['Thanks for joining.', 'It still feels slow on my phone.'] });
    expect(asks[0].content).not.toContain('Speaker');
    expect(asks[0].content).not.toContain('start_ms');
    expect(result.content).toEqual({ lines: ['Gracias por venir.', 'Sigue lento en mi teléfono.'] });
    expect(calls.find((c) => c.name === 'save_translation')!.args.p_kind).toBe('transcript');
  });

  test('a pasted-text note is translated paragraph by paragraph', async () => {
    const { admin } = fakeAdmin({
      claim: { account_id: 'acc1', source_id: 'm1', existing: null, note_source: 'text', file_path: 'acc1/m1/notes.txt' },
      downloadText: 'First paragraph.\n\nSecond paragraph.',
    });
    const { call, asks } = fakeClaude([{ text: JSON.stringify({ lines: ['Primer párrafo.', 'Segundo párrafo.'] }) }]);
    const result = await runTranslate({ ...base, kind: 'transcript', admin, call });
    expect(JSON.parse(asks[0].content)).toEqual({ lines: ['First paragraph.', 'Second paragraph.'] });
    expect(result.content).toEqual({ lines: ['Primer párrafo.', 'Segundo párrafo.'] });
  });

  test('TOO LONG: a huge transcript is refused instead of being cut short', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([]);
    await expect(
      runTranslate({ ...base, kind: 'transcript', admin, call, countTokens: async () => 6001 }),
    ).rejects.toThrow(MESSAGES.tooLong);
    expect(call).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.name === 'save_translation')).toHaveLength(0);
  });

  test('a transcript just inside the limit is still translated', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ text: SPANISH_LINES }]);
    await runTranslate({ ...base, kind: 'transcript', admin, call, countTokens: async () => 6000 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  test('NO WORDS: a note with no lines has nothing to translate', async () => {
    const { admin } = fakeAdmin({ lines: [] });
    const { call } = fakeClaude([]);
    await expect(runTranslate({ ...base, kind: 'transcript', admin, call })).rejects.toThrow(MESSAGES.noWords);
    expect(call).not.toHaveBeenCalled();
  });
});

describe('when something goes wrong', () => {
  test('a bad answer is tried exactly once more, and both tries are paid for', async () => {
    const { admin, calls } = fakeAdmin();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { call } = fakeClaude([{ text: 'not the shape' }, { text: SPANISH_SUMMARY }]);

    const result = await runTranslate({ ...base, kind: 'summary', admin, call });

    expect(call).toHaveBeenCalledTimes(2);
    expect(result.reused).toBe(false);
    // Two tries of 1000 in and 1200 out each.
    expect(calls.find((c) => c.name === 'save_translation')!.args.p_tokens).toBe(4400);
    log.mockRestore();
  });

  test('two bad answers in a row give up with a plain message, and save nothing', async () => {
    const { admin, calls } = fakeAdmin();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { call } = fakeClaude([{ text: 'nope' }, { text: 'still nope' }]);

    await expect(runTranslate({ ...base, kind: 'summary', admin, call })).rejects.toThrow(MESSAGES.badShape);
    expect(call).toHaveBeenCalledTimes(2);
    expect(calls.filter((c) => c.name === 'save_translation')).toHaveLength(0);
    log.mockRestore();
  });

  test('REFUSED: a safety decline is not retried', async () => {
    const { admin } = fakeAdmin();
    const { call } = fakeClaude([{ refused: true, text: '' }]);
    await expect(runTranslate({ ...base, kind: 'summary', admin, call })).rejects.toThrow(MESSAGES.declined);
    expect(call).toHaveBeenCalledTimes(1);
  });

  test('a problem while saving becomes a plain message', async () => {
    const { admin } = fakeAdmin({ saveError: true });
    const { call } = fakeClaude([{ text: SPANISH_SUMMARY }]);
    await expect(runTranslate({ ...base, kind: 'summary', admin, call })).rejects.toBeInstanceOf(TranslateError);
  });

  test('the words of the meeting are never written to the log', async () => {
    const { admin } = fakeAdmin();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { call } = fakeClaude([{ text: 'nope' }, { text: 'nope' }]);

    await expect(runTranslate({ ...base, kind: 'summary', admin, call })).rejects.toThrow();

    const written = log.mock.calls.flat().join(' ');
    expect(written).not.toContain('sign up screen');
    expect(written).not.toContain('Priya');
    log.mockRestore();
  });
});

describe('privacy', () => {
  test('it only ever reads the note it was asked about', async () => {
    const seen: string[] = [];
    const { admin } = fakeAdmin({ seen });
    const { call } = fakeClaude([{ text: SPANISH_SUMMARY }]);
    await runTranslate({ ...base, kind: 'summary', admin, call });
    for (const row of seen) expect(row.endsWith(':m1')).toBe(true);
  });

  test('the person asking is passed to the database, so it checks they may see the note', async () => {
    const { admin, calls } = fakeAdmin();
    const { call } = fakeClaude([{ text: SPANISH_SUMMARY }]);
    await runTranslate({ ...base, kind: 'summary', admin, call });
    const claim = calls.find((c) => c.name === 'claim_translation')!;
    expect(claim.args).toEqual({ p_meeting_id: 'm1', p_user_id: 'u1', p_kind: 'summary', p_language: 'es' });
  });
});
