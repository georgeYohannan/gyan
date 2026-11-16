import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** Screens for people who are not logged in. No tab bar here. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
