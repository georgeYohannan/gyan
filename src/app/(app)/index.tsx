import { useState } from 'react';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/lib/auth';

/** Home is a placeholder for now. It shows who is logged in and lets them log out. */
export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function logOut() {
    setBusy(true);
    const result = await signOut();
    setBusy(false);
    setError(result.error);
  }

  return (
    <Screen>
      <Heading level={1}>Home</Heading>
      <Body color="textSecondary">Your notes will show up here soon.</Body>
      <GlassPanel>
        <Body small color="textSecondary">
          Logged in as
        </Body>
        <Body>{session?.user.email}</Body>
        {error ? (
          <Body small color="danger" accessibilityRole="alert">
            {error}
          </Body>
        ) : null}
        <Button label="Log out" variant="secondary" loading={busy} onPress={logOut} />
      </GlassPanel>
    </Screen>
  );
}
