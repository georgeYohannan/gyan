/**
 * The pure parts of the side chat: the prompt, the numbered passages, reading the passage numbers
 * back out of an answer, and the cost.
 * Claude is NEVER called here.
 */
import fs from 'fs';
import path from 'path';

import {
  buildSystem,
  buildUser,
  citedNumbers,
  costFor,
  formatDate,
  formatPassages,
  formatTime,
  languageName,
  MESSAGES,
  messageForStatus,
  sourcesFor,
  type Segment,
} from '../supabase/functions/chat/chat';

const SEGMENTS: Segment[] = [
  { id: 's1', speaker_label: 'Speaker 1', start_ms: 500, text: 'Thanks for joining. Let us start with the sign up screen.' },
  { id: 's2', speaker_label: 'Speaker 2', start_ms: 4200, text: 'It still feels slow on my phone.' },
  { id: 's3', speaker_label: 'Speaker 1', start_ms: 65000, text: 'Priya will send the test plan on Friday, then we ship.' },
];

describe('the side chat prompt', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'data-model.md'), 'utf8');

  test('it is the prompt from docs/data-model.md, word for word', () => {
    const system = buildSystem('English', '[1] a line');
    for (const line of [
      "You answer questions about the user's own meeting notes. Use only the numbered passages below. Never use outside knowledge to fill gaps.",
      '- After each fact, add the passage number in square brackets, like [2].',
      '- If the passages do not answer the question, say: "I could not find that in your notes." Then suggest 1 better question.',
      '- Keep answers short. Use a short list only when the answer has several parts.',
      '- Keep names, numbers, and dates exactly as written in the passages.',
      '- Do not give legal, medical, or financial advice. You may report what was said in a meeting.',
    ]) {
      expect(doc).toContain(line);
      expect(system).toContain(line);
    }
    // The document writes the language as a fill-in; the prompt we send has it filled in.
    expect(doc).toContain('Answer in {{language}}, unless the user asks for another language.');
    expect(system).toContain('Answer in English, unless the user asks for another language.');
  });

  test('it answers in the language the person chose', () => {
    expect(buildSystem('Hindi', '[1] x')).toContain('Answer in Hindi, unless the user asks for another language.');
    expect(languageName('hi')).toBe('Hindi');
    expect(languageName('es')).toBe('Spanish');
    expect(languageName(null)).toBe('English');
    // A language we have no name for is asked for by its code rather than guessed at.
    expect(languageName('xx')).toBe('xx');
  });

  test('the passages go in the prompt under a PASSAGES heading', () => {
    const system = buildSystem('English', formatPassages(SEGMENTS, 'Weekly team call', '2026-11-17T10:00:00Z'));
    expect(system).toContain('\nPASSAGES\n');
    expect(system).toContain('[1] Weekly team call');
    expect(system).toContain('[3] Weekly team call');
  });

  test('the question is sent under a USER QUESTION heading', () => {
    expect(buildUser('  What were the decisions?  ')).toBe('USER QUESTION\nWhat were the decisions?');
  });
});

describe('the numbered passages', () => {
  test('each line is numbered, with the note name, the date, the time, and who said it', () => {
    const out = formatPassages(SEGMENTS, 'Weekly team call', '2026-11-17T10:00:00Z');
    const rows = out.split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe('[1] Weekly team call, 17 November 2026, at 0:00: Speaker 1: Thanks for joining. Let us start with the sign up screen.');
    expect(rows[2]).toBe('[3] Weekly team call, 17 November 2026, at 1:05: Speaker 1: Priya will send the test plan on Friday, then we ship.');
  });

  test('passage 1 is the first line, so the numbers follow the transcript in time order', () => {
    const rows = formatPassages(SEGMENTS, 'Call', null).split('\n');
    expect(rows[0]).toContain('Thanks for joining');
    expect(rows[1]).toContain('still feels slow');
    expect(rows[2]).toContain('Priya will send');
  });

  test('a line with no speaker still gets a passage number', () => {
    const out = formatPassages([{ id: 'x', speaker_label: null, start_ms: 0, text: 'Hello.' }], 'Call', null);
    expect(out).toBe('[1] Call, no date, at 0:00: Speaker: Hello.');
  });

  test('times and dates are written the way a person reads them', () => {
    expect(formatTime(500)).toBe('0:00');
    expect(formatTime(65000)).toBe('1:05');
    expect(formatTime(3725000)).toBe('1:02:05');
    expect(formatDate('2026-01-02T00:00:00Z')).toBe('2 January 2026');
    expect(formatDate(null)).toBe('no date');
    expect(formatDate('not a date')).toBe('no date');
  });
});

describe('reading the passage numbers out of an answer', () => {
  test('it finds each number once, in the order they appear', () => {
    expect(citedNumbers('We ship on Friday [3], and Priya agreed [3][1].')).toEqual([3, 1]);
    expect(citedNumbers('I could not find that in your notes.')).toEqual([]);
  });

  test('each number becomes the line it means, so the app can jump to it', () => {
    const sources = sourcesFor('Priya will send it on Friday [3]. Sign up is slow [2].', SEGMENTS);
    expect(sources).toEqual([
      { n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' },
      { n: 2, segment_id: 's2', start_ms: 4200, speaker_label: 'Speaker 2' },
    ]);
  });

  test('a number that points at no line is dropped, so a link can never be dead', () => {
    expect(sourcesFor('Something happened [99].', SEGMENTS)).toEqual([]);
    expect(sourcesFor('Something happened [0].', SEGMENTS)).toEqual([]);
  });

  test('an honest "could not find that" answer has no links, which is fine', () => {
    expect(sourcesFor('I could not find that in your notes. Try asking who tested the screen.', SEGMENTS)).toEqual([]);
  });
});

describe('cost and messages', () => {
  test('the cost comes from the token counts and the rates in settings', () => {
    // 10,000 in at $2 per million + 1,000 out at $10 per million = $0.02 + $0.01.
    expect(costFor(10_000, 0, 1_000, 2, 10, 0.1)).toBeCloseTo(0.03, 6);
    expect(costFor(0, 0, 0, 2, 10, 0.1)).toBe(0);
  });

  test('words the model already read before cost a tenth as much', () => {
    // The same 10,000 words, but remembered from the last question.
    expect(costFor(0, 10_000, 1_000, 2, 10, 0.1)).toBeCloseTo(0.011, 6);
    expect(costFor(0, 10_000, 1_000, 2, 10, 0.1)).toBeLessThan(costFor(10_000, 0, 1_000, 2, 10, 0.1));
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
