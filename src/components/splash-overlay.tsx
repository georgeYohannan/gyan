import { useCallback, useEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Colors, FontFamily, Type } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';

/** If the layout pass never arrives, go anyway rather than sit on a navy screen. */
const BACKSTOP_MS = 1000;

/**
 * The first thing anybody sees: the Gyan name on navy, which fades once the app is ready.
 *
 * It replaces an Expo starter animation that showed the EXPO logo on a bright blue background
 * (#208AEF, with a #3C9FFE to #0274DF gradient and a glow rotating 7200 degrees over four
 * minutes). None of those colours is in the palette, and it was the very first impression the
 * product made.
 *
 * The whole thing is one fade, and it is the only piece of motion in Gyan that nobody asked
 * for -- which is exactly why it is one move and not three. With reduce motion turned on there
 * is no fade at all: the overlay simply goes.
 *
 * The native splash underneath it is configured in app.json and uses the same navy, so there
 * is no flash between the two.
 *
 * TWO THINGS HERE ARE LOAD-BEARING, and the first version of this file got both wrong.
 *
 * 1. The fade is driven by a shared value, NOT by Reanimated's `exiting` prop. An `exiting`
 *    animation runs when a PARENT takes the view away; a view cannot use it to take itself
 *    away, because the animation that would tell it to leave never starts. The first version
 *    did exactly that, so the overlay stayed on screen for ever.
 * 2. It never takes a tap. A splash is not something anybody presses, and while this one sat
 *    there invisible it swallowed every click in the app -- which is how the mistake above
 *    showed up: 168 browser scripts all failed at once saying "gyan intercepts pointer
 *    events". `pointerEvents="none"` means that can never happen again, however the fade goes.
 */
export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);
  const { reveal } = useMotion();
  const opacity = useSharedValue(1);
  const started = useRef(false);

  const gone = useCallback(() => setVisible(false), []);

  const begin = useCallback(() => {
    if (started.current) return;
    started.current = true;
    // Hide the native splash only once this one is really on screen, or there is a frame of
    // nothing in between. Either way the fade starts: a failure here must not trap anybody.
    SplashScreen.hideAsync().finally(() => {
      opacity.set(
        withTiming(0, reveal, (finished) => {
          'worklet';
          if (finished) runOnJS(gone)();
        }),
      );
    });
  }, [gone, opacity, reveal]);

  useEffect(() => {
    const timer = setTimeout(begin, BACKSTOP_MS);
    return () => clearTimeout(timer);
  }, [begin]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={begin}
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors.background,
          zIndex: 100,
        },
        fade,
      ]}>
      <Text
        // Not a picture: the wordmark is type, the same type the sidebar uses, so it needs no
        // asset and can never be the wrong logo.
        style={{ fontFamily: FontFamily.heading, fontSize: Type.display, color: Colors.heading }}>
        gyan
      </Text>
    </Animated.View>
  );
}
