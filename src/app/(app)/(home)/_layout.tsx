import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/**
 * The Home tab holds a stack: Home, then a note on top of it.
 *
 * New note and Search used to live here too. They are their own destinations now, so they sit
 * in their own groups. A note stays here, because you always arrive at one FROM a list.
 *
 * None of these is a hidden tab, deliberately: a tab marked hidden cannot be navigated to at
 * all, which is what made the New note screen flash and bounce back on iPhone once before
 * (docs/decisions.md, 2026-11-17). Groups in brackets add nothing to the address, so every
 * web address is exactly what it was.
 */
export default function HomeStackLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
