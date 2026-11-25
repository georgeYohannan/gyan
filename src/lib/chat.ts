/**
 * The side chat: reading the conversation about one note, and asking a new question.
 * The Anthropic key is never here. It lives only on the server.
 */
import { getSupabase } from '@/lib/supabase';

/**
 * One passage number an answer pointed at, and the transcript line it means.
 *
 * `meeting_id` and `note_title` are only there on an answer from the Ask destination, which
 * reads several notes at once and therefore has to say WHICH note a number came from. A note
 * chat leaves them off, because there is only ever one note to mean.
 */
export type ChatSource = {
  n: number;
  segment_id: string;
  start_ms: number;
  speaker_label: string | null;
  meeting_id?: string;
  note_title?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: ChatSource[];
  created_at: string;
};

/** What happens after a question: either an answer, or a plain-words problem with a Retry. */
export type AskResult =
  | { ok: true; answer: string; sources: ChatSource[]; remaining: number; messageId: string }
  | { ok: false; message: string; messageId?: string; remaining?: number };

/** Thrown when the person has used up today's questions. */
export class ChatLimitError extends Error {}

/** The 3 questions offered before anybody has typed anything. */
export const SUGGESTED = [
  'What were the decisions?',
  'What did I promise to do?',
  'What is still open?',
] as const;

/** What an empty note chat says before anybody has asked anything. */
export const CHAT_BLURB =
  'Ask anything about this note. Gyan answers only from what was said in it, and shows you where each answer came from.';

export const LIMIT_MESSAGE = 'You have used all your questions for today. You get a new set tomorrow.';

export const NO_TRANSCRIPT_MESSAGE = 'You can ask questions once this note has its words.';

/** For a pasted-text note that somehow has nothing in it. */
export const NO_WORDS_MESSAGE = 'This note has no words in it, so there is nothing to ask about.';

export const SEND_PROBLEM_MESSAGE = 'We could not send your question. Check your internet and tap Retry.';

/** The longest question we let somebody send, to match the server. */
export const MAX_QUESTION_LENGTH = 1000;

/** Saved sources come back as JSON, so make sure we always hand back a tidy list. */
function asSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return [];
  const out: ChatSource[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const s = raw as Record<string, unknown>;
    if (typeof s.n !== 'number' || typeof s.segment_id !== 'string') continue;
    out.push({
      n: s.n,
      segment_id: s.segment_id,
      start_ms: typeof s.start_ms === 'number' ? s.start_ms : 0,
      speaker_label: typeof s.speaker_label === 'string' ? s.speaker_label : null,
      ...(typeof s.meeting_id === 'string' ? { meeting_id: s.meeting_id } : {}),
      ...(typeof s.note_title === 'string' ? { note_title: s.note_title } : {}),
    });
  }
  return out;
}

/**
 * The conversation about one note, oldest first.
 * Nothing yet means nobody has asked anything about this note. Because this reads from the
 * database, the chat is still there after a refresh, and on another device.
 */
export async function listChatMessages(meetingId: string): Promise<ChatMessage[]> {
  const supabase = getSupabase();
  // The database rules only ever show a person their OWN thread, so this cannot read anyone else's.
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('id')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (threadError) throw threadError;
  if (!thread) return [];

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, sources, created_at')
    .eq('thread_id', (thread as { id: string }).id)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      id: String(m.id),
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : '',
      sources: asSources(m.sources),
      created_at: String(m.created_at),
    }));
}

/**
 * Sends one request to the chat server function and reads its answer.
 *
 * Exported because the Ask destination talks to the SAME server function, with `scope: 'all'`
 * in the body. One place reads the answer, one place decides what a 402 means, one place
 * decides what a problem looks like -- so the two chats cannot drift apart in how they fail.
 */
export async function invokeChat(body: Record<string, unknown>): Promise<AskResult> {
  const { data, error, response } = (await getSupabase().functions.invoke('chat', { body })) as {
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
    response?: Response;
  };

  if (error) {
    // 402 means today's questions are used up. Everything else is a problem worth a Retry.
    if (response?.status === 402) throw new ChatLimitError(LIMIT_MESSAGE);
    throw new Error(error.message ?? 'chat_failed');
  }

  if (data?.ok === true) {
    return {
      ok: true,
      answer: typeof data.answer === 'string' ? data.answer : '',
      sources: asSources(data.sources),
      remaining: typeof data.remaining === 'number' ? data.remaining : 0,
      messageId: String(data.message_id ?? ''),
    };
  }

  return {
    ok: false,
    message: typeof data?.message === 'string' ? data.message : SEND_PROBLEM_MESSAGE,
    messageId: typeof data?.message_id === 'string' ? data.message_id : undefined,
    remaining: typeof data?.remaining === 'number' ? data.remaining : undefined,
  };
}

/** Asks a new question about one note. Throws ChatLimitError when the day's questions are gone. */
export async function askChat(meetingId: string, question: string): Promise<AskResult> {
  return invokeChat({ meeting_id: meetingId, question: question.trim() });
}

/**
 * Tries a question that already failed. It uses the question that is ALREADY saved, so a problem
 * never costs somebody a second question out of their day.
 */
export async function retryChat(messageId: string): Promise<AskResult> {
  return invokeChat({ retry_message_id: messageId });
}


/**
 * Everything a chat needs from the outside world: read the conversation, ask, try again.
 *
 * `ChatBody` draws a chat and knows nothing about which chat it is. There are two:
 * the side chat on one note, and the Ask destination across every note. They have the same
 * states, the same failures and the same markup, so they are one component with two
 * transports rather than two copies of three hundred lines.
 */
export type ChatTransport = {
  /** The conversation so far, oldest first. */
  list: () => Promise<ChatMessage[]>;
  /** Asks a new question. Throws ChatLimitError when the day's questions are gone. */
  ask: (question: string) => Promise<AskResult>;
  /** Tries a saved question again. It never costs a second question out of the day. */
  retry: (messageId: string) => Promise<AskResult>;
};

/** The side chat about one note. */
export function noteChat(meetingId: string): ChatTransport {
  return {
    list: () => listChatMessages(meetingId),
    ask: (question) => askChat(meetingId, question),
    retry: (messageId) => retryChat(messageId),
  };
}
