import { useMemo } from 'react';
import { Easing, useReducedMotion } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

const easing = Easing.bezier(...Motion.easing);

/**
 * Animation settings that respect the phone's "reduce motion" setting.
 * When reduce motion is on, every duration is 0, so changes happen at once.
 */
export function useMotion() {
  const reduced = useReducedMotion();
  return useMemo(
    () => ({
      reduced,
      /** Small interactions: press, focus. */
      ui: { duration: reduced ? 0 : Motion.uiMs, easing },
      /** Things that appear: panels, sheets. */
      reveal: { duration: reduced ? 0 : Motion.revealMs, easing },
    }),
    [reduced],
  );
}
