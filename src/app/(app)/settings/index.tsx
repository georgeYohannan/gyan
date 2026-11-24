import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { NavRow } from '@/components/ui/nav-row';
import { PageHeader } from '@/components/ui/page-header';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';
import { languageName } from '@/constants/languages';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { getPlanAndUsage, type PlanAndUsage } from '@/lib/plans';
import { useProfile } from '@/lib/profile';
import { getSecuritySettings, getTwoFactor, type SecuritySettings, type TwoFactor } from '@/lib/security';
import { DEFAULT_SETTINGS, getRecapSettings, shortRecipients, type RecapSettings } from '@/lib/recaps';
import { listTeam, seatsSentence, type Team } from '@/lib/team';

type Summaries = {
  plan?: PlanAndUsage;
  team?: Team;
  recap: RecapSettings;
  security?: SecuritySettings;
  twoFactor?: TwoFactor;
};

/**
 * What the Security row says. It leads with the thing people came to check -- whether the
 * extra code is on -- and adds the sign out time after it.
 */
function securitySummary(security?: SecuritySettings, twoFactor?: TwoFactor): string {
  if (!security) return 'Two-factor sign in, and what has happened on this account.';
  const code = twoFactor?.on ? 'Two-factor sign in is on' : 'Two-factor sign in is off';
  const minutes = security.inactivityMinutes;
  const time = minutes < 60 ? `${minutes} minutes` : minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  return `${code}. Signs you out after ${time} of doing nothing.`;
}

/**
 * Settings: six doors in two groups, each saying what is behind it.
 *
 * Every row shows what is set right now, so most visits end here without opening anything.
 * If a summary cannot be read, its row still works and simply says less: this is a signpost,
 * not the page itself, so one slow answer must never stop somebody reaching Team.
 *
 * The two groups are the point of the redesign here. Six undifferentiated doors in one glass
 * box made somebody read all six every time; "Your account" and "How Gyan works" split them
 * by whose question they answer -- who am I and what am I paying for, against what does Gyan
 * do on my behalf. (The comment here used to say five doors. There have been six since
 * prompt 11.)
 */
export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { displayName, languageCode } = useProfile();
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<Summaries>({ recap: DEFAULT_SETTINGS });
  const [busy, setBusy] = useState(false);
  const [logOutError, setLogOutError] = useState<string>();

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      getPlanAndUsage().catch(() => undefined),
      listTeam().catch(() => undefined),
      getRecapSettings().catch(() => undefined),
      getSecuritySettings().catch(() => undefined),
      getTwoFactor().catch(() => undefined),
    ]).then(([plan, team, recap, security, twoFactor]) => {
      setSummaries({ plan, team, recap: recap?.settings ?? DEFAULT_SETTINGS, security, twoFactor });
      setLoading(false);
    });
  }, []);

  // Read again every time the person comes back, so a change made inside shows up out here.
  useFocusEffect(refresh);

  async function logOut() {
    setBusy(true);
    const result = await signOut();
    setBusy(false);
    setLogOutError(result.error);
  }

  const { plan, team, recap, security, twoFactor } = summaries;
  const email = session?.user.email ?? '';
  const name = displayName.trim() === '' ? email.split('@')[0] : displayName;

  return (
    <Screen testID="settings-screen">
      <PageHeader title="Settings" helpId="settings" />

      {loading ? (
        <GlassPanel accessibilityLabel="Loading your settings">
          <Skeleton width="70%" height={18} />
          <Skeleton width="50%" />
          <Skeleton width="60%" />
        </GlassPanel>
      ) : (
        <>
          <Section title="Your account">
            <View>
              <NavRow
                testID="settings-row-profile"
                title="Profile"
                summary={`${name}. Gyan writes in ${languageName(languageCode)}.`}
                href="/settings/profile"
              />
              <NavRow
                testID="settings-row-plan"
                title="Plan and usage"
                summary={
                  plan
                    ? `${plan.planName} plan. ${plan.meetingsUsed} of ${plan.meetingsPerMonth} meetings used this month.`
                    : 'Your plan, and how much of it you have used.'
                }
                href="/settings/plan"
              />
              <NavRow
                testID="settings-row-team"
                title="Team"
                summary={team ? seatsSentence(team) : 'The people who share this account.'}
                href="/settings/team"
                divider={false}
              />
            </View>
          </Section>

          <Section title="How Gyan works">
            <View>
              <NavRow
                testID="settings-row-recaps"
                title="Recaps"
                summary={shortRecipients(recap)}
                href="/settings/recaps"
              />
              <NavRow
                testID="settings-row-security"
                title="Security"
                summary={securitySummary(security, twoFactor)}
                href="/settings/security"
              />
              <NavRow
                testID="settings-row-data"
                title="Data and privacy"
                summary="Delete a note, or delete your account."
                href="/settings/data"
                divider={false}
              />
            </View>
          </Section>
        </>
      )}

      {/* Who you are and the way out. This was a glass panel with a heading over it, which
          made logging out look like a seventh setting. It is a footer: the quietest thing on
          the page, and the last. */}
      <View style={{ gap: Spacing.three, paddingTop: Spacing.two }}>
        <Body small color="textSecondary">
          Signed in as {email}
        </Body>
        {logOutError ? (
          <Body small color="danger" accessibilityRole="alert">
            {logOutError}
          </Body>
        ) : null}
        <View style={{ alignSelf: 'flex-start' }}>
          <Button testID="settings-log-out" label="Log out" variant="secondary" loading={busy} onPress={logOut} />
        </View>
      </View>

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}
