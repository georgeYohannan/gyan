import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { recordMyAction } from '@/lib/audit';
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
  /** Sets a new password. The current one is required, so a stolen session cannot do it. */
  changePassword: (password: string, currentPassword: string) => Promise<AuthResult>;
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
  // Read by changePassword, which needs the email but must not be rebuilt every time the
  // session object is replaced.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

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
    if (error) return { error: friendlyAuthError(error) };
    // Write the sign in down. Fire and forget: the record is worth having, and never worth
    // keeping somebody waiting at a sign in screen for. The database refuses a second row
    // for the same person inside a minute, so a retry cannot fill the log.
    void recordMyAction('sign_in');
    return {};
  }, []);

  const signOut = useCallback<AuthValue['signOut']>(async () => {
    const { error } = await getSupabase().auth.signOut();
    return error ? { error: friendlyAuthError(error) } : {};
  }, []);

  /**
   * Changes the password of whoever is signed in right now.
   *
   * There is no id and no email here on purpose: Supabase changes the password of the person
   * holding the session, so this can only ever change your own.
   *
   * THE CURRENT PASSWORD IS ASKED FOR, and that is a change. It used to be enough to be
   * signed in, with the reasoning that signing in had already proved it. That reasoning is
   * wrong once a session can outlive the moment it was made: an unattended laptop turned
   * straight into a full account takeover, because whoever had it could set a new password
   * and lock the real person out.
   *
   * BE CLEAR ABOUT WHAT THIS DOES AND DOES NOT DO TODAY. Supabase takes current_password,
   * but it does not check it unless the project is told to. That was tested, not assumed:
   * a change sent with a deliberately wrong current password SUCCEEDED against the test
   * project. So as things stand this stops somebody sitting at an unattended laptop -- a
   * real and common case -- and does NOT stop somebody who has taken a session token and
   * is calling the server directly.
   *
   * Making it a real lock is one project setting,
   * security_update_password_require_current_password, which is in the hand-over list.
   * Until that is on, this box is a speed bump rather than a lock, and the audit says so.
   */
  const changePassword = useCallback<AuthValue['changePassword']>(async (password, currentPassword) => {
    const email = sessionRef.current?.user.email;
    if (!email) return { error: friendlyAuthError({ code: 'session_not_found' }) };
    const { error } = await getSupabase().auth.updateUser({
      email,
      password,
      // Supabase checks this itself and refuses the change if it is wrong.
      current_password: currentPassword,
    });
    if (!error) return {};
    // Supabase reports a wrong current password the same way it reports a wrong login.
    // On this screen no email was typed, so "that email and password do not match" would
    // be baffling; say which password was wrong.
    const code = error.code === 'invalid_credentials' ? 'wrong_current_password' : error.code;
    return { error: friendlyAuthError({ ...error, code }) };
  }, []);

  const value = useMemo(
    () => ({ session, isLoading, signUp, signIn, signOut, changePassword }),
    [session, isLoading, signUp, signIn, signOut, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
