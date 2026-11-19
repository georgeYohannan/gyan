/**
 * The pieces a translation is drawn with: the language picker, the "Translated by AI" bar, and the
 * text itself, which has to pick the right font and read the right way round.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { LanguagePicker } from '@/components/notes/language-picker';
import { TranslationBar } from '@/components/notes/translation-bar';
import { fontForLanguage, ScriptText, styleForLanguage } from '@/components/ui/script-text';
import { languageFor, LANGUAGES } from '@/constants/languages';
import { FontFamily, Motion } from '@/constants/theme';
import { TRANSLATED_LABEL } from '@/lib/translations';

describe('the language picker', () => {
  const open = async (over: Record<string, unknown> = {}) => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    await render(
      <LanguagePicker
        title="Your language"
        hint="Gyan writes your summaries in this language."
        selected="en"
        visible
        onPick={onPick}
        onClose={onClose}
        {...over}
      />,
    );
    return { onPick, onClose };
  };

  test('it shows every language, with its own name first', async () => {
    await open();
    expect(screen.getByText('Español')).toBeTruthy();
    expect(screen.getByText('हिन्दी')).toBeTruthy();
    expect(screen.getByText('العربية')).toBeTruthy();
    expect(screen.getByText('日本語')).toBeTruthy();
    expect(screen.getByText('Français')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(LANGUAGES.length);
  });

  test('the language already chosen is marked as chosen', async () => {
    await open({ selected: 'hi' });
    expect(screen.getByRole('radio', { name: 'Hindi, हिन्दी' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('radio', { name: 'Spanish, Español' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  test('tapping a language gives back its code', async () => {
    const { onPick } = await open();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Arabic, العربية' }));
    });
    expect(onPick).toHaveBeenCalledWith('ar');
  });

  test('while one is being fetched, the list cannot be tapped again', async () => {
    const { onPick } = await open({ busyCode: 'ja' });
    expect(screen.getByText('Translating…')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Spanish, Español' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Spanish, Español' }));
    });
    expect(onPick).not.toHaveBeenCalled();
  });

  test('Close closes it', async () => {
    const { onClose } = await open();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  test('it goes away when it is no longer wanted', async () => {
    jest.useFakeTimers();
    const view = await render(
      <LanguagePicker title="Your language" hint="h" selected="en" visible onPick={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByText('Español')).toBeTruthy();
    await act(async () => {
      view.rerender(
        <LanguagePicker
          title="Your language"
          hint="h"
          selected="en"
          visible={false}
          onPick={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });
    await act(async () => jest.advanceTimersByTime(Motion.revealMs + 50));
    expect(screen.queryByText('Español')).toBeNull();
    jest.useRealTimers();
  });
});

describe('the "Translated by AI" bar', () => {
  const bar = (over: Record<string, unknown> = {}) =>
    render(
      <TranslationBar
        language="es"
        showing
        onToggle={jest.fn()}
        onClear={jest.fn()}
        {...over}
      />,
    );

  test('every translation says it was translated by AI, and offers the original', async () => {
    await bar();
    expect(screen.getByText(TRANSLATED_LABEL)).toBeTruthy();
    // And it answers the question people actually have about a translation.
    expect(screen.getByText('Spanish. Names, numbers and times are unchanged.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show original' })).toBeTruthy();
  });

  test('with the original on screen, it offers the translation back', async () => {
    await bar({ showing: false });
    expect(screen.getByText('Showing the original')).toBeTruthy();
    expect(screen.getByText('Your Spanish translation is saved.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show translation' })).toBeTruthy();
    // The label only belongs on translated words, so it is not here.
    expect(screen.queryByText(TRANSLATED_LABEL)).toBeNull();
  });

  test('the toggle works both ways', async () => {
    const onToggle = jest.fn();
    await bar({ onToggle });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Show original' }));
    });
    expect(onToggle).toHaveBeenCalled();
  });

  test('while it is working it says which language, and no label yet', async () => {
    await bar({ busy: true, language: 'ja' });
    expect(screen.getByLabelText('Translating into Japanese')).toBeTruthy();
    expect(screen.getByText('Translating into Japanese…')).toBeTruthy();
    expect(screen.queryByText(new RegExp(TRANSLATED_LABEL))).toBeNull();
  });

  test('a problem shows a plain sentence and a way to hide it', async () => {
    const onClear = jest.fn();
    await bar({ error: 'Gyan could not translate this note just now. Please try again.', onClear });
    expect(screen.getByText(/could not translate this note/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Hide' }));
    });
    expect(onClear).toHaveBeenCalled();
  });
});

describe('drawing text in any language', () => {
  test('Latin and Cyrillic use our own body font', () => {
    expect(fontForLanguage(languageFor('es'))).toBe(FontFamily.body);
    expect(fontForLanguage(languageFor('fr'))).toBe(FontFamily.body);
    expect(fontForLanguage(languageFor('ru'))).toBe(FontFamily.body);
    expect(fontForLanguage(languageFor('es'), true)).toBe(FontFamily.bodySemiBold);
  });

  test('Arabic and Hindi use the IBM Plex family made for their letters', () => {
    expect(fontForLanguage(languageFor('ar'))).toBe(FontFamily.arabic);
    expect(fontForLanguage(languageFor('ar'), true)).toBe(FontFamily.arabicSemiBold);
    expect(fontForLanguage(languageFor('hi'))).toBe(FontFamily.devanagari);
    expect(fontForLanguage(languageFor('hi'), true)).toBe(FontFamily.devanagariSemiBold);
  });

  test('Japanese names NO font, so the device uses its own and never shows empty boxes', () => {
    expect(fontForLanguage(languageFor('ja'))).toBeUndefined();
    expect(fontForLanguage(languageFor('zh'))).toBeUndefined();
    expect(fontForLanguage(languageFor('ko'))).toBeUndefined();
  });

  test('Arabic lines up on the right; every other language on the left', () => {
    expect(styleForLanguage(languageFor('ar')).textAlign).toBe('right');
    expect(styleForLanguage(languageFor('es')).textAlign).toBe('left');
    expect(styleForLanguage(languageFor('ja')).textAlign).toBe('left');
  });

  test('on an iPhone, Arabic also sets the writing direction', () => {
    const before = Platform.OS;
    // writingDirection is an iPhone-only setting, so it is only sent there.
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    expect(styleForLanguage(languageFor('ar')).writingDirection).toBe('rtl');
    expect(styleForLanguage(languageFor('es')).writingDirection).toBeUndefined();
    Object.defineProperty(Platform, 'OS', { value: before, configurable: true });
  });

  test('on the web, the direction is said out loud on the text itself', async () => {
    // A Text inside another Text does not inherit the browser's automatic direction, so the web
    // needs it spelled out. Phones use the style above instead.
    const before = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      await render(<ScriptText language="ar">مرحبا</ScriptText>);
      expect(screen.getByText('مرحبا').props.dir).toBe('rtl');
      await render(<ScriptText language="es">Hola</ScriptText>);
      expect(screen.getByText('Hola').props.dir).toBe('ltr');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: before, configurable: true });
    }
  });

  test('on a phone, no web-only direction is sent', async () => {
    const before = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await render(<ScriptText language="ar">مرحبا</ScriptText>);
      expect(screen.getByText('مرحبا').props.dir).toBeUndefined();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: before, configurable: true });
    }
  });

  test('the words themselves are drawn exactly as they came', async () => {
    for (const words of ['Hola a todos', 'नमस्ते सब लोग', 'مرحبا بكم', 'ご参加ありがとうございます']) {
      await render(<ScriptText language="es">{words}</ScriptText>);
      expect(screen.getByText(words)).toBeTruthy();
    }
  });
});
