import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { Colors, FontFamily, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

import { Body } from './body';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** An error message. Shows under the field and turns the border red. */
  error?: string;
  disabled?: boolean;
};

/** A labeled text box with focus, disabled, and error looks. */
export function TextField({ label, error, disabled, onFocus, onBlur, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? Colors.dangerBorder : focused ? Colors.brand : Colors.glassBorder;

  return (
    <View style={{ gap: Spacing.one }}>
      <Body small color="textSecondary">
        {label}
      </Body>
      <TextInput
        accessibilityLabel={label}
        editable={!disabled}
        placeholderTextColor={Colors.textSecondary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: MinTouchTarget,
            paddingHorizontal: Spacing.three,
            borderRadius: Radius.panel,
            borderWidth: 1,
            borderColor,
            backgroundColor: Colors.glass,
            color: Colors.text,
            fontFamily: FontFamily.body,
            fontSize: 16,
            opacity: disabled ? 0.5 : 1,
          },
          // Web draws its own outline; our border already shows focus.
          { outlineStyle: 'none' } as object,
        ]}
        {...rest}
      />
      {error ? (
        <Body small color="danger" accessibilityRole="alert">
          {error}
        </Body>
      ) : null}
    </View>
  );
}
