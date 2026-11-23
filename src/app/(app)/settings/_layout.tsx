import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/**
 * The Settings tab holds a stack: the list of sections, and a page for each one.
 *
 * Same shape as the Home tab. A tab marked "hidden" cannot be opened at all, so the five
 * section pages live in a stack behind one tab rather than as tabs of their own.
 */
export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
