// The slow part of one chat answer: read the note's words -> ask Claude -> save the answer.
// Pure code, so Jest can test it with a fake database and a fake Claude.
import {
  buildSystem,
  buildUser,
  ChatError,
  costFor,
  formatPassages,
  languageName,
  MESSAGES,
  sourcesFor,
  type HistoryMessage,
  type Segment,
  type Source,
} from './chat.ts';

/** What we ask Claude: the system half, the conversation so far, and the new question. */
export type Ask = { system: string; history: HistoryMessage[]; question: string };

/** What comes back. `refused` is true in the rare case a safety check declines the request. */
export type Reply = {
  text: string;
  refused: boolean;
  tokensIn: number;
  cachedTokensIn: number;
  tokensOut: number;
};

export type CallClaude = (ask: Ask) => Promise<Reply>;
export type CountTokens = (ask: Ask) => Promise<number>;

type Rows = PromiseLike<{ data: unknown[] | null; error: unknown }>;

/** The small part of the Supabase admin client that we use. */
export type AdminLike = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        order(column: string, options: { ascending: boolean }): Rows;
      };
    };
  };
};

export type ChatOptions = {
  admin: AdminLike;
  meetingId: string;
  threadId: string;
  accountId: string;
  /** The title and date of the note, used in every passage line. */
  noteTitle: string;
  noteDate: string | null;
  /** The question the person asked. It is already saved in the database by this point. */
  question: string;
  /** The language code the person prefers, for example 'en'. */
  language: string;
  maxInputTokens: number;
  maxHistoryMessages: number;
  usdPerMtokIn: number;
  usdPerMtokOut: number;
  usdPerMtokCacheRead: number;
  call: CallClaude;
  /** Counts the tokens before we send, so a huge note is refused instead of being cut short. */
  countTokens?: CountTokens;
};

export type ChatResult = { answer: string; sources: Source[] };

/** The transcript lines of the note, in time order. */
async function readSegments(o: ChatOptions): Promise<Segment[]> {
  const { data, error } = await o.admin
    .from('transcript_segments')
    .select('id, speaker_label, start_ms, text')
    .eq('meeting_id', o.meetingId)
    .order('start_ms', { ascending: true });
  if (error) throw new ChatError(MESSAGES.unknown);
  const segments = (data ?? []) as Segment[];
  if (segments.length === 0) throw new ChatError(MESSAGES.noTranscript);
  return segments;
}

/**
 * The conversation so far, oldest first, without the question we are answering right now.
 * Only the last few are sent back, so a long chat never grows the request without end.
 */
async function readHistory(o: ChatOptions): Promise<HistoryMessage[]> {
  const { data, error } = await o.admin
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', o.threadId)
    .order('created_at', { ascending: true });
  if (error) throw new ChatError(MESSAGES.unknown);

  const all = ((data ?? []) as { role: string; content: string }[])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // The newest 'user' row is the question being answered now. It goes in on its own, so drop it
  // from the history to avoid asking it twice.
  for (let i = all.length - 1; i >= 0; i -= 1) {
    if (all[i].role === 'user' && all[i].content === o.question.trim()) {
      all.splice(i, 1);
      break;
    }
  }

  // Claude needs the conversation to start with a question, never with an answer.
  const recent = all.slice(-o.maxHistoryMessages);
  while (recent.length > 0 && recent[0].role === 'assistant') recent.shift();
  return recent;
}

/**
 * Answers one question about one note, saves the answer, and logs the cost.
 * Throws a ChatError with plain words when it cannot. The question stays saved either way, so the
 * person can tap Retry without it costing them another question out of their day.
 */
export async function runChat(o: ChatOptions): Promise<ChatResult> {
  const segments = await readSegments(o);
  const history = await readHistory(o);

  const ask: Ask = {
    system: buildSystem(languageName(o.language), formatPassages(segments, o.noteTitle, o.noteDate)),
    history,
    question: buildUser(o.question),
  };

  // Never cut the words off quietly: if the note is too big, stop and say so.
  if (o.countTokens) {
    const tokens = await o.countTokens(ask);
    if (tokens > o.maxInputTokens) throw new ChatError(MESSAGES.tooLong);
  }

  const reply = await o.call(ask);
  if (reply.refused) throw new ChatError(MESSAGES.declined);

  const answer = reply.text.trim();
  if (answer === '') throw new ChatError(MESSAGES.empty);

  // Only passage numbers that really point at a line become links.
  const sources = sourcesFor(answer, segments);

  const { error } = await o.admin.rpc('finish_chat_message', {
    p_thread_id: o.threadId,
    p_account_id: o.accountId,
    p_meeting_id: o.meetingId,
    p_content: answer,
    p_sources: sources,
    p_language: o.language,
    p_tokens: reply.tokensIn + reply.cachedTokensIn + reply.tokensOut,
    p_cost: costFor(
      reply.tokensIn,
      reply.cachedTokensIn,
      reply.tokensOut,
      o.usdPerMtokIn,
      o.usdPerMtokOut,
      o.usdPerMtokCacheRead,
    ),
  });
  if (error) throw new ChatError(MESSAGES.unknown);

  return { answer, sources };
}
