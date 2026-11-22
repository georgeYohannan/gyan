import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, FontFamily, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

type SearchFieldProps = {
  value: string;
  onChange: (next: string) => void;
  /** What the box says before anybody types. */
  placeholder?: string;
  /** The label a screen reader reads. There is no visible label: the box explains itself. */
  label?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
};

/**
 * The search box.
 *
 * TextField is the project's labelled input, and a label above a search box would be a label
 * that says what the box already says. So this is a sibling built from the same pieces: the same
 * glass, the same radius, the same brand-blue border on focus. It adds the two things a search
 * box needs and a text field does not: a magnifier, and a way to empty it.
 */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search your notes',
  label = 'Search your notes',
  autoFocus,
  onSubmit,
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        minHeight: MinTouchTarget,
        paddingHorizontal: Spacing.three,
        borderRadius: Radius.panel,
        borderWidth: 1,
        borderColor: focused ? Colors.brand : Colors.glassBorder,
        backgroundColor: Colors.glass,
        // The one glow on the screen, and only while somebody is actually typing in it.
        ...(focused
          ? {
              shadowColor: Colors.glow,
              shadowOpacity: 1,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 0 },
            }
          : {}),
      }}>
      <Body color="textSecondary" accessibilityElementsHidden>
        {'⌕'}
      </Body>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          {
            flex: 1,
            paddingVertical: Spacing.two,
            color: Colors.text,
            fontFamily: FontFamily.body,
            fontSize: 16,
          },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {},
        ]}
      />
      {value !== '' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear the search"
          onPress={() => onChange('')}
          hitSlop={Spacing.two}
          style={({ pressed }) => ({
            width: 28,
            height: 28,
            borderRadius: Radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? Colors.backgroundSelected : 'transparent',
          })}>
          <Body color="textSecondary" accessibilityElementsHidden>
            {'✕'}
          </Body>
        </Pressable>
      ) : null}
    </View>
  );
}
