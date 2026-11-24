import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

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

/** A row of pill tabs. The chosen one is filled glass; the others are outlines. */
export function TabBar<T extends string>({ tabs, selected, onSelect, testIDPrefix }: TabBarProps<T>) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
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
              paddingHorizontal: Spacing.four,
              borderRadius: Radius.pill,
              borderWidth: 1,
              borderColor: Colors.glassBorder,
              backgroundColor: isSelected ? Colors.backgroundSelected : 'transparent',
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
