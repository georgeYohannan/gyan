import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

/**
 * Shows a short recording-consent note the first time a person signs in, then never again
 * on this device. TODO before public launch: a lawyer must review these words (product spec).
 */
export function ConsentGate({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const key = userId ? `gyan.consent.v1.${userId}` : undefined;
  // undefined = still checking, true = already accepted, false = show the note.
  const [accepted, setAccepted] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((value) => !cancelled && setAccepted(value === 'yes'))
      .catch(() => !cancelled && setAccepted(false));
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (accepted === undefined) return null;
  if (accepted) return <>{children}</>;

  return (
    <Screen>
      <Heading level={1}>Before you start</Heading>
      <GlassPanel style={{ gap: Spacing.three }}>
        <Body>Gyan can record conversations and turn them into notes.</Body>
        <Body>Always tell everyone that they are being recorded. Some US states need everyone to agree.</Body>
        <Body>Gyan will never join or record a meeting without a notice for the people in it.</Body>
        <View>
          <Button
            label="I understand"
            onPress={() => {
              if (key) AsyncStorage.setItem(key, 'yes').catch(() => {});
              setAccepted(true);
            }}
          />
        </View>
      </GlassPanel>
    </Screen>
  );
}
