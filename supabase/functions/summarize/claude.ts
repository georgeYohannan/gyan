// Pure helpers for the summary: the prompt, the strict shape, the checks, and the cost.
// No Deno-only code here, so Jest can test this file without ever calling Claude.
// The prompt is the one in docs/data-model.md ("1. Summary and action items"), word for word.

export type Segment = { speaker_label: string | null; start_ms: number; text: string };

export type ActionItem = { text: string; owner: string | null; due: string | null; start_ms: number };

export type Summary = {
  title: string;
  overview: string;
  key_points: string[];
  decisions: string[];
  action_items: ActionItem[];
  open_questions: string[];
};

/** A plain-words error that is safe to show to a person. */
export class SummaryError extends Error {}

/** The answer was not in the shape we asked for. The pipeline tries once more when it sees this. */
export class SummaryShapeError extends Error {}

export const MESSAGES = {
  empty: 'This note has nothing to summarize yet. Please add a recording or some text.',
  tooLong:
    'This note is too long for Gyan to summarize in one go. Please split it into shorter notes and try again.',
  badShape: 'Gyan could not write a summary for this note. Please tap Retry summary.',
  declined: 'Gyan could not write a summary for this note. Please tap Retry summary.',
  service: 'Gyan could not reach its writing service right now. Please tap Retry summary in a little while.',
  busy: 'The writing service is busy. Please tap Retry summary in a minute.',
  unknown: 'Something went wrong while writing the summary. Please tap Retry summary.',
} as const;

/** Turns a Claude error status into a plain message. */
export function messageForStatus(status: number): string {
  if (status === 401 || status === 402 || status === 403) return MESSAGES.service;
  if (status === 408 || status === 429 || status === 504 || status >= 500) return MESSAGES.busy;
  if (status === 400 || status === 413 || status === 422) return MESSAGES.tooLong;
  return MESSAGES.unknown;
}

/** Language codes we can name in the prompt. Anything else is asked for by its code. */
const LANGUAGE_NAMES: Record<string, string> = {
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

/** 'en' -> 'English'. An unknown code is passed through as it is. */
export function languageName(code: string | null | undefined): string {
  const key = (code ?? 'en').toLowerCase().split('-')[0];
  return LANGUAGE_NAMES[key] ?? (code ?? 'English');
}

/** One transcript line per row: "[Speaker 1, 12000] Hello." (the shape the prompt describes). */
export function formatTranscript(segments: Segment[]): string {
  return segments
    .map((s) => `[${s.speaker_label ?? 'Speaker'}, ${Math.max(0, Math.round(s.start_ms))}] ${s.text.trim()}`)
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/** The strict shape Claude must answer in. The service checks every answer against this. */
export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    overview: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          owner: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          due: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          start_ms: { type: 'integer' },
        },
        required: ['text', 'owner', 'due', 'start_ms'],
        additionalProperties: false,
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'overview', 'key_points', 'decisions', 'action_items', 'open_questions'],
  additionalProperties: false,
} as const;

/**
 * The SYSTEM half of the prompt, from docs/data-model.md.
 * `hasTimes` is false for pasted text, which has no speaker labels and no times. Only the one
 * sentence about the line shape changes, because telling the model about times it cannot see
 * would invite it to make them up.
 */
export function buildSystem(language: string, hasTimes = true): string {
  const lineShape = hasTimes
    ? 'Each transcript line looks like this: [speaker, start time in ms] text.'
    : 'The text has no speaker labels and no times, so always use 0 for start_ms.';
  return `You write meeting notes. Use only what is in the transcript. Never add facts. If something is unclear, say that it is unclear.
Write all text in ${language}.
${lineShape}

Return JSON only, in this shape:
{
  "title": "short title, at most 8 words",
  "overview": "2 to 4 sentences",
  "key_points": ["..."],
  "decisions": ["..."],
  "action_items": [{"text": "...", "owner": "name or null", "due": "as said, or null", "start_ms": 0}],
  "open_questions": ["..."]
}

RULES
- owner is a name only when the transcript says who will do it. Otherwise null.
- due is a date or time only when someone said it. Otherwise null. Do not work out dates.
- Keep names, numbers, and dates exactly as spoken.
- start_ms is the start time of the line where the action item was said.
- If the transcript is too short or has no clear content, return empty lists and an overview that says so.`;
}

/** The USER half of the prompt, from docs/data-model.md. */
export function buildUser(transcript: string, meetingType?: string | null): string {
  const type = meetingType?.trim() || 'general';
  return `Meeting type: ${type}
Transcript:
${transcript}`;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return undefined;
    const trimmed = item.trim();
    if (trimmed !== '') out.push(trimmed);
  }
  return out;
}

function asActionItems(value: unknown): ActionItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ActionItem[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const item = raw as Record<string, unknown>;
    if (typeof item.text !== 'string' || item.text.trim() === '') return undefined;
    if (item.owner !== null && item.owner !== undefined && typeof item.owner !== 'string') return undefined;
    if (item.due !== null && item.due !== undefined && typeof item.due !== 'string') return undefined;
    const startMs = typeof item.start_ms === 'number' && Number.isFinite(item.start_ms) ? Math.max(0, Math.round(item.start_ms)) : 0;
    const owner = typeof item.owner === 'string' && item.owner.trim() !== '' ? item.owner.trim() : null;
    const due = typeof item.due === 'string' && item.due.trim() !== '' ? item.due.trim() : null;
    out.push({ text: item.text.trim(), owner, due, start_ms: startMs });
  }
  return out;
}

/**
 * Reads Claude's answer and checks every part of it.
 * Throws SummaryShapeError when the answer is not JSON, or not the shape we asked for,
 * so the pipeline can try once more before giving up.
 */
export function parseSummary(text: string): Summary {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SummaryShapeError('not_json');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SummaryShapeError('not_an_object');
  const data = raw as Record<string, unknown>;

  if (typeof data.title !== 'string') throw new SummaryShapeError('title');
  if (typeof data.overview !== 'string') throw new SummaryShapeError('overview');
  const keyPoints = asStringList(data.key_points);
  const decisions = asStringList(data.decisions);
  const openQuestions = asStringList(data.open_questions);
  const actionItems = asActionItems(data.action_items);
  if (!keyPoints) throw new SummaryShapeError('key_points');
  if (!decisions) throw new SummaryShapeError('decisions');
  if (!openQuestions) throw new SummaryShapeError('open_questions');
  if (!actionItems) throw new SummaryShapeError('action_items');

  return {
    // At most 8 words, as the prompt asks. Trim it here so a long one cannot slip through.
    title: data.title.trim().split(/\s+/).slice(0, 8).join(' '),
    overview: data.overview.trim(),
    key_points: keyPoints,
    decisions,
    action_items: actionItems,
    open_questions: openQuestions,
  };
}

/** What this summary cost, from the token counts and the rates in settings.ts. */
export function costFor(tokensIn: number, tokensOut: number, usdPerMtokIn: number, usdPerMtokOut: number): number {
  const usd = (tokensIn / 1_000_000) * usdPerMtokIn + (tokensOut / 1_000_000) * usdPerMtokOut;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
