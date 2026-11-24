import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { dayKey, fromDayKey, monthGrid, startOfDay } from '@/lib/dates';

type DateRangeCalendarProps = {
  /** The chosen range, as "YYYY-MM-DD" day keys. */
  value: { from?: string; to?: string };
  onChange: (next: { from?: string; to?: string }) => void;
  /** Today, injectable so the tests can hold the clock still. */
  now?: Date;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Pick two days from a month.
 *
 * Built by hand from the project's own pieces rather than with a date picker. Expo ships one,
 * but it is a native module: it would mean rebuilding the phone apps to include it, it behaves
 * differently on the web, and the browser scripts could not click it. This works the same in
 * every place Gyan runs, and adds nothing to install.
 *
 * Tapping once sets the first day. Tapping again sets the last day -- or starts over, if the
 * second tap is before the first.
 */
export function DateRangeCalendar({ value, onChange, now = new Date() }: DateRangeCalendarProps) {
  const anchor = fromDayKey(value.from ?? '') ?? now;
  const [shown, setShown] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() });

  const weeks = monthGrid(shown.year, shown.month);
  const monthName = new Date(shown.year, shown.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const today = startOfDay(now);

  const step = (by: number) => {
    const next = new Date(shown.year, shown.month + by, 1);
    setShown({ year: next.getFullYear(), month: next.getMonth() });
  };

  const pick = (day: Date) => {
    const key = dayKey(day);
    // No first day yet, or a whole range already picked: start a new one.
    if (!value.from || (value.from && value.to)) return onChange({ from: key });
    if (key < value.from) return onChange({ from: key });
    return onChange({ from: value.from, to: key });
  };

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Arrow label="Show the month before" glyph="‹" onPress={() => step(-1)} />
        <Body weight="semibold">{monthName}</Body>
        <Arrow label="Show the month after" glyph="›" onPress={() => step(1)} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((day, index) => (
          <View key={index} style={{ flex: 1, alignItems: 'center' }}>
            <Body small color="textSecondary" accessibilityElementsHidden>
              {day}
            </Body>
          </View>
        ))}
      </View>

      {weeks.map((week, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {week.map((day, column) => {
            if (!day) return <View key={column} style={{ flex: 1, height: MinTouchTarget }} />;
            const key = dayKey(day);
            const isStart = key === value.from;
            const isEnd = key === value.to;
            const inside = !!value.from && !!value.to && key > value.from && key < value.to;
            const ahead = startOfDay(day) > today;
            const chosen = isStart || isEnd;

            return (
              <Pressable
                key={column}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen, disabled: ahead }}
                accessibilityLabel={day.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
                disabled={ahead}
                onPress={() => pick(day)}
                style={({ pressed }) => ({
                  flex: 1,
                  height: MinTouchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: Radius.panel / 2,
                  // The two days you picked are outlined; the days between them are filled.
                  // A press is only ever a fill, so "this is chosen" and "my finger is here"
                  // never look the same.
                  borderWidth: 1,
                  borderColor: chosen ? Colors.brand : 'transparent',
                  backgroundColor: chosen || inside || pressed ? Colors.backgroundSelected : 'transparent',
                  opacity: ahead ? 0.35 : 1,
                })}>
                <Body small color={chosen ? 'text' : ahead ? 'textSecondary' : 'text'}>
                  {day.getDate()}
                </Body>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Arrow({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: MinTouchTarget,
        height: MinTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.pill,
        backgroundColor: pressed ? Colors.backgroundSelected : 'transparent',
      })}>
      <Body color="textSecondary" accessibilityElementsHidden>
        {glyph}
      </Body>
    </Pressable>
  );
}
