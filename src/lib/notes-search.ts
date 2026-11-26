/**
 * Searching, filtering and paging the Home list, plus the Search screen.
 *
 * All of the work happens in the database, in find_notes and find_passages. Two reasons:
 * the words of a note live in four tables, and paging has to be the server's job or the app
 * would be downloading everything in order to show ten of them.
 *
 * NEVER MORE THAN 30 NOTES IN ONE ASK. The database clamps it too, because a limit the caller
 * chooses is not a limit.
 */
import { getSupabase } from '@/lib/supabase';
import { type Source } from '@/lib/notes';
import { STATUSES, type Status } from '@/components/ui/status-badge';
import { DATE_PRESETS, fromDayKey, rangeFor, type DatePreset } from '@/lib/dates';

/** How many notes the first look at Home asks for, and how many each Show more adds. */
export const FIRST_PAGE = 10;
export const NEXT_PAGE = 20;
/** The ceiling the database also enforces. */
export const MAX_PAGE = 30;

/**
 * The two characters the database wraps a matched word in. They are NOT html: nothing in this
 * app renders html, and Postgres' own manual warns a snippet is not safe to put in a web page.
 * These are private-use characters, so they cannot appear in anything a person said.
 *
 * The SAME two characters are written in
 * supabase/migrations/20261121150000_search_and_paging.sql, and in tests/fixtures/fake-api.ts.
 * __tests__/notes-search-test.ts reads all three and fails if they ever drift apart.
 */
export const MARK_START = '';
export const MARK_END = '';

/** Where a search word was found. The order is the order they are shown in. */
export type MatchedIn = 'title' | 'summary' | 'transcript';

export const FOUND_IN_LABEL: Record<MatchedIn, string> = {
  title: 'in the title',
  summary: 'in the summary',
  transcript: 'in the transcript',
};

/** One note in the Home list, with whatever the search found in it. */
export type NoteHit = {
  id: string;
  title: string | null;
  source: Source;
  status: Status;
  error_message: string | null;
  created_at: string;
  hasOpenActions: boolean;
  /** False when this note was made by somebody else and you do not own the account. */
  canDelete: boolean;
  matchedIn: MatchedIn[];
  /** A few words around the match, with the matched words marked. Undefined when not searching. */
  snippet?: string;
  /** The moment in the recording the snippet came from, when it came from the transcript. */
  snippetStartMs?: number;
  /** The transcript line the snippet came from, so the note can open at it. */
  snippetSegmentId?: string;
};

export type NoteFilters = {
  query: string;
  from?: string;
  to?: string;
  statuses: Status[];
  sources: Source[];
  openActions: boolean;
};

export const NO_FILTERS: NoteFilters = {
  query: '',
  statuses: [],
  sources: [],
  openActions: false,
};

/** The database writes statuses in lower case; the app shows them in Title Case. */
const STATUS_TO_DB: Record<Status, string> = {
  Uploading: 'uploading',
  Joining: 'joining',
  'In waiting room': 'waiting',
  Recording: 'recording',
  Queued: 'queued',
  Transcribing: 'transcribing',
  Summarizing: 'summarizing',
  Ready: 'ready',
  Failed: 'failed',
};

const STATUS_FROM_DB: Record<string, Status> = Object.fromEntries(
  STATUSES.map((s) => [STATUS_TO_DB[s], s]),
) as Record<string, Status>;

export const ALL_SOURCES: Source[] = ['upload', 'phone', 'bot', 'text'];

/** True when anything at all is narrowing the list. */
export function isFiltering(filters: NoteFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    !!filters.from ||
    !!filters.to ||
    filters.statuses.length > 0 ||
    filters.sources.length > 0 ||
    filters.openActions
  );
}

/** How many filters are on, not counting the search words. For the Filters button. */
export function filterCount(filters: NoteFilters): number {
  return (
    (filters.from || filters.to ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.sources.length > 0 ? 1 : 0) +
    (filters.openActions ? 1 : 0)
  );
}

export type NotePage = { notes: NoteHit[]; total: number };

type Cursor = { before: string; beforeId: string };

/**
 * One page of the Home list.
 *
 * With search words the database puts the best match first, so the next page is counted from
 * the start. Without them the list is newest first, and the next page starts just past the last
 * row already shown, so a note arriving while you read cannot push a row onto the next page or
 * make one appear twice.
 */
export async function findNotes(
  filters: NoteFilters,
  page: { limit: number; after?: NoteHit; offset?: number } = { limit: FIRST_PAGE },
): Promise<NotePage> {
  const searching = filters.query.trim() !== '';
  const cursor: Cursor | undefined =
    !searching && page.after ? { before: page.after.created_at, beforeId: page.after.id } : undefined;

  const { data, error } = await getSupabase().rpc('find_notes', {
    p_query: searching ? filters.query.trim() : null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_statuses: filters.statuses.length > 0 ? filters.statuses.map((s) => STATUS_TO_DB[s]) : null,
    p_sources: filters.sources.length > 0 ? filters.sources : null,
    p_open_actions: filters.openActions,
    p_limit: Math.min(Math.max(page.limit, 1), MAX_PAGE),
    p_before: cursor?.before ?? null,
    p_before_id: cursor?.beforeId ?? null,
    p_offset: searching ? (page.offset ?? 0) : 0,
  });

  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    title: string | null;
    source: string;
    status: string;
    error_message: string | null;
    created_at: string;
    has_open_actions: boolean;
    can_delete: boolean;
    matched_in: string[] | null;
    snippet: string | null;
    snippet_start_ms: number | null;
    snippet_segment_id: string | null;
    total_count: number;
  }[];

  return {
    // No rows means none, not "we do not know". The count only comes back attached to a row.
    total: rows.length > 0 ? rows[0].total_count : 0,
    notes: rows.map((row) => ({
      id: row.id,
      title: row.title,
      source: row.source as Source,
      status: STATUS_FROM_DB[row.status] ?? 'Queued',
      error_message: row.error_message,
      created_at: row.created_at,
      hasOpenActions: !!row.has_open_actions,
      canDelete: !!row.can_delete,
      matchedIn: ((row.matched_in ?? []) as MatchedIn[]).filter((m) => m in FOUND_IN_LABEL),
      snippet: row.snippet ?? undefined,
      snippetStartMs: row.snippet_start_ms ?? undefined,
      snippetSegmentId: row.snippet_segment_id ?? undefined,
    })),
  };
}

/** One matching line of a transcript, for the Search screen. */
export type Passage = {
  segmentId: string;
  meetingId: string;
  noteTitle: string | null;
  noteCreatedAt: string;
  speaker: string | null;
  startMs: number;
  line: string;
};

export type PassagePage = { passages: Passage[]; total: number; noteCount: number };

/** One page of matching transcript lines, best match first. */
export async function findPassages(
  query: string,
  page: { limit: number; offset?: number } = { limit: FIRST_PAGE },
): Promise<PassagePage> {
  if (query.trim() === '') return { passages: [], total: 0, noteCount: 0 };

  const { data, error } = await getSupabase().rpc('find_passages', {
    p_query: query.trim(),
    p_limit: Math.min(Math.max(page.limit, 1), MAX_PAGE),
    p_offset: page.offset ?? 0,
  });

  if (error) throw error;

  const rows = (data ?? []) as {
    segment_id: string;
    meeting_id: string;
    note_title: string | null;
    note_created_at: string;
    speaker_label: string | null;
    start_ms: number;
    line: string;
    total_count: number;
    note_count: number;
  }[];

  return {
    total: rows.length > 0 ? rows[0].total_count : 0,
    noteCount: rows.length > 0 ? rows[0].note_count : 0,
    passages: rows.map((row) => ({
      segmentId: row.segment_id,
      meetingId: row.meeting_id,
      noteTitle: row.note_title,
      noteCreatedAt: row.note_created_at,
      speaker: row.speaker_label,
      startMs: row.start_ms,
      line: row.line,
    })),
  };
}

/** What happened to each note Select mode tried to delete. */
export type DeleteOutcome = { id: string; filePath: string | null; errorCode: string | null };

/**
 * Deletes several notes and their recordings.
 *
 * It answers note by note on purpose. Notes are shared with the team but throwing one away is
 * not, so a handful of ticked notes can quite normally be a mix of yours and a teammate's.
 * The rows go first, in the database, and the files second -- the same order and the same
 * reasoning as deleting one note (src/lib/account.ts).
 */
export async function deleteNotes(ids: string[]): Promise<DeleteOutcome[]> {
  const { data, error } = await getSupabase().rpc('delete_notes', { p_ids: ids });
  if (error) throw error;

  const rows = (data ?? []) as { id: string; file_path: string | null; error_code: string | null }[];
  const outcomes = rows.map((row) => ({
    id: row.id,
    filePath: row.file_path,
    errorCode: row.error_code,
  }));

  const paths = outcomes
    .filter((o) => o.errorCode === null && o.filePath)
    .map((o) => o.filePath as string);
  if (paths.length > 0) {
    // A file left behind is worth far less than telling somebody their note is still there when
    // it is already gone, so a storage problem here is deliberately not raised.
    const { error: removeError } = await getSupabase().storage.from('notes-files').remove(paths);
    if (removeError) console.warn('A recording could not be removed', removeError.message);
  }

  return outcomes;
}

/** One piece of a snippet: either plain words, or words the search matched. */
export type SnippetPart = { text: string; match: boolean };

/**
 * Splits a snippet into plain and matched pieces, so the screen can colour the matches without
 * ever rendering html.
 *
 * It is deliberately total: a half-written mark, a mark inside a mark, or no marks at all all
 * give back readable words. A snippet comes from the database, but it is made of something
 * somebody said, and words somebody said are never to be trusted to be well formed.
 */
export function splitHighlight(snippet: string | undefined): SnippetPart[] {
  if (!snippet) return [];

  const parts: SnippetPart[] = [];
  let plain = '';
  let marked = '';
  let inside = false;

  const pushPlain = () => {
    if (plain !== '') parts.push({ text: plain, match: false });
    plain = '';
  };
  const pushMarked = () => {
    if (marked !== '') parts.push({ text: marked, match: true });
    marked = '';
  };

  for (const char of snippet) {
    if (char === MARK_START) {
      // A second start before the first ended: keep what we have and carry on marking.
      if (inside) continue;
      pushPlain();
      inside = true;
    } else if (char === MARK_END) {
      // An end with no start is just noise. Drop the character, keep the words.
      if (!inside) continue;
      pushMarked();
      inside = false;
    } else if (inside) {
      marked += char;
    } else {
      plain += char;
    }
  }

  // A start that never ended still has words after it, and they are still worth showing.
  pushPlain();
  pushMarked();
  return parts;
}

/** A snippet with the marks taken out, for screen readers and for tests. */
export function plainSnippet(snippet: string | undefined): string {
  return splitHighlight(snippet)
    .map((p) => p.text)
    .join('');
}

/** Says where the words were found, in plain English: "in the title and the transcript". */
export function foundInSentence(matchedIn: MatchedIn[]): string {
  const order: MatchedIn[] = ['title', 'summary', 'transcript'];
  const words = order
    .filter((m) => matchedIn.includes(m))
    .map((m) => FOUND_IN_LABEL[m].replace(/^in /, ''));
  if (words.length === 0) return '';
  if (words.length === 1) return `Found in ${words[0]}`;
  return `Found in ${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Keeping the search and the filters in the web address
// ---------------------------------------------------------------------------
// The address holds what the person CHOSE -- "last 7 days" -- and not the two moments that
// works out to. So a link kept overnight still means the last seven days tomorrow, and a
// refresh brings back the same view rather than a frozen one.

/** Everything about the current view that belongs in the address. */
export type ViewState = {
  query: string;
  preset: DatePreset;
  custom: { from?: string; to?: string };
  statuses: Status[];
  sources: Source[];
  openActions: boolean;
};

export const EMPTY_VIEW: ViewState = {
  query: '',
  preset: 'any',
  custom: {},
  statuses: [],
  sources: [],
  openActions: false,
};

/** True when the view is the plain, unfiltered Home list. */
export function isEmptyView(view: ViewState): boolean {
  return (
    view.query.trim() === '' &&
    view.preset === 'any' &&
    view.statuses.length === 0 &&
    view.sources.length === 0 &&
    !view.openActions
  );
}

/**
 * The address for a view. Anything at its default is left out, so an untouched Home stays a
 * plain "/" and the address only ever carries what somebody actually chose.
 *
 * Lists are joined with commas. Expo's own documentation does not say how it treats the same
 * key twice, so this does not rely on finding out -- and __tests__/notes-search-test.ts checks
 * a view survives the round trip.
 */
export function viewToParams(view: ViewState): Record<string, string> {
  const params: Record<string, string> = {};
  const query = view.query.trim();
  if (query !== '') params.q = query;
  if (view.preset !== 'any') params.preset = view.preset;
  if (view.preset === 'custom') {
    if (view.custom.from) params.from = view.custom.from;
    if (view.custom.to) params.to = view.custom.to;
  }
  if (view.statuses.length > 0) params.status = view.statuses.join(',');
  if (view.sources.length > 0) params.source = view.sources.join(',');
  if (view.openActions) params.open = '1';
  return params;
}

/** The same keys, every one of them, so setParams can clear the ones that have gone. */
export const VIEW_KEYS = ['q', 'preset', 'from', 'to', 'status', 'source', 'open'] as const;

function listFrom<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T[] {
  const text = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  const seen = new Set<T>();
  for (const piece of text.split(',')) {
    const value = piece.trim();
    if (allowed.includes(value as T)) seen.add(value as T);
  }
  return [...seen];
}

function first(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? '';
}

/**
 * Reads a view back out of the address. Anything it does not recognise is dropped rather than
 * argued with: a hand-typed or half-copied address should still open Home.
 */
export function viewFromParams(params: Record<string, string | string[] | undefined>): ViewState {
  const preset = DATE_PRESETS.find((p) => p === first(params.preset)) ?? 'any';
  const from = first(params.from).trim();
  const to = first(params.to).trim();
  return {
    query: first(params.q),
    preset,
    custom:
      preset === 'custom'
        ? { from: fromDayKey(from) ? from : undefined, to: fromDayKey(to) ? to : undefined }
        : {},
    statuses: listFrom(params.status, STATUSES),
    sources: listFrom(params.source, ALL_SOURCES),
    openActions: first(params.open) === '1',
  };
}

/** Turns a view into the question the database is asked. */
export function filtersFor(view: ViewState, now = new Date()): NoteFilters {
  const range = rangeFor(view.preset, view.custom, now);
  return {
    query: view.query,
    from: range.from,
    to: range.to,
    statuses: view.statuses,
    sources: view.sources,
    openActions: view.openActions,
  };
}
