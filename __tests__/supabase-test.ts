import { createSupabaseClient } from '@/lib/supabase';

describe('Supabase client', () => {
  test('builds a client when a URL and public key are given', () => {
    const client = createSupabaseClient('https://example.supabase.co', 'sb_publishable_test');
    expect(typeof client.auth.getSession).toBe('function');
    expect(typeof client.from).toBe('function');
  });

  test('gives a plain-English error when the URL is missing', () => {
    expect(() => createSupabaseClient(undefined, 'key')).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  test('gives a plain-English error when the key is missing', () => {
    expect(() => createSupabaseClient('https://example.supabase.co', '')).toThrow(
      /EXPO_PUBLIC_SUPABASE_KEY/,
    );
  });
});
