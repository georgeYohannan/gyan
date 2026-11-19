// Reading and asking for translations of a note.
//
// A translation is saved once per note, kind and language, so a second request for the same
// language is instant and costs nothing. The app looks in the table first; only when nothing is
// saved does it ask the server function, which is the only thing allowed to write one.
import { getSupabase } from '@/lib/supabase';

/** The two things a person can translate. The transcript tab, or the summary tab. */
export type TranslateKind = 'summary' | 'transcript';

/** The translated words of a Summary tab, in the same order as the original. */
export type SummaryTranslation = {
  overview: string;
  key_points: string[];
  decisions: string[];
  open_questions: string[];
  action_items: { text: string; due: string | null }[];
};

/** The translated words of a transcript: one spoken line, or one pasted paragraph, each. */
export type TranscriptTranslation = { lines: string[] };

export type TranslationContent = SummaryTranslation | TranscriptTranslation;

/** The label that goes on every translated text. CLAUDE.md hard rule 7. */
export const TRANSLATED_LABEL = 'Translated by AI';

/**
 * The version of the translating rules that saved words must have been made by.
 * A translation saved by older rules is treated as if it were not there, so the app asks the
 * server for a new one instead of showing out of date words.
 *
 * This must match PROMPT_VERSION in supabase/functions/translate/translate.ts.
 * __tests__/translate-claude-test.ts keeps the two in step.
 */
export const PROMPT_VERSION = 2;

export const MESSAGES = {
  problem: 'Gyan could not translate this note just now. Please try again.',
  notAllowed: 'You cannot translate this note.',
} as const;

export type TranslateResult =
  | { ok: true; kind: TranslateKind; language: string; content: TranslationContent; reused: boolean }
  | { ok: false; message: string };

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Reads a saved translation back into the shape the screen draws. Anything odd becomes nothing.
 * `checkVersion` is true for words read straight out of the database, which may have been saved a
 * long time ago by older rules. Words that have just come back from the server are already made by
 * today's rules, so they are not checked again.
 */
export function readContent(
  kind: TranslateKind,
  raw: unknown,
  checkVersion = false,
): TranslationContent | undefined {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (checkVersion && row.v !== PROMPT_VERSION) return undefined;

  if (kind === 'transcript') {
    const lines = asStringList(row.lines);
    return lines.length > 0 ? { lines } : undefined;
  }

  if (typeof row.overview !== 'string') return undefined;
  const items = Array.isArray(row.action_items) ? row.action_items : [];
  return {
    overview: row.overview,
    key_points: asStringList(row.key_points),
    decisions: asStringList(row.decisions),
    open_questions: asStringList(row.open_questions),
    action_items: items
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        text: typeof item.text === 'string' ? item.text : '',
        due: typeof item.due === 'string' ? item.due : null,
      })),
  };
}

/**
 * The translation of this note that is already saved, if there is one.
 * This is a plain read, so a translation someone already paid for appears with no server call at
 * all and nothing new to pay.
 */
export async function getSavedTranslation(
  meetingId: string,
  kind: TranslateKind,
  language: string,
): Promise<TranslationContent | undefined> {
  const { data, error } = await getSupabase()
    .from('translations')
    .select('content')
    .eq('meeting_id', meetingId)
    .eq('kind', kind)
    .eq('language', language)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return readContent(kind, data.content, true);
}

/** Asks the server to translate this note's summary or transcript into one language. */
export async function translate(
  meetingId: string,
  kind: TranslateKind,
  language: string,
): Promise<TranslateResult> {
  const { data, error, response } = (await getSupabase().functions.invoke('translate', {
    body: { meeting_id: meetingId, kind, language },
  })) as {
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
    response?: Response;
  };

  if (error) {
    if (response?.status === 403) return { ok: false, message: MESSAGES.notAllowed };
    return { ok: false, message: MESSAGES.problem };
  }

  if (data?.ok === true) {
    const content = readContent(kind, data.content);
    if (!content) return { ok: false, message: MESSAGES.problem };
    return {
      ok: true,
      kind,
      language: typeof data.language === 'string' ? data.language : language,
      content,
      reused: data.reused === true,
    };
  }

  return { ok: false, message: typeof data?.message === 'string' ? data.message : MESSAGES.problem };
}
