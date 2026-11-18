/**
 * Pasted text has no transcript, so its words are cut into numbered paragraphs instead.
 *
 * The cutting happens in TWO places: in the app (src/lib/passages.ts), which draws the paragraphs
 * on screen, and on the server (supabase/functions/chat/chat.ts), which sends them to the AI.
 * If the two ever cut the text differently, a number in an answer would point at the wrong
 * paragraph. The last test in this file is the one that stops that happening.
 */
import { splitPassages as splitOnServer } from '../supabase/functions/chat/chat';
import { splitPassages as splitInApp } from '@/lib/passages';

describe('cutting text into numbered paragraphs', () => {
  test('a blank line starts a new paragraph', () => {
    expect(splitInApp('One.\n\nTwo.\n\nThree.')).toEqual([
      { id: 'p1', text: 'One.' },
      { id: 'p2', text: 'Two.' },
      { id: 'p3', text: 'Three.' },
    ]);
  });

  test('several blank lines in a row still make just one break', () => {
    expect(splitInApp('One.\n\n\n\nTwo.')).toEqual([
      { id: 'p1', text: 'One.' },
      { id: 'p2', text: 'Two.' },
    ]);
  });

  test('a paragraph keeps the lines inside it together', () => {
    expect(splitInApp('A list:\n- one\n- two\n\nThe end.')).toEqual([
      { id: 'p1', text: 'A list:\n- one\n- two' },
      { id: 'p2', text: 'The end.' },
    ]);
  });

  test('text with no blank lines at all becomes one paragraph per line', () => {
    expect(splitInApp('One.\nTwo.\nThree.')).toEqual([
      { id: 'p1', text: 'One.' },
      { id: 'p2', text: 'Two.' },
      { id: 'p3', text: 'Three.' },
    ]);
  });

  test('one single line stays one paragraph', () => {
    expect(splitInApp('Just the one sentence.')).toEqual([{ id: 'p1', text: 'Just the one sentence.' }]);
  });

  test('spaces, tabs and Windows line endings do not change where the breaks are', () => {
    expect(splitInApp('  One.  \r\n   \r\n  Two.  ')).toEqual([
      { id: 'p1', text: 'One.' },
      { id: 'p2', text: 'Two.' },
    ]);
  });

  test('empty text has no paragraphs', () => {
    expect(splitInApp('')).toEqual([]);
    expect(splitInApp('   \n  \n ')).toEqual([]);
  });

  test('the numbers run 1, 2, 3 with no gaps, so passage 3 really is the third paragraph', () => {
    const passages = splitInApp('A.\n\nB.\n\n\nC.\n\nD.');
    expect(passages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(passages[2].text).toBe('C.');
  });
});

describe('the app and the server cut text the same way', () => {
  // If this ever fails, a number in a chat answer would point at the wrong paragraph.
  const samples = [
    '',
    '   ',
    'One sentence.',
    'One.\n\nTwo.\n\nThree.',
    'One.\nTwo.\nThree.',
    'Heading\n\nA list:\n- one\n- two\n\nThe end.',
    '  One.  \r\n   \r\n  Two.  ',
    'A.\n\n\n\nB.\n\n\n\n\nC.',
    'Mixed\nlines\n\nthen a break\n\n\nand another.',
    'Unicode: café, 日本語, emoji 🎉\n\nSecond paragraph.',
  ];

  test.each(samples.map((s, i) => [i, s]))('sample %i is cut identically on both sides', (_i, sample) => {
    expect(splitOnServer(sample as string)).toEqual(splitInApp(sample as string));
  });
});
