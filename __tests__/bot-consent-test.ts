/**
 * THE WORDS GYAN SAYS ABOUT RECORDING SOMEBODY ELSE'S MEETING.
 *
 * CLAUDE.md hard rule 8 is that Gyan never records or joins a meeting without a clear consent
 * notice for the people in it. That rule has three halves this file holds to account:
 *
 *   1. The wording is marked DRAFT until a lawyer has read it, and nobody may quietly take the
 *      marker off.
 *   2. The notice the bot says in the meeting exists in two places -- the app, which shows the
 *      person what will be said, and the server, which actually says it -- and they must be the
 *      same words.
 *   3. The server's idea of which confirmation is current must match the app's, or a confirmation
 *      somebody really gave would be refused (or, far worse, one they never gave accepted).
 */
import fs from 'fs';
import path from 'path';

import {
  BOT_CONSENT_LINES,
  BOT_CONSENT_STATUS,
  BOT_CONSENT_TICK,
  BOT_CONSENT_TITLE,
  BOT_CONSENT_VERSION,
  botChatNotice as appNotice,
  botConsentFingerprint,
} from '@/content/bot-consent';
import {
  BOT_CONSENT_HASH as serverHash,
  BOT_CONSENT_VERSION as serverVersion,
  botChatNotice as serverNotice,
  MAX_CHAT_NOTICE,
} from '../supabase/functions/bot/settings';

const root = path.join(__dirname, '..');

describe('the wording is DRAFT until a lawyer says otherwise', () => {
  test('and the marker is on the screen, not only in a file', () => {
    expect(BOT_CONSENT_STATUS).toBe('DRAFT');
    const screen = fs.readFileSync(path.join(root, 'src/app/(app)/(new)/meeting-link.tsx'), 'utf8');
    expect(screen).toContain('BOT_CONSENT_STATUS');
    expect(screen).toContain('a lawyer has not checked these words yet');
  });

  test('the file says plainly that it is not legal advice and claims nothing', () => {
    const file = fs.readFileSync(path.join(root, 'src/content/bot-consent.ts'), 'utf8');
    expect(file).toContain('PENDING LAWYER REVIEW');
    expect(file).toContain('Nothing here is legal advice');
    // The one sentence nobody but a lawyer may write, anywhere in Gyan.
    expect(file).not.toMatch(/\bHIPAA compliant\b|\bGDPR compliant\b/);
  });
});

describe('what the person confirms', () => {
  test('is three short promises about THIS meeting', () => {
    expect(BOT_CONSENT_LINES).toHaveLength(3);
    for (const line of BOT_CONSENT_LINES) {
      expect(line.length).toBeGreaterThan(20);
      expect(line.length).toBeLessThan(100);
      expect(line.endsWith('.')).toBe(true);
    }
  });

  test('covers the two things the founder asked for: the right to record, and telling people', () => {
    const all = BOT_CONSENT_LINES.join(' ').toLowerCase();
    expect(all).toContain('right to record');
    expect(all).toContain('tell everyone');
  });

  test('and the heading and the tick say what they are for', () => {
    expect(BOT_CONSENT_TITLE.length).toBeGreaterThan(0);
    expect(BOT_CONSENT_TICK.length).toBeGreaterThan(0);
  });
});

describe('the notice the bot says in the meeting', () => {
  test('IS THE SAME WORDS IN BOTH PLACES', () => {
    // The app shows what WILL be said; the server is what says it. Two copies exist because the
    // server must own the words it writes into a live call -- but they must not drift.
    for (const [name, asked] of [
      ['gyan Notetaker (Sam Carter)', 'Sam Carter'],
      ['gyan Notetaker', null],
      ['gyan Notetaker (Dr Ada Byron)', '  Ada Byron  '],
    ] as const) {
      expect(serverNotice(name, asked)).toBe(appNotice(name, asked));
    }
  });

  test('FITS IN A GOOGLE MEET CHAT MESSAGE, which is the strictest of the three platforms', () => {
    // Meet refuses anything over 500 characters. A notice that silently fails to send on one of
    // the three platforms would be worse than having no feature at all.
    expect(MAX_CHAT_NOTICE).toBe(500);
    const longest = serverNotice('gyan Notetaker (A Very Long Name Indeed)', 'Somebody With A Long Name');
    expect(longest.length).toBeLessThanOrEqual(MAX_CHAT_NOTICE);
  });

  test('says that it is recording, who asked for it, and what to do about it', () => {
    const notice = serverNotice('gyan Notetaker (Sam Carter)', 'Sam Carter');
    expect(notice).toContain('recording this meeting');
    expect(notice).toContain('Sam Carter');
    expect(notice).toContain('rather not be recorded');
  });

  test('works when nobody has set a name, rather than saying "at the request of null"', () => {
    for (const nothing of [null, '', '   ']) {
      const notice = serverNotice('gyan Notetaker', nothing);
      expect(notice).not.toContain('null');
      expect(notice).not.toContain('undefined');
      expect(notice).not.toContain('at the request of ');
    }
  });

  test('never names the bot service, only Gyan\'s own bot', () => {
    expect(serverNotice('gyan Notetaker', 'Sam').toLowerCase()).not.toContain('recall');
  });
});

describe('the app and the server agree which confirmation is current', () => {
  test('the version matches', () => {
    expect(serverVersion).toBe(BOT_CONSENT_VERSION);
  });

  test('AND SO DOES THE FINGERPRINT OF THE EXACT WORDS', () => {
    // The server mirrors this value as a plain string, because it cannot import from the app.
    // If somebody changes the words and forgets to change it, every bot would be refused -- so
    // this test is what turns that silent breakage into a loud one.
    expect(serverHash).toBe(botConsentFingerprint());
  });

  test('and the fingerprint really does change when the words do', () => {
    const changed = botConsentFingerprint([...BOT_CONSENT_LINES.slice(1), 'Something else entirely.']);
    expect(changed).not.toBe(botConsentFingerprint());
  });

  test('the version is in the fingerprint, so raising one moves the other', () => {
    expect(botConsentFingerprint()).toContain(BOT_CONSENT_VERSION);
  });
});

describe('the sign-in notice already promised this', () => {
  test('and it still does, so the two do not contradict each other', () => {
    // src/lib/consent.ts has said since the first week that Gyan "will never join or record a
    // meeting without a notice for the people in it". This round is what makes that true.
    const file = fs.readFileSync(path.join(root, 'src/lib/consent.ts'), 'utf8');
    expect(file).toContain('never join or record a meeting without a notice for the people in it');
  });
});
