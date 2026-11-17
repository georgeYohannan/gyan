import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/**
 * The Home tab holds a stack of screens: Home, then New note or a note on top of it.
 * (A tab marked "hidden" cannot be opened at all, so these screens live in a stack instead.
 * See https://docs.expo.dev/router/advanced/native-tabs/.)
 */
export default function HomeStackLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
