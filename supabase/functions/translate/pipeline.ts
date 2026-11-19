// The slow part of one translation: check whether it is already saved -> read the words ->
// ask Claude -> save it and log the cost.
// Pure code, so Jest can test it with a fake database and a fake Claude.
import {
  baseCode,
  buildSystem,
  buildUser,
  costFor,
  languageName,
  MESSAGES,
  parseSummaryTranslation,
  parseTranscriptTranslation,
  PROMPT_VERSION,
  splitPassages,
  TranslateError,
  TranslateShapeError,
  type SummaryContent,
  type TranscriptContent,
  type TranslatedContent,
  type TranslateKind,
} from './translate.ts';

/** What we ask Claude: the rules half, and the words to translate. */
export type Ask = { system: string; content: string; kind: TranslateKind };

/** What comes back. `refused` is true in the rare case a safety check declines the request. */
export type Reply = { text: string; refused: boolean; tokensIn: number; tokensOut: number };

export type CallClaude = (ask: Ask) => Promise<Reply>;
export type CountTokens = (ask: Ask) => Promise<number>;

type Rows = PromiseLike<{ data: unknown[] | null; error: unknown }>;
type RpcResult = { data: unknown; error: { message: string } | null };

/** The small part of the Supabase admin client that we use. */
export type AdminLike = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<RpcResult> & {
    single<T>(): PromiseLike<{ data: T | null; error: { message: string } | null }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(column: string, options: { ascending: boolean }): Rows & {
          order(column: string, options: { ascending: boolean }): Rows;
        };
        maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
  storage: {
    from(bucket: string): {
      download(path: string): PromiseLike<{ data: { text(): Promise<string> } | null; error: unknown }>;
    };
  };
};

/** What claim_translation hands back. */
export type Claim = {
  account_id: string;
  source_id: string;
  /** The translation that is already saved, when there is one. Then nothing is asked for or paid. */
  existing: string | null;
  note_source: string;
  file_path: string | null;
};

export type TranslateOptions = {
  admin: AdminLike;
  meetingId: string;
  userId: string;
  kind: TranslateKind;
  /** The language code asked for, for example 'es'. */
  language: string;
  bucket: string;
  maxTranscriptTokens: number;
  usdPerMtokIn: number;
  usdPerMtokOut: number;
  call: CallClaude;
  /** Counts the tokens before we send, so a huge note is refused instead of being cut short. */
  countTokens?: CountTokens;
};

export type TranslateResult = {
  kind: TranslateKind;
  language: string;
  content: TranslatedContent;
  /** true when it came straight from the database, so nothing was asked for and nothing was paid. */
  reused: boolean;
};

/** A plain-words error that means "you may not do that", so the caller can answer 403. */
export class TranslateNotAllowedError extends Error {}

/** Turns a database error from claim_translation into the right kind of problem. */
function claimProblem(message: string): Error {
  if (message.includes('no_summary')) return new TranslateError(MESSAGES.noSummary);
  if (message.includes('not_allowed')) return new TranslateNotAllowedError('not_allowed');
  return new TranslateError(MESSAGES.unknown);
}

/** The words of the Summary tab, in the order the app shows them. */
async function readSummary(o: TranslateOptions): Promise<SummaryContent> {
  const { data: row, error } = await o.admin
    .from('summaries')
    .select('overview, key_points, decisions, open_questions')
    .eq('meeting_id', o.meetingId)
    .maybeSingle();
  if (error || !row) throw new TranslateError(MESSAGES.noSummary);
  const summary = row as {
    overview: string | null;
    key_points: unknown;
    decisions: unknown;
    open_questions: unknown;
  };

  // The app reads the to-dos in the same order: earliest moment first, then by id so two to-dos
  // from the same moment never swap places between one read and the next.
  const { data: items, error: itemsError } = await o.admin
    .from('action_items')
    .select('id, text, due_text, start_ms')
    .eq('meeting_id', o.meetingId)
    .order('start_ms', { ascending: true })
    .order('id', { ascending: true });
  if (itemsError) throw new TranslateError(MESSAGES.unknown);

  const asList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];

  const content: SummaryContent = {
    overview: summary.overview ?? '',
    key_points: asList(summary.key_points),
    decisions: asList(summary.decisions),
    open_questions: asList(summary.open_questions),
    action_items: ((items ?? []) as { text: string; due_text: string | null }[]).map((item) => ({
      text: item.text,
      due: item.due_text ?? null,
    })),
  };

  const hasWords =
    content.overview.trim() !== '' ||
    content.key_points.length > 0 ||
    content.decisions.length > 0 ||
    content.open_questions.length > 0 ||
    content.action_items.length > 0;
  if (!hasWords) throw new TranslateError(MESSAGES.noWords);

  return content;
}

/**
 * The words of the transcript, in order: the spoken lines of a recording, or the paragraphs of a
 * pasted-text note. Speaker labels and times are never sent, so they can never be changed.
 */
async function readTranscript(o: TranslateOptions, claim: Claim): Promise<TranscriptContent> {
  if (claim.note_source === 'text') {
    if (!claim.file_path) throw new TranslateError(MESSAGES.noWords);
    const { data, error } = await o.admin.storage.from(o.bucket).download(claim.file_path);
    if (error || !data) throw new TranslateError(MESSAGES.noWords);
    const lines = splitPassages(await data.text()).map((p) => p.text);
    if (lines.length === 0) throw new TranslateError(MESSAGES.noWords);
    return { lines };
  }

  const { data, error } = await o.admin
    .from('transcript_segments')
    .select('id, start_ms, text')
    .eq('meeting_id', o.meetingId)
    .order('start_ms', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new TranslateError(MESSAGES.unknown);
  const lines = ((data ?? []) as { text: string }[]).map((row) => row.text);
  if (lines.length === 0) throw new TranslateError(MESSAGES.noWords);
  return { lines };
}

/**
 * A translation that is already saved, read back.
 * It counts as saved only when it is readable AND it was made by the rules we use today. One made
 * by older rules is treated as not there, so it is made again with the rules we have now.
 * An unreadable one is also treated as not there.
 */
function reuse(existing: string | null): TranslatedContent | null {
  if (typeof existing !== 'string' || existing.trim() === '') return null;
  try {
    const parsed = JSON.parse(existing);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { v, ...content } = parsed as Record<string, unknown>;
    if (v !== PROMPT_VERSION) return null;
    return content as TranslatedContent;
  } catch {
    return null;
  }
}

/**
 * Translates one note's summary or transcript, saves it, and logs the cost.
 * If the same translation is already saved, it comes straight back: Claude is never asked, and no
 * cost row is written. Throws a TranslateError with plain words when it cannot.
 */
export async function runTranslate(o: TranslateOptions): Promise<TranslateResult> {
  const language = o.language.trim();

  const { data: claim, error: claimError } = await o.admin
    .rpc('claim_translation', {
      p_meeting_id: o.meetingId,
      p_user_id: o.userId,
      p_kind: o.kind,
      p_language: language,
    })
    .single<Claim>();
  if (claimError || !claim) throw claimProblem(claimError?.message ?? '');

  // Already paid for once. Never pay for it twice.
  const saved = reuse(claim.existing);
  if (saved) return { kind: o.kind, language, content: saved, reused: true };

  const original: TranslatedContent =
    o.kind === 'summary' ? await readSummary(o) : await readTranscript(o, claim);

  const ask: Ask = { system: buildSystem(languageName(language)), content: buildUser(original), kind: o.kind };

  // Never cut the words off quietly: if the transcript is too big for one answer, stop and say so.
  if (o.kind === 'transcript' && o.countTokens) {
    const tokens = await o.countTokens(ask);
    if (tokens > o.maxTranscriptTokens) throw new TranslateError(MESSAGES.tooLong);
  }

  // One try, then exactly one more if the answer comes back out of shape. Both tries are paid
  // for, so both are added into the single cost row.
  let tokensIn = 0;
  let tokensOut = 0;
  let translated: TranslatedContent | null = null;
  let lastShapeProblem: TranslateShapeError | null = null;

  for (let attempt = 1; attempt <= 2 && translated === null; attempt += 1) {
    const replied = await o.call(ask);
    tokensIn += replied.tokensIn;
    tokensOut += replied.tokensOut;
    if (replied.refused) throw new TranslateError(MESSAGES.declined);
    try {
      translated =
        o.kind === 'summary'
          ? parseSummaryTranslation(replied.text, original as SummaryContent)
          : parseTranscriptTranslation(replied.text, original as TranscriptContent);
    } catch (e) {
      if (!(e instanceof TranslateShapeError)) throw e;
      lastShapeProblem = e;
    }
  }

  if (translated === null) {
    // The KIND of problem only. Never the words of the meeting.
    console.error('translation shape problem for', o.meetingId, lastShapeProblem?.message ?? 'unknown');
    throw new TranslateError(MESSAGES.badShape);
  }

  const { error: saveError } = await o.admin.rpc('save_translation', {
    p_meeting_id: o.meetingId,
    p_account_id: claim.account_id,
    p_kind: o.kind,
    p_source_id: claim.source_id,
    p_language: language,
    // The version goes in with the words, so a later change to the rules reaches this note.
    p_content: JSON.stringify({ v: PROMPT_VERSION, ...translated }),
    p_tokens: tokensIn + tokensOut,
    p_cost: costFor(tokensIn, tokensOut, o.usdPerMtokIn, o.usdPerMtokOut),
  });
  if (saveError) throw new TranslateError(MESSAGES.unknown);

  return { kind: o.kind, language, content: translated, reused: false };
}

/** Exported so the caller can tell "already in that language" apart from a real translation. */
export function isSameLanguage(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = baseCode(a);
  const right = baseCode(b);
  return left !== '' && left === right;
}
