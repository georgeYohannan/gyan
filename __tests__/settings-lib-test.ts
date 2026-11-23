/**
 * The reading and wording helpers behind the Settings screens.
 *
 * The one that matters most is featureLines: it is what keeps "what your plan includes" honest,
 * by making the words come from the table AND the numbers in them come from the real columns.
 */
import { CONFIRM_WORD, confirmed, readDeleteCheck } from '@/lib/account';
import { testToolsOn } from '@/lib/environment';
import { featureLines, readPlanAndUsage } from '@/lib/plans';
import { readTeam, seatsFull, seatsFullMessage, seatsSentence } from '@/lib/team';

describe('what a plan includes', () => {
  const plan = {
    meetings_per_month: 50,
    chat_messages_per_day: 200,
    seats_included: 5,
    max_meeting_minutes: 180,
  };

  test('a line names the column, and the real number is put in', () => {
    expect(featureLines(['{meetings_per_month} meetings a month'], plan)).toEqual(['50 meetings a month']);
    expect(featureLines(['Up to {seats_included} people'], plan)).toEqual(['Up to 5 people']);
  });

  test('several numbers in one line all get filled in', () => {
    expect(featureLines(['{seats_included} seats, {meetings_per_month} meetings'], plan)).toEqual([
      '5 seats, 50 meetings',
    ]);
  });

  test('A LINE WHOSE NUMBER IS EMPTY IS DROPPED, rather than printed with a hole in it', () => {
    const free = { ...plan, max_meeting_minutes: null };
    expect(featureLines(['Notes up to {max_meeting_minutes} minutes long', 'Everything else'], free)).toEqual([
      'Everything else',
    ]);
  });

  test('a line with no number in it is left exactly as the table wrote it', () => {
    expect(featureLines(['Translate any note into another language'], plan)).toEqual([
      'Translate any note into another language',
    ]);
  });

  test('rubbish in the features column cannot break the screen', () => {
    expect(featureLines(null, plan)).toEqual([]);
    expect(featureLines('not a list', plan)).toEqual([]);
    expect(featureLines([1, null, {}, '  ', 'Real line'], plan)).toEqual(['Real line']);
  });

  test('the whole answer survives a server that sends nothing useful', () => {
    const empty = readPlanAndUsage(undefined);
    expect(empty.planName).toBe('');
    expect(empty.meetingsPerMonth).toBe(0);
    expect(empty.seatsIncluded).toBe(1);
    expect(empty.isOwner).toBe(false);
    expect(empty.features).toEqual([]);
  });

  test('it reads a real answer, numbers and words together', () => {
    const plan = readPlanAndUsage({
      account_id: 'a1',
      is_owner: true,
      plan_name: 'Pro',
      plan_description: 'Stand-ins.',
      plan_features: ['{meetings_per_month} meetings a month'],
      is_test_plan: true,
      meetings_per_month: 50,
      meetings_used: 7,
      chat_messages_per_day: 200,
      chat_messages_used: 9,
      seats_included: 5,
      seats_used: 3,
      max_meeting_minutes: 180,
    });
    expect(plan.features).toEqual(['50 meetings a month']);
    expect(plan.isTestPlan).toBe(true);
    expect(plan.meetingsUsed).toBe(7);
    expect(plan.maxMeetingMinutes).toBe(180);
  });
});

describe('seats', () => {
  const team = (included: number, used: number) => ({ seatsIncluded: included, seatsUsed: used });

  test('it counts in words a person would use', () => {
    expect(seatsSentence(team(5, 3))).toBe('3 of 5 seats');
    expect(seatsSentence(team(1, 1))).toBe('1 of 1 seat');
  });

  test('full is full, and over full is still full', () => {
    expect(seatsFull(team(5, 4))).toBe(false);
    expect(seatsFull(team(5, 5))).toBe(true);
    expect(seatsFull(team(5, 6))).toBe(true);
  });

  test('THE BLOCKING MESSAGE CARRIES THE PLAN’S OWN NUMBER, never one written in the app', () => {
    expect(seatsFullMessage({ seatsIncluded: 5 })).toBe(
      'All 5 seats are taken. Remove somebody, or change your plan, to invite another person.',
    );
    expect(seatsFullMessage({ seatsIncluded: 1 })).toBe(
      'All 1 seat is taken. Remove somebody, or change your plan, to invite another person.',
    );
    expect(seatsFullMessage({ seatsIncluded: 999 })).toContain('All 999 seats');
  });

  test('a team answer is read safely, however odd it is', () => {
    const team = readTeam({
      account_id: 'a1',
      is_owner: true,
      seats_included: 5,
      seats_used: 2,
      members: [
        { user_id: 'u1', email: 'sam@example.test', name: 'Sam', role: 'owner', is_you: true },
        { user_id: 'u2', email: 'ada@example.test', role: 'member' },
        { email: 'no-id@example.test' },
        'rubbish',
      ],
      pending_invites: [{ id: 'i1', email: 'waiting@example.test', created_at: '2026-11-19' }],
    });
    expect(team.members).toHaveLength(2);
    // Somebody with no name set is called by their address rather than by nothing.
    expect(team.members[1].name).toBe('ada@example.test');
    expect(team.members[1].isYou).toBe(false);
    expect(team.invites).toHaveLength(1);
  });

  test('an empty answer does not pretend there are no seats', () => {
    expect(readTeam(undefined).seatsIncluded).toBe(1);
    expect(readTeam(undefined).isOwner).toBe(false);
    expect(readTeam(undefined).members).toEqual([]);
  });
});

describe('deleting', () => {
  test('only the exact word counts, and stray spaces are forgiven', () => {
    expect(confirmed('DELETE')).toBe(true);
    expect(confirmed('  DELETE  ')).toBe(true);
    expect(confirmed('delete')).toBe(false);
    expect(confirmed('Delete')).toBe(false);
    expect(confirmed('DELETE NOW')).toBe(false);
    expect(confirmed('')).toBe(false);
  });

  test('the word a person has to type is the one the screen asks for', () => {
    expect(CONFIRM_WORD).toBe('DELETE');
  });

  test('a check that says no comes back with its reason, and nothing to press', () => {
    const check = readDeleteCheck({
      is_owner: true,
      can_delete: false,
      reason: 'There is 1 other person on your account.',
      what_goes: null,
      note_count: 4,
      other_member_count: 1,
      pending_invite_count: 0,
    });
    expect(check.canDelete).toBe(false);
    expect(check.reason).toContain('1 other person');
    expect(check.whatGoes).toBeUndefined();
  });

  test('a missing answer is treated as "no", never as "yes"', () => {
    expect(readDeleteCheck(undefined).canDelete).toBe(false);
    expect(readDeleteCheck(null).canDelete).toBe(false);
    expect(readDeleteCheck({}).canDelete).toBe(false);
  });
});

describe('THE BUILDERS’ TEST TOOLS ARE OFF UNLESS A BUILD SAYS OTHERWISE', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS;
  });

  test('not set at all means off, which is the safe way round', () => {
    delete process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS;
    expect(testToolsOn()).toBe(false);
  });

  test.each(['0', 'true', 'yes', 'on', '1 ', '', 'TRUE'])('%p is not on', (value) => {
    process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS = value;
    expect(testToolsOn()).toBe(false);
  });

  test('only exactly 1 turns them on', () => {
    process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS = '1';
    expect(testToolsOn()).toBe(true);
  });
});
