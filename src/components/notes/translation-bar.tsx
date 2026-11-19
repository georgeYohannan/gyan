import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { languageName } from '@/constants/languages';
import { Colors, Spacing } from '@/constants/theme';
import { TRANSLATED_LABEL } from '@/lib/translations';

type TranslationBarProps = {
  /** The language being translated into, for example 'es'. */
  language: string;
  /** true while Gyan is still working on it. */
  busy?: boolean;
  /** A plain sentence when it did not work. */
  error?: string;
  /** false while the original is on screen instead of the translation. */
  showing: boolean;
  onToggle: () => void;
  /** Clears the translation and goes back to the plain note. */
  onClear: () => void;
};

/**
 * The bar above a translated summary or transcript.
 * Every translated text carries the "Translated by AI" label and a way back to the original.
 * That is a rule, not a style choice: see CLAUDE.md and docs/product-spec.md.
 */
export function TranslationBar({ language, busy, error, showing, onToggle, onClear }: TranslationBarProps) {
  const name = languageName(language);

  if (busy) {
    return (
      <GlassPanel accessibilityLabel={`Translating into ${name}`}>
        <Body small color="textSecondary">{`Translating into ${name}…`}</Body>
      </GlassPanel>
    );
  }

  if (error) {
    return (
      <GlassPanel style={{ borderColor: Colors.dangerBorder, backgroundColor: Colors.dangerFill }}>
        <Body small color="danger">
          {error}
        </Body>
        <Button label="Hide" variant="secondary" onPress={onClear} />
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two }}>
        <Body small color="link" style={{ flex: 1, minWidth: 160 }}>
          {showing ? `${name} · ${TRANSLATED_LABEL}` : `${name} translation ready · showing the original`}
        </Body>
        <Button
          label={showing ? 'Show original' : 'Show translation'}
          variant="secondary"
          onPress={onToggle}
        />
      </View>
    </GlassPanel>
  );
}
