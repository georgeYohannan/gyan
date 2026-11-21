import AppTabs from '@/components/app-tabs';
import { AutoSignOut } from '@/components/auth/auto-sign-out';
import { ConsentGate } from '@/components/auth/consent-gate';
import { TwoFactorGate } from '@/components/auth/two-factor-gate';

/**
 * Everything behind the login, with three things in front of it, in this order:
 *
 *   1. TwoFactorGate  proves who you are, before anything is shown
 *   2. ConsentGate    the recording notice, on a person's first sign in
 *   3. AutoSignOut    draws nothing; signs you out if you walk away
 *
 * The order matters. Asking for a code comes before asking somebody to agree to anything,
 * because until the code is typed we do not really know who is agreeing.
 */
export default function AppLayout() {
  return (
    <TwoFactorGate>
      <ConsentGate>
        <AutoSignOut />
        <AppTabs />
      </ConsentGate>
    </TwoFactorGate>
  );
}
