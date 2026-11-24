import { View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { Body } from '@/components/ui/body';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';

/**
 * Ask: questions across every note.
 *
 * `docs/product-spec.md` feature 5 promises asking "about this note or all notes". The
 * per-note half shipped in prompt 7; this is the other half, and it is NOT built yet.
 *
 * It is a real destination from today rather than a tab that appears later, so the shape of
 * the app stops changing under people. What it says is the truth: not ready, and what to do
 * meanwhile. An empty screen is an invitation to act, not an apology.
 */
export default function AskScreen() {
  return (
    <Screen testID="ask-screen">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: Spacing.three,
        }}>
        <View style={{ flex: 1 }}>
          <Heading level={1}>Ask</Heading>
        </View>
        {/* The help entry and its picture arrive with the feature. Until then this
            draws nothing, which is better than a ? that explains an empty screen. */}
        <HelpButton helpId="ask" />
      </View>

      <GlassPanel>
        <Heading level={3}>Not ready yet</Heading>
        <Body color="textSecondary">
          Asking questions across every note is still being built. You can already ask about one
          note: open it and choose Chat.
        </Body>
      </GlassPanel>
    </Screen>
  );
}
