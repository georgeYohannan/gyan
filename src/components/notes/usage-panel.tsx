import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { Spacing } from '@/constants/theme';
import { isLimitReached, type Usage } from '@/lib/notes';

export const LIMIT_MESSAGE = 'You have used all your meetings for this month. They start again on the 1st. Pasted text still works.';

/**
 * "Meetings used this month: 2 of 5", with the meter under it. The 5 comes from the plans table.
 *
 * This lives on New note, which is the one screen where the number changes what you do next.
 * It used to be on Home as well, above a person's own notes, where it was the least important
 * thing on the screen -- Home says one quiet line instead now (see `usage-line.tsx`).
 *
 * The meter is `ui/progress-bar.tsx`, which already existed and which this screen was not
 * using: on a small plan it draws one block per meeting, so five meetings look like five
 * things and you can see that two are gone without reading a number.
 */
export function UsagePanel({ usage, loading }: { usage?: Usage; loading?: boolean }) {
  if (loading) {
    return (
      <View style={{ gap: Spacing.two }}>
        <Skeleton width="60%" />
        <Skeleton width="100%" height={28} />
      </View>
    );
  }
  if (!usage) return null;
  const reached = isLimitReached(usage.used, usage.limit);
  return (
    <View style={{ gap: Spacing.two }}>
      <Body>
        Meetings used this month: {usage.used} of {usage.limit}
      </Body>
      <ProgressBar used={usage.used} limit={usage.limit} label="meetings" />
      <Body small color="textSecondary">
        {usage.planName} plan
      </Body>
      {reached ? (
        <Body small color="danger" accessibilityRole="alert">
          {LIMIT_MESSAGE}
        </Body>
      ) : null}
    </View>
  );
}
