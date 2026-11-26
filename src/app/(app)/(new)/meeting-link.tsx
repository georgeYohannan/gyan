import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { BackLink } from '@/components/ui/back-link';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Heading } from '@/components/ui/heading';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { SettingRow } from '@/components/ui/setting-row';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { TickBox } from '@/components/ui/tick-box';
import { MinTouchTarget, Spacing, WideBreakpoint } from '@/constants/theme';
import {
  BOT_CONSENT_LINES,
  BOT_CONSENT_STATUS,
  BOT_CONSENT_TITLE,
  BOT_CONSENT_TICK,
} from '@/content/bot-consent';
import {
  getBotSettings,
  MESSAGES,
  PLATFORM_LABEL,
  readMeetingLink,
  startBot,
  WAITING_ROOM_ADVICE,
  type BotSettings,
} from '@/lib/meeting-bot';
import { getPlanAndUsage, type PlanAndUsage } from '@/lib/plans';

/**
 * Meeting link: send a bot to a Zoom, Google Meet or Microsoft Teams call.
 *
 * WHAT THIS SCREEN IS REALLY FOR. It would be easy to build it as a form -- a box for a link, a
 * meter, a button -- but pasting a link is the least important thing happening here. The real job
 * is that somebody is about to put a recording device into a room with other people in it. So the
 * screen is ordered the way that conversation goes: which call, then what everybody in it will
 * see, then the confirmation, and only then the button. The plan's allowance comes last, because
 * it is admin.
 *
 * The section about the call does not exist until a link has been recognised. Before that there is
 * nothing true to say about it, and a panel of general advice above an empty box is the kind of
 * padding that makes a screen feel generated.
 */
export default function MeetingLinkScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // A primary button is full width on a phone and the width of its words on a page. Without this
  // "Send the bot" is a 768 point glowing bar at 1280, which is the same thing the redesign
  // already fixed on Home (docs/decisions.md, 2026-11-24). Found by looking at the screenshot.
  const wide = width >= WideBreakpoint;
  const [settings, setSettings] = useState<BotSettings>();
  const [plan, setPlan] = useState<PlanAndUsage>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [link, setLink] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    let alive = true;
    Promise.all([getBotSettings(), getPlanAndUsage().catch(() => undefined)]).then(
      ([gotSettings, gotPlan]) => {
        if (!alive) return;
        setSettings(gotSettings);
        setPlan(gotPlan);
      },
      () => {
        if (alive) setLoadFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const typed = link.trim();
  const read = typed === '' ? null : readMeetingLink(typed);
  const hoursLeft = plan ? Math.max(0, plan.botHoursPerMonth - plan.botHoursUsed) : undefined;
  const outOfHours = plan ? plan.botHoursPerMonth <= 0 || plan.botHoursUsed >= plan.botHoursPerMonth : false;

  async function send() {
    if (!read || !confirmed || sending) return;
    setSending(true);
    setProblem(undefined);
    const result = await startBot(typed);
    if (result.ok) {
      // Straight to the note, because the next thing that happens is in the call, not here.
      router.replace(`/note/${result.meetingId}`);
      return;
    }
    setSending(false);
    setProblem(result.message);
  }

  // ---------------------------------------------------------------------------
  // The switch is off. This is the state every account is in until it is turned on by hand.
  // ---------------------------------------------------------------------------
  if (settings && !settings.enabled) {
    return (
      <Screen testID="meeting-link-screen">
        <BackLink label="New note" href="/new-note" helpId="meetingLink" />
        <Heading level={1}>Meeting link</Heading>
        <GlassPanel style={{ gap: Spacing.three }} testID="meeting-link-coming-soon">
          <Heading level={3}>{MESSAGES.comingSoon}</Heading>
          <Body color="textSecondary">{MESSAGES.comingSoonWhy}</Body>
        </GlassPanel>
      </Screen>
    );
  }

  return (
    <Screen testID="meeting-link-screen">
      <BackLink label="New note" href="/new-note" helpId="meetingLink" />
      <View style={{ gap: Spacing.two }}>
        <Heading level={1}>Meeting link</Heading>
        <Body color="textSecondary">Gyan joins the call, records it, and writes the notes afterwards.</Body>
      </View>

      {loadFailed ? (
        <Body color="danger" accessibilityRole="alert">
          {MESSAGES.loadProblem}
        </Body>
      ) : null}

      {!settings && !loadFailed ? (
        <View style={{ gap: Spacing.three }}>
          <Skeleton height={56} />
          <Skeleton height={20} width="70%" />
        </View>
      ) : null}

      {settings ? (
        <>
          <Section title="Which call">
            <TextField
              testID="meeting-link-url"
              label="Paste the link to the call"
              value={link}
              onChangeText={(next) => {
                setLink(next);
                setProblem(undefined);
              }}
              placeholder="https://meet.google.com/..."
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!sending}
              error={typed !== '' && !read ? MESSAGES.badLink : undefined}
            />

            {read ? (
              // Only now is there anything true to say. Naming the platform back is the quickest
              // way for somebody to see they pasted the link they meant to.
              <View style={{ gap: Spacing.two }} testID="meeting-link-what-happens">
                <Body>
                  Gyan joins your {PLATFORM_LABEL[read.platform]} call as {settings.effectiveName}.
                </Body>
                <Body small color="textSecondary">
                  {WAITING_ROOM_ADVICE[read.platform]}
                </Body>
                <Body small color="textSecondary">
                  Everybody in the call can see the bot by name, and it says in the meeting chat
                  that it is recording.
                </Body>
              </View>
            ) : null}
          </Section>

          <Section title={BOT_CONSENT_TITLE}>
            {/* The three promises, as three lines rather than a list: they are not steps and
                nothing is in an order. */}
            <View style={{ gap: Spacing.two }}>
              {BOT_CONSENT_LINES.map((line) => (
                <Body key={line}>{line}</Body>
              ))}
            </View>

            {/* The whole row is the target, not the 24 point square. */}
            <Pressable
              testID="meeting-link-consent"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              accessibilityLabel={BOT_CONSENT_TICK}
              disabled={sending}
              onPress={() => setConfirmed((was) => !was)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.three,
                minHeight: MinTouchTarget,
              }}>
              <TickBox checked={confirmed} />
              <View style={{ flex: 1 }}>
                <Body>{BOT_CONSENT_TICK}</Body>
              </View>
            </Pressable>

            <View style={wide ? { alignSelf: 'flex-start' } : undefined}>
              <Button
                testID="meeting-link-send"
                label="Send the bot"
                glow
                loading={sending}
                disabled={!read || !confirmed || sending || outOfHours}
                onPress={send}
              />
            </View>

            {!confirmed && read ? (
              <Body small color="textSecondary">
                {MESSAGES.notTicked}
              </Body>
            ) : null}

            {problem ? (
              <Body color="danger" accessibilityRole="alert">
                {problem}
              </Body>
            ) : null}

            {/* Said on the screen, not only in a file. The founder has to be able to see at a
                glance that these words are not signed off, and so does anybody testing it. */}
            <Body small color="textSecondary">
              {BOT_CONSENT_STATUS} wording: a lawyer has not checked these words yet.
            </Body>
          </Section>

          {plan ? (
            <Section title="What your plan allows">
              <SettingRow
                testID="meeting-link-hours"
                value={
                  plan.botHoursPerMonth <= 0
                    ? 'No meeting bot hours on this plan'
                    : `${round(hoursLeft ?? 0)} of ${round(plan.botHoursPerMonth)} hours left this month`
                }
                note={
                  plan.botHoursPerMonth <= 0
                    ? 'A bigger plan includes hours of meeting bot.'
                    : 'A bot uses an hour for every hour it is in a call. Time starts again on the 1st.'
                }
              />
              <SettingRow
                testID="meeting-link-max-minutes"
                value={
                  plan.maxMeetingMinutes
                    ? `Up to ${plan.maxMeetingMinutes} minutes in one call`
                    : 'No limit on how long one call may be'
                }
                note={
                  plan.maxMeetingMinutes
                    ? 'Gyan leaves the call when it reaches that, and writes the notes from what it has.'
                    : 'Gyan stays until the call ends.'
                }
              />
              {outOfHours ? (
                <Body color="danger" accessibilityRole="alert">
                  {plan.botHoursPerMonth <= 0 ? MESSAGES.comingSoonHours : MESSAGES.outOfHours}
                </Body>
              ) : null}
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Hours, to one place, with no trailing ".0" to make a whole number look like a measurement. */
function round(hours: number): string {
  const one = Math.round(hours * 10) / 10;
  return Number.isInteger(one) ? String(one) : one.toFixed(1);
}
