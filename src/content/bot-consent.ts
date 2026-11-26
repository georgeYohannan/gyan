/**
 * DRAFT — PENDING LAWYER REVIEW.
 *
 * Every word Gyan says about recording a meeting with a bot lives in this one file: what the
 * person confirms before a bot is ever sent, and what the bot itself says in the meeting chat
 * when it joins. Changing the words is changing this file and nothing else.
 *
 * WHY IT IS MARKED DRAFT. docs/product-spec.md and docs/decisions.md (2026-11-18) both say the
 * meeting bot stays behind a switch until a lawyer has reviewed this wording. Recording laws
 * differ by state in the first market: some US states need only one person in the call to agree,
 * and others need everybody. Gyan does not try to work out which applies -- it asks the person
 * sending the bot to confirm that they have the right to record, and it tells everybody in the
 * call that recording is happening. A lawyer has to decide whether that is enough, and the DRAFT
 * marker below is what __tests__/bot-consent-test.ts refuses to let anybody quietly remove.
 *
 * Nothing here is legal advice and nothing here may be presented as compliance with anything.
 */

/** Removing this marker is a test failure. Only a lawyer's sign-off may take it out. */
export const BOT_CONSENT_STATUS = 'DRAFT' as const;

/**
 * What the person confirms, as a tick box, every time before a bot is sent.
 *
 * It is per bot, not once per person. The sign-in note (src/lib/consent.ts) is a one-off
 * explanation of what Gyan does; this is a statement about ONE meeting, and it is stored on that
 * meeting's own row as the evidence that it was given.
 */
export const BOT_CONSENT_LINES = [
  'I have the right to record this meeting.',
  'I will tell everyone in the call that it is being recorded.',
  'Gyan will also say so in the meeting chat when it joins.',
] as const;

/** The heading above those lines, and the words on the button. */
export const BOT_CONSENT_TITLE = 'Before Gyan joins';
export const BOT_CONSENT_TICK = 'I confirm all three';
export const BOT_CONSENT_NOT_TICKED = 'Tick the box above to send the bot.';

/**
 * What the bot says in the meeting chat, to everybody, the moment it joins — and again to each
 * person who arrives afterwards.
 *
 * UNDER 500 CHARACTERS ON PURPOSE. Google Meet refuses a chat message longer than 500 (Zoom and
 * Teams allow 4,096), and a notice that silently fails to send on one of the three platforms
 * would be worse than no feature at all. A test keeps it under the limit.
 *
 * It names who asked for it, because "a bot is recording" invites the question "whose?" and the
 * answer being right there is the difference between a notetaker and a surprise.
 */
export function botChatNotice(botName: string, askedBy: string | null): string {
  const who = askedBy && askedBy.trim() !== '' ? ` at the request of ${askedBy.trim()}` : '';
  return (
    `${botName} is recording this meeting${who}, to write notes and a summary afterwards. ` +
    'If you would rather not be recorded, please say so now and the recording will be stopped.'
  );
}

/** Raise this whenever any of the words above change, so a fresh confirmation is asked for. */
export const BOT_CONSENT_VERSION = 'v1';

/**
 * A short fingerprint of the exact words confirmed, stored beside the confirmation.
 *
 * The same mechanism, and the same reason, as consentFingerprint in src/lib/consent.ts: a version
 * number is something a person types and could forget to raise, while a fingerprint is worked out
 * from the words themselves and cannot disagree with what was on the screen. It is not a secret
 * and does not need to be hard to reverse — the words are printed on the screen.
 */
export function botConsentFingerprint(lines: readonly string[] = BOT_CONSENT_LINES): string {
  const text = lines.join('\n');
  let a = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    a ^= text.charCodeAt(i);
    a = Math.imul(a, 0x01000193) >>> 0;
  }
  return `${BOT_CONSENT_VERSION}-${a.toString(16).padStart(8, '0')}-${text.length}`;
}
