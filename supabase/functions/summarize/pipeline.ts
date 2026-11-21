// The slow part of a summary: read the words -> ask Claude -> save (or fail).
// Pure code, so Jest can test it with a fake database and a fake Claude.
import { looksLikeText, SNIFF_BYTES, WRONG_TYPE_MESSAGE } from '../_shared/filetype.ts';
import { isPathInsideAccount, WRONG_PLACE_MESSAGE } from '../_shared/paths.ts';
import {
  buildSystem,
  buildUser,
  costFor,
  formatTranscript,
  languageName,
  MESSAGES,
  parseSummary,
  SummaryError,
  SummaryShapeError,
  type Segment,
  type Summary,
} from './claude.ts';

/** What we ask Claude, in the two halves of the prompt. */
export type Ask = { system: string; user: string };

/** What comes back. `refused` is true in the rare case a safety check declines the request. */
export type Reply = { text: string; refused: boolean; tokensIn: number; tokensOut: number };

export type CallClaude = (ask: Ask) => Promise<Reply>;
export type CountTokens = (ask: Ask) => Promise<number>;

/** The small part of the Supabase admin client that we use. */
export type AdminLike = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(column: string, options: { ascending: boolean }): PromiseLike<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };
  storage: {
    from(bucket: string): {
      download(path: string): PromiseLike<{
        data: {
          text(): Promise<string>;
          /** Just the first few thousand bytes, to work out what the file really is. */
          slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
        } | null;
        error: unknown;
      }>;
    };
  };
};

export type SummarizeOptions = {
  admin: AdminLike;
  meetingId: string;
  /** 'text' means the person pasted or uploaded words, so there is no transcript to read. */
  source: string;
  filePath: string | null;
  /** The language code the person prefers, for example 'en'. */
  language: string;
  bucket: string;
  maxInputTokens: number;
  usdPerMtokIn: number;
  usdPerMtokOut: number;
  call: CallClaude;
  /** Counts the tokens before we send, so a huge note is refused instead of being cut short. */
  countTokens?: CountTokens;
  /**
   * Run the moment the note becomes Ready, and only then. This is where the recap email goes
   * out, when the account owner has the automatic send switched on.
   * A note that fails never reaches here, so a failed note never emails anybody.
   */
  onReady?: () => Promise<void>;
  /** The account the note belongs to, so the stored file path can be checked against it. */
  accountId?: string;
};

/** The words to summarize: the pasted text, or the transcript lines joined together. */
async function readWords(o: SummarizeOptions): Promise<{ words: string; hasTimes: boolean }> {
  if (o.source === 'text') {
    if (!o.filePath) throw new SummaryError(MESSAGES.empty);

    // The same check as the export, for the same reason: this download uses the service
    // key, and a path that climbs out of the account would be read with full authority.
    // claim_summary accepts a note that previously failed, so a note can reach here without
    // ever having had a file really uploaded against its name.
    if (!o.accountId || !isPathInsideAccount(o.filePath, o.accountId)) {
      throw new SummaryError(WRONG_PLACE_MESSAGE);
    }

    const { data, error } = await o.admin.storage.from(o.bucket).download(o.filePath);
    if (error || !data) throw new SummaryError(MESSAGES.empty);

    // IS THIS REALLY WRITING? Until now Gyan believed whatever the app said a file was, and
    // the app reads that from the file's name. A note marked as text has its raw contents
    // put straight into the AI prompt, with no transcription step in between -- so a file
    // claiming to be text was the shortest route from "upload anything" to "put anything I
    // like in front of the model". The bytes decide now, not the name.
    // Only the first few thousand bytes are looked at. The whole file is already in hand
    // here -- a text note is small, and its words are about to be read anyway -- so there
    // is nothing to save by asking for a range, unlike in the transcribe step.
    const bytes = new Uint8Array(await data.slice(0, SNIFF_BYTES).arrayBuffer());
    if (!looksLikeText(bytes)) throw new SummaryError(WRONG_TYPE_MESSAGE);

    const words = (await data.text()).trim();
    if (words === '') throw new SummaryError(MESSAGES.empty);
    return { words, hasTimes: false };
  }

  const { data, error } = await o.admin
    .from('transcript_segments')
    .select('speaker_label, start_ms, text')
    .eq('meeting_id', o.meetingId)
    .order('start_ms', { ascending: true });
  if (error) throw new SummaryError(MESSAGES.unknown);
  const words = formatTranscript((data ?? []) as Segment[]);
  if (words.trim() === '') throw new SummaryError(MESSAGES.empty);
  return { words, hasTimes: true };
}

/**
 * Asks Claude, checks the answer, and tries exactly once more when the answer is the wrong shape.
 * Both tries are paid for, so the tokens of both are added up for the cost row.
 */
async function askClaude(o: SummarizeOptions, ask: Ask): Promise<{ summary: Summary; tokensIn: number; tokensOut: number }> {
  let tokensIn = 0;
  let tokensOut = 0;
  let lastShapeProblem: SummaryShapeError | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const reply = await o.call(ask);
    tokensIn += reply.tokensIn;
    tokensOut += reply.tokensOut;
    if (reply.refused) throw new SummaryError(MESSAGES.declined);
    try {
      return { summary: parseSummary(reply.text), tokensIn, tokensOut };
    } catch (e) {
      if (!(e instanceof SummaryShapeError)) throw e;
      lastShapeProblem = e;
    }
  }
  // Two tries, two answers we could not read. Give up with a plain message.
  console.error('summary shape problem for', o.meetingId, lastShapeProblem?.message ?? 'unknown');
  throw new SummaryError(MESSAGES.badShape);
}

/**
 * Writes the summary and the action items for one note, or marks the note Failed.
 * Returns true when the note is now Ready.
 */
export async function runSummary(o: SummarizeOptions): Promise<boolean> {
  try {
    const { words, hasTimes } = await readWords(o);
    const ask: Ask = {
      system: buildSystem(languageName(o.language), hasTimes),
      user: buildUser(words),
    };

    // Never cut the text off quietly: if it is too big, stop and say so.
    if (o.countTokens) {
      const tokens = await o.countTokens(ask);
      if (tokens > o.maxInputTokens) throw new SummaryError(MESSAGES.tooLong);
    }

    const { summary, tokensIn, tokensOut } = await askClaude(o, ask);

    const { error } = await o.admin.rpc('finish_summary', {
      p_meeting_id: o.meetingId,
      p_language: o.language,
      p_title: summary.title,
      p_overview: summary.overview,
      p_key_points: summary.key_points,
      p_decisions: summary.decisions,
      p_open_questions: summary.open_questions,
      p_action_items: summary.action_items,
      p_tokens: tokensIn + tokensOut,
      p_cost: costFor(tokensIn, tokensOut, o.usdPerMtokIn, o.usdPerMtokOut),
    });
    if (error) throw new Error('finish_failed');

    // The note is Ready. Anything that happens after this point must not be able to undo it, so
    // a problem sending the recap is written down and swallowed, never raised.
    if (o.onReady) {
      try {
        await o.onReady();
      } catch (e) {
        console.error('after-ready step failed for', o.meetingId, e instanceof Error ? e.name : 'error');
      }
    }
    return true;
  } catch (e) {
    const message = e instanceof SummaryError ? e.message : MESSAGES.unknown;
    // Log the kind of problem only. Never log the key or the words of the meeting.
    console.error('summary failed for', o.meetingId, e instanceof Error ? e.name : 'error');
    await o.admin.rpc('fail_summary', { p_meeting_id: o.meetingId, p_message: message });
    return false;
  }
}
