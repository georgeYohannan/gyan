import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { baseCode, DEFAULT_LANGUAGE, languageFor, type Language } from '@/constants/languages';
import { useAuth } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

/**
 * The person's own settings. For now that is only their preferred language, which Gyan writes
 * summaries, action items and chat answers in.
 *
 * It lives in the profiles table, so it is remembered on every device and after a refresh. The
 * full Settings screen comes later; until then the picker lives on the note page.
 */
type ProfileValue = {
  /** The language code, for example 'en'. Always a real code, never empty. */
  languageCode: string;
  /** The same language, with its names and script, ready for the screen. */
  language: Language;
  /** True until the saved setting has been read. */
  isLoading: boolean;
  /** Saves a new preferred language. Gives back a friendly sentence if it could not. */
  setLanguage: (code: string) => Promise<{ error?: string }>;
};

const SAVE_PROBLEM = 'Gyan could not save your language. Please check your connection and try again.';

const ProfileContext = createContext<ProfileValue | null>(null);

export function useProfile(): ProfileValue {
  const value = use(ProfileContext);
  if (!value) throw new Error('useProfile must be used inside <ProfileProvider />');
  return value;
}

export function ProfileProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  /**
   * What we know, and whose it is. Keeping the person's id next to the language means a different
   * person logging in never sees the last person's setting, not even for a moment.
   */
  const [known, setKnown] = useState<{ userId: string; code: string }>();
  const mine = known && known.userId === userId ? known.code : undefined;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getSupabase()
      .from('profiles')
      .select('preferred_language')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const saved = baseCode(data?.preferred_language as string | undefined);
        setKnown({ userId, code: saved === '' ? DEFAULT_LANGUAGE : saved });
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const setLanguage = useCallback<ProfileValue['setLanguage']>(
    async (code) => {
      if (!userId) return { error: SAVE_PROBLEM };
      const next = baseCode(code) || DEFAULT_LANGUAGE;
      const before = mine;
      // Show it straight away, then put it back if saving fails, so the screen never lies.
      setKnown({ userId, code: next });
      const { error } = await getSupabase()
        .from('profiles')
        .update({ preferred_language: next })
        .eq('id', userId);
      if (error) {
        if (before) setKnown({ userId, code: before });
        return { error: SAVE_PROBLEM };
      }
      return {};
    },
    [userId, mine],
  );

  const languageCode = mine ?? DEFAULT_LANGUAGE;
  const value = useMemo(
    () => ({
      languageCode,
      language: languageFor(languageCode),
      isLoading: !!userId && mine === undefined,
      setLanguage,
    }),
    [languageCode, userId, mine, setLanguage],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
