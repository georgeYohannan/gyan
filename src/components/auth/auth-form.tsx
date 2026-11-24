import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { looksLikeEmail, MIN_PASSWORD_LENGTH } from '@/lib/auth-errors';

type Mode = 'sign-up' | 'log-in';

const words = {
  'sign-up': {
    title: 'Create your account',
    intro: 'Free to start. You get 5 meetings a month.',
    button: 'Sign up',
    helpId: 'signUp',
    switchText: 'Already have an account?',
    switchLabel: 'Log in',
    switchHref: '/log-in',
    passwordHint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
  },
  'log-in': {
    title: 'Welcome back',
    intro: 'Log in to see your notes.',
    button: 'Log in',
    helpId: 'logIn',
    switchText: 'New to Gyan?',
    switchLabel: 'Sign up',
    switchHref: '/sign-up',
    passwordHint: undefined,
  },
} as const;

/** The email and password form shared by the Sign up and Log in screens. */
export function AuthForm({
  mode,
  /**
   * Something to say before anybody types, such as why they are looking at this screen
   * again. It seeds the same line that a sent confirmation email uses, rather than adding a
   * second one, so the screen never shows two notices at once.
   */
  notice: openingNotice,
}: {
  mode: Mode;
  notice?: string;
}) {
  const w = words[mode];
  const { signUp, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string | undefined>(openingNotice);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormError(undefined);
    setNotice(undefined);
    const emailProblem = looksLikeEmail(email) ? undefined : 'Enter your email, like name@example.com.';
    const passwordProblem =
      mode === 'sign-up' && password.length < MIN_PASSWORD_LENGTH
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
        : password.length === 0
          ? 'Enter your password.'
          : undefined;
    setEmailError(emailProblem);
    setPasswordError(passwordProblem);
    if (emailProblem || passwordProblem) return;

    setBusy(true);
    const result = mode === 'sign-up' ? await signUp(email, password) : await signIn(email, password);
    setBusy(false);

    if (result.error) setFormError(result.error);
    else if (result.needsConfirmation) {
      setNotice('Almost done. We sent a link to your email. Open it, then come back and log in.');
    }
    // Otherwise the person is now logged in and the app moves them to Home by itself.
  }

  return (
    <Screen testID={`auth-screen-${mode}`}>
      {/* The title IS this screen's focal point. There is one thing to do here, and three
          words set large say what it is faster than any panel around them could. */}
      <PageHeader display title={w.title} lead={w.intro} helpId={w.helpId} />

      <GlassPanel style={{ gap: Spacing.three }}>
        <TextField
          testID="auth-email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="name@example.com"
        />
        <TextField
          testID="auth-password"
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
          onSubmitEditing={submit}
        />
        {w.passwordHint ? (
          <Body small color="textSecondary">
            {w.passwordHint}
          </Body>
        ) : null}
        {formError ? (
          <Body small color="danger" accessibilityRole="alert">
            {formError}
          </Body>
        ) : null}
        {notice ? (
          <Body small color="success" accessibilityRole="alert">
            {notice}
          </Body>
        ) : null}
        <Button testID="auth-submit" label={w.button} loading={busy} onPress={submit} />
      </GlassPanel>

      <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
        <Body color="textSecondary">{w.switchText}</Body>
        <Link testID="auth-switch-mode" href={w.switchHref} accessibilityRole="link">
          <Body color="link">{w.switchLabel}</Body>
        </Link>
      </View>
    </Screen>
  );
}
