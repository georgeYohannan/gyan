import {
  dayBucket,
  dayKey,
  describeRange,
  formatMoment,
  formatNoteDate,
  fromDayKey,
  monthGrid,
  PRESET_LABEL,
  rangeFor,
  startOfWeek,
} from '@/lib/dates';

// Every date here is built from local parts on purpose, so these tests mean the same thing on a
// machine in London and a machine in California. The app's day headings are local too: that is
// the only way "Today" can mean today.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

// Saturday 21 November 2026, mid-morning.
const NOW = at(2026, 11, 21, 9, 30);

describe('the date filter presets', () => {
  test('Today is from this midnight to the next one', () => {
    const range = rangeFor('today', {}, NOW);
    expect(range.from).toBe(at(2026, 11, 21, 0, 0).toISOString());
    expect(range.to).toBe(at(2026, 11, 22, 0, 0).toISOString());
  });

  test('Last 7 days includes today, so it starts 6 days back', () => {
    const range = rangeFor('last7', {}, NOW);
    expect(range.from).toBe(at(2026, 11, 15, 0, 0).toISOString());
    expect(range.to).toBe(at(2026, 11, 22, 0, 0).toISOString());
  });

  test('Last 30 days includes today, so it starts 29 days back', () => {
    expect(rangeFor('last30', {}, NOW).from).toBe(at(2026, 10, 23, 0, 0).toISOString());
  });

  test('This month runs from the 1st to the 1st of next month', () => {
    const range = rangeFor('month', {}, NOW);
    expect(range.from).toBe(at(2026, 11, 1, 0, 0).toISOString());
    expect(range.to).toBe(at(2026, 12, 1, 0, 0).toISOString());
  });

  test('Any time asks for no dates at all', () => {
    expect(rangeFor('any', {}, NOW)).toEqual({});
  });

  test('a custom range includes the whole of the last day', () => {
    // Somebody who picks 1 to 3 November means all of the 3rd, not midnight on the 3rd.
    const range = rangeFor('custom', { from: '2026-11-01', to: '2026-11-03' }, NOW);
    expect(range.from).toBe(at(2026, 11, 1, 0, 0).toISOString());
    expect(range.to).toBe(at(2026, 11, 4, 0, 0).toISOString());
  });

  test('two custom dates the wrong way round are a slip, not an empty answer', () => {
    const range = rangeFor('custom', { from: '2026-11-03', to: '2026-11-01' }, NOW);
    expect(range.from).toBe(at(2026, 11, 1, 0, 0).toISOString());
    expect(range.to).toBe(at(2026, 11, 4, 0, 0).toISOString());
  });

  test('half a custom range is still a range', () => {
    expect(rangeFor('custom', { from: '2026-11-01' }, NOW).to).toBeUndefined();
    expect(rangeFor('custom', { to: '2026-11-01' }, NOW).from).toBeUndefined();
  });

  test('a date that is not a date is ignored rather than argued with', () => {
    expect(rangeFor('custom', { from: 'yesterday please' }, NOW)).toEqual({ from: undefined, to: undefined });
    expect(fromDayKey('2026-02-31')).toBeUndefined();
    expect(fromDayKey('')).toBeUndefined();
  });

  test('a day key survives the round trip', () => {
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
    expect(fromDayKey('2026-01-05')?.getMonth()).toBe(0);
    expect(fromDayKey('2026-01-05')?.getDate()).toBe(5);
  });

  test('a custom range says itself in plain words', () => {
    expect(describeRange({ from: '2026-11-01', to: '2026-11-03' })).toBe('Nov 1 to Nov 3');
    expect(describeRange({ from: '2026-11-01' })).toBe('From Nov 1');
    expect(describeRange({ to: '2026-11-03' })).toBe('Up to Nov 3');
    expect(describeRange({})).toBe(PRESET_LABEL.custom);
  });
});

describe('the day headings', () => {
  test('today and yesterday are named', () => {
    expect(dayBucket(at(2026, 11, 21, 8, 0), NOW)).toBe('Today');
    expect(dayBucket(at(2026, 11, 20, 23, 59), NOW)).toBe('Yesterday');
  });

  test('a minute after midnight is still today, and a minute before it is not', () => {
    // The trap here is counting in UTC: for anybody west of UTC, 23:30 last night is already
    // "tomorrow" in UTC and would be filed under the wrong day.
    expect(dayBucket(at(2026, 11, 21, 0, 1), NOW)).toBe('Today');
    expect(dayBucket(at(2026, 11, 20, 23, 59), NOW)).toBe('Yesterday');
  });

  test('the rest of this week is This week, counting from Sunday', () => {
    // 21 November 2026 is a Saturday, so this week began on Sunday the 15th.
    expect(startOfWeek(NOW).getDate()).toBe(15);
    expect(dayBucket(at(2026, 11, 16), NOW)).toBe('This week');
    expect(dayBucket(at(2026, 11, 15), NOW)).toBe('This week');
  });

  test('anything older is filed under its month, never a single "Earlier" heap', () => {
    expect(dayBucket(at(2026, 11, 14), NOW)).toBe('November');
    expect(dayBucket(at(2026, 9, 3), NOW)).toBe('September');
    expect(dayBucket(at(2025, 9, 3), NOW)).toBe('September 2025');
  });

  test('on a Sunday, This week holds only today', () => {
    const sunday = at(2026, 11, 22, 10, 0);
    expect(dayBucket(at(2026, 11, 22, 1, 0), sunday)).toBe('Today');
    expect(dayBucket(at(2026, 11, 21, 10, 0), sunday)).toBe('Yesterday');
    expect(dayBucket(at(2026, 11, 20, 10, 0), sunday)).toBe('November');
  });

  test('a date that cannot be read does not break the list', () => {
    expect(dayBucket('not a date', NOW)).toBe('Earlier');
  });
});

describe('showing a date or a moment', () => {
  test('a note date reads the way it always has', () => {
    expect(formatNoteDate(at(2026, 11, 15))).toBe('Nov 15, 2026');
    expect(formatNoteDate('nonsense')).toBe('');
  });

  test('a moment in a recording is minutes and seconds, and hours only when there are some', () => {
    expect(formatMoment(0)).toBe('0:00');
    expect(formatMoment(64000)).toBe('1:04');
    expect(formatMoment(3723000)).toBe('1:02:03');
    expect(formatMoment(-5)).toBe('0:00');
  });
});

describe('the month grid the calendar draws', () => {
  test('November 2026 starts on a Sunday and needs five rows', () => {
    const grid = monthGrid(2026, 10);
    expect(grid).toHaveLength(5);
    expect(grid[0][0]?.getDate()).toBe(1);
    expect(grid[4][6]).toBeUndefined();
  });

  test('every row is a full week, and every day of the month appears once', () => {
    const grid = monthGrid(2026, 1); // February 2026
    expect(grid.every((row) => row.length === 7)).toBe(true);
    const days = grid.flat().filter(Boolean).map((d) => d!.getDate());
    expect(days).toEqual([...Array(28)].map((_, i) => i + 1));
  });
});
