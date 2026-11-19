// Pure helpers for translation: the prompt, the strict shape, the checks, and the cost.
// No Deno-only code here, so Jest can test this file without ever calling Claude.
// The prompt is the one in docs/data-model.md ("4. Translation"), word for word.

/** The two things a person can translate. */
export const TRANSLATE_KINDS = ['summary', 'transcript'] as const;
export type TranslateKind = (typeof TRANSLATE_KINDS)[number];

/**
 * The translatable words of a Summary tab. Only text is sent, never an id, so the model has
 * nothing to change that the app relies on. The to-dos come back in the same order they went out,
 * and the app puts each one back beside its own tick box.
 */
export type SummaryContent = {
  overview: string;
  key_points: string[];
  decisions: string[];
  open_questions: string[];
  action_items: { text: string; due: string | null }[];
};

/** The translatable words of a transcript: one line of speech, or one pasted paragraph, each. */
export type TranscriptContent = { lines: string[] };

export type TranslatedContent = SummaryContent | TranscriptContent;

/** A plain-words error that is safe to show to a person. */
export class TranslateError extends Error {}

/** The answer was not in the shape we asked for. The pipeline tries once more when it sees this. */
export class TranslateShapeError extends Error {}

export const MESSAGES = {
  notSetUp: 'Gyan cannot translate yet, because it has not been set up to. Please tell the Gyan team.',
  noSummary: 'This note has no summary yet, so there is nothing to translate. Wait until the note is ready.',
  noWords: 'This note has no words in it yet, so there is nothing to translate.',
  tooLong:
    'This note is too long to translate in one go. Translating the summary still works, and we can lift this limit later.',
  badShape: 'Gyan could not translate this note. Please try again.',
  declined: 'Gyan could not translate this one. Please try again.',
  service: 'Gyan could not reach its translating service right now. Please try again in a little while.',
  busy: 'The translating service is busy. Please try again in a minute.',
  unknown: 'Something went wrong while translating. Please try again.',
} as const;

/** Turns a Claude error status into a plain message. */
export function messageForStatus(status: number): string {
  if (status === 401 || status === 402 || status === 403) return MESSAGES.service;
  if (status === 408 || status === 429 || status === 504 || status >= 500) return MESSAGES.busy;
  if (status === 400 || status === 413 || status === 422) return MESSAGES.tooLong;
  return MESSAGES.unknown;
}

/**
 * Language codes we can name in the prompt. Anything else is asked for by its code.
 * This is the same list the chat and the summary use. src/constants/languages.ts holds the app's
 * copy, and __tests__/languages-test.ts keeps the two in step.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  hi: 'Hindi',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  ru: 'Russian',
  tr: 'Turkish',
  pl: 'Polish',
  sv: 'Swedish',
};

/** 'en' -> 'English'. An unknown code is passed through as it is. */
export function languageName(code: string | null | undefined): string {
  const key = (code ?? 'en').toLowerCase().split('-')[0];
  return LANGUAGE_NAMES[key] ?? (code ?? 'English');
}

/** 'en-GB' -> 'en'. Used to tell two languages apart without the country part. */
export function baseCode(code: string | null | undefined): string {
  return (code ?? '').toLowerCase().split('-')[0];
}

/** The strict shape a translated summary must come back in. */
export const SUMMARY_TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          due: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['text', 'due'],
        additionalProperties: false,
      },
    },
  },
  required: ['overview', 'key_points', 'decisions', 'open_questions', 'action_items'],
  additionalProperties: false,
} as const;

/** The strict shape a translated transcript must come back in. */
export const TRANSCRIPT_TRANSLATION_SCHEMA = {
  type: 'object',
  properties: { lines: { type: 'array', items: { type: 'string' } } },
  required: ['lines'],
  additionalProperties: false,
} as const;

/**
 * The version of the translating rules below.
 * Translated words are saved with this number inside them. When the rules change, this number goes
 * up by 1, and anything saved under an older number is translated again the next time somebody
 * asks for it. Without this, a change to the rules would never reach a note that had already been
 * translated, because a translation is only ever bought once.
 *
 * 1: the first rules.
 * 2: 2026-11-18. Ordinary technical and business words were being left in English. The rules now
 *    say to translate every ordinary word, and name exactly what may stay in English.
 *
 * src/lib/translations.ts holds the app's copy of this number, and
 * __tests__/translate-claude-test.ts keeps the two in step.
 */
export const PROMPT_VERSION = 2;

/** The SYSTEM half of the prompt, from docs/data-model.md, word for word. */
export function buildSystem(language: string): string {
  return `Translate the content into ${language}.

RULES
- Translate meaning faithfully. Do not add, remove, or explain anything.
- Translate every ordinary word, including technical, legal, financial, and business terms. A word being technical is not a reason to leave it in English.
- Leave unchanged only these: people's names, company, product and brand names, file names, code, web addresses, numbers, dates, times, speaker labels, and timestamps.
- If the input is JSON, translate only the text values. Keep every key and the structure exactly the same.
- Somebody who reads ${language} and no English at all must be able to understand every sentence you write.
- Return only the translation.`;
}

/** The USER half of the prompt, from docs/data-model.md: just the content, as JSON. */
export function buildUser(content: TranslatedContent): string {
  return JSON.stringify(content);
}

function asStringList(value: unknown, what: string, expected: number): string[] {
  if (!Array.isArray(value)) throw new TranslateShapeError(`${what} is not a list`);
  if (value.length !== expected) {
    throw new TranslateShapeError(`${what} came back with ${value.length} items instead of ${expected}`);
  }
  return value.map((item) => {
    if (typeof item !== 'string') throw new TranslateShapeError(`${what} has an item that is not text`);
    return item;
  });
}

/** Reads the JSON Claude sent back. Anything out of shape is a TranslateShapeError, so it is retried once. */
function readJson(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw new TranslateShapeError('the answer was not readable');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TranslateShapeError('the answer was not in the right shape');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Checks a translated summary against the one that was sent.
 * Every list must come back the same length, because the app lines each item up with the original
 * by its position. A list of a different length would quietly mix the to-dos up, so it is treated
 * as a bad answer and asked for again.
 */
export function parseSummaryTranslation(text: string, original: SummaryContent): SummaryContent {
  const raw = readJson(text);
  if (typeof raw.overview !== 'string') throw new TranslateShapeError('the overview is missing');

  const items = raw.action_items;
  if (!Array.isArray(items) || items.length !== original.action_items.length) {
    throw new TranslateShapeError('the to-dos came back in a different number');
  }

  return {
    overview: raw.overview,
    key_points: asStringList(raw.key_points, 'key points', original.key_points.length),
    decisions: asStringList(raw.decisions, 'decisions', original.decisions.length),
    open_questions: asStringList(raw.open_questions, 'open questions', original.open_questions.length),
    action_items: items.map((item, i) => {
      if (!item || typeof item !== 'object') throw new TranslateShapeError('a to-do is not in the right shape');
      const row = item as Record<string, unknown>;
      if (typeof row.text !== 'string') throw new TranslateShapeError('a to-do has no text');
      // A to-do with no due date must still have none afterwards. Only real text may change.
      const due = original.action_items[i].due === null ? null : typeof row.due === 'string' ? row.due : null;
      return { text: row.text, due };
    }),
  };
}

/** Checks a translated transcript: the same number of lines, in the same order, all text. */
export function parseTranscriptTranslation(text: string, original: TranscriptContent): TranscriptContent {
  const raw = readJson(text);
  return { lines: asStringList(raw.lines, 'the lines', original.lines.length) };
}

/**
 * What this translation cost, from the token counts and the rates in settings.ts.
 * Nothing is cached here, because a translation is paid for once and then saved for good, so
 * there is never a second request with the same words to save money on.
 */
export function costFor(
  tokensIn: number,
  tokensOut: number,
  usdPerMtokIn: number,
  usdPerMtokOut: number,
): number {
  const usd = (tokensIn / 1_000_000) * usdPerMtokIn + (tokensOut / 1_000_000) * usdPerMtokOut;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export type Passage = { id: string; text: string };

/**
 * Cuts text into numbered paragraphs.
 * Paragraphs are blocks separated by a blank line. If the whole thing is one block with no blank
 * lines, every line becomes its own paragraph instead.
 *
 * IMPORTANT: this is copied word for word from src/lib/passages.ts and from
 * supabase/functions/chat/chat.ts. All three must cut the text the same way, or a translated
 * paragraph would end up next to the wrong original. A test (__tests__/passages-test.ts) keeps
 * the three copies in step.
 */
export function splitPassages(raw: string): Passage[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (text === '') return [];

  let chunks = text.split(/\n\s*\n+/);
  if (chunks.length === 1) chunks = text.split(/\n+/);

  return chunks
    .map((c) => c.trim())
    .filter((c) => c !== '')
    .map((c, i) => ({ id: `p${i + 1}`, text: c }));
}
