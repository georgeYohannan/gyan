import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** The New note tab's own stack. One screen today. */
export default function NewNoteStackLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
