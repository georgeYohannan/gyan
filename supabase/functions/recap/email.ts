// Building one recap email. Pure code: no network, no database, no keys.
// Everything here can be unit tested, which is why the whole layout lives in this file.
//
// Two versions of every email are built together:
//   html  - the pretty one, in the Gyan colours
//   text  - the same facts in plain words, for anyone whose email hides pictures and styling
// A test compares the two, so one can never say something the other does not.

/** The label that goes on anything a person did not write. CLAUDE.md hard rule 7. */
export const TRANSLATED_LABEL = 'Translated by AI';

/** The sentence under that label. It answers the worry people actually have. */
export const TRANSLATED_NOTE = 'Names, numbers and times are unchanged.';

/**
 * The languages Gyan offers, by code.
 * The same list lives in src/constants/languages.ts, supabase/functions/chat/chat.ts and
 * supabase/functions/translate/translate.ts. __tests__/languages-test.ts keeps all 4 in step.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  hi: 'Hindi',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  ru: 'Russian',
  tr: 'Turkish',
  pl: 'Polish',
  sv: 'Swedish',
};

/** The languages written from right to left. Only the translated words turn around, not the page. */
export const RTL_LANGUAGES = ['ar'];

/** 'en-GB' -> 'en'. Used to tell two languages apart without the country part. */
export function baseCode(code: string | null | undefined): string {
  return (code ?? '').toLowerCase().split('-')[0];
}

/** The English name of a language, for the "Translated by AI" line. */
export function languageName(code: string | null | undefined): string {
  const key = baseCode(code);
  return LANGUAGE_NAMES[key] ?? (code ?? 'English');
}

/** True when two codes mean the same language, ignoring the country part. */
export function sameLanguage(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = baseCode(a);
  const right = baseCode(b);
  return left !== '' && left === right;
}

/** Problems a person may read. No jargon, and never a key or an address. */
export const MESSAGES = {
  notSetUp: 'Gyan cannot send emails yet. The email service is not set up on the server.',
  problem: 'Gyan could not send the recap just now. Please try again.',
  notAllowed: 'You cannot send a recap for this note.',
  notReady: 'This note is not finished yet, so there is nothing to send.',
  noSummary: 'This note has no summary yet, so there is nothing to send.',
  nobody: 'Nobody is picked to receive this recap. Tick at least one person.',
  badAddress:
    'Gyan is not allowed to send from its own address yet. The sending domain needs to be verified.',
  busy: 'The email service is busy. Please try again in a minute.',
  service: 'Gyan could not reach the email service. Please try again later.',
  unknown: 'Something went wrong sending the recap. Please try again.',
} as const;

/** A problem worth showing a person, as opposed to a bug. */
export class RecapError extends Error {}

/** Turns an email service answer into a plain message. */
export function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return MESSAGES.service;
  if (status === 422 || status === 400) return MESSAGES.badAddress;
  if (status === 429 || status === 408 || status === 504 || status >= 500) return MESSAGES.busy;
  return MESSAGES.problem;
}

// ---------------------------------------------------------------------------
// The words of one recap
// ---------------------------------------------------------------------------

export type RecapItem = { text: string; owner: string | null; due: string | null };

/** Everything the email says about the note. Already in the recipient's language. */
export type RecapBody = {
  title: string;
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: RecapItem[];
};

export type Sender = { name: string; email: string; replyTo: string };

export type RenderOptions = {
  body: RecapBody;
  /** When the note was made. Shown as a plain date, never a raw timestamp. */
  date: string | null;
  /** The language these words are in. */
  language: string;
  /** True when the words came from a translation, so the email must say so. */
  translated: boolean;
  /** The name of the person whose workspace this is, for the footer. */
  ownerName: string;
  /** Where "Open in gyan" goes. */
  noteUrl: string;
  /** Where "Turn off recaps" goes. */
  settingsUrl: string;
  sender: Sender;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A timestamp as a plain date: "19 November 2026".
 * Written by hand rather than with a locale, so it reads the same wherever the server runs and
 * a test can be sure of it.
 */
export function plainDate(value: string | null): string {
  if (!value) return '';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return '';
  return `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()}`;
}

/** Makes any text safe to put inside a page, so a quote mark can never break the layout. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * "gyan <recaps@example.com>", the way an email names who it came from.
 * The real address is never written here. It lives only in settings.ts, and a test checks
 * that this file does not hold a copy of it.
 */
export function fromHeader(sender: Sender): string {
  return `${sender.name} <${sender.email}>`;
}

/** "Priya Shah, by Friday" - the quiet line under a to-do, when there is anything to say. */
export function itemNote(item: RecapItem): string {
  const parts: string[] = [];
  const owner = (item.owner ?? '').trim();
  const due = (item.due ?? '').trim();
  if (owner !== '') parts.push(owner);
  if (due !== '') parts.push(`by ${due}`);
  return parts.join(', ');
}

// The Gyan colours. Email cannot read our design tokens file, so they are written out here.
// Email programs throw away style sheets and anything clever, so every colour is inline.
const C = {
  page: '#0B1220',
  panel: '#0F172A',
  border: 'rgba(255,255,255,0.14)',
  heading: '#FFFFFF',
  text: '#E2E8F0',
  quiet: '#94A3B8',
  brand: '#0066FF',
  link: '#99CBFF',
};

// Schibsted Grotesk and IBM Plex Sans are not on anybody's email program, so each falls back to
// the nearest thing every computer and phone already has.
const HEAD_FONT = "'Schibsted Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif";
const BODY_FONT = "'IBM Plex Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

function htmlSection(heading: string, inner: string): string {
  if (inner === '') return '';
  return (
    `<tr><td style="padding-top:24px;">` +
    `<h2 style="margin:0 0 8px 0;font-family:${HEAD_FONT};font-size:18px;line-height:1.4;color:${C.heading};font-weight:bold;">${escapeHtml(heading)}</h2>` +
    inner +
    `</td></tr>`
  );
}

function htmlList(values: string[], dir: string): string {
  if (values.length === 0) return '';
  const items = values
    .map(
      (value) =>
        `<li style="margin:0 0 8px 0;font-family:${BODY_FONT};font-size:16px;line-height:1.5;color:${C.text};">${escapeHtml(value)}</li>`,
    )
    .join('');
  return `<ul dir="${dir}" style="margin:0;padding:0 0 0 20px;">${items}</ul>`;
}

function htmlItems(items: RecapItem[], dir: string): string {
  if (items.length === 0) return '';
  const rows = items
    .map((item) => {
      const note = itemNote(item);
      const quiet =
        note === ''
          ? ''
          : `<div style="font-family:${BODY_FONT};font-size:14px;line-height:1.5;color:${C.quiet};padding-top:2px;">${escapeHtml(note)}</div>`;
      return (
        `<li style="margin:0 0 12px 0;font-family:${BODY_FONT};font-size:16px;line-height:1.5;color:${C.text};">` +
        escapeHtml(item.text) +
        quiet +
        `</li>`
      );
    })
    .join('');
  return `<ul dir="${dir}" style="margin:0;padding:0 0 0 20px;">${rows}</ul>`;
}

function textList(values: string[]): string {
  return values.map((value) => `- ${value}`).join('\n');
}

function textSection(heading: string, inner: string): string {
  if (inner.trim() === '') return '';
  return `\n${heading.toUpperCase()}\n${inner}\n`;
}

/**
 * Builds one recap email, both versions at once.
 * Everything that goes in has already been chosen by the server: the words are this person's
 * language, and the links are real app addresses. Nothing here reaches out to anything.
 */
export function renderRecap(o: RenderOptions): RenderedEmail {
  const dir = RTL_LANGUAGES.includes(baseCode(o.language)) ? 'rtl' : 'ltr';
  const title = (o.body.title ?? '').trim() === '' ? 'Your note' : o.body.title.trim();
  const date = plainDate(o.date);
  const subject = `Recap: ${title}`;

  // --- the pretty version ------------------------------------------------
  const translatedBar = o.translated
    ? `<tr><td style="padding-bottom:20px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td style="border-left:3px solid ${C.brand};padding:4px 0 4px 12px;">` +
      `<div style="font-family:${BODY_FONT};font-size:14px;line-height:1.5;color:${C.text};font-weight:600;">${escapeHtml(TRANSLATED_LABEL)}</div>` +
      `<div style="font-family:${BODY_FONT};font-size:14px;line-height:1.5;color:${C.quiet};">${escapeHtml(`${languageName(o.language)}. ${TRANSLATED_NOTE}`)}</div>` +
      `</td></tr></table></td></tr>`
    : '';

  const dateRow =
    date === ''
      ? ''
      : `<tr><td style="padding-top:4px;"><div style="font-family:${BODY_FONT};font-size:14px;line-height:1.5;color:${C.quiet};">${escapeHtml(date)}</div></td></tr>`;

  const overviewRow =
    o.body.overview.trim() === ''
      ? ''
      : `<tr><td style="padding-top:20px;"><div dir="${dir}" style="font-family:${BODY_FONT};font-size:16px;line-height:1.5;color:${C.text};">${escapeHtml(o.body.overview.trim())}</div></td></tr>`;

  const html =
    `<!doctype html><html lang="${escapeHtml(baseCode(o.language) || 'en')}"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark">` +
    `<title>${escapeHtml(subject)}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${C.page};">` +
    // A one-line preview, which many email programs show next to the subject. Hidden in the email.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(o.body.overview.trim().slice(0, 140))}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};margin:0;padding:0;">` +
    `<tr><td align="center" style="padding:24px 16px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">` +
    // Wordmark
    `<tr><td style="padding-bottom:16px;"><span style="font-family:${HEAD_FONT};font-size:20px;line-height:1.4;color:${C.heading};font-weight:bold;letter-spacing:0.5px;">gyan</span></td></tr>` +
    // The panel
    `<tr><td bgcolor="${C.panel}" style="background-color:${C.panel};border:1px solid ${C.border};border-radius:20px;padding:24px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    translatedBar +
    `<tr><td><h1 dir="${dir}" style="margin:0;font-family:${HEAD_FONT};font-size:26px;line-height:1.3;color:${C.heading};font-weight:bold;">${escapeHtml(title)}</h1></td></tr>` +
    dateRow +
    overviewRow +
    htmlSection('Key points', htmlList(o.body.keyPoints, dir)) +
    htmlSection('Decisions', htmlList(o.body.decisions, dir)) +
    htmlSection('Action items', htmlItems(o.body.actionItems, dir)) +
    // The button. A blue fill with white words on it, never blue words on the navy.
    `<tr><td style="padding-top:28px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td bgcolor="${C.brand}" style="background-color:${C.brand};border-radius:999px;">` +
    `<a href="${escapeHtml(o.noteUrl)}" style="display:inline-block;padding:12px 24px;font-family:${BODY_FONT};font-size:16px;line-height:1.2;font-weight:600;color:#FFFFFF;text-decoration:none;">Open this note in gyan</a>` +
    `</td></tr></table></td></tr>` +
    `</table></td></tr>` +
    // The footer: why you got this, and how to stop it.
    `<tr><td style="padding:20px 4px 0 4px;">` +
    `<div style="border-top:1px solid ${C.border};padding-top:16px;">` +
    `<div style="font-family:${BODY_FONT};font-size:13px;line-height:1.6;color:${C.quiet};">` +
    `You are getting this because you are on ${escapeHtml(o.ownerName)}'s workspace in gyan, and recap emails are switched on for it.` +
    `</div>` +
    `<div style="font-family:${BODY_FONT};font-size:13px;line-height:1.6;color:${C.quiet};padding-top:10px;">` +
    `<a href="${escapeHtml(o.settingsUrl)}" style="color:${C.link};text-decoration:underline;">Turn off recaps</a>` +
    `</div>` +
    `<div style="font-family:${BODY_FONT};font-size:13px;line-height:1.6;color:${C.quiet};padding-top:10px;">` +
    `Sent by gyan. Reply to this email to reach <a href="mailto:${escapeHtml(o.sender.replyTo)}" style="color:${C.link};text-decoration:underline;">${escapeHtml(o.sender.replyTo)}</a>.` +
    `</div></div></td></tr>` +
    `</table></td></tr></table></body></html>`;

  // --- the plain version -------------------------------------------------
  // Written out by hand, not stripped from the page above, so it reads like something a person
  // would type rather than a page with its styling torn off.
  const text =
    `gyan recap\n\n` +
    `${title}\n` +
    (date === '' ? '' : `${date}\n`) +
    (o.translated ? `\n${TRANSLATED_LABEL}. ${languageName(o.language)}. ${TRANSLATED_NOTE}\n` : '') +
    (o.body.overview.trim() === '' ? '' : `\n${o.body.overview.trim()}\n`) +
    textSection('Key points', textList(o.body.keyPoints)) +
    textSection('Decisions', textList(o.body.decisions)) +
    textSection(
      'Action items',
      o.body.actionItems
        .map((item) => {
          const note = itemNote(item);
          return note === '' ? `- ${item.text}` : `- ${item.text} (${note})`;
        })
        .join('\n'),
    ) +
    `\nOpen this note in gyan:\n${o.noteUrl}\n` +
    `\n-----\n` +
    `You are getting this because you are on ${o.ownerName}'s workspace in gyan, and recap emails ` +
    `are switched on for it.\n` +
    `Turn off recaps: ${o.settingsUrl}\n` +
    `Sent by gyan. Reply to this email to reach ${o.sender.replyTo}.\n`;

  return { subject, html, text };
}

/** The web address of one note inside the app. */
export function noteUrlFor(appUrl: string, meetingId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/note/${meetingId}`;
}

/** The web address of the page where recaps are switched off. */
export function settingsUrlFor(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/recap-emails`;
}
