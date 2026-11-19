import '@/global.css';

import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import {
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-devanagari';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk';
import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors, FontFamily } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ProfileProvider } from '@/lib/profile';

SplashScreen.preventAutoHideAsync();

/** Navigation colors, so no white flashes appear between screens. */
const GyanTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.link,
    background: Colors.background,
    card: Colors.backgroundElement,
    text: Colors.text,
    border: Colors.glassBorder,
    notification: Colors.record,
  },
};

export default function TabLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [FontFamily.heading]: SchibstedGrotesk_700Bold,
    [FontFamily.body]: IBMPlexSans_400Regular,
    [FontFamily.bodyMedium]: IBMPlexSans_500Medium,
    [FontFamily.bodySemiBold]: IBMPlexSans_600SemiBold,
    // For translations into Arabic and Hindi. See the note on FontFamily in theme.ts.
    [FontFamily.arabic]: IBMPlexSansArabic_400Regular,
    [FontFamily.arabicSemiBold]: IBMPlexSansArabic_600SemiBold,
    [FontFamily.devanagari]: IBMPlexSansDevanagari_400Regular,
    [FontFamily.devanagariSemiBold]: IBMPlexSansDevanagari_600SemiBold,
  });

  // Keep the splash screen up until the fonts are ready (or failed, so the app still opens).
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={GyanTheme}>
      <StatusBar style="light" />
      <AnimatedSplashOverlay />
      <AuthProvider>
        <ProfileProvider>
          <RootNavigator />
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

/** Logged-out people only reach the (auth) screens. Logged-in people only reach (app). */
function RootNavigator() {
  const { session, isLoading } = useAuth();
  // Wait until we know if the person is already logged in, so there is no flash of the wrong screen.
  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
