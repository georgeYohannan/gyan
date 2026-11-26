import { useWindowDimensions, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Colors, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { PLATFORM_LABEL, WAITING_ROOM_ADVICE, type BotState } from '@/lib/meeting-bot';

/**
 * What a meeting bot is doing right now, on the note it is making.
 *
 * It is only drawn while the bot is still in the call. Once the recording is Gyan's own the note
 * is an ordinary note and this would be saying something that had stopped being true.
 *
 * TWO DESIGN DECISIONS WORTH THE COMMENT:
 *
 * The burnt orange edge appears for ONE phase: in the waiting room. That is the only state where
 * the person has something to do -- go and let the bot in -- and the edge means exactly that
 * everywhere else in Gyan (a note row uses it for "still to do"). While the bot is joining or
 * recording there is nothing to do, so there is no edge.
 *
 * Stop recording is a QUIET button, not a loud one. Ending somebody's recording halfway through a
 * meeting is not the thing you usually want, and a glowing button invites exactly the mis-tap that
 * cannot be undone. A disabled button of any variant already takes this surface, so a quiet
 * secondary here is the house look for "available, not encouraged".
 */
export function BotLive({
  bot,
  stopping,
  message,
  onStop,
}: {
  bot: BotState;
  stopping: boolean;
  /** What happened after Stop recording was pressed, in plain words. */
  message?: { text: string; bad: boolean };
  onStop: () => void;
}) {
  const { width } = useWindowDimensions();
  // A button is full width on a phone and the width of its words on a page, which is the rule
  // the redesign set on Home (docs/decisions.md, 2026-11-24) and which a new button breaks every
  // time it is added without thinking. Found by looking at the screenshot, twice in one round.
  const wide = width >= WideBreakpoint;

  if (bot.phase !== 'joining' && bot.phase !== 'waiting' && bot.phase !== 'recording') return null;

  const needsYou = bot.phase === 'waiting';

  return (
    <View
      testID="note-bot-live"
      style={{
        flexDirection: 'row',
        gap: Spacing.three,
        borderRadius: Radius.panel,
        backgroundColor: Colors.glass,
        borderWidth: 1,
        borderColor: Colors.glassBorder,
        padding: Spacing.three,
      }}>
      {/* The edge, in the gutter beside the words, exactly as a note row draws it. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 3,
          borderRadius: Radius.pill,
          backgroundColor: needsYou ? Colors.record : 'transparent',
        }}
      />
      <View style={{ flex: 1, gap: Spacing.three }}>
        <View style={{ gap: Spacing.two }}>
          <Body weight="semibold">
            {needsYou
              ? `Let ${bot.botName} in`
              : bot.phase === 'recording'
                ? `${bot.botName} is in the call`
                : `${bot.botName} is asking to join`}
          </Body>
          <Body small color="textSecondary">
            {needsYou
              ? WAITING_ROOM_ADVICE[bot.platform]
              : bot.phase === 'recording'
                ? `Recording your ${PLATFORM_LABEL[bot.platform]} call. Gyan writes the notes when the call ends.`
                : `Asking to join your ${PLATFORM_LABEL[bot.platform]} call.`}
          </Body>
        </View>

        {bot.canStop ? (
          <View style={wide ? { alignSelf: 'flex-start' } : undefined}>
            <Button
              testID="note-bot-stop"
              label="Stop recording"
              variant="secondary"
              loading={stopping}
              disabled={stopping}
              onPress={onStop}
            />
          </View>
        ) : null}

        {message ? (
          <Body
            small
            color={message.bad ? 'danger' : 'textSecondary'}
            accessibilityRole={message.bad ? 'alert' : undefined}>
            {message.text}
          </Body>
        ) : null}
      </View>
    </View>
  );
}
