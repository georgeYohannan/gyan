import { View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Body } from './body';

/**
 * Every state a note can be in, in the order it goes through them.
 *
 * The first three are a meeting bot's own part, added in prompt 14: it asks to be let into the
 * call, it waits for somebody to admit it, and then it records. Once the recording is in Gyan's
 * own storage the note becomes Queued -- which is exactly where an upload starts -- and from there
 * on a bot note is indistinguishable from any other note.
 *
 * "In waiting room" is three words rather than one because it is the one state where the person
 * has something to DO: go and let the bot in.
 */
export const STATUSES = [
  'Uploading',
  'Joining',
  'In waiting room',
  'Recording',
  'Queued',
  'Transcribing',
  'Summarizing',
  'Ready',
  'Failed',
] as const;
export type Status = (typeof STATUSES)[number];

const look: Record<Status, { fill: string; border: string; text: 'text' | 'link' | 'success' | 'danger' }> = {
  Uploading: { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  // A bot's three states reuse the quiet glass look the other working states already have, so
  // nothing new is invented and no new colour has to be checked for contrast.
  Joining: { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  'In waiting room': { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  Recording: { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  Queued: { fill: Colors.glass, border: Colors.glassBorder, text: 'text' },
  Transcribing: { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  Summarizing: { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  Ready: { fill: Colors.successFill, border: Colors.successFill, text: 'success' },
  Failed: { fill: Colors.dangerFill, border: Colors.dangerBorder, text: 'danger' },
};

/**
 * The states where Gyan is still doing something, so the screen keeps asking for news.
 *
 * This list existed as three separate copies -- Home's poll, the note page's poll and the blue
 * strip on a note row -- which was fine while it held four words and became a trap the moment
 * prompt 14 added three more. One copy means a fix reaches every one of them at once, which is
 * the same argument _shared/guard.ts makes about the server's checks.
 */
export const WORKING_STATUSES: readonly Status[] = [
  'Uploading',
  'Joining',
  'In waiting room',
  'Recording',
  'Queued',
  'Transcribing',
  'Summarizing',
];

/** True while a note is still being made, so a screen should keep asking for news. */
export function isWorking(status: Status): boolean {
  return WORKING_STATUSES.includes(status);
}

/**
 * The states a meeting bot is in before its recording is Gyan's own. In these, and only these, the
 * person can still stop the bot.
 */
export const BOT_LIVE_STATUSES: readonly Status[] = ['Joining', 'In waiting room', 'Recording'];

/** A small pill that says where a note is in its journey. Always shows the word, not just a color. */
export function StatusBadge({ status, testID }: { status: Status; testID?: string }) {
  const v = look[status];
  return (
    <View
      testID={testID}
      accessibilityLabel={`Status: ${status}`}
      style={{
        alignSelf: 'flex-start',
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: v.border,
        backgroundColor: v.fill,
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.three,
      }}>
      <Body small color={v.text} weight="semibold">
        {status}
      </Body>
    </View>
  );
}
