import { View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Body } from './body';

export const STATUSES = ['Uploading', 'Queued', 'Transcribing', 'Summarizing', 'Ready', 'Failed'] as const;
export type Status = (typeof STATUSES)[number];

const look: Record<Status, { fill: string; border: string; text: 'text' | 'link' | 'success' | 'danger' }> = {
  Uploading: { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  Queued: { fill: Colors.glass, border: Colors.glassBorder, text: 'text' },
  Transcribing: { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  Summarizing: { fill: Colors.glass, border: Colors.glassBorder, text: 'link' },
  Ready: { fill: Colors.successFill, border: Colors.successFill, text: 'success' },
  Failed: { fill: Colors.dangerFill, border: Colors.dangerBorder, text: 'danger' },
};

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
