import '@/global.css';

import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk';
import { DarkTheme, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Colors, FontFamily } from '@/constants/theme';

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
  });

  // Keep the splash screen up until the fonts are ready (or failed, so the app still opens).
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={GyanTheme}>
      <StatusBar style="light" />
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
