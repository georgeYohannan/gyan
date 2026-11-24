import { Pressable, ScrollView, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Heading } from '@/components/ui/heading';
import { SlidePanel } from '@/components/ui/slide-panel';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

export type ActionItem = {
  testID: string;
  title: string;
  /** What this does, or -- when it cannot be done yet -- why not. */
  summary: string;
  accessibilityLabel: string;
  enabled: boolean;
  onPress: () => void;
};

/**
 * A short list of things you can do, in a panel that comes in over the page.
 *
 * Two places use it. The note page puts Language, Translate and Send recap behind one "More",
 * because that line used to carry six things and pushed the page sideways on a phone. A note
 * row on Home puts Share and Delete behind one "..." -- which is also the way anybody who is
 * not swiping reaches those two.
 *
 * A row that cannot be used yet is not simply greyed out: it says why in its own line, which
 * is the one thing a disabled button can never do.
 */
export function ActionMenu({
  visible,
  onClose,
  title,
  testIDPrefix,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  /** What this menu is about: "More", or the name of the note it belongs to. */
  title: string;
  testIDPrefix: string;
  items: ActionItem[];
}) {
  return (
    <SlidePanel visible={visible} onClose={onClose} label={title} testIDPrefix={testIDPrefix}>
      <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }}>
        <Heading level={3}>{title}</Heading>

        <View>
          {items.map((item, i) => (
            <View key={item.testID}>
              <Pressable
                testID={item.testID}
                accessibilityRole="button"
                accessibilityLabel={item.accessibilityLabel}
                accessibilityState={{ disabled: !item.enabled }}
                disabled={!item.enabled}
                onPress={item.onPress}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing.three,
                  minHeight: MinTouchTarget,
                  paddingVertical: Spacing.three,
                  paddingHorizontal: Spacing.three,
                  borderRadius: Radius.panel,
                  opacity: item.enabled ? 1 : 0.6,
                  backgroundColor: pressed ? Colors.backgroundSelected : 'transparent',
                })}>
                <View style={{ flex: 1, gap: Spacing.half }}>
                  <Body color={item.enabled ? 'text' : 'textSecondary'}>{item.title}</Body>
                  <Body small color="textSecondary">
                    {item.summary}
                  </Body>
                </View>
                {item.enabled ? <Body color="textSecondary">{'›'}</Body> : null}
              </Pressable>
              {i === items.length - 1 ? null : (
                <View style={{ height: 1, marginHorizontal: Spacing.three, backgroundColor: Colors.glassBorder }} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </SlidePanel>
  );
}
