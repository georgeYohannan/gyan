/**
 * The pure parts of translation: the prompt, the strict shape, the checks, and the cost.
 * Claude is NEVER called here.
 */
import fs from 'fs';
import path from 'path';

import {
  buildSystem,
  buildUser,
  costFor,
  languageName,
  MESSAGES,
  messageForStatus,
  parseSummaryTranslation,
  parseTranscriptTranslation,
  PROMPT_VERSION,
  SUMMARY_TRANSLATION_SCHEMA,
  TRANSCRIPT_TRANSLATION_SCHEMA,
  TranslateShapeError,
  TRANSLATE_KINDS,
  type SummaryContent,
  type TranscriptContent,
} from '../supabase/functions/translate/translate';
import { PROMPT_VERSION as APP_PROMPT_VERSION } from '@/lib/translations';

const SUMMARY: SummaryContent = {
  overview: 'The team agreed to ship the new sign up screen on Friday.',
  key_points: ['Sign up is slow on phones', 'Two people tested it'],
  decisions: ['Ship on Friday'],
  open_questions: ['Who writes the release note?'],
  action_items: [
    { text: 'Send the test plan', due: 'by Friday' },
    { text: 'Book the review', due: null },
  ],
};

const TRANSCRIPT: TranscriptContent = {
  lines: ['Thanks for joining.', 'It still feels slow on my phone.', 'Priya will send the test plan on Friday.'],
};

/** A Spanish answer in the right shape, for the happy paths below. */
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

describe('the translation prompt', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'data-model.md'), 'utf8');

  test('it is the prompt from docs/data-model.md, word for word', () => {
    const system = buildSystem('Spanish');
    for (const line of [
      '- Translate meaning faithfully. Do not add, remove, or explain anything.',
      '- Translate every ordinary word, including technical, legal, financial, and business terms. A word being technical is not a reason to leave it in English.',
      "- Leave unchanged only these: people's names, company, product and brand names, file names, code, web addresses, numbers, dates, times, speaker labels, and timestamps.",
      '- If the input is JSON, translate only the text values. Keep every key and the structure exactly the same.',
      '- Return only the translation.',
    ]) {
      expect(doc).toContain(line);
      expect(system).toContain(line);
    }
    // The document writes the language as a fill-in; the prompt we send has it filled in.
    expect(doc).toContain('Translate the content into {{target_language}}.');
    expect(system).toContain('Translate the content into Spanish.');
    expect(doc).toContain('Somebody who reads {{target_language}} and no English at all must be able to understand every sentence you write.');
    expect(system).toContain('Somebody who reads Spanish and no English at all must be able to understand every sentence you write.');
  });

  test('IT TELLS THE MODEL TO TRANSLATE TECHNICAL WORDS TOO', () => {
    // A real translation came back with ordinary words like "ledger", "workpapers" and
    // "engagement shell" left in English, because the old rules said to keep a word when there was
    // no good translation. These are the rules that replaced it.
    const system = buildSystem('Hindi');
    expect(system).toContain('A word being technical is not a reason to leave it in English.');
    expect(system).not.toContain('If a word has no good translation, keep the original word.');
    // It still protects the things that really must not change.
    expect(system).toContain("people's names, company, product and brand names");
    expect(system).toContain('numbers, dates, times, speaker labels, and timestamps');
  });

  test('the rules carry a version, and all 3 copies of it agree', () => {
    // A translation is only ever bought once, so without a version a change to the rules above
    // would never reach a note somebody had already translated. The number lives in 3 places: the
    // server, the app, and the browser scripts (which cannot import app code).
    expect(PROMPT_VERSION).toBe(APP_PROMPT_VERSION);
    expect(PROMPT_VERSION).toBeGreaterThanOrEqual(2);

    const fixture = fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'fake-api.ts'), 'utf8');
    const inScripts = fixture.match(/export const PROMPT_VERSION = (\d+);/);
    expect(inScripts).not.toBeNull();
    expect(Number(inScripts![1])).toBe(PROMPT_VERSION);
  });

  test('it asks for each of the 5 test languages by name', () => {
    for (const [code, name] of [
      ['es', 'Spanish'],
      ['hi', 'Hindi'],
      ['fr', 'French'],
      ['ar', 'Arabic'],
      ['ja', 'Japanese'],
    ]) {
      expect(languageName(code)).toBe(name);
      expect(buildSystem(languageName(code))).toContain(`Translate the content into ${name}.`);
    }
    expect(languageName(null)).toBe('English');
    expect(languageName('en-GB')).toBe('English');
  });

  test('only the words go to Claude, never an id, a speaker or a time', () => {
    const sent = buildUser(SUMMARY);
    expect(JSON.parse(sent)).toEqual(SUMMARY);
    expect(sent).not.toMatch(/\bid\b|speaker|start_ms|owner/);
  });

  test('there are exactly 2 things a person can translate', () => {
    expect([...TRANSLATE_KINDS]).toEqual(['summary', 'transcript']);
  });

  test('the strict shapes allow no extra keys, so nothing unexpected comes back', () => {
    expect(SUMMARY_TRANSLATION_SCHEMA.additionalProperties).toBe(false);
    expect(SUMMARY_TRANSLATION_SCHEMA.properties.action_items.items.additionalProperties).toBe(false);
    expect(TRANSCRIPT_TRANSLATION_SCHEMA.additionalProperties).toBe(false);
  });
});

describe('checking a translated summary', () => {
  test('a good answer comes back as the same shape, in the same order', () => {
    const out = parseSummaryTranslation(SPANISH_SUMMARY, SUMMARY);
    expect(out.overview).toContain('viernes');
    expect(out.key_points).toHaveLength(2);
    expect(out.action_items[0]).toEqual({ text: 'Enviar el plan de pruebas', due: 'para el viernes' });
    // A to-do with no due date must still have none afterwards.
    expect(out.action_items[1].due).toBeNull();
  });

  test('a to-do that had no due date never gains one', () => {
    const invented = JSON.parse(SPANISH_SUMMARY);
    invented.action_items[1].due = 'el lunes';
    expect(parseSummaryTranslation(JSON.stringify(invented), SUMMARY).action_items[1].due).toBeNull();
  });

  test('A DIFFERENT NUMBER OF KEY POINTS is a bad answer, so it is asked for again', () => {
    const short = JSON.parse(SPANISH_SUMMARY);
    short.key_points = ['Solo uno'];
    expect(() => parseSummaryTranslation(JSON.stringify(short), SUMMARY)).toThrow(TranslateShapeError);
  });

  test('A DIFFERENT NUMBER OF TO-DOS is a bad answer, because the ticks would mix up', () => {
    const short = JSON.parse(SPANISH_SUMMARY);
    short.action_items = [short.action_items[0]];
    expect(() => parseSummaryTranslation(JSON.stringify(short), SUMMARY)).toThrow(TranslateShapeError);
  });

  test('UNREADABLE: words instead of the shape we asked for', () => {
    expect(() => parseSummaryTranslation('Here is your translation!', SUMMARY)).toThrow(TranslateShapeError);
    expect(() => parseSummaryTranslation('[1, 2, 3]', SUMMARY)).toThrow(TranslateShapeError);
    expect(() => parseSummaryTranslation('{"key_points": []}', SUMMARY)).toThrow(TranslateShapeError);
  });
});

describe('checking a translated transcript', () => {
  test('every line comes back, in the same order', () => {
    const answer = JSON.stringify({ lines: ['Gracias por venir.', 'Sigue lento.', 'Priya enviará el plan.'] });
    expect(parseTranscriptTranslation(answer, TRANSCRIPT).lines).toHaveLength(3);
    expect(parseTranscriptTranslation(answer, TRANSCRIPT).lines[0]).toBe('Gracias por venir.');
  });

  test('A MISSING LINE is a bad answer, because the speakers would shift up', () => {
    const answer = JSON.stringify({ lines: ['Gracias por venir.', 'Sigue lento.'] });
    expect(() => parseTranscriptTranslation(answer, TRANSCRIPT)).toThrow(TranslateShapeError);
  });

  test('a line that is not text is a bad answer', () => {
    const answer = JSON.stringify({ lines: ['a', 2, 'c'] });
    expect(() => parseTranscriptTranslation(answer, TRANSCRIPT)).toThrow(TranslateShapeError);
  });

  test('right to left and non-Latin answers are kept exactly as they came', () => {
    for (const words of ['مرحبا بكم', 'नमस्ते सब लोग', 'ご参加ありがとうございます']) {
      const answer = JSON.stringify({ lines: [words, words, words] });
      expect(parseTranscriptTranslation(answer, TRANSCRIPT).lines[0]).toBe(words);
    }
  });
});

describe('cost and messages', () => {
  test('cost is the tokens times the rates in settings.ts', () => {
    // 10,000 in at $2 per million = $0.02. 12,000 out at $10 per million = $0.12. Total $0.14.
    expect(costFor(10_000, 12_000, 2, 10)).toBeCloseTo(0.14, 6);
    expect(costFor(0, 0, 2, 10)).toBe(0);
  });

  test('every message is a plain sentence with no jargon in it', () => {
    for (const m of Object.values(MESSAGES)) {
      expect(m.length).toBeGreaterThan(20);
      expect(m).not.toMatch(/json|token|api|anthropic|claude|http|null/i);
    }
  });

  test('a problem from the service becomes a plain message', () => {
    expect(messageForStatus(429)).toBe(MESSAGES.busy);
    expect(messageForStatus(500)).toBe(MESSAGES.busy);
    expect(messageForStatus(401)).toBe(MESSAGES.service);
    expect(messageForStatus(413)).toBe(MESSAGES.tooLong);
    expect(messageForStatus(418)).toBe(MESSAGES.unknown);
  });
});
