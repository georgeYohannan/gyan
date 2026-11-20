import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { baseCode, DEFAULT_LANGUAGE, languageFor, type Language } from '@/constants/languages';
import { useAuth } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

/**
 * The person's own settings: their name, and the preferred language Gyan writes summaries,
 * action items and chat answers in.
 *
 * Both live in the profiles table, so they are remembered on every device and after a refresh.
 * These are the only two things the app may change about a profile; the database makes sure of
 * that, so is_admin can never be set from here.
 *
 * Settings > Profile is where a person changes them. The language picker also stays on the note
 * page as a shortcut, because that is where people notice they want it.
 */
type ProfileValue = {
  /** The language code, for example 'en'. Always a real code, never empty. */
  languageCode: string;
  /** The same language, with its names and script, ready for the screen. */
  language: Language;
  /** What the person calls themselves. Empty when they have never set one. */
  displayName: string;
  /** True until the saved settings have been read. */
  isLoading: boolean;
  /** Saves a new preferred language. Gives back a friendly sentence if it could not. */
  setLanguage: (code: string) => Promise<{ error?: string }>;
  /** Saves a new name. Gives back a friendly sentence if it could not. */
  setDisplayName: (name: string) => Promise<{ error?: string }>;
};

const SAVE_PROBLEM = 'Gyan could not save your language. Please check your connection and try again.';
const NAME_PROBLEM = 'Gyan could not save your name. Please check your connection and try again.';

/** The most a name may be, so one long enough to break a screen never gets saved. */
export const MAX_NAME_LENGTH = 60;

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
  const [known, setKnown] = useState<{ userId: string; code: string; name: string }>();
  const mine = known && known.userId === userId ? known : undefined;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getSupabase()
      .from('profiles')
      .select('preferred_language, display_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const saved = baseCode(data?.preferred_language as string | undefined);
        setKnown({
          userId,
          code: saved === '' ? DEFAULT_LANGUAGE : saved,
          name: ((data?.display_name as string | undefined) ?? '').trim(),
        });
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
      setKnown({ userId, code: next, name: mine?.name ?? '' });
      const { error } = await getSupabase()
        .from('profiles')
        .update({ preferred_language: next })
        .eq('id', userId);
      if (error) {
        if (before) setKnown(before);
        return { error: SAVE_PROBLEM };
      }
      return {};
    },
    [userId, mine],
  );

  const setDisplayName = useCallback<ProfileValue['setDisplayName']>(
    async (name) => {
      if (!userId) return { error: NAME_PROBLEM };
      const next = name.trim().slice(0, MAX_NAME_LENGTH);
      const before = mine;
      setKnown({ userId, code: mine?.code ?? DEFAULT_LANGUAGE, name: next });
      const { error } = await getSupabase()
        .from('profiles')
        // An empty name is saved as nothing at all, so the server falls back to the part of the
        // address before the @, rather than showing a blank space where a name should be.
        .update({ display_name: next === '' ? null : next })
        .eq('id', userId);
      if (error) {
        if (before) setKnown(before);
        return { error: NAME_PROBLEM };
      }
      return {};
    },
    [userId, mine],
  );

  const languageCode = mine?.code ?? DEFAULT_LANGUAGE;
  const value = useMemo(
    () => ({
      languageCode,
      language: languageFor(languageCode),
      displayName: mine?.name ?? '',
      isLoading: !!userId && mine === undefined,
      setLanguage,
      setDisplayName,
    }),
    [languageCode, userId, mine, setLanguage, setDisplayName],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
