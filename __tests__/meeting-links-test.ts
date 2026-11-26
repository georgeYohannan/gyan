/**
 * Reading a meeting link, and THE TWO COPIES THAT HAVE TO AGREE.
 *
 * The check exists twice: in the app (src/lib/meeting-links.ts) so the screen can say "this is a
 * Google Meet link" as somebody pastes, and on the server
 * (supabase/functions/_shared/meeting-bot/platforms.ts) because the screen cannot be trusted. The
 * app must NOT import the server's copy -- that file sits beside the one holding the bot service's
 * addresses and key handling, and none of that may reach the app bundle.
 *
 * So the two are run over the same list here, and this file fails the moment they disagree. The
 * same guard passages-test.ts puts on the three copies of the paragraph splitter.
 */
import * as server from '../supabase/functions/_shared/meeting-bot/platforms';
import * as app from '@/lib/meeting-links';

/** Links a person could really paste, from a calendar invitation or a chat message. */
const REAL: [string, 'zoom' | 'meet' | 'teams'][] = [
  ['https://meet.google.com/abc-defg-hij', 'meet'],
  ['https://meet.google.com/abc-defg-hij/', 'meet'],
  ['https://meet.google.com/ABC-DEFG-HIJ', 'meet'],
  ['https://meet.google.com/abc-defg-hij?authuser=0', 'meet'],
  ['https://meet.google.com/lookup/abcdef1234', 'meet'],
  ['https://zoom.us/j/1234567890', 'zoom'],
  ['https://zoom.us/j/1234567890?pwd=aBcDeF', 'zoom'],
  ['https://acme.zoom.us/j/1234567890', 'zoom'],
  ['https://us02web.zoom.us/j/9876543210', 'zoom'],
  ['https://zoom.us/w/1234567890', 'zoom'],
  ['https://acme.zoom.us/my/sam.carter', 'zoom'],
  ['https://zoom.com/j/1234567890', 'zoom'],
  ['https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%3a%22x%22%7d', 'teams'],
  ['https://teams.microsoft.com/l/meeting/join?somequery=1', 'teams'],
  ['https://teams.live.com/meet/9312345678901', 'teams'],
  ['https://teams.microsoft.us/l/meetup-join/19%3ameeting_abc%40thread.v2/0', 'teams'],
];

/** Things a person could paste that must NOT send a bot anywhere. */
const NOT_LINKS = [
  '',
  '   ',
  'hello',
  'meet.google.com/abc-defg-hij',
  // http, not https. A meeting link goes to an outside service, and in the clear is not an option.
  'http://meet.google.com/abc-defg-hij',
  'https://example.com/meeting/1',
  'https://zoom.us/about',
  'https://zoom.us/pricing',
  'https://meet.google.com/',
  'https://meet.google.com/abc',
  'https://teams.microsoft.com/',
  'https://teams.microsoft.com/l/channel/19%3aabc',
  // A near-miss host. Somebody who registers meet-google.com must not get a bot sent to them.
  'https://meet-google.com/abc-defg-hij',
  'https://notzoom.us/j/1234567890',
  'javascript:alert(1)',
  'https://meet.google.com/abc-defg-hij\nhttps://evil.example/x',
  'Join at https://meet.google.com/abc-defg-hij',
  `https://meet.google.com/${'a'.repeat(3000)}`,
];

describe('the two copies of the link reader are the same code', () => {
  test.each([...REAL.map(([link]) => link), ...NOT_LINKS])('agree about %j', (link) => {
    expect(server.platformFor(link)).toEqual(app.platformFor(link));
    expect(server.readMeetingLink(link)).toEqual(app.readMeetingLink(link));
  });
});

describe('a real meeting link', () => {
  test.each(REAL)('%s is a %s call', (link, platform) => {
    expect(app.platformFor(link)).toBe(platform);
    expect(app.readMeetingLink(link)).toMatchObject({ platform });
  });
});

describe('anything else is refused', () => {
  test.each(NOT_LINKS)('%j is not a meeting link', (link) => {
    expect(app.platformFor(link)).toBeNull();
    expect(app.readMeetingLink(link)).toBeNull();
  });
});

describe('a link out of Outlook', () => {
  // Anybody whose company uses Microsoft 365 copies links that have been wrapped by Safe Links.
  // Without unwrapping, a perfectly good Teams invitation would be refused and it would look
  // like a bug in Gyan rather than a wrapper nobody can see.
  const real = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0';
  const wrapped = `https://eur01.safelinks.protection.outlook.com/?url=${encodeURIComponent(real)}&data=05%7C01`;

  test('is unwrapped, on both copies', () => {
    expect(app.readMeetingLink(wrapped)).toMatchObject({ platform: 'teams' });
    expect(server.readMeetingLink(wrapped)).toEqual(app.readMeetingLink(wrapped));
  });

  test('and a wrapper around something that is not a meeting link is still refused', () => {
    const bad = `https://eur01.safelinks.protection.outlook.com/?url=${encodeURIComponent('https://evil.example/x')}`;
    expect(app.readMeetingLink(bad)).toBeNull();
    expect(server.readMeetingLink(bad)).toBeNull();
  });
});

describe('which words count as a platform', () => {
  test('only the three, and nothing that merely looks like one', () => {
    for (const good of ['zoom', 'meet', 'teams']) expect(app.isPlatform(good)).toBe(true);
    for (const bad of ['webex', 'ZOOM', '', null, undefined, 1, {}]) {
      expect(app.isPlatform(bad)).toBe(false);
      expect(server.isPlatform(bad)).toBe(false);
    }
  });
});
