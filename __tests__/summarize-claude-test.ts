/**
 * The pure parts of the summary step: the prompt, the strict shape, the checks, and the cost.
 * Claude is NEVER called here.
 */
import fs from 'fs';
import path from 'path';

import {
  buildSystem,
  buildUser,
  costFor,
  formatTranscript,
  languageName,
  MESSAGES,
  messageForStatus,
  parseSummary,
  SUMMARY_SCHEMA,
  SummaryShapeError,
} from '../supabase/functions/summarize/claude';

const good = {
  title: 'Sign up screen review',
  overview: 'The team looked at the sign up screen. They agreed to ship it on Friday.',
  key_points: ['Sign up is slow on phones'],
  decisions: ['Ship on Friday'],
  action_items: [{ text: 'Send the test plan', owner: 'Priya', due: 'Friday', start_ms: 65000 }],
  open_questions: ['Who writes the release note?'],
};

describe('the summary prompt', () => {
  test('it is the prompt from docs/data-model.md, word for word', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'data-model.md'), 'utf8');
    const system = buildSystem('English');
    // Every rule line in the document is in the prompt we send.
    for (const line of [
      'You write meeting notes. Use only what is in the transcript. Never add facts.',
      'Each transcript line looks like this: [speaker, start time in ms] text.',
      '- owner is a name only when the transcript says who will do it. Otherwise null.',
      '- due is a date or time only when someone said it. Otherwise null. Do not work out dates.',
      '- Keep names, numbers, and dates exactly as spoken.',
      '- start_ms is the start time of the line where the action item was said.',
      '- If the transcript is too short or has no clear content, return empty lists and an overview that says so.',
    ]) {
      expect(doc).toContain(line);
      expect(system).toContain(line);
    }
  });

  test('it asks for the summary in the language the person chose', () => {
    expect(buildSystem('Hindi')).toContain('Write all text in Hindi.');
    expect(languageName('hi')).toBe('Hindi');
    expect(languageName('es')).toBe('Spanish');
    expect(languageName(null)).toBe('English');
    // A language we have no name for is asked for by its code rather than guessed at.
    expect(languageName('xx')).toBe('xx');
  });

  test('pasted text has no times, so the prompt says to use 0 instead of inventing them', () => {
    const system = buildSystem('English', false);
    expect(system).toContain('The text has no speaker labels and no times, so always use 0 for start_ms.');
    expect(system).not.toContain('start time in ms] text');
  });

  test('the meeting type defaults to general', () => {
    expect(buildUser('line one')).toContain('Meeting type: general');
    expect(buildUser('line one', 'sales call')).toContain('Meeting type: sales call');
    expect(buildUser('line one')).toContain('Transcript:\nline one');
  });

  test('transcript lines are written as [speaker, time] text', () => {
    const out = formatTranscript([
      { speaker_label: 'Speaker 1', start_ms: 500, text: ' Hello there. ' },
      { speaker_label: null, start_ms: 65000.4, text: 'Hi.' },
    ]);
    expect(out).toBe('[Speaker 1, 500] Hello there.\n[Speaker, 65000] Hi.');
  });
});

describe('the strict shape', () => {
  test('it names every field, allows nothing extra, and lets owner and due be empty', () => {
    expect(SUMMARY_SCHEMA.required).toEqual(['title', 'overview', 'key_points', 'decisions', 'action_items', 'open_questions']);
    expect(SUMMARY_SCHEMA.additionalProperties).toBe(false);
    const item = SUMMARY_SCHEMA.properties.action_items.items;
    expect(item.required).toEqual(['text', 'owner', 'due', 'start_ms']);
    expect(item.additionalProperties).toBe(false);
    expect(item.properties.owner.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
  });
});

describe('checking the answer', () => {
  test('a good answer is read and tidied up', () => {
    const s = parseSummary(JSON.stringify(good));
    expect(s.overview).toContain('agreed to ship it on Friday');
    expect(s.key_points).toEqual(['Sign up is slow on phones']);
    expect(s.action_items).toEqual([{ text: 'Send the test plan', owner: 'Priya', due: 'Friday', start_ms: 65000 }]);
  });

  test('an empty meeting is fine: empty lists and an overview that says so', () => {
    const s = parseSummary(
      JSON.stringify({ title: 'Short note', overview: 'There was not enough here to summarize.', key_points: [], decisions: [], action_items: [], open_questions: [] }),
    );
    expect(s.key_points).toEqual([]);
    expect(s.action_items).toEqual([]);
    expect(s.overview).toContain('not enough');
  });

  test('a missing owner or date becomes empty instead of a guess', () => {
    const s = parseSummary(JSON.stringify({ ...good, action_items: [{ text: 'Do it', owner: null, due: '   ', start_ms: 0 }] }));
    expect(s.action_items[0].owner).toBeNull();
    expect(s.action_items[0].due).toBeNull();
  });

  test('a title longer than 8 words is shortened', () => {
    const s = parseSummary(JSON.stringify({ ...good, title: 'one two three four five six seven eight nine ten' }));
    expect(s.title).toBe('one two three four five six seven eight');
  });

  test('INVALID ANSWER: words that are not JSON are refused', () => {
    expect(() => parseSummary('Here is your summary!')).toThrow(SummaryShapeError);
  });

  test('INVALID ANSWER: JSON that is not an object is refused', () => {
    expect(() => parseSummary('[1, 2, 3]')).toThrow(SummaryShapeError);
    expect(() => parseSummary('"hello"')).toThrow(SummaryShapeError);
  });

  test.each([
    ['a missing overview', { ...good, overview: undefined }],
    ['key points that are not words', { ...good, key_points: [{ a: 1 }] }],
    ['decisions that are not a list', { ...good, decisions: 'Ship on Friday' }],
    ['an action item with no text', { ...good, action_items: [{ owner: null, due: null, start_ms: 0 }] }],
    ['an action item owner that is a number', { ...good, action_items: [{ text: 'Do it', owner: 7, due: null, start_ms: 0 }] }],
  ])('INVALID ANSWER: %s is refused', (_name, body) => {
    expect(() => parseSummary(JSON.stringify(body))).toThrow(SummaryShapeError);
  });

  test('a start time that is missing or odd becomes 0 rather than failing the whole note', () => {
    const s = parseSummary(JSON.stringify({ ...good, action_items: [{ text: 'Do it', owner: null, due: null, start_ms: 'soon' }] }));
    expect(s.action_items[0].start_ms).toBe(0);
  });
});

describe('cost and messages', () => {
  test('the cost comes from the token counts and the rates in settings', () => {
    // 10,000 in at $2 per million + 1,000 out at $10 per million = $0.02 + $0.01.
    expect(costFor(10_000, 1_000, 2, 10)).toBeCloseTo(0.03, 6);
    expect(costFor(0, 0, 2, 10)).toBe(0);
  });

  test('every message is plain English with no technical words', () => {
    for (const m of Object.values(MESSAGES)) {
      expect(m.length).toBeGreaterThan(20);
      expect(m).not.toMatch(/json|token|api|anthropic|claude|http|null/i);
    }
  });

  test('a busy or broken service gets the right plain message', () => {
    expect(messageForStatus(429)).toBe(MESSAGES.busy);
    expect(messageForStatus(500)).toBe(MESSAGES.busy);
    expect(messageForStatus(401)).toBe(MESSAGES.service);
    expect(messageForStatus(413)).toBe(MESSAGES.tooLong);
  });
});
