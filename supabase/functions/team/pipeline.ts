// Inviting somebody to an account: the order things happen in, with no network of its own.
//
// Pure on purpose. Everything that touches the outside world (sending, and the database) is
// handed in, so a test can run the whole thing and check the ORDER, which is where the care is:
// an invite is only allowed to exist if its email really went out.

import { MESSAGES, TeamError, joinUrlFor, messageForSendError, renderInvite } from './invite-email.ts';

/** The shape of the one Supabase call this needs. Kept small so a test can stand in for it. */
export type Db = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type SendInvite = (message: { to: string; subject: string; text: string; html: string }) => Promise<void>;

export type InviteOptions = {
  db: Db;
  send: SendInvite;
  /** Who pressed Invite. Read from their login by the caller, never sent up by the app. */
  userId: string;
  email: string;
  appUrl: string;
};

export type InviteResult = {
  email: string;
  ownerName: string;
  seatsIncluded: number;
  seatsUsed: number;
};

/** The database's short reasons, turned into one plain sentence each. */
export function inviteProblem(error: { message?: string } | null): string {
  const text = error?.message ?? '';
  if (text.includes('not_owner')) return MESSAGES.notOwner;
  if (text.includes('bad_email')) return MESSAGES.badEmail;
  if (text.includes('already_member')) return MESSAGES.alreadyMember;
  if (text.includes('already_invited')) return MESSAGES.alreadyInvited;
  if (text.includes('seats_full')) return MESSAGES.seatsFull;
  if (text.includes('no_account')) return MESSAGES.noAccount;
  return MESSAGES.problem;
}

type ClaimedInvite = {
  invite_id: string;
  invite_account_id: string;
  invite_email: string;
  invite_token: string;
  owner_name: string;
  seats_included: number;
  seats_used: number;
};

function firstRow(data: unknown): ClaimedInvite | undefined {
  if (Array.isArray(data)) return data[0] as ClaimedInvite | undefined;
  return (data ?? undefined) as ClaimedInvite | undefined;
}

/**
 * Invites one person.
 *
 * The order is the whole point:
 *   1. The database decides. It checks the owner, the address, the seats, and only then makes
 *      the invite and hands back the token. Every refusal lives there, in one place.
 *   2. The email goes out.
 *   3. IF THE EMAIL FAILS, THE INVITE IS TAKEN BACK. Otherwise a seat would sit there held by
 *      an invite nobody ever received, and the owner would have no way to see why.
 *   4. Either way it is written down in the email log.
 *
 * The token exists only between step 1 and step 2, inside this server. It is never returned to
 * the app and never written to the log.
 */
export async function runInvite(o: InviteOptions): Promise<InviteResult> {
  const claim = await o.db.rpc('claim_invite', { p_user_id: o.userId, p_email: o.email });
  if (claim.error) throw new TeamError(inviteProblem(claim.error));

  const invite = firstRow(claim.data);
  if (!invite?.invite_token) throw new TeamError(MESSAGES.problem);

  const message = {
    to: invite.invite_email,
    ...renderInvite({
      ownerName: invite.owner_name,
      joinUrl: joinUrlFor(o.appUrl, invite.invite_token),
    }),
  };

  try {
    await o.send(message);
  } catch (e) {
    const why = messageForSendError(e);
    // Take the invite back, so no seat is held by an invite that nobody got. If even this
    // fails there is nothing more to do here: the owner can take it back by hand on the Team
    // screen, which is why that button exists.
    await o.db.rpc('discard_invite', { p_invite_id: invite.invite_id }).catch(() => undefined);
    await o.db
      .rpc('log_account_email', {
        p_account_id: invite.invite_account_id,
        p_kind: 'invite',
        p_recipient_email: invite.invite_email,
        p_result: 'failed',
        p_error_message: why,
        p_sent_by: o.userId,
      })
      .catch(() => undefined);
    throw new TeamError(why);
  }

  await o.db
    .rpc('log_account_email', {
      p_account_id: invite.invite_account_id,
      p_kind: 'invite',
      p_recipient_email: invite.invite_email,
      p_result: 'sent',
      p_error_message: null,
      p_sent_by: o.userId,
    })
    .catch(() => undefined);

  return {
    email: invite.invite_email,
    ownerName: invite.owner_name,
    seatsIncluded: invite.seats_included,
    seatsUsed: invite.seats_used,
  };
}
