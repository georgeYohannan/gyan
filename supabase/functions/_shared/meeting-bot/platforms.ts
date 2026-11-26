// Which call is this a link to?
//
// Vendor-neutral on purpose: which platforms Gyan supports is a product decision, and the three
// below are the three docs/product-spec.md feature 10 names. A provider that cannot do one of them
// says so itself, with its own plain message.
//
// THIS CODE EXISTS TWICE, here and in src/lib/meeting-links.ts, and that is deliberate. The screen
// has to recognise a link as somebody pastes it -- waiting for a round trip to say "that is a
// Google Meet link" would make the box feel broken -- and the server cannot trust what the screen
// says. __tests__/meeting-links-test.ts runs both over the same list and fails if they ever
// disagree, the same guard __tests__/passages-test.ts puts on the three copies of the paragraph
// splitter.

import { PLATFORMS, type Platform } from './provider.ts';

/**
 * The platform a link points at, or null.
 *
 * Deliberately strict about the HOST and loose about everything after it. A meeting link is a
 * thing people copy out of a calendar invitation and it comes with all sorts of query strings,
 * `?pwd=`, tracking, and sometimes a `safelinks` wrapper; refusing those would refuse real links.
 * But the host has to be one we know, or a bot would be sent somewhere nobody meant.
 */
export function platformFor(link: string): Platform | null {
  const url = readUrl(link);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // Zoom: any of their many regional and vanity hosts, zoom.us or zoom.com.
  // /j/<id> is a meeting, /w/<id> a webinar, /my/<name> a personal room.
  if (host === 'zoom.us' || host.endsWith('.zoom.us') || host === 'zoom.com' || host.endsWith('.zoom.com')) {
    if (/^\/(j|w|s|my)\//i.test(path)) return 'zoom';
    return null;
  }

  // Google Meet: meet.google.com/abc-defg-hij, and the g.co/meet short form.
  if (host === 'meet.google.com') {
    if (/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(path)) return 'meet';
    // The alias form a Workspace can hand out, for example meet.google.com/lookup/<name>.
    if (/^\/lookup\/[a-z0-9_-]+\/?$/i.test(path)) return 'meet';
    // A named or numbered room, which Meet also issues.
    if (/^\/[a-z0-9_-]{6,}\/?$/i.test(path)) return 'meet';
    return null;
  }

  // Microsoft Teams: the long meetup-join link, the newer short link, and the live/personal one.
  if (host === 'teams.microsoft.com' || host === 'teams.microsoft.us' || host === 'teams.live.com') {
    if (/^\/l\/meetup-join\//i.test(path)) return 'teams';
    if (/^\/l\/meeting\/join/i.test(path)) return 'teams';
    if (/^\/meet\//i.test(path)) return 'teams';
    if (/^\/v2\//i.test(path)) return 'teams';
    return null;
  }

  return null;
}

/**
 * The link as it should be sent on, or null when it is not one we can use.
 *
 * Two things it does beyond recognising the host:
 *
 * 1. It UNWRAPS Microsoft's Safe Links. Anybody whose company uses Microsoft 365 copies links out
 *    of Outlook that look like `https://eur01.safelinks.protection.outlook.com/?url=<the real
 *    one>&data=...`. Without this, pasting a perfectly good Teams invitation from Outlook would be
 *    refused, which would look like a bug in Gyan.
 * 2. It insists on https. A meeting link is given to an outside service, and http would be handing
 *    it over in the clear.
 */
export function readMeetingLink(link: string): { url: string; platform: Platform } | null {
  const unwrapped = unwrapSafeLink(link);
  const url = readUrl(unwrapped);
  if (!url) return null;
  const platform = platformFor(unwrapped);
  if (!platform) return null;
  return { url: url.toString(), platform };
}

/** Is this one of the three words a platform may be? Used where a value comes in from outside. */
export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

function readUrl(link: string): URL | null {
  if (typeof link !== 'string') return null;
  const text = link.trim();
  // A length nobody could paste by accident. A meeting link is long; a Teams one can be 1,000
  // characters. Anything past this is not a link, and the database refuses over 2,000 anyway.
  if (text === '' || text.length > 2000) return null;
  // No spaces, no newlines, no control characters: all of those mean somebody pasted a sentence.
  if (/[\s\u0000-\u001f\u007f]/.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

/** Takes the real link out of a Microsoft Safe Links wrapper. Leaves anything else alone. */
function unwrapSafeLink(link: string): string {
  const url = readUrl(link);
  if (!url) return link;
  if (!url.hostname.toLowerCase().endsWith('safelinks.protection.outlook.com')) return link;
  const inner = url.searchParams.get('url');
  if (!inner) return link;
  // Once only. A wrapper inside a wrapper is not something to chase.
  return inner;
}
