import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * Makes a Supabase client. Only ever pass the PUBLIC key (the "publishable" or "anon" key).
 * Never put the secret "service_role" key in app code.
 */
export function createSupabaseClient(url?: string, publicKey?: string): SupabaseClient {
  if (!url || !publicKey) {
    throw new Error(
      'Supabase is not set up. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY to your .env.local file, then restart the app.',
    );
  }

  // On the server (web pre-rendering) there is no browser storage, so skip it there.
  const hasStorage = Platform.OS !== 'web' || typeof window !== 'undefined';

  return createClient(url, publicKey, {
    auth: {
      storage: hasStorage ? AsyncStorage : undefined,
      autoRefreshToken: true,
      persistSession: hasStorage,
      detectSessionInUrl: false,
    },
  });
}

let client: SupabaseClient | undefined;

/** The one shared client. It is made the first time it is needed. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    // Expo only fills in these values when they are written exactly like this.
    client = createSupabaseClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_KEY,
    );

    // Refresh the login only while the app is on screen.
    if (Platform.OS !== 'web') {
      AppState.addEventListener('change', (state) => {
        if (state === 'active') client?.auth.startAutoRefresh();
        else client?.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}
