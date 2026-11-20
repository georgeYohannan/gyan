import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Spacing } from '@/constants/theme';
import {
  DEFAULT_SETTINGS,
  getRecapSettings,
  MESSAGES,
  saveRecapSettings,
  type RecapSettings,
} from '@/lib/recaps';

type Load =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; isOwner: boolean };

/**
 * One plain sentence saying what is set right now.
 *
 * This is the only thing on the page that moves, and it is the point of the page: somebody who
 * arrived from the bottom of a recap email wants to know what is happening to them before they
 * read three switches. It rewrites itself as the switches change.
 */
export function stateSentence(settings: RecapSettings): string {
  const when = settings.autoSend
    ? 'as soon as a note is ready'
    : 'only when somebody presses Send recap on a note';

  if (!settings.toOwner && !settings.toMembers) {
    return 'Nobody is sent a recap on their own. A recap only goes to people picked by hand when sending one.';
  }
  if (settings.toOwner && settings.toMembers) {
    return `Recaps go to the account owner and everyone on the team, ${when}.`;
  }
  if (settings.toOwner) {
    return `Recaps go to the account owner only, ${when}.`;
  }
  return `Recaps go to the team, but not the account owner, ${when}.`;
}

/**
 * Recap emails: who gets them, and when.
 *
 * This is also where the "Turn off recaps" link at the bottom of every recap email lands, which
 * is why it is a page of its own and not only a box inside something else. The old address,
 * /recap-emails, still works and sends people here, because emails already sent point at it.
 * Only the account owner can change these. Anybody on the account can read them, so a person
 * who is getting emails can always find out why.
 */
export default function RecapEmailsScreen() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [settings, setSettings] = useState<RecapSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      const result = await getRecapSettings();
      setSettings(result.settings);
      setLoad({ state: 'ready', isOwner: result.isOwner });
    } catch {
      setLoad({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function change(next: RecapSettings) {
    const before = settings;
    // Move the switch at once, so it feels like a switch, then put it back if saving fails.
    setSettings(next);
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const stored = await saveRecapSettings(next);
      setSettings(stored);
      setSaved(true);
    } catch (e) {
      setSettings(before);
      setError(e instanceof Error ? e.message : MESSAGES.settingsProblem);
    } finally {
      setSaving(false);
    }
  }

  const isOwner = load.state === 'ready' && load.isOwner;
  const locked = isOwner ? undefined : MESSAGES.notOwner;

  return (
    <Screen>
      <BackLink label="Settings" href="/settings" helpId="recapEmail" />

      <Heading level={1}>Recap emails</Heading>

      {load.state === 'loading' ? (
        <GlassPanel accessibilityLabel="Loading your recap settings">
          <Skeleton width="80%" height={20} />
          <Skeleton width="60%" />
          <Skeleton width="70%" />
        </GlassPanel>
      ) : null}

      {load.state === 'error' ? (
        <GlassPanel>
          <Heading level={3}>Gyan could not open your settings</Heading>
          <Body color="textSecondary">
            This usually means the connection dropped. Nothing has changed.
          </Body>
          <Button label="Try again" variant="secondary" onPress={() => void refresh()} />
        </GlassPanel>
      ) : null}

      {load.state === 'ready' ? (
        <>
          {/* The whole page in one sentence, which changes as the switches do. */}
          <GlassPanel strong accessibilityLabel="What is set now">
            <Body accessibilityLiveRegion="polite">{stateSentence(settings)}</Body>
          </GlassPanel>

          <GlassPanel>
            <Heading level={3}>Who gets a recap</Heading>
            <ToggleRow
              label="The account owner"
              note="The person who owns this workspace and pays for it."
              value={settings.toOwner}
              saving={saving}
              lockedReason={locked}
              onChange={(next) => void change({ ...settings, toOwner: next })}
            />
            <ToggleRow
              label="Everyone on the team"
              note="Every member with a seat on this workspace."
              value={settings.toMembers}
              saving={saving}
              lockedReason={locked}
              onChange={(next) => void change({ ...settings, toMembers: next })}
            />
            <Body small color="textSecondary">
              A recap can only ever go to people on this account. Gyan never emails an address
              typed in by hand.
            </Body>
          </GlassPanel>

          <GlassPanel>
            <Heading level={3}>When it is sent</Heading>
            <ToggleRow
              label="Send on its own when a note is ready"
              note="Off means a recap only goes out when somebody presses Send recap on a note."
              value={settings.autoSend}
              saving={saving}
              lockedReason={locked}
              onChange={(next) => void change({ ...settings, autoSend: next })}
            />
            <Body small color="textSecondary">
              A note only ever sends itself once, so writing a new summary does not email everybody
              again.
            </Body>
          </GlassPanel>

          {error ? (
            <Body small color="danger" accessibilityRole="alert">
              {error}
            </Body>
          ) : null}
          {saved && !error ? (
            <Body small color="success" accessibilityRole="alert">
              Saved
            </Body>
          ) : null}

          <GlassPanel>
            <Heading level={3}>What is in a recap</Heading>
            <Body color="textSecondary">
              The note&apos;s title and date, the overview, the key points, the decisions, and the
              action items. Everyone gets it in the language they have chosen, and anything
              translated says &quot;Translated by AI&quot;.
            </Body>
            <Body small color="textSecondary">
              Emails come from gyan, and a reply goes to a person, not a robot.
            </Body>
          </GlassPanel>
        </>
      ) : null}

      <View style={{ height: Spacing.six }} />
    </Screen>
  );
}
