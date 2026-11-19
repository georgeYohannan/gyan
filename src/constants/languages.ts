/**
 * The languages Gyan offers, for the preferred-language setting and for Translate.
 *
 * `nativeName` is how the language writes its own name, so a person who does not read English
 * can still find their language in the list.
 *
 * `script` says which font can draw it:
 *  - 'plex'       IBM Plex Sans, our body font. It covers Latin, Cyrillic and Greek.
 *  - 'arabic'     IBM Plex Sans Arabic, loaded alongside it.
 *  - 'devanagari' IBM Plex Sans Devanagari, loaded alongside it.
 *  - 'system'     The phone's or browser's own font. Used for Japanese, Chinese and Korean,
 *                 whose font files are far too big to ship inside the app (17 MB) for one
 *                 language each. Every device already has one, so the words still read correctly.
 *
 * This list must hold the same codes as LANGUAGE_NAMES in supabase/functions/translate/translate.ts
 * and supabase/functions/chat/chat.ts. __tests__/languages-test.ts keeps them in step.
 */
export type LanguageScript = 'plex' | 'arabic' | 'devanagari' | 'system';

export type Language = {
  /** The code saved in the database, for example 'es'. */
  code: string;
  /** The English name, for example 'Spanish'. */
  name: string;
  /** The name in its own language, for example 'Español'. */
  nativeName: string;
  script: LanguageScript;
  /** true when the language is written right to left. */
  rtl: boolean;
};

export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', script: 'plex', rtl: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', script: 'plex', rtl: false },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'devanagari', rtl: false },
  { code: 'fr', name: 'French', nativeName: 'Français', script: 'plex', rtl: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', script: 'arabic', rtl: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', script: 'system', rtl: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', script: 'plex', rtl: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', script: 'plex', rtl: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', script: 'plex', rtl: false },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', script: 'plex', rtl: false },
  { code: 'ko', name: 'Korean', nativeName: '한국어', script: 'system', rtl: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文', script: 'system', rtl: false },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', script: 'plex', rtl: false },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', script: 'plex', rtl: false },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', script: 'plex', rtl: false },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', script: 'plex', rtl: false },
] as const;

/** The language everybody starts on. The database column has the same default. */
export const DEFAULT_LANGUAGE = 'en';

/** 'en-GB' -> 'en'. The database stores plain codes, but be forgiving about what comes back. */
export function baseCode(code: string | null | undefined): string {
  return (code ?? '').toLowerCase().split('-')[0];
}

/** The language for a code, or English when the code is unknown. */
export function languageFor(code: string | null | undefined): Language {
  const key = baseCode(code);
  return LANGUAGES.find((l) => l.code === key) ?? LANGUAGES[0];
}

/** 'es' -> 'Spanish'. Used in buttons and labels. */
export function languageName(code: string | null | undefined): string {
  return languageFor(code).name;
}

/** true when two codes mean the same language, ignoring any country part. */
export function sameLanguage(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = baseCode(a);
  return left !== '' && left === baseCode(b);
}
