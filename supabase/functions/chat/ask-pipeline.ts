// The slow part of one Ask answer: pick the notes -> read their words -> ask Claude -> save.
// Pure code, so Jest can test it with a fake database and a fake Claude.
import {
  buildUser,
  ChatError,
  costFor,
  languageName,
  MESSAGES,
  passagesAsSegments,
  splitPassages,
  type HistoryMessage,
  type Segment,
} from './chat.ts';
import { ASK_MESSAGES, askSourcesFor, buildAskSystem, formatAskPassages, type AskNote, type AskSource } from './ask.ts';
import type { AdminLike, Ask, CallClaude, CountTokens } from './pipeline.ts';

/** One note the keyword search handed back, before its words have been read. */
export type AskCandidate = {
  id: string;
  title: string | null;
  source: string;
  created_at: string | null;
  file_path: string | null;
};

/** Finds the handful of notes a question might be about. Runs as the PERSON, never as the server. */
export type FindAskNotes = (question: string, limit: number) => Promise<AskCandidate[]>;

/**
 * The answer we write ourselves when no note has any of the question's words in it.
 *
 * It is an ANSWER, not an error, so it is saved beside the question and the conversation reads
 * the way it happened. Claude is never called, so it costs nothing. The sentence is the same one
 * the prompt tells Claude to use when the passages do not answer the question, because a person
 * should not be able to tell from the words whether the search or the model came up empty.
 */
export const NOTHING_FOUND =
  'I could not find that in your notes. Try a word somebody would have said out loud, like a person\'s name or the name of a project.';

export type AskOptions = {
  admin: AdminLike;
  threadId: string;
  accountId: string;
  bucket: string;
  /** The question. It is already saved in the database by this point. */
  question: string;
  /** The language code the person prefers, for example 'en'. */
  language: string;
  /** How many notes at most go into one answer. */
  maxNotes: number;
  maxInputTokens: number;
  maxHistoryMessages: number;
  usdPerMtokIn: number;
  usdPerMtokOut: number;
  usdPerMtokCacheRead: number;
  findNotes: FindAskNotes;
  call: CallClaude;
  countTokens?: CountTokens;
};

export type AskReply = { answer: string; sources: AskSource[] };

/** A note's title the way the rest of Gyan writes it when there is none. */
function titleOf(note: AskCandidate): string {
  return note.title?.trim() || (note.source === 'text' ? 'Pasted text' : 'Untitled note');
}

/** The words of one note, in order: transcript lines, or the paragraphs of pasted text. */
async function readWords(o: AskOptions, note: AskCandidate): Promise<AskNote | null> {
  if (note.source === 'text') {
    if (!note.file_path) return null;
    const { data, error } = await o.admin.storage.from(o.bucket).download(note.file_path);
    if (error || !data) return null;
    const segments = passagesAsSegments(splitPassages(await data.text()));
    if (segments.length === 0) return null;
    return { id: note.id, title: titleOf(note), date: note.created_at, hasTimes: false, segments };
  }

  const { data, error } = await o.admin
    .from('transcript_segments')
    .select('id, speaker_label, start_ms, text')
    .eq('meeting_id', note.id)
    .order('start_ms', { ascending: true });
  // One unreadable note must not sink the whole question: it is left out, and the answer is
  // built from the rest. There is no way to tell a person "one of four notes was skipped"
  // that is more use than simply answering from the three that were readable.
  if (error) return null;
  const segments = (data ?? []) as Segment[];
  if (segments.length === 0) return null;
  return { id: note.id, title: titleOf(note), date: note.created_at, hasTimes: true, segments };
}

/** The Ask conversation so far, oldest first, without the question being answered right now. */
async function readHistory(o: AskOptions): Promise<HistoryMessage[]> {
  const { data, error } = await o.admin
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', o.threadId)
    .order('created_at', { ascending: true });
  if (error) throw new ChatError(MESSAGES.unknown);

  const all = ((data ?? []) as { role: string; content: string }[])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  for (let i = all.length - 1; i >= 0; i -= 1) {
    if (all[i].role === 'user' && all[i].content === o.question.trim()) {
      all.splice(i, 1);
      break;
    }
  }

  const recent = all.slice(-o.maxHistoryMessages);
  while (recent.length > 0 && recent[0].role === 'assistant') recent.shift();
  return recent;
}

/** Saves one answer and logs what it cost. Zero tokens is a real number, not a missing one. */
async function save(
  o: AskOptions,
  answer: string,
  sources: AskSource[],
  tokens: number,
  cost: number,
): Promise<void> {
  const { error } = await o.admin.rpc('finish_ask_message', {
    p_thread_id: o.threadId,
    p_account_id: o.accountId,
    p_content: answer,
    p_sources: sources,
    p_language: o.language,
    p_tokens: tokens,
    p_cost: cost,
  });
  if (error) throw new ChatError(MESSAGES.unknown);
}

/**
 * Answers one question from several notes at once, saves the answer, and logs the cost.
 *
 * WHICH NOTES. The keyword search picks them, ranked, best first. That is the honest limit of
 * this feature and the help text says it out loud: it finds notes where somebody SAID a word,
 * not notes about the same topic worded differently. No embeddings, no chunks table.
 *
 * HOW MANY. At most `maxNotes`, and then as many of those as fit inside the token budget. The
 * lowest-ranked note is dropped first, so trimming always costs the least relevant words.
 * Nothing is ever cut off in the middle: a note is either whole or absent.
 */
export async function runAsk(o: AskOptions): Promise<AskReply> {
  const candidates = await o.findNotes(o.question, o.maxNotes);

  const notes: AskNote[] = [];
  for (const candidate of candidates) {
    const read = await readWords(o, candidate);
    if (read) notes.push(read);
  }

  if (notes.length === 0) {
    await save(o, NOTHING_FOUND, [], 0, 0);
    return { answer: NOTHING_FOUND, sources: [] };
  }

  const history = await readHistory(o);
  const language = languageName(o.language);

  /** The request for a given set of notes, newest-first order kept as the search ranked it. */
  const askFor = (set: AskNote[]): { ask: Ask; passages: ReturnType<typeof formatAskPassages>['passages'] } => {
    const built = formatAskPassages(set);
    return {
      ask: { system: buildAskSystem(language, built.text), history, question: buildUser(o.question) },
      passages: built.passages,
    };
  };

  let used = notes;
  let { ask, passages } = askFor(used);

  // Never cut the words off quietly. Drop whole notes from the least relevant end until the
  // request fits, and if even the single best note is too big, say so in plain words.
  if (o.countTokens) {
    let tokens = await o.countTokens(ask);
    while (tokens > o.maxInputTokens && used.length > 1) {
      used = used.slice(0, -1);
      ({ ask, passages } = askFor(used));
      tokens = await o.countTokens(ask);
    }
    if (tokens > o.maxInputTokens) throw new ChatError(ASK_MESSAGES.tooLong);
  }

  const reply = await o.call(ask);
  if (reply.refused) throw new ChatError(MESSAGES.declined);

  const answer = reply.text.trim();
  if (answer === '') throw new ChatError(MESSAGES.empty);

  const sources = askSourcesFor(answer, passages);

  await save(
    o,
    answer,
    sources,
    reply.tokensIn + reply.cachedTokensIn + reply.tokensOut,
    costFor(
      reply.tokensIn,
      reply.cachedTokensIn,
      reply.tokensOut,
      o.usdPerMtokIn,
      o.usdPerMtokOut,
      o.usdPerMtokCacheRead,
    ),
  );

  return { answer, sources };
}
