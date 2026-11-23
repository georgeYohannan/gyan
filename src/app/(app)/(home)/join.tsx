import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';
import { takeInviteToken } from '@/lib/invite-link';
import { acceptInvite, MESSAGES } from '@/lib/team';

type State =
  | { step: 'joining' }
  | { step: 'joined'; ownerName: string }
  | { step: 'failed'; message: string };

/**
 * Where an invite link lands, once there is somebody signed in to join with.
 *
 * The token comes either straight off the address, or out of the one that was put away when
 * they tapped the link before they had a login. Either way it is used once and then forgotten.
 *
 * IT LIVES IN THE HOME STACK, not beside it. A screen under (app) that is not part of a stack
 * and has no tab of its own cannot be opened at all, so an invite link would quietly land on
 * Home instead. (The same trap is written up in (home)/_layout.tsx.)
 */
export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [state, setState] = useState<State>({ step: 'joining' });

  const join = useCallback(async () => {
    // No "now joining" is set here: that is already the state this screen starts in, and
    // setting it again as the page opens would be a second render for nothing. The Try again
    // button sets it, because by then the screen is showing something else.
    // The stored token is ALWAYS taken, which also forgets it. Reading it only when the address
    // has none would leave a spent token behind, and the next time the app started it would try
    // to join again and say the link does not work.
    const stored = await takeInviteToken();
    const token = (params.token ?? '').trim() || stored || '';
    if (token === '') {
      setState({ step: 'failed', message: MESSAGES.badInvite });
      return;
    }
    try {
      const result = await acceptInvite(token);
      setState({ step: 'joined', ownerName: result.ownerName });
    } catch (e) {
      setState({ step: 'failed', message: e instanceof Error ? e.message : MESSAGES.problem });
    }
  }, [params.token]);

  useEffect(() => {
    // The rule cannot see that every setState inside join() happens after an await, so it reads
    // this as changing state while the page is drawing. It is not: joining always waits for the
    // stored token or the server first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void join();
  }, [join]);

  return (
    <Screen>
      <Heading level={1}>Joining</Heading>

      {state.step === 'joining' ? (
        <GlassPanel accessibilityLabel="Joining the account">
          <Skeleton width="70%" height={20} />
          <Skeleton width="50%" />
        </GlassPanel>
      ) : null}

      {state.step === 'joined' ? (
        <GlassPanel>
          <Heading level={3}>You are in</Heading>
          <Body color="textSecondary">
            You are now on {state.ownerName}&apos;s account. Their notes are on your Home screen.
          </Body>
          <Button label="Go to Home" onPress={() => router.replace('/')} />
        </GlassPanel>
      ) : null}

      {state.step === 'failed' ? (
        <GlassPanel>
          <Heading level={3}>Gyan could not let you in</Heading>
          <Body color="danger" accessibilityRole="alert">
            {state.message}
          </Body>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => {
              setState({ step: 'joining' });
              void join();
            }}
          />
          <Button label="Go to Home" variant="secondary" onPress={() => router.replace('/')} />
        </GlassPanel>
      ) : null}

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}
