// The invite email: the words, the link, and the two versions of it.
//
// Pure. It builds strings and nothing else: no network, no keys, no database. That is what lets
// a test read every sentence, and lets a browser script photograph the email without one ever
// being sent.
import { SENDER } from '../_shared/sender.ts';
import { INVITE_MAX_AGE_DAYS, INVITE_PATH } from './settings.ts';

export class TeamError extends Error {}

export const MESSAGES = {
  notOwner: 'Only the account owner can invite people.',
  badEmail: 'That does not look like an email address. Check it and try again.',
  alreadyMember: 'That person is already on your account.',
  alreadyInvited: 'That person has already been invited. Their invite is still waiting.',
  seatsFull: 'All your seats are taken. Remove somebody, or change your plan, to invite another person.',
  noAccount: 'Gyan could not find your account.',
  sendProblem: 'Gyan could not send the invite just now. Nobody was invited. Please try again.',
  notSetUp: 'Gyan cannot send emails yet. The email service is not set up on the server.',
  problem: 'Gyan could not send that invite just now. Please try again.',
} as const;

/** What the mail server refused, in words the owner can act on. */
export function messageForSendError(e: unknown): string {
  const text = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  if (text.includes('auth') || text.includes('535') || text.includes('password')) {
    return 'Gyan could not sign in to its mailbox, so the invite was not sent. The mailbox password on the server needs checking.';
  }
  if (text.includes('timeout') || text.includes('timed out') || text.includes('connect')) {
    return 'Gyan could not reach the mail server, so the invite was not sent. Please try again in a minute.';
  }
  return MESSAGES.sendProblem;
}

/** The link the invited person taps. The token is the key, so it only ever lives in the email. */
export function joinUrlFor(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}${INVITE_PATH}?token=${encodeURIComponent(token)}`;
}

export type InviteWords = {
  /** The name of the person doing the inviting, already worked out by the database. */
  ownerName: string;
  joinUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function subjectFor(ownerName: string): string {
  return `${ownerName} invited you to gyan`;
}

/**
 * The plain words version, written by hand rather than stripped out of the pretty one.
 * Some mail apps show only this, so it has to carry the same facts on its own. A test checks
 * that both versions say the same things.
 */
export function inviteText(w: InviteWords): string {
  return [
    `${w.ownerName} has invited you to join them on gyan.`,
    '',
    'gyan takes notes for you. It writes down what was said in a meeting, who said it, what was',
    'decided, and what everybody agreed to do.',
    '',
    'Join here:',
    w.joinUrl,
    '',
    `This link works for ${INVITE_MAX_AGE_DAYS} days, and only for this email address.`,
    'If you were not expecting this, you can ignore it. Nothing happens until you tap the link.',
    '',
    'gyan',
    `Sent by gyan on behalf of ${w.ownerName}.`,
  ].join('\n');
}

/**
 * The pretty version. Tables and styles written straight onto each tag, because that is the
 * only thing every mail app understands. Brand blue is a fill only, never text, and links are
 * the lighter blue, exactly as everywhere else in gyan.
 */
export function inviteHtml(w: InviteWords): string {
  const owner = escapeHtml(w.ownerName);
  const url = escapeHtml(w.joinUrl);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0B1220;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0B1220;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#0F172A;border:1px solid rgba(255,255,255,0.14);border-radius:20px;">
<tr><td style="padding:32px 24px 8px 24px;">
<h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;color:#FFFFFF;font-weight:bold;">${owner} invited you to gyan</h1>
</td></tr>
<tr><td style="padding:8px 24px 0 24px;">
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#E2E8F0;">gyan takes notes for you. It writes down what was said in a meeting, who said it, what was decided, and what everybody agreed to do.</p>
</td></tr>
<tr><td align="center" style="padding:8px 24px 24px 24px;">
<a href="${url}" style="display:inline-block;background:#0066FF;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:999px;">Join ${owner} on gyan</a>
</td></tr>
<tr><td style="padding:0 24px 24px 24px;">
<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#94A3B8;">This link works for ${INVITE_MAX_AGE_DAYS} days, and only for this email address.</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#94A3B8;">If you were not expecting this, you can ignore it. Nothing happens until you tap the link.</p>
</td></tr>
<tr><td style="padding:0 24px 28px 24px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94A3B8;">gyan</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94A3B8;">Sent by gyan on behalf of ${owner}.</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94A3B8;">Reply to this email to reach us.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/** The whole invite email, both versions, ready for the mailer. */
export function renderInvite(w: InviteWords): { subject: string; text: string; html: string } {
  return { subject: subjectFor(w.ownerName), text: inviteText(w), html: inviteHtml(w) };
}

/** Handy for a test: the address the email comes from, never written into the layout above. */
export const INVITE_SENDER = SENDER;
