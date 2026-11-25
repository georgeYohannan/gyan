import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Heading } from '@/components/ui/heading';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

type ChoiceCardProps = {
  title: string;
  description: string;
  onPress?: () => void;
  /** Turns the card off. Shows `disabledLabel` (such as "Coming soon"). */
  disabled?: boolean;
  disabledLabel?: string;
  selected?: boolean;
  /** A stable name for tests, so a visual change does not break them. */
  testID?: string;
};

/** One of the 4 ways to add a note. */
export function ChoiceCard({
  title,
  description,
  onPress,
  disabled,
  disabledLabel,
  selected,
  testID,
}: ChoiceCardProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={disabled && disabledLabel ? `${title}, ${disabledLabel}` : title}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MinTouchTarget,
        padding: Spacing.three,
        gap: Spacing.one,
        borderRadius: Radius.panel,
        borderWidth: 1,
        borderColor: selected ? Colors.brand : Colors.glassBorder,
        backgroundColor: selected || pressed ? Colors.backgroundSelected : Colors.glass,
        opacity: disabled ? 0.6 : 1,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }}>
        <Heading level={3}>{title}</Heading>
        {disabled && disabledLabel ? (
          <View
            style={{
              borderRadius: Radius.pill,
              borderWidth: 1,
              borderColor: Colors.glassBorder,
              paddingHorizontal: Spacing.three,
              paddingVertical: Spacing.one,
            }}>
            <Body small color="textSecondary">
              {disabledLabel}
            </Body>
          </View>
        ) : null}
      </View>
      <Body small color="textSecondary">
        {description}
      </Body>
    </Pressable>
  );
}
