import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { HelpButton } from '@/components/help/help-button';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { TickBox } from '@/components/ui/tick-box';
import { languageName, sameLanguage } from '@/constants/languages';
import { Colors, MinTouchTarget, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
import {
  MESSAGES,
  peopleCount,
  previewRecap,
  sendRecap,
  type PreviewResult,
  type RecapOutcome,
  type Recipient,
} from '@/lib/recaps';

type RecapDialogProps = {
  meetingId: string;
  visible: boolean;
  onClose: () => void;
  /** The language the note's summary is written in, so a row can say when it will be translated. */
  noteLanguage: string;
  /** Opens the recap settings page. Closes the dialog first. */
  onOpenSettings: () => void;
};

const SIDE_WIDTH = 420;

type Stage =
  | { kind: 'loading' }
  | { kind: 'loadFailed'; message: string }
  | { kind: 'picking' }
  | { kind: 'confirming' }
  | { kind: 'sending' }
  | { kind: 'sent'; outcomes: RecapOutcome[]; sent: number; failed: number }
  | { kind: 'sendFailed'; message: string };

/**
 * Who this person is, in words the person reading would use.
 * "owner" and "member" are how the database thinks. Nobody describes themselves that way.
 */
function describe(person: Recipient, isMe: boolean): string {
  if (isMe) return 'you';
  return person.role === 'owner' ? 'the account owner' : 'on your team';
}

/**
 * Send a recap of one note.
 *
 * An email cannot be unsent, so this dialog has one job: make it impossible to be surprised by
 * who receives it. Every person on the account is listed with their address and, when it differs
 * from the note, the language their copy will arrive in. The ticks start where the account's
 * settings put them.
 *
 * On a phone it slides up from the bottom. On a wide web window it opens as a panel on the
 * right, like the help and the chat.
 */
export function RecapDialog({ meetingId, visible, onClose, noteLanguage, onOpenSettings }: RecapDialogProps) {
  const { width, height } = useWindowDimensions();
  const { reveal } = useMotion();
  const side = Platform.OS === 'web' && width >= WideBreakpoint;

  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [people, setPeople] = useState<Recipient[]>([]);
  const [ticked, setTicked] = useState<string[]>([]);

  // `mounted` keeps the panel on screen while it slides away.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  // Show the panel as soon as it is asked for (set during render, not in an effect).
  if (visible && !mounted) setMounted(true);

  // And start from the waiting state each time it opens, the same way, so a list left over from
  // last time is never shown as if it were fresh.
  const [askedFor, setAskedFor] = useState<string | undefined>(undefined);
  if (visible && askedFor !== meetingId) {
    setAskedFor(meetingId);
    setStage({ kind: 'loading' });
  }
  if (!visible && askedFor !== undefined) setAskedFor(undefined);

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, reveal));
      return;
    }
    progress.set(withTiming(0, reveal));
    const t = setTimeout(() => setMounted(false), reveal.duration);
    return () => clearTimeout(t);
  }, [visible, reveal, progress]);

  // On the web, the Escape key closes the panel.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  /** Puts an answer about who would get this recap on screen. */
  const show = useCallback((result: PreviewResult) => {
    if (!result.ok) {
      setStage({ kind: 'loadFailed', message: result.message });
      return;
    }
    setPeople(result.recipients);
    setTicked(result.recipients.filter((person) => person.defaultOn).map((person) => person.userId));
    // The list is worth showing even when nothing can be sent, but say why rather than
    // claiming a send failed when nothing was ever attempted.
    setStage(
      result.canSend
        ? { kind: 'picking' }
        : { kind: 'loadFailed', message: result.sendProblem ?? MESSAGES.notSetUp },
    );
  }, []);

  /** Try again, from a button. This one shows the waiting state first. */
  const retry = useCallback(() => {
    setStage({ kind: 'loading' });
    void previewRecap(meetingId).then(show);
  }, [meetingId, show]);

  // Ask again every time the dialog opens, so the list is never out of date. The waiting state
  // is set during render above, not here: setting it here would cost a whole extra render.
  // `alive` stops an answer that arrives after the dialog has closed from landing on screen.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void (async () => {
      const result = await previewRecap(meetingId);
      if (alive) show(result);
    })();
    return () => {
      alive = false;
    };
  }, [visible, meetingId, show]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: side
      ? [{ translateX: (1 - progress.value) * SIDE_WIDTH }]
      : [{ translateY: (1 - progress.value) * height * 0.5 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!mounted) return null;

  const chosen = people.filter((person) => ticked.includes(person.userId));

  function toggle(userId: string) {
    setTicked((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function send() {
    setStage({ kind: 'sending' });
    const result = await sendRecap(
      meetingId,
      chosen.map((person) => person.userId),
    );
    if (!result.ok) {
      setStage({ kind: 'sendFailed', message: result.message });
      return;
    }
    setStage({ kind: 'sent', outcomes: result.outcomes, sent: result.sent, failed: result.failed });
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: side ? 'flex-start' : 'flex-end', alignItems: side ? 'flex-end' : 'stretch' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)' }, backdropStyle]}>
          <Pressable accessibilityLabel="Close the recap dialog" style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="Send recap"
          style={[
            {
              backgroundColor: Colors.backgroundElement,
              borderColor: Colors.glassBorder,
              borderWidth: 1,
              overflow: 'hidden',
            },
            side
              ? { width: SIDE_WIDTH, height: '100%', borderTopLeftRadius: Radius.panel, borderBottomLeftRadius: Radius.panel }
              : { maxHeight: '88%', borderTopLeftRadius: Radius.panel, borderTopRightRadius: Radius.panel },
            panelStyle,
          ]}>
          <View style={{ padding: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.two, borderBottomWidth: 1, borderBottomColor: Colors.glassBorder }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }}>
              <Heading level={3}>Send recap</Heading>
              <HelpButton helpId="recapEmail" />
            </View>
            <Body small color="textSecondary">
              The summary and action items of this note, by email. Only people on your account can
              be picked.
            </Body>
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
            {stage.kind === 'loading' ? (
              <Body color="textSecondary">Working out who would get this…</Body>
            ) : null}

            {stage.kind === 'loadFailed' ? (
              <View style={{ gap: Spacing.three }}>
                <Body color="danger" accessibilityRole="alert">
                  {stage.message}
                </Body>
                <Button label="Try again" variant="secondary" onPress={retry} />
              </View>
            ) : null}

            {/* --- Picking who gets it ------------------------------------ */}
            {stage.kind === 'picking' || stage.kind === 'confirming' || stage.kind === 'sending' ? (
              <View style={{ gap: Spacing.one }} accessibilityRole="list">
                {people.length === 0 ? (
                  <Body color="textSecondary">
                    There is nobody on this account to email yet.
                  </Body>
                ) : null}

                {people.map((person) => {
                  const checked = ticked.includes(person.userId);
                  const willTranslate = !sameLanguage(person.language, noteLanguage);
                  const who = describe(person, person.isYou);
                  const second = willTranslate ? `${who}, in ${languageName(person.language)}` : who;
                  return (
                    <Pressable
                      key={person.userId}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${person.email}, ${second}`}
                      accessibilityState={{ checked, disabled: stage.kind !== 'picking' }}
                      aria-checked={checked}
                      disabled={stage.kind !== 'picking'}
                      onPress={() => toggle(person.userId)}
                      style={({ pressed }) => ({
                        minHeight: MinTouchTarget,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: Spacing.three,
                        paddingVertical: Spacing.two,
                        paddingHorizontal: Spacing.three,
                        borderRadius: Radius.panel,
                        backgroundColor: pressed ? Colors.backgroundSelected : 'transparent',
                      })}>
                      <TickBox checked={checked} />
                      <View style={{ flex: 1, gap: Spacing.half }}>
                        <Body>{person.email}</Body>
                        <Body small color="textSecondary">
                          {second}
                        </Body>
                      </View>
                    </Pressable>
                  );
                })}

                <View style={{ gap: Spacing.two, paddingTop: Spacing.two }}>
                  <Body small color="textSecondary">
                    The ticks come from your recap settings. Changing them here changes this one
                    email only.
                  </Body>
                  <Body small color="textSecondary">
                    Anybody who reads another language gets their own copy, translated by AI.
                  </Body>
                </View>
              </View>
            ) : null}

            {/* --- Asking before anything is sent ------------------------- */}
            {stage.kind === 'confirming' ? (
              <View
                accessibilityLabel={`Send this recap to ${peopleCount(chosen.length)}?`}
                style={{
                  gap: Spacing.two,
                  padding: Spacing.three,
                  borderRadius: Radius.panel,
                  borderWidth: 1,
                  borderColor: Colors.glassBorder,
                  backgroundColor: Colors.glass,
                }}>
                <Heading level={3}>{`Send this recap to ${peopleCount(chosen.length)}?`}</Heading>
                <Body color="textSecondary">
                  An email cannot be taken back once it has gone.
                </Body>
                <View style={{ gap: Spacing.half }}>
                  {chosen.map((person) => (
                    <Body key={person.userId} small>
                      {person.email}
                    </Body>
                  ))}
                </View>
              </View>
            ) : null}

            {/* --- What happened ----------------------------------------- */}
            {stage.kind === 'sent' ? (
              <View style={{ gap: Spacing.three }}>
                <Body color={stage.sent > 0 ? 'success' : 'danger'} accessibilityRole="alert">
                  {stage.sent > 0
                    ? `Recap sent to ${peopleCount(stage.sent)}.`
                    : 'The recap did not reach anybody.'}
                </Body>
                <View style={{ gap: Spacing.two }}>
                  {stage.outcomes.map((outcome) => (
                    <View key={outcome.email} style={{ gap: Spacing.half }}>
                      <Body small>{outcome.email}</Body>
                      <Body small color={outcome.ok ? 'textSecondary' : 'danger'}>
                        {outcome.ok
                          ? outcome.translated
                            ? `Sent in ${outcome.language}, translated by AI`
                            : `Sent in ${outcome.language}`
                          : 'Did not go. Try this one again.'}
                      </Body>
                    </View>
                  ))}
                </View>
                {stage.failed > 0 ? (
                  <Button label="Try again" variant="secondary" onPress={retry} />
                ) : null}
              </View>
            ) : null}

            {stage.kind === 'sendFailed' ? (
              <View style={{ gap: Spacing.three }}>
                <Body color="danger" accessibilityRole="alert">
                  {stage.message}
                </Body>
                <Body small color="textSecondary">
                  Nothing was sent. You can try again.
                </Body>
                <Button label="Try again" variant="secondary" onPress={() => setStage({ kind: 'picking' })} />
              </View>
            ) : null}
          </ScrollView>

          <View style={{ padding: Spacing.three, gap: Spacing.two, borderTopWidth: 1, borderTopColor: Colors.glassBorder }}>
            {stage.kind === 'picking' ? (
              <>
                <Button
                  label="Send recap"
                  disabled={chosen.length === 0}
                  onPress={() => setStage({ kind: 'confirming' })}
                />
                <Button
                  label="Change recap settings"
                  variant="secondary"
                  onPress={() => {
                    onClose();
                    onOpenSettings();
                  }}
                />
              </>
            ) : null}

            {stage.kind === 'confirming' || stage.kind === 'sending' ? (
              <>
                <Button label="Send recap" loading={stage.kind === 'sending'} onPress={() => void send()} />
                <Button
                  label="Cancel"
                  variant="secondary"
                  disabled={stage.kind === 'sending'}
                  onPress={() => setStage({ kind: 'picking' })}
                />
              </>
            ) : null}

            {stage.kind === 'loading' || stage.kind === 'loadFailed' || stage.kind === 'sent' || stage.kind === 'sendFailed' ? (
              <Button label="Close" variant="secondary" onPress={onClose} />
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
