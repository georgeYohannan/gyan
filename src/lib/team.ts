/**
 * The people on an account: who is on it, who has been invited, and who may change any of it.
 *
 * The app never makes an invite itself and never sees an invite token. It asks the `team` server
 * function to invite an address; that function holds the mailbox password and the token, and the
 * token only ever travels to the invited person's inbox.
 */
import { getSupabase } from '@/lib/supabase';

export type Member = {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'member';
  /** True when this row is the person looking at the screen. The server decides, not the app. */
  isYou: boolean;
};

export type PendingInvite = {
  id: string;
  email: string;
  createdAt: string;
};

export type Team = {
  accountId: string;
  isOwner: boolean;
  seatsIncluded: number;
  seatsUsed: number;
  members: Member[];
  invites: PendingInvite[];
};

export const MESSAGES = {
  loadProblem: 'Gyan could not read your team just now. Please try again.',
  notOwner: 'Only the account owner can change the team.',
  noAccount: 'Gyan could not find your account.',
  problem: 'Gyan could not do that just now. Please try again.',
  inviteProblem: 'Gyan could not send the invite just now. Please try again.',
  noInvite: 'That invite has already been used or taken back.',
  notAMember: 'That person is not on your account.',
  lastOwner: 'You are the only owner. Make somebody else the owner first.',
  cannotRemoveYourself: 'You cannot remove yourself. Hand the account over to somebody else first.',
  cannotRemoveOwner: 'You cannot remove the account owner.',
  badRole: 'That is not a role Gyan knows about.',
  // Joining a team
  badInvite: 'That invite link does not work any more. Ask for a new one.',
  inviteExpired: 'That invite link has run out. Ask for a new one.',
  wrongEmail: 'That invite was sent to a different email address. Sign in with that address to join.',
  seatsFull: 'That account has no seats left. Ask the owner to free one up.',
  ownNotes:
    'You already have notes in Gyan on your own account. Joining would leave them behind, so Gyan has stopped. Ask to be invited with a different email address.',
  ownTeam: 'You already have people on your own account, so you cannot join another one.',
  ownInvites: 'You have invites still waiting on your own account. Take them back first.',
  ownPlan: 'You are on a paid plan of your own, so you cannot join another account.',
} as const;

type Raw = Record<string, unknown>;

function readMembers(value: unknown): Member[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Raw => !!row && typeof row === 'object')
    .filter((row) => typeof row.user_id === 'string' && typeof row.email === 'string')
    .map((row) => ({
      userId: row.user_id as string,
      email: row.email as string,
      name:
        typeof row.name === 'string' && row.name.trim() !== ''
          ? row.name
          : (row.email as string),
      role: row.role === 'owner' ? 'owner' : 'member',
      isYou: row.is_you === true,
    }));
}

function readInvites(value: unknown): PendingInvite[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Raw => !!row && typeof row === 'object')
    .filter((row) => typeof row.id === 'string' && typeof row.email === 'string')
    .map((row) => ({
      id: row.id as string,
      email: row.email as string,
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    }));
}

export function readTeam(value: unknown): Team {
  const row = (value && typeof value === 'object' ? value : {}) as Raw;
  const seats = typeof row.seats_included === 'number' ? row.seats_included : 1;
  const used = typeof row.seats_used === 'number' ? row.seats_used : 1;
  return {
    accountId: typeof row.account_id === 'string' ? row.account_id : '',
    isOwner: row.is_owner === true,
    seatsIncluded: seats,
    seatsUsed: used,
    members: readMembers(row.members),
    invites: readInvites(row.pending_invites),
  };
}

function teamProblem(message: string | undefined, fallback: string): Error {
  const text = message ?? '';
  if (text.includes('not_owner')) return new Error(MESSAGES.notOwner);
  if (text.includes('no_account')) return new Error(MESSAGES.noAccount);
  if (text.includes('no_invite')) return new Error(MESSAGES.noInvite);
  if (text.includes('not_a_member')) return new Error(MESSAGES.notAMember);
  if (text.includes('last_owner')) return new Error(MESSAGES.lastOwner);
  if (text.includes('cannot_remove_yourself')) return new Error(MESSAGES.cannotRemoveYourself);
  if (text.includes('cannot_remove_owner')) return new Error(MESSAGES.cannotRemoveOwner);
  if (text.includes('bad_role')) return new Error(MESSAGES.badRole);
  return new Error(fallback);
}

/** Who is on the account, and who has been invited. Any member may read this. */
export async function listTeam(): Promise<Team> {
  const { data, error } = await getSupabase().rpc('list_team').single();
  if (error) throw new Error(MESSAGES.loadProblem);
  return readTeam(data);
}

/**
 * Invites one person by email.
 *
 * This goes to the server function, not to the database: making the invite and sending its
 * email have to be one single thing, or a seat could sit there held by an invite that nobody
 * ever received.
 */
export async function inviteByEmail(email: string): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  const { data, error } = (await getSupabase().functions.invoke('team', {
    body: { email },
  })) as { data: Raw | null; error: { message?: string } | null };

  if (error) {
    // The function answers a refusal with ok:false and 200, so a real error here is the network.
    return { ok: false, message: MESSAGES.inviteProblem };
  }
  if (data?.ok === true) {
    return { ok: true, email: typeof data.email === 'string' ? data.email : email };
  }
  return {
    ok: false,
    message: typeof data?.message === 'string' ? data.message : MESSAGES.inviteProblem,
  };
}

/** The owner takes an invite back. The seat it was holding is free again straight away. */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await getSupabase().rpc('revoke_invite', { p_invite_id: inviteId });
  if (error) throw teamProblem(error.message, MESSAGES.problem);
}

/**
 * Hands the account over to somebody else.
 *
 * There is one owner per account, so making somebody the owner means STEPPING DOWN: the person
 * who does it becomes an ordinary member in the same moment. The screen says so before asking.
 */
export async function makeOwner(userId: string): Promise<void> {
  const { error } = await getSupabase().rpc('change_member_role', {
    p_user_id: userId,
    p_role: 'owner',
  });
  if (error) throw teamProblem(error.message, MESSAGES.problem);
}

/** Takes somebody off the account. THE NOTES THEY MADE STAY with the account. */
export async function removeMember(userId: string): Promise<void> {
  const { error } = await getSupabase().rpc('remove_member', { p_user_id: userId });
  if (error) throw teamProblem(error.message, MESSAGES.problem);
}

/** Joins the account an invite link points at. */
export async function acceptInvite(token: string): Promise<{ accountId: string; ownerName: string }> {
  const { data, error } = await getSupabase().rpc('accept_invite', { p_token: token }).single();
  if (error) {
    const text = error.message ?? '';
    if (text.includes('bad_invite')) throw new Error(MESSAGES.badInvite);
    if (text.includes('invite_expired')) throw new Error(MESSAGES.inviteExpired);
    if (text.includes('wrong_email')) throw new Error(MESSAGES.wrongEmail);
    if (text.includes('seats_full')) throw new Error(MESSAGES.seatsFull);
    if (text.includes('own_notes')) throw new Error(MESSAGES.ownNotes);
    if (text.includes('own_team')) throw new Error(MESSAGES.ownTeam);
    if (text.includes('own_invites')) throw new Error(MESSAGES.ownInvites);
    if (text.includes('own_plan')) throw new Error(MESSAGES.ownPlan);
    throw new Error(MESSAGES.problem);
  }
  const row = (data ?? {}) as Raw;
  return {
    accountId: typeof row.joined_account === 'string' ? row.joined_account : '',
    ownerName: typeof row.owner_name === 'string' ? row.owner_name : 'your new team',
  };
}

/** "3 of 5 seats", the one line the Team screen leads with. */
export function seatsSentence(team: Pick<Team, 'seatsIncluded' | 'seatsUsed'>): string {
  return `${team.seatsUsed} of ${team.seatsIncluded} ${team.seatsIncluded === 1 ? 'seat' : 'seats'}`;
}

/** True when there is no room for another person. The number comes from the plans table. */
export function seatsFull(team: Pick<Team, 'seatsIncluded' | 'seatsUsed'>): boolean {
  return team.seatsUsed >= team.seatsIncluded;
}

/** What to say when the seats are all taken. Never a number written in the app. */
export function seatsFullMessage(team: Pick<Team, 'seatsIncluded'>): string {
  return `All ${team.seatsIncluded} ${team.seatsIncluded === 1 ? 'seat is' : 'seats are'} taken. Remove somebody, or change your plan, to invite another person.`;
}
