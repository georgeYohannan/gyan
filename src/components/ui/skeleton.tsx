import { useEffect } from 'react';
import { type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Radius } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';

type SkeletonProps = { width?: DimensionValue; height?: number };

/** A gray placeholder block that gently pulses while content loads. Still when reduce motion is on. */
export function Skeleton({ width = '100%', height = 16 }: SkeletonProps) {
  const { reduced } = useMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      opacity.set(1);
      return;
    }
    opacity.set(withRepeat(
      withSequence(
        withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    ));
  }, [reduced, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[{ width, height, borderRadius: Radius.pill, backgroundColor: Colors.skeleton }, style]}
    />
  );
}
