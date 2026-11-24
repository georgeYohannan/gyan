import { useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Text, View } from 'react-native';
import Animated, { FadeOut, runOnJS } from 'react-native-reanimated';

import { Colors, FontFamily, Motion } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';

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
 */
export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const { reduced } = useMotion();

  if (!visible) return null;

  const mark = (
    <Text
      // Not a picture: the wordmark is type, the same type the sidebar uses, so it needs no
      // asset and can never be the wrong logo.
      style={{ fontFamily: FontFamily.heading, fontSize: 40, color: Colors.heading }}>
      gyan
    </Text>
  );

  const fill = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.background,
    zIndex: 100,
  };

  if (!ready) {
    return (
      <View
        style={fill}
        onLayout={() => {
          // Hide the native splash only once this one is really on screen, or there is a
          // frame of nothing in between.
          SplashScreen.hideAsync().finally(() => setReady(true));
        }}>
        {mark}
      </View>
    );
  }

  return (
    <Animated.View
      exiting={FadeOut.duration(reduced ? 0 : Motion.revealMs).withCallback((finished) => {
        'worklet';
        if (finished) runOnJS(setVisible)(false);
      })}
      style={fill}>
      {mark}
    </Animated.View>
  );
}
