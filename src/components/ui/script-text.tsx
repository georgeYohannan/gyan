import { Platform, Text, type TextProps, type TextStyle } from 'react-native';

import { languageFor, type Language } from '@/constants/languages';
import { Colors, FontFamily, Type, type ThemeColor } from '@/constants/theme';

type ScriptTextProps = TextProps & {
  /** The language code the words are in, for example 'ar'. */
  language: string;
  color?: Extract<ThemeColor, 'text' | 'textSecondary' | 'link' | 'danger' | 'success'>;
  small?: boolean;
  /** Slightly heavier, for a short label or a key point. */
  strong?: boolean;
  /**
   * The one paragraph that opens a note, set larger so it is read first and read as prose
   * rather than as another line of detail. One per screen.
   */
  lead?: boolean;
};

/**
 * The font that can draw this language.
 * `undefined` means "use the device's own font", which is what Japanese, Chinese and Korean get.
 * Leaving it unset is deliberate: every phone and browser already ships a font for those scripts,
 * and naming a font that has no letters for them would show empty boxes instead of words.
 */
export function fontForLanguage(language: Language, strong = false): string | undefined {
  if (language.script === 'arabic') return strong ? FontFamily.arabicSemiBold : FontFamily.arabic;
  if (language.script === 'devanagari') return strong ? FontFamily.devanagariSemiBold : FontFamily.devanagari;
  if (language.script === 'system') return undefined;
  return strong ? FontFamily.bodySemiBold : FontFamily.body;
}

/**
 * How a block of text in this language should sit on the page.
 *
 * Right to left is done per block, not for the whole app: the screen around a translation stays
 * in English, and only the translated words read right to left. The three platforms need
 * different things for that:
 *  - every platform: line the paragraph up on the right
 *  - iPhone: `writingDirection`, which is iOS-only
 *  - web: the `dir` prop below, because a Text inside another Text does not inherit 'auto'
 */
export function styleForLanguage(language: Language, strong = false): TextStyle {
  return {
    fontFamily: fontForLanguage(language, strong),
    textAlign: language.rtl ? 'right' : 'left',
    ...(language.rtl && Platform.OS === 'ios' ? { writingDirection: 'rtl' as const } : null),
  };
}

/**
 * Body text in any language. Picks the right font for the script and reads right to left when the
 * language does. Use it for every translated text.
 */
export function ScriptText({ language, color = 'text', small, strong, lead, style, ...rest }: ScriptTextProps) {
  const lang = languageFor(language);
  const size = lead ? Type.heading2 : small ? Type.small : Type.body;
  // On web the direction has to be said out loud; on phones the style above does it.
  const webDir = Platform.OS === 'web' ? ({ dir: lang.rtl ? 'rtl' : 'ltr' } as object) : null;
  return (
    <Text
      style={[{ color: Colors[color], fontSize: size, lineHeight: size * Type.bodyLineHeight }, styleForLanguage(lang, strong), style]}
      {...webDir}
      {...rest}
    />
  );
}
