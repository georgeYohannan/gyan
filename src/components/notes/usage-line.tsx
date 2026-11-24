import { LIMIT_MESSAGE } from '@/components/notes/usage-panel';
import { Body } from '@/components/ui/body';
import { isLimitReached, type Usage } from '@/lib/notes';

/** Below this many meetings left, Home starts mentioning it. */
const QUIET_UNTIL = 1;

/** True when Home should say anything at all about the month's meetings. */
export function usageWorthSaying(usage?: Usage): boolean {
  if (!usage) return false;
  return usage.limit - usage.used <= QUIET_UNTIL;
}

/**
 * One quiet line on Home, and only when the month is nearly spent.
 *
 * Home used to open with a panel saying "Meetings used this month: 0 of 5". That is the least
 * important thing on the screen for all but the last meeting of the month, and it sat above a
 * person's own notes. So Home now leads with the notes and says this only when there is one
 * meeting left or none -- which is exactly when knowing changes what you do next.
 *
 * The whole meter did not disappear: it still lives on Settings -> Plan and usage, where
 * somebody who wants the number can go and read it. This is a warning, not a dashboard.
 */
export function UsageLine({ usage }: { usage?: Usage }) {
  if (!usageWorthSaying(usage) || !usage) return null;

  if (isLimitReached(usage.used, usage.limit)) {
    return (
      <Body small color="danger" accessibilityRole="alert">
        {LIMIT_MESSAGE}
      </Body>
    );
  }

  const left = usage.limit - usage.used;
  return (
    <Body small color="textSecondary">
      {`${left} ${left === 1 ? 'meeting' : 'meetings'} left this month on the ${usage.planName} plan. Pasted text is always free.`}
    </Body>
  );
}
