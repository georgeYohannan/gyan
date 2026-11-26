// Settings for the bot function. Change them here, not inside the code.
//
// NOTHING VENDOR-SPECIFIC IS IN THIS FILE. The service's address, its field names and its price
// all live in _shared/meeting-bot/recall.ts, which is the only file in Gyan that names it.

/**
 * How long the bot service may keep its own copy of a recording.
 *
 * Gyan downloads the recording into its own private bucket and then asks the service to delete
 * its copy, within seconds. This is the BACKSTOP for when that delete fails: the copy goes by
 * itself a day later, and there is still a day in which it could be fetched again by hand if
 * something went badly wrong. The founder chose 24 hours on 2026-11-25 over 1 hour (too little
 * room to recover) and 7 days (somebody else holding a customer's meeting for a week).
 */
export const PROVIDER_RETENTION_HOURS = 24;

/** What the stored recording is called inside the account's own folder. */
export const RECORDING_FILE_NAME = 'meeting.mp3';

/**
 * What the bot says in the meeting chat when it joins, and again to each person who arrives
 * afterwards.
 *
 * THIS IS THE SECOND OF TWO COPIES. The other is `botChatNotice` in src/content/bot-consent.ts,
 * which is what the person sending the bot is shown before they confirm.
 * `__tests__/bot-consent-test.ts` runs both over the same names and fails if the words ever
 * differ -- the same guard languages-test.ts puts on the language list, which also exists once in
 * the app and once per server function.
 *
 * Why not one shared copy: the server is what actually says these words into somebody else's
 * meeting, so the server must own them. Letting the app post the text it wants said would mean a
 * server function writing whatever it was handed into a live call.
 *
 * UNDER 500 CHARACTERS. Google Meet refuses a longer chat message (Zoom and Teams allow 4,096),
 * and a notice that silently fails on one of the three platforms would be worse than none.
 */
export function botChatNotice(botName: string, askedBy: string | null): string {
  const who = askedBy && askedBy.trim() !== '' ? ` at the request of ${askedBy.trim()}` : '';
  return (
    `${botName} is recording this meeting${who}, to write notes and a summary afterwards. ` +
    'If you would rather not be recorded, please say so now and the recording will be stopped.'
  );
}

/** The longest the notice may be, because Google Meet is the strictest of the three. */
export const MAX_CHAT_NOTICE = 500;

/**
 * The consent the server insists on before it will send a bot.
 *
 * MIRRORED from `BOT_CONSENT_VERSION` and `botConsentFingerprint()` in src/content/bot-consent.ts,
 * which is where the words themselves live. `__tests__/bot-consent-test.ts` computes them from
 * those words and fails if these two strings fall out of step — the same way
 * tests/fixtures/fake-api.ts mirrors the translation prompt's version number.
 *
 * Why the server checks at all, when the app already showed the words: anybody can post to a
 * server function. Without this, a request made by hand could send a bot into a call with no
 * confirmation ever given, which is the one thing CLAUDE.md hard rule 8 forbids outright.
 */
export const BOT_CONSENT_VERSION = 'v1';
export const BOT_CONSENT_HASH = 'v1-2b8ed56c-157';
