import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, Radius, Spacing } from '@/constants/theme';

type ProgressBarProps = {
  /** How many have been used. */
  used: number;
  /** How many the plan allows. Always from the plans table, never written in the app. */
  limit: number;
  /** What is being counted, for somebody listening rather than looking: "meetings". */
  label: string;
};

/**
 * How much of an allowance is gone.
 *
 * It draws itself TWO DIFFERENT WAYS, because the number decides which one tells the truth
 * better. A small allowance is something a person counts: five meetings is five things, so it
 * is drawn as five blocks and you can see at a glance that two are gone. Two hundred is not
 * something anybody counts, so that is drawn as one filling bar.
 *
 * The block that was used last is the warm colour, so the eye lands on where you are now
 * rather than having to measure the blue. It is the only warm thing on the screen.
 */
const COUNTABLE_UP_TO = 12;
const TRACK_HEIGHT = 28;

export function ProgressBar({ used, limit, label }: ProgressBarProps) {
  const safeLimit = Math.max(limit, 0);
  const done = Math.min(Math.max(used, 0), safeLimit);
  const full = safeLimit > 0 && used >= safeLimit;

  const shared = {
    // `accessible` makes the whole bar one thing to a screen reader, rather than a pile of
    // blocks it reads out one at a time.
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityLabel: `${used} of ${limit} ${label} used`,
    accessibilityValue: { min: 0, max: safeLimit, now: done },
  };

  if (safeLimit > 0 && safeLimit <= COUNTABLE_UP_TO) {
    return (
      <View
        {...shared}
        style={{
          flexDirection: 'row',
          gap: Spacing.one,
          height: TRACK_HEIGHT,
          padding: Spacing.half,
          borderRadius: Radius.pill,
          borderWidth: 1,
          borderColor: Colors.glassBorder,
          backgroundColor: Colors.glass,
        }}>
        {Array.from({ length: safeLimit }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              borderRadius: Radius.pill,
              backgroundColor:
                i < done ? (i === done - 1 ? Colors.record : Colors.brand) : Colors.skeleton,
            }}
          />
        ))}
      </View>
    );
  }

  const share = safeLimit > 0 ? done / safeLimit : 0;
  return (
    <View
      {...shared}
      style={{
        height: TRACK_HEIGHT,
        padding: Spacing.half,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: Colors.glassBorder,
        backgroundColor: Colors.glass,
      }}>
      <View style={{ flexDirection: 'row', flex: 1, borderRadius: Radius.pill, overflow: 'hidden' }}>
        <View
          style={{
            // A sliver of colour even at zero would say something had been used when nothing had.
            flex: share,
            backgroundColor: full ? Colors.record : Colors.brand,
            borderRadius: Radius.pill,
          }}
        />
        <View style={{ flex: Math.max(1 - share, 0), backgroundColor: 'transparent' }} />
      </View>
    </View>
  );
}

/**
 * The line above the bar: the numbers themselves.
 * Kept separate so a screen can put its own words around them.
 */
export function ProgressNumbers({ used, limit, unit }: { used: number; limit: number; unit: string }) {
  return (
    <Body>
      {used} of {limit} {unit}
    </Body>
  );
}

export { COUNTABLE_UP_TO };
