import { useLocalSearchParams } from 'expo-router';

import { AuthForm } from '@/components/auth/auth-form';

/**
 * The log in screen.
 *
 * `?signedOut=time` means Gyan signed this person out after they left the app alone, and the
 * form says so. Without it, somebody comes back to a sign in screen with no idea why they
 * are looking at it, and reasonably assumes something is broken.
 */
export default function LogInScreen() {
  const { signedOut } = useLocalSearchParams<{ signedOut?: string }>();
  return (
    <AuthForm
      mode="log-in"
      notice={
        signedOut === 'time'
          ? 'You were signed out because the app was left alone for a while. Sign in to carry on.'
          : undefined
      }
    />
  );
}
