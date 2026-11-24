import { Pressable, ScrollView, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Heading } from '@/components/ui/heading';
import { SlidePanel } from '@/components/ui/slide-panel';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

export type MoreItem = {
  testID: string;
  title: string;
  /** What this does, or -- when it cannot be done yet -- why not. */
  summary: string;
  accessibilityLabel: string;
  enabled: boolean;
  onPress: () => void;
};

/**
 * Everything on the note page that is not reading it.
 *
 * The note page used to carry two tabs and four round-ended buttons on one line: Language,
 * Translate, Ask and Send recap. On a phone that pushed the page sideways, which
 * docs/decisions.md recorded at the time as a thing to fix. Ask became the third tab, and the
 * other three live here -- so the line above a note is two things now, the tabs and this,
 * instead of six.
 *
 * The rows keep the names the buttons had (`note-language`, `note-translate`,
 * `note-send-recap`), because what they DO has not changed and a name is for the purpose, not
 * the place.
 *
 * A row that cannot be used yet is not simply greyed out: it says why in its own line, which
 * is the one thing a disabled button can never do.
 */
export function NoteMoreMenu({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: MoreItem[];
}) {
  return (
    <SlidePanel visible={visible} onClose={onClose} label="More" testIDPrefix="note-more">
      <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }}>
        <Heading level={3}>More</Heading>

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
