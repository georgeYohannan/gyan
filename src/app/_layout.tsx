import '@/global.css';

import { useEffect } from 'react';

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
import * as Linking from 'expo-linking';
import { DarkTheme, Stack, ThemeProvider, useRouter, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/splash-overlay';
import { Colors, FontFamily } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { peekInviteToken, rememberInviteToken, tokenFromUrl } from '@/lib/invite-link';
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
    // Outermost, and NOT inside (app)/_layout: React Native draws a Modal in its own host, so
    // a gesture inside one only works if this sits above it. It is a plain View on the web.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={GyanTheme}>
        <StatusBar style="light" />
        <AnimatedSplashOverlay />
        <AuthProvider>
          <ProfileProvider>
            <RootNavigator />
          </ProfileProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Catches an invite link before the app can throw it away.
 *
 * Somebody tapping an invite link usually has no Gyan login yet, so they are sent straight to
 * the sign up screen and the address they arrived at is lost. This watches the address the app
 * was opened with and puts the token away first, so it is still there afterwards.
 */
function useInviteLink(session: unknown) {
  const url = Linking.useURL();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const token = tokenFromUrl(url);
      if (token) {
        // The address itself is the invite link, so the app is already going to the joining
        // screen. Put the token away in case they have to sign up first, and do NOT send them
        // there as well: that would stack a second copy of the screen on top of the first.
        //
        // Putting it away and reading it back also have to happen in order. As two separate
        // effects the read raced the write and usually won, so the token looked as if it had
        // never arrived at all.
        await rememberInviteToken(token);
        return;
      }
      if (!session) return;
      // No token in the address, but one was put away earlier: they have signed in since
      // tapping the link, so take them to the joining screen now.
      const waiting = await peekInviteToken();
      if (alive && waiting) router.push('/join');
    })();
    return () => {
      alive = false;
    };
  }, [url, session, router]);
}

/** Logged-out people only reach the (auth) screens. Logged-in people only reach (app). */
function RootNavigator() {
  const { session, isLoading } = useAuth();
  useInviteLink(session);
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
