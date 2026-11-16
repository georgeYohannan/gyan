import { Body } from '@/components/ui/body';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { isLimitReached, type Usage } from '@/lib/notes';

export const LIMIT_MESSAGE = 'You have used all your meetings for this month. They start again on the 1st. Pasted text still works.';

/** "Meetings used this month: 2 of 5". The 5 comes from the plans table. */
export function UsagePanel({ usage, loading }: { usage?: Usage; loading?: boolean }) {
  if (loading) {
    return (
      <GlassPanel>
        <Skeleton width="60%" />
      </GlassPanel>
    );
  }
  if (!usage) return null;
  const reached = isLimitReached(usage.used, usage.limit);
  return (
    <GlassPanel>
      <Body>
        Meetings used this month: {usage.used} of {usage.limit}
      </Body>
      <Body small color="textSecondary">
        {usage.planName} plan
      </Body>
      {reached ? (
        <Body small color="danger" accessibilityRole="alert">
          {LIMIT_MESSAGE}
        </Body>
      ) : null}
    </GlassPanel>
  );
}
