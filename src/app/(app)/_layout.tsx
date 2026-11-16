import AppTabs from '@/components/app-tabs';
import { ConsentGate } from '@/components/auth/consent-gate';

/** Everything behind the login. The consent note shows first on a person's first sign in. */
export default function AppLayout() {
  return (
    <ConsentGate>
      <AppTabs />
    </ConsentGate>
  );
}
