import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { HelpButton } from '@/components/help/help-button';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { NavRow } from '@/components/ui/nav-row';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { languageName } from '@/constants/languages';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { getPlanAndUsage, type PlanAndUsage } from '@/lib/plans';
import { useProfile } from '@/lib/profile';
import { DEFAULT_SETTINGS, getRecapSettings, shortRecipients, type RecapSettings } from '@/lib/recaps';
import { listTeam, seatsSentence, type Team } from '@/lib/team';

type Summaries = {
  plan?: PlanAndUsage;
  team?: Team;
  recap: RecapSettings;
};

/**
 * Settings: five doors, each saying what is behind it.
 *
 * Every row shows what is set right now, so most visits end here without opening anything.
 * If a summary cannot be read, its row still works and simply says less: this is a signpost,
 * not the page itself, so one slow answer must never stop somebody reaching Team.
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
    ]).then(([plan, team, recap]) => {
      setSummaries({ plan, team, recap: recap?.settings ?? DEFAULT_SETTINGS });
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

  const { plan, team, recap } = summaries;
  const email = session?.user.email ?? '';
  const name = displayName.trim() === '' ? email.split('@')[0] : displayName;

  return (
    <Screen>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
        <View style={{ flex: 1 }}>
          <Heading level={1}>Settings</Heading>
        </View>
        <HelpButton helpId="settings" />
      </View>

      {loading ? (
        <GlassPanel accessibilityLabel="Loading your settings">
          <Skeleton width="70%" height={18} />
          <Skeleton width="50%" />
          <Skeleton width="60%" />
        </GlassPanel>
      ) : (
        <GlassPanel>
          <NavRow
            title="Profile"
            summary={`${name}. Gyan writes in ${languageName(languageCode)}.`}
            href="/settings/profile"
          />
          <NavRow
            title="Plan and usage"
            summary={
              plan
                ? `${plan.planName} plan. ${plan.meetingsUsed} of ${plan.meetingsPerMonth} meetings used this month.`
                : 'Your plan, and how much of it you have used.'
            }
            href="/settings/plan"
          />
          <NavRow
            title="Team"
            summary={team ? seatsSentence(team) : 'The people who share this account.'}
            href="/settings/team"
          />
          <NavRow
            title="Recaps"
            summary={shortRecipients(recap)}
            href="/settings/recaps"
          />
          <NavRow
            title="Data and privacy"
            summary="Delete a note, or delete your account."
            href="/settings/data"
          />
        </GlassPanel>
      )}

      <GlassPanel>
        <Heading level={3}>Signed in</Heading>
        <Body color="textSecondary">{email}</Body>
        {logOutError ? (
          <Body small color="danger" accessibilityRole="alert">
            {logOutError}
          </Body>
        ) : null}
        <Button label="Log out" variant="secondary" loading={busy} onPress={logOut} />
      </GlassPanel>

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}
