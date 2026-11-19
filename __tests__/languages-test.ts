/**
 * The list of languages exists in 3 places: the app, the chat server function, and the translate
 * server function. If they ever drifted, a person could pick a language the server cannot name in
 * its prompt, and the answer would quietly come back in English. These tests keep all 3 in step.
 */
import { languageName as nameInChat } from '../supabase/functions/chat/chat';
import { LANGUAGE_NAMES, languageName as nameInTranslate } from '../supabase/functions/translate/translate';
import { baseCode, DEFAULT_LANGUAGE, LANGUAGES, languageFor, languageName, sameLanguage } from '@/constants/languages';

describe('the list of languages', () => {
  test('the app and the two server functions know exactly the same languages', () => {
    const inApp = LANGUAGES.map((l) => l.code).sort();
    const onServer = Object.keys(LANGUAGE_NAMES).sort();
    expect(inApp).toEqual(onServer);
  });

  test('every language the app offers can be named by both server functions', () => {
    for (const language of LANGUAGES) {
      // A code the server does not know is passed straight through, so the name would equal the
      // code. Getting a real name back proves the server knows it.
      expect(nameInChat(language.code)).toBe(language.name);
      expect(nameInTranslate(language.code)).toBe(language.name);
      expect(nameInChat(language.code)).not.toBe(language.code);
    }
  });

  test('every language has a name in its own letters, and no two share a code', () => {
    const codes = new Set<string>();
    for (const language of LANGUAGES) {
      expect(language.code).toMatch(/^[a-z]{2}$/);
      expect(language.name.length).toBeGreaterThan(2);
      expect(language.nativeName.length).toBeGreaterThan(0);
      expect(codes.has(language.code)).toBe(false);
      codes.add(language.code);
    }
    expect(codes.size).toBe(LANGUAGES.length);
  });

  test('the 5 test languages are all there, with the right script and direction', () => {
    expect(languageFor('es')).toMatchObject({ nativeName: 'Español', script: 'plex', rtl: false });
    expect(languageFor('fr')).toMatchObject({ nativeName: 'Français', script: 'plex', rtl: false });
    expect(languageFor('hi')).toMatchObject({ nativeName: 'हिन्दी', script: 'devanagari', rtl: false });
    expect(languageFor('ar')).toMatchObject({ nativeName: 'العربية', script: 'arabic', rtl: true });
    expect(languageFor('ja')).toMatchObject({ nativeName: '日本語', script: 'system', rtl: false });
  });

  test('Arabic is the only language that reads right to left', () => {
    expect(LANGUAGES.filter((l) => l.rtl).map((l) => l.code)).toEqual(['ar']);
  });

  test('Japanese, Chinese and Korean use the device’s own font', () => {
    // Their font files are about 17 MB each, far too big to ship inside the app.
    expect(LANGUAGES.filter((l) => l.script === 'system').map((l) => l.code).sort()).toEqual(['ja', 'ko', 'zh']);
  });

  test('everybody starts on English', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(LANGUAGES[0].code).toBe('en');
    expect(languageName(undefined)).toBe('English');
    expect(languageName('made-up')).toBe('English');
  });

  test('a code with a country on the end still finds the language', () => {
    expect(baseCode('pt-BR')).toBe('pt');
    expect(languageName('pt-BR')).toBe('Portuguese');
    expect(sameLanguage('pt-BR', 'pt')).toBe(true);
    expect(sameLanguage('pt', 'es')).toBe(false);
    expect(sameLanguage(null, null)).toBe(false);
    expect(sameLanguage('', 'en')).toBe(false);
  });
});
