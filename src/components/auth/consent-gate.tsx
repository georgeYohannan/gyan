import { useEffect, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { recordMyAction } from '@/lib/audit';
import { CONSENT_LINES, hasAgreedOnThisDevice, recordAgreement } from '@/lib/consent';

/**
 * Shows a short recording-consent note the first time a person signs in, then never again
 * on this device.
 *
 * Agreeing is now written down in the DATABASE as well as on the device, with which version
 * of the words was agreed to and when. Before, it lived only on the device, so clearing site
 * data or moving to a new phone erased the only evidence it had ever been shown -- which is
 * no use at all if anybody ever asks.
 *
 * The words themselves live in src/lib/consent.ts, next to the version number, so the two
 * cannot drift apart. TODO before public launch: a lawyer must review them (product spec).
 */
export function ConsentGate({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  // undefined = still checking, true = already accepted, false = show the note.
  const [accepted, setAccepted] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    hasAgreedOnThisDevice(userId)
      .then((already) => !cancelled && setAccepted(already))
      .catch(() => !cancelled && setAccepted(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (accepted === undefined) return null;
  if (accepted) return <>{children}</>;

  return (
    <Screen>
      <Heading level={1}>Before you start</Heading>
      <GlassPanel style={{ gap: Spacing.three }}>
        {CONSENT_LINES.map((line) => (
          <Body key={line}>{line}</Body>
        ))}
        <View>
          <Button
            label="I understand"
            onPress={() => {
              // Let them in straight away. Writing it down matters, but not enough to make
              // somebody wait on the network for it.
              setAccepted(true);
              if (userId) {
                void recordAgreement(userId);
                void recordMyAction('consent_accept');
              }
            }}
          />
        </View>
      </GlassPanel>
    </Screen>
  );
}
