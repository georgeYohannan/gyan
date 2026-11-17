import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

type TabBarProps<T extends string> = {
  tabs: readonly T[];
  selected: T;
  onSelect: (tab: T) => void;
};

/** A row of pill tabs. The chosen one is filled glass; the others are outlines. */
export function TabBar<T extends string>({ tabs, selected, onSelect }: TabBarProps<T>) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
      {tabs.map((tab) => {
        const isSelected = tab === selected;
        return (
          <Pressable
            key={tab}
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
            <Body color={isSelected ? 'text' : 'textSecondary'} style={isSelected ? { fontWeight: '600' } : undefined}>
              {tab}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}
