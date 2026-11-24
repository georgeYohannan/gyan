import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** The Ask tab's own stack. One screen today. */
export default function AskStackLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
