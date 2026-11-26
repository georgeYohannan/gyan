/**
 * Which call is this a link to?
 *
 * THIS IS THE SECOND OF TWO COPIES. The other is
 * `supabase/functions/_shared/meeting-bot/platforms.ts`, and `__tests__/meeting-links-test.ts`
 * runs both over the same list of links and fails if they ever disagree.
 *
 * Why two copies rather than one shared file. The screen has to recognise a link as somebody
 * pastes it, so it can say "this looks like a Google Meet link" straight away -- waiting for a
 * round trip to the server would make the box feel broken. And the server cannot trust what the
 * screen says, because anybody can post to a server function. So the check really does have to
 * happen in both places. The app also must NOT import the server's copy: that file sits next to
 * the one that knows the bot service's addresses and key handling, and none of that may ever
 * reach the app bundle (`__tests__/env-safety-test.ts` enforces that rule).
 *
 * The same reasoning, and the same guard test, as the three copies of the paragraph splitter
 * (docs/decisions.md, 2026-11-18).
 */

export const PLATFORMS = ['zoom', 'meet', 'teams'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** What people call each one. */
export const PLATFORM_LABEL: Record<Platform, string> = {
  zoom: 'Zoom',
  meet: 'Google Meet',
  teams: 'Microsoft Teams',
};

/**
 * The platform a link points at, or null.
 *
 * Strict about the host, loose about everything after it. A meeting link is something people copy
 * out of a calendar invitation, and it arrives with query strings, passwords and tracking on the
 * end; refusing those would refuse real links. But the host has to be one we know, or a bot would
 * be sent somewhere nobody meant.
 */
export function platformFor(link: string): Platform | null {
  const url = readUrl(link);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (host === 'zoom.us' || host.endsWith('.zoom.us') || host === 'zoom.com' || host.endsWith('.zoom.com')) {
    if (/^\/(j|w|s|my)\//i.test(path)) return 'zoom';
    return null;
  }

  if (host === 'meet.google.com') {
    if (/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(path)) return 'meet';
    // The alias form a Workspace can hand out, for example meet.google.com/lookup/<name>.
    if (/^\/lookup\/[a-z0-9_-]+\/?$/i.test(path)) return 'meet';
    if (/^\/[a-z0-9_-]{6,}\/?$/i.test(path)) return 'meet';
    return null;
  }

  if (host === 'teams.microsoft.com' || host === 'teams.microsoft.us' || host === 'teams.live.com') {
    if (/^\/l\/meetup-join\//i.test(path)) return 'teams';
    if (/^\/l\/meeting\/join/i.test(path)) return 'teams';
    if (/^\/meet\//i.test(path)) return 'teams';
    if (/^\/v2\//i.test(path)) return 'teams';
    return null;
  }

  return null;
}

/** The link as it should be sent on, or null when it is not one we can use. */
export function readMeetingLink(link: string): { url: string; platform: Platform } | null {
  const unwrapped = unwrapSafeLink(link);
  const url = readUrl(unwrapped);
  if (!url) return null;
  const platform = platformFor(unwrapped);
  if (!platform) return null;
  return { url: url.toString(), platform };
}

/** Is this one of the three words a platform may be? */
export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

function readUrl(link: string): URL | null {
  if (typeof link !== 'string') return null;
  const text = link.trim();
  if (text === '' || text.length > 2000) return null;
  if (/[\s\u0000-\u001f\u007f]/.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Takes the real link out of a Microsoft Safe Links wrapper.
 *
 * Anybody whose company uses Microsoft 365 copies links out of Outlook that look like
 * `https://eur01.safelinks.protection.outlook.com/?url=<the real one>&data=...`. Without this,
 * pasting a perfectly good Teams invitation out of Outlook would be refused, which would look
 * like a bug in Gyan rather than a wrapper nobody can see.
 */
function unwrapSafeLink(link: string): string {
  const url = readUrl(link);
  if (!url) return link;
  if (!url.hostname.toLowerCase().endsWith('safelinks.protection.outlook.com')) return link;
  const inner = url.searchParams.get('url');
  if (!inner) return link;
  return inner;
}
