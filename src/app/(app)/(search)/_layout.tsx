import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** The Search tab's own stack. One screen today; it keeps its place when you come back. */
export default function SearchStackLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
