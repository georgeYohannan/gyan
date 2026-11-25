/**
 * Ask: one conversation about EVERY note, rather than about one note.
 *
 * docs/product-spec.md feature 5 promises asking "about this note or all notes". The per-note
 * half shipped in prompt 7; this is the other half. It talks to the SAME `chat` server
 * function, with `scope: 'all'`, and reads the same two tables, so everything already true of
 * the side chat is true here: the Anthropic key is only ever on the server, the conversation
 * lives in the database so it survives a refresh, and only you can read it.
 *
 * WHAT IT CANNOT DO, said out loud here as well as in the help text: Gyan picks the notes a
 * question is about by the WORDS in them, using the same search Home and the Search screen
 * use. So it finds notes where somebody said a word, not notes about the same topic worded
 * differently. "Pricing" will not find a meeting that only ever said "what we charge".
 */
import { invokeChat, type AskResult, type ChatMessage, type ChatSource, type ChatTransport } from '@/lib/chat';
import { getSupabase } from '@/lib/supabase';

/** The 3 questions offered before anybody has typed anything here. */
export const ASK_SUGGESTED = [
  'What did I promise to do?',
  'What is still open across my notes?',
  'What has been decided about pricing?',
] as const;

/** What an empty Ask screen says. */
export const ASK_BLURB =
  'Ask one question and Gyan reads your notes to answer it. It answers only from what was said in them, and every answer says which note it came from.';

export const ASK_PLACEHOLDER = 'Who is doing what this week?';

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
 * The all-notes conversation, oldest first.
 *
 * The thread is the one with NO note on it. That is the whole difference in the database: a
 * chat_threads row with meeting_id left null. The database rules only ever show a person their
 * own threads, so this cannot read anybody else's -- not even a teammate's.
 */
export async function listAskMessages(): Promise<ChatMessage[]> {
  const supabase = getSupabase();
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('id')
    .is('meeting_id', null)
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

/** Asks one question across every note. Throws ChatLimitError when the day's questions are gone. */
export async function askAll(question: string): Promise<AskResult> {
  return invokeChat({ scope: 'all', question: question.trim() });
}

/** Tries an all-notes question that already failed. It never costs a second question. */
export async function retryAsk(messageId: string): Promise<AskResult> {
  return invokeChat({ scope: 'all', retry_message_id: messageId });
}

/** The Ask destination, in the shape `ChatBody` draws. */
export const allNotesChat: ChatTransport = {
  list: listAskMessages,
  ask: askAll,
  retry: retryAsk,
};
