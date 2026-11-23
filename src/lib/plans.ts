/**
 * The plan an account is on, and how much of it has been used.
 *
 * EVERY NUMBER HERE COMES OUT OF THE DATABASE. Not one limit, seat count or price is written in
 * this file or in any screen. That is a hard rule: an admin changes a number in the plans table
 * and the app says the new number, with no new code.
 */
import { getSupabase } from '@/lib/supabase';

export type PlanAndUsage = {
  accountId: string;
  isOwner: boolean;
  planName: string;
  planDescription: string;
  /** What the plan includes, as whole sentences, with the real numbers already filled in. */
  features: string[];
  /** True when the plan's numbers are stand-ins rather than something anybody has paid for. */
  isTestPlan: boolean;
  meetingsPerMonth: number;
  meetingsUsed: number;
  chatMessagesPerDay: number;
  chatMessagesUsed: number;
  seatsIncluded: number;
  seatsUsed: number;
  /** How long one note may be, in minutes. Empty when the plan does not limit it. */
  maxMeetingMinutes?: number;
};

export const MESSAGES = {
  loadProblem: 'Gyan could not read your plan just now. Please try again.',
  notOwner: 'Only the account owner can change the plan.',
  notAdmin: 'This switch is only for the Gyan team.',
  noAccount: 'Gyan could not find your account.',
  notATestPlan: 'That plan is a real one, so this test switch cannot reach it.',
  realPlan: 'This account is on a real plan, so this test switch cannot change it.',
  tooManyPeople:
    'That plan has fewer seats than you have people. Remove somebody on the Team screen first.',
  switchProblem: 'Gyan could not change the plan just now. Please try again.',
} as const;

/** The names of the plan columns a feature line is allowed to borrow a number from. */
const PLACEHOLDERS = [
  'meetings_per_month',
  'chat_messages_per_day',
  'seats_included',
  'max_meeting_minutes',
] as const;

type Raw = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Puts the real numbers into a plan's feature lines.
 *
 * A line in the plans table says "{meetings_per_month} meetings a month" rather than
 * "5 meetings a month", on purpose: writing the number into the words would be a SECOND COPY of
 * the limit, sitting next to the real one and free to disagree with it. Here the words come
 * from the table and so does every number in them.
 *
 * A line whose number is empty is dropped completely. That is how a plan with no limit on how
 * long a note may be simply does not mention it.
 */
export function featureLines(raw: unknown, plan: Raw): string[] {
  if (!Array.isArray(raw)) return [];
  const lines: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    let line = entry;
    let dropped = false;

    for (const name of PLACEHOLDERS) {
      if (!line.includes(`{${name}}`)) continue;
      const value = plan[name];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        dropped = true;
        break;
      }
      line = line.split(`{${name}}`).join(String(value));
    }

    if (!dropped && line.trim() !== '') lines.push(line);
  }

  return lines;
}

/** Reads whatever the server sent, defending every field, the way the recap settings do. */
export function readPlanAndUsage(value: unknown): PlanAndUsage {
  const row = (value && typeof value === 'object' ? value : {}) as Raw;
  const minutes = row.max_meeting_minutes;
  return {
    accountId: typeof row.account_id === 'string' ? row.account_id : '',
    isOwner: row.is_owner === true,
    planName: typeof row.plan_name === 'string' ? row.plan_name : '',
    planDescription: typeof row.plan_description === 'string' ? row.plan_description : '',
    features: featureLines(row.plan_features, row),
    isTestPlan: row.is_test_plan === true,
    meetingsPerMonth: num(row.meetings_per_month),
    meetingsUsed: num(row.meetings_used),
    chatMessagesPerDay: num(row.chat_messages_per_day),
    chatMessagesUsed: num(row.chat_messages_used),
    seatsIncluded: num(row.seats_included, 1),
    seatsUsed: num(row.seats_used, 1),
    maxMeetingMinutes: typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : undefined,
  };
}

/** The plan, its limits and what has been used. Any member of the account may read this. */
export async function getPlanAndUsage(): Promise<PlanAndUsage> {
  const { data, error } = await getSupabase().rpc('get_plan_and_usage').single();
  if (error) throw new Error(MESSAGES.loadProblem);
  return readPlanAndUsage(data);
}

/**
 * Moves the account onto another plan. THIS IS A TEST-ONLY DOOR.
 *
 * Real payments are not built yet. The database will only ever let this reach a plan whose
 * numbers are marked as stand-ins (or Free, so there is a way back), and only for a Gyan admin,
 * so it can never move a paying customer onto a plan they have not paid for.
 */
export async function setTestPlan(planName: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('set_test_plan', { p_plan_name: planName }).single();
  if (error) {
    const text = error.message ?? '';
    if (text.includes('not_owner')) throw new Error(MESSAGES.notOwner);
    if (text.includes('not_admin')) throw new Error(MESSAGES.notAdmin);
    if (text.includes('not_a_test_plan')) throw new Error(MESSAGES.notATestPlan);
    if (text.includes('real_plan')) throw new Error(MESSAGES.realPlan);
    if (text.includes('too_many_people')) throw new Error(MESSAGES.tooManyPeople);
    if (text.includes('no_account')) throw new Error(MESSAGES.noAccount);
    throw new Error(MESSAGES.switchProblem);
  }
  const row = (data ?? {}) as Raw;
  return typeof row.plan_name === 'string' ? row.plan_name : planName;
}

/** The plans this account could be switched to, for the test-only switch. */
export async function listSwitchablePlans(): Promise<{ name: string; isTest: boolean }[]> {
  const { data, error } = await getSupabase()
    .from('plans')
    .select('name, is_test, is_active')
    .eq('is_active', true)
    .order('meetings_per_month', { ascending: true });
  if (error) throw new Error(MESSAGES.loadProblem);
  return (data ?? [])
    .map((row) => ({ name: String((row as Raw).name ?? ''), isTest: (row as Raw).is_test === true }))
    .filter((plan) => plan.name !== '' && (plan.isTest || plan.name === 'Free'));
}
