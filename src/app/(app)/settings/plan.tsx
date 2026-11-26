import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { testToolsOn } from '@/lib/environment';
import {
  getPlanAndUsage,
  listSwitchablePlans,
  setTestPlan,
  type PlanAndUsage,
} from '@/lib/plans';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; plan: PlanAndUsage };

/**
 * Plan and usage.
 *
 * NOT ONE NUMBER ON THIS SCREEN IS WRITTEN IN THIS FILE. The plan name, the limits, the words
 * describing what the plan includes and the prices all come out of the plans table, and what
 * has been used comes out of the usage table. An admin changes a number there and this screen
 * says the new number, with no new code.
 *
 * The meter is the one loud thing here. Everything else stays quiet.
 */
export default function PlanScreen() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [switchable, setSwitchable] = useState<{ name: string; isTest: boolean }[]>([]);
  const [switching, setSwitching] = useState<string>();
  const [switchError, setSwitchError] = useState<string>();

  // Whether the builders' plan switch exists at all. Off unless this build was told otherwise,
  // so a real build that never sets it simply has no switch.
  const testTools = testToolsOn();

  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      setLoad({ state: 'ready', plan: await getPlanAndUsage() });
    } catch {
      setLoad({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!testTools) return;
    listSwitchablePlans()
      .then(setSwitchable)
      .catch(() => setSwitchable([]));
  }, [testTools]);

  async function switchTo(name: string) {
    setSwitching(name);
    setSwitchError(undefined);
    try {
      await setTestPlan(name);
      await refresh();
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setSwitching(undefined);
    }
  }

  const plan = load.state === 'ready' ? load.plan : undefined;
  const atLimit = !!plan && plan.meetingsUsed >= plan.meetingsPerMonth;

  return (
    <Screen>
      <BackLink label="Settings" href="/settings" helpId="settingsPlan" />
      <Heading level={1}>Plan and usage</Heading>

      {load.state === 'loading' ? (
        <GlassPanel accessibilityLabel="Loading your plan">
          <Skeleton width="50%" height={20} />
          <Skeleton width="80%" height={28} />
          <Skeleton width="60%" />
        </GlassPanel>
      ) : null}

      {load.state === 'error' ? (
        <GlassPanel>
          <Heading level={3}>Gyan could not read your plan</Heading>
          <Body color="textSecondary">
            This usually means the connection dropped. Nothing has changed.
          </Body>
          <Button label="Try again" variant="secondary" onPress={() => void refresh()} />
        </GlassPanel>
      ) : null}

      {plan ? (
        <>
          {plan.isTestPlan ? (
            <GlassPanel accessibilityLabel="This is a test plan">
              <Body color="danger" accessibilityRole="alert">
                These numbers are stand-ins
              </Body>
              <Body small color="textSecondary">
                {plan.planDescription}
              </Body>
            </GlassPanel>
          ) : null}

          {/* The meter. The one thing on this screen the eye should land on. */}
          <GlassPanel strong accessibilityLabel="Meetings used this month">
            <Body small color="textSecondary">
              Meetings used this month
            </Body>
            <Heading level={2}>
              {plan.meetingsUsed} of {plan.meetingsPerMonth}
            </Heading>
            <ProgressBar used={plan.meetingsUsed} limit={plan.meetingsPerMonth} label="meetings" />
            <Body small color={atLimit ? 'danger' : 'textSecondary'} accessibilityRole={atLimit ? 'alert' : undefined}>
              {atLimit
                ? 'You have used all your meetings for this month. They start again on the 1st. Pasted text still works.'
                : `${plan.meetingsPerMonth - plan.meetingsUsed} left. They start again on the 1st.`}
            </Body>
            <Body small color="textSecondary">
              This is counted for the whole account, so everybody on it shares these meetings.
            </Body>
          </GlassPanel>

          {/* Meeting bot hours. Shown even when the plan has none, because "none" is the thing
              somebody on the Free plan needs to know before they go looking for the feature. The
              hours include time a bot in a call right now might still use, which is why the
              number can go down without a note finishing. */}
          <GlassPanel testID="settings-plan-bot-hours">
            <Heading level={3}>Meeting bot hours this month</Heading>
            <Body>
              {plan.botHoursPerMonth <= 0
                ? 'Not included on this plan'
                : `${hours(plan.botHoursUsed)} of ${hours(plan.botHoursPerMonth)}`}
            </Body>
            <Body small color="textSecondary">
              {plan.botHoursPerMonth <= 0
                ? 'Sending a bot to a Zoom, Google Meet or Microsoft Teams call needs a bigger plan. Uploading a recording works on every plan.'
                : 'A bot uses an hour for every hour it is in a call. Counted for the whole account, and it starts again on the 1st.'}
            </Body>
          </GlassPanel>

          <GlassPanel>
            <Heading level={3}>Chat questions today</Heading>
            <Body>
              {plan.chatMessagesUsed} of {plan.chatMessagesPerDay}
            </Body>
            <Body small color="textSecondary">
              This one is yours alone, and it starts again every day. A teammate asking questions
              does not use up yours.
            </Body>
          </GlassPanel>

          <GlassPanel>
            <Heading level={3}>Your plan: {plan.planName}</Heading>
            {plan.features.length > 0 ? (
              <View style={{ gap: Spacing.one }}>
                {plan.features.map((line) => (
                  <Body key={line} color="textSecondary">
                    {`•  ${line}`}
                  </Body>
                ))}
              </View>
            ) : (
              <Body color="textSecondary">{plan.planDescription}</Body>
            )}
          </GlassPanel>

          <GlassPanel>
            <Heading level={3}>More meetings</Heading>
            <Body color="textSecondary">
              Paying for a bigger plan is not built yet. When it is, this is where it will be.
            </Body>
            <Button label="Upgrade — coming soon" disabled onPress={() => undefined} />
          </GlassPanel>

          {/*
            THE BUILDERS' PLAN SWITCH. It is not part of the app.
            It is only ever drawn when this build was started with EXPO_PUBLIC_GYAN_TEST_TOOLS=1,
            and even then the database refuses anybody who is not a Gyan admin and will only move
            an account onto a plan whose numbers are stand-ins.
          */}
          {testTools ? (
            <GlassPanel accessibilityLabel="Test only: switch plan">
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: Spacing.three,
                  paddingVertical: Spacing.one,
                  borderRadius: Radius.pill,
                  backgroundColor: Colors.dangerFill,
                  borderWidth: 1,
                  borderColor: Colors.dangerBorder,
                }}>
                <Body small color="danger">
                  For builders only
                </Body>
              </View>
              <Heading level={3}>Switch plan, for testing</Heading>
              <Body small color="textSecondary">
                This changes the plan without any payment, so you can check that the limits above
                really follow the plan. The Pro and Team numbers are stand-ins for you to change
                later. This switch does not exist in the real app.
              </Body>
              <View style={{ gap: Spacing.two }}>
                {switchable.map((option) => (
                  <Button
                    key={option.name}
                    label={
                      option.name === plan.planName ? `${option.name} (you are on this)` : `Switch to ${option.name}`
                    }
                    variant="secondary"
                    loading={switching === option.name}
                    disabled={option.name === plan.planName || !!switching}
                    onPress={() => void switchTo(option.name)}
                  />
                ))}
              </View>
              {switchError ? (
                <Body small color="danger" accessibilityRole="alert">
                  {switchError}
                </Body>
              ) : null}
            </GlassPanel>
          ) : null}
        </>
      ) : null}

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}

/** Hours, to one place, with no trailing ".0" to make a whole number look like a measurement. */
function hours(value: number): string {
  const one = Math.round(value * 10) / 10;
  return Number.isInteger(one) ? String(one) : one.toFixed(1);
}
