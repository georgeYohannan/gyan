import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, MinTouchTarget, Spacing } from '@/constants/theme';

type TabBarProps<T extends string> = {
  tabs: readonly T[];
  selected: T;
  onSelect: (tab: T) => void;
  /**
   * Start of a stable name for each tab, so tests can press one without knowing its words.
   * "note-tab" gives note-tab-summary, note-tab-transcript, note-tab-chat.
   */
  testIDPrefix?: string;
};

/**
 * A row of tabs with a line under the chosen one.
 *
 * They were pills, which is what every other pressable thing in Gyan is -- so a row of them
 * read as a row of buttons rather than as where you are in a document. A tab is not a button:
 * pressing it does not DO anything, it changes what you are looking at. An underline is the
 * oldest way of saying that and still the clearest.
 *
 * The line is brand blue, which is allowed and deliberate: it is a 2 point rule, never a word.
 * The chosen tab's LABEL is plain white, because `__tests__/theme-test.ts` proves brand blue
 * fails the contrast rule as text on navy.
 */
export function TabBar<T extends string>({ tabs, selected, onSelect, testIDPrefix }: TabBarProps<T>) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap' }}>
      {tabs.map((tab) => {
        const isSelected = tab === selected;
        return (
          <Pressable
            key={tab}
            testID={testIDPrefix ? `${testIDPrefix}-${tab.toLowerCase().replace(/\s+/g, '-')}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={tab}
            accessibilityState={{ selected: isSelected }}
            // Phones read accessibilityState; the web reads aria-selected. Both are needed.
            aria-selected={isSelected}
            onPress={() => onSelect(tab)}
            style={{
              minHeight: MinTouchTarget,
              justifyContent: 'center',
              paddingHorizontal: Spacing.two,
              borderBottomWidth: 2,
              borderBottomColor: isSelected ? Colors.brand : 'transparent',
            }}>
            <Body color={isSelected ? 'text' : 'textSecondary'} weight={isSelected ? 'semibold' : 'regular'}>
              {tab}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}
