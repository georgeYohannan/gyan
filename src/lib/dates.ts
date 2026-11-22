/**
 * Dates for the Home list: the filter presets, the day headings, and one formatter.
 *
 * Everything here works in the PERSON'S OWN time zone, which is the only way "Today" and
 * "Yesterday" can mean what they say. That is deliberately different from the monthly meeting
 * count, which counts in UTC because the usage table does (src/lib/notes.ts, currentMonthStart).
 * So for somebody west of UTC, "This month" as a filter and "Meetings used this month" in the
 * box at the top of Home can disagree for a few hours around the 1st. The help text says so.
 *
 * Every function takes the current time as an argument so the tests can hold the clock still.
 */

/** The date filters offered on Home. 'any' means no date filter at all. */
export const DATE_PRESETS = ['any', 'today', 'last7', 'last30', 'month', 'custom'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const PRESET_LABEL: Record<DatePreset, string> = {
  any: 'Any time',
  today: 'Today',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  month: 'This month',
  custom: 'Custom range',
};

/** A range the database understands: from is included, to is not. */
export type DateRange = { from?: string; to?: string };

/** Midnight at the start of this day, where the person is. */
export function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Midnight n days before the start of this day. */
export function daysBefore(date: Date, days: number): Date {
  const out = startOfDay(date);
  out.setDate(out.getDate() - days);
  return out;
}

/** The Sunday that starts this week. The first market is the United States. */
export function startOfWeek(date: Date): Date {
  const out = startOfDay(date);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

/** A plain "YYYY-MM-DD" for the day this moment falls on, where the person is. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Reads a "YYYY-MM-DD" back as midnight on that day, where the person is. */
export function fromDayKey(key: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const out = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(out.getTime()) || out.getMonth() !== Number(month) - 1) return undefined;
  return out;
}

/**
 * Turns a preset into the range the database is asked for. A custom range takes two day keys;
 * the second day is included in full, which is why `to` is the midnight AFTER it.
 */
export function rangeFor(
  preset: DatePreset,
  custom: { from?: string; to?: string } = {},
  now = new Date(),
): DateRange {
  const tomorrow = daysBefore(now, -1);
  switch (preset) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: tomorrow.toISOString() };
    case 'last7':
      return { from: daysBefore(now, 6).toISOString(), to: tomorrow.toISOString() };
    case 'last30':
      return { from: daysBefore(now, 29).toISOString(), to: tomorrow.toISOString() };
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from: first.toISOString(), to: next.toISOString() };
    }
    case 'custom': {
      const from = custom.from ? fromDayKey(custom.from) : undefined;
      const toDay = custom.to ? fromDayKey(custom.to) : undefined;
      // Two dates the wrong way round are a slip, not an empty answer. Swap them.
      const [early, late] = from && toDay && from > toDay ? [toDay, from] : [from, toDay];
      return {
        from: early ? early.toISOString() : undefined,
        to: late ? daysBefore(late, -1).toISOString() : undefined,
      };
    }
    default:
      return {};
  }
}

/** Says a custom range in plain words, for the chip on Home. */
export function describeRange(custom: { from?: string; to?: string }): string {
  const from = custom.from ? fromDayKey(custom.from) : undefined;
  const to = custom.to ? fromDayKey(custom.to) : undefined;
  if (from && to) return `${shortDate(from)} to ${shortDate(to)}`;
  if (from) return `From ${shortDate(from)}`;
  if (to) return `Up to ${shortDate(to)}`;
  return PRESET_LABEL.custom;
}

/**
 * Which heading a note sits under: Today, Yesterday, This week, or the month it happened in.
 * There is deliberately no "Earlier": with hundreds of notes, one bucket holding all of them
 * says nothing at all.
 */
export function dayBucket(when: string | Date, now = new Date()): string {
  const date = typeof when === 'string' ? new Date(when) : when;
  if (Number.isNaN(date.getTime())) return 'Earlier';

  const today = startOfDay(now);
  const day = startOfDay(date);
  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === daysBefore(now, 1).getTime()) return 'Yesterday';
  if (day >= startOfWeek(now)) return 'This week';

  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return date.getFullYear() === now.getFullYear() ? month : `${month} ${date.getFullYear()}`;
}

/** "Nov 15, 2026". The one place Home and the note rows agree on how a date looks. */
export function formatNoteDate(when: string | Date): string {
  const date = typeof when === 'string' ? new Date(when) : when;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "15 Nov", for places that are tight and already say the year elsewhere. */
export function shortDate(when: string | Date): string {
  const date = typeof when === 'string' ? new Date(when) : when;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "1:04" or "1:02:03", for a moment inside a recording. */
export function formatMoment(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** The days of a month, as a grid of weeks starting Sunday. Empty slots are undefined. */
export function monthGrid(year: number, month: number): (Date | undefined)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | undefined)[] = Array.from({ length: first.getDay() }, () => undefined);
  for (let day = 1; day <= days; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(undefined);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}
