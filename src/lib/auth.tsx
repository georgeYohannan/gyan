import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { friendlyAuthError } from '@/lib/auth-errors';
import { getSupabase } from '@/lib/supabase';

/** What a sign up, log in, or log out gives back. `error` is a friendly sentence. */
export type AuthResult = { error?: string; needsConfirmation?: boolean };

type AuthValue = {
  session: Session | null;
  /** True until we know whether the person is already logged in. */
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  /** Sets a new password for the person who is signed in. */
  changePassword: (password: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider />');
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signUp = useCallback<AuthValue['signUp']>(async (email, password) => {
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      // After the person taps the link in the email, send them back to this web address.
      options: Platform.OS === 'web' && typeof window !== 'undefined' ? { emailRedirectTo: window.location.origin } : undefined,
    });
    if (error) return { error: friendlyAuthError(error) };
    // Supabase hides whether an email is taken: an empty identities list means it already has an account.
    if (data.user && data.user.identities?.length === 0) {
      return { error: friendlyAuthError({ code: 'user_already_exists' }) };
    }
    // No session yet means "Confirm email" is on and the person must open the email first.
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback<AuthValue['signIn']>(async (email, password) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    return error ? { error: friendlyAuthError(error) } : {};
  }, []);

  const signOut = useCallback<AuthValue['signOut']>(async () => {
    const { error } = await getSupabase().auth.signOut();
    return error ? { error: friendlyAuthError(error) } : {};
  }, []);

  /**
   * Changes the password of whoever is signed in right now.
   *
   * There is no id and no email here on purpose: Supabase changes the password of the person
   * holding the session, so this can only ever change your own. The old password is not asked
   * for, because being signed in already proved it.
   */
  const changePassword = useCallback<AuthValue['changePassword']>(async (password) => {
    const { error } = await getSupabase().auth.updateUser({ password });
    return error ? { error: friendlyAuthError(error) } : {};
  }, []);

  const value = useMemo(
    () => ({ session, isLoading, signUp, signIn, signOut, changePassword }),
    [session, isLoading, signUp, signIn, signOut, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
