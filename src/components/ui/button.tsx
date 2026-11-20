import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Colors, FontFamily, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';

export type ButtonVariant = 'primary' | 'secondary' | 'record';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /** Show the pressed look without touching it. Used on the /design page. */
  forcePressed?: boolean;
  /** Primary buttons glow by default. Turn off when a screen already has its one glowing focal point. */
  glow?: boolean;
};

const look = {
  primary: { bg: Colors.brand, border: Colors.brand, text: Colors.heading },
  secondary: { bg: Colors.glass, border: Colors.glassBorder, text: Colors.heading },
  record: { bg: Colors.record, border: Colors.record, text: Colors.onRecord },
} as const;

/**
 * A button that cannot be pressed stops looking like one, whatever it normally looks like.
 *
 * Fading a blue button leaves a washed out blue button with a label nobody can read: it looks
 * broken rather than unavailable, and the words drop under the contrast we promise. So a button
 * that is off goes quiet instead, with a label that can still be read.
 */
const OFF = { bg: Colors.glass, border: Colors.glassBorder, text: Colors.textSecondary } as const;

/** Pill button. Primary glows blue, secondary is glass, record is orange. */
export function Button({ label, variant = 'primary', loading, disabled, forcePressed, glow: glowProp = true, onPress, ...rest }: ButtonProps) {
  const { ui } = useMotion();
  const [pressedIn, setPressedIn] = useState(false);
  const pressed = forcePressed || pressedIn;
  const off = disabled || loading;
  const v = off ? OFF : look[variant];
  const glow = variant === 'primary' && glowProp && !off;

  const scale = useSharedValue(1);
  const shrink = pressed && !off;
  useEffect(() => {
    scale.set(withTiming(shrink ? 0.97 : 1, ui));
  }, [shrink, ui, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      onPressIn={() => setPressedIn(true)}
      onPressOut={() => setPressedIn(false)}
      {...rest}>
      <Animated.View
        style={[
          {
            minHeight: MinTouchTarget,
            minWidth: MinTouchTarget,
            paddingHorizontal: Spacing.four,
            borderRadius: Radius.pill,
            borderWidth: 1,
            borderColor: v.border,
            backgroundColor: v.bg,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: Spacing.two,
            opacity: pressed && !off ? 0.85 : 1,
          },
          glow && {
            boxShadow: `0 0 ${pressed ? 32 : 24}px ${Colors.glow}`,
          },
          animated,
        ]}>
        {loading ? <ActivityIndicator color={v.text} /> : null}
        <Text style={{ color: v.text, fontFamily: FontFamily.bodySemiBold, fontSize: 16 }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
