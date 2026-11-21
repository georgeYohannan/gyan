import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { confirmTwoFactor, needsTwoFactor } from '@/lib/security';

/**
 * Asks for the 6-digit code when somebody has two-factor sign in switched on.
 *
 * WHERE THIS SITS, AND WHY. Supabase treats a password sign in as finished: the session
 * exists straight away, at the lower of its two levels. Typing the code raises it to the
 * higher one. So this is a gate INSIDE the app rather than a screen before it.
 *
 * WHAT THAT MEANS, HONESTLY. This is a lock on the door of the app, not on the data behind
 * it. Somebody holding a stolen token could still call the server directly without ever
 * seeing this screen. Making the code compulsory for the DATA is possible -- Supabase can
 * require the higher level in the database rules -- and it is deliberately not done yet,
 * because Gyan has no way to get somebody back in if they lose their phone. Locking a
 * customer out of their own meetings for ever is a worse failure than the one it would fix.
 * Recovery codes come first; see docs/security/audit-1.md.
 *
 * What it does protect against is the ordinary case, which is also the common one: somebody
 * who has a password and is typing it into Gyan.
 */
export function TwoFactorGate({ children }: PropsWithChildren) {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;

  // undefined = still asking, null = nothing needed, string = the factor to confirm.
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const check = useCallback(async () => {
    if (!userId) {
      setFactorId(null);
      return;
    }
    try {
      const { needed, factorId: waiting } = await needsTwoFactor();
      setFactorId(needed && waiting ? waiting : null);
    } catch {
      // If this cannot be worked out, do not stand in the way. A problem reading the level
      // must not lock somebody out of their own notes.
      setFactorId(null);
    }
  }, [userId]);

  useEffect(() => {
    void check();
  }, [check]);

  if (factorId === undefined) return null;
  if (factorId === null) return <>{children}</>;

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    const result = await confirmTwoFactor(factorId, code);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCode('');
    await check();
  };

  return (
    <Screen>
      <Heading level={1}>One more step</Heading>
      <GlassPanel style={{ gap: Spacing.three }}>
        <Body>Open your authenticator app and type the 6-digit code it is showing for gyan.</Body>
        <TextField
          label="6-digit code"
          value={code}
          onChangeText={(next) => {
            setCode(next.replace(/\D/g, '').slice(0, 6));
            setError(undefined);
          }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder="123456"
          error={error}
        />
        <Button label="Confirm" loading={busy} disabled={code.length !== 6} onPress={() => void confirm()} />
        <View>
          <Button
            label="Sign in as somebody else"
            variant="secondary"
            onPress={() => {
              void signOut();
            }}
          />
        </View>
        <Body small color="textSecondary">
          Lost the app on your phone? Ask the person who owns this account to remove you and invite you again.
        </Body>
      </GlassPanel>
    </Screen>
  );
}
