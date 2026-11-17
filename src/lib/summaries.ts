/**
 * Reading a note's summary and action items, ticking an item off, and asking the server function
 * to write the summary. The Anthropic key is never here. It lives only on the server.
 */
import { getSupabase } from '@/lib/supabase';
import { formatTime } from '@/lib/transcripts';

export type Summary = {
  language: string;
  overview: string | null;
  key_points: string[];
  decisions: string[];
  open_questions: string[];
};

export type ActionItem = {
  id: string;
  text: string;
  owner_name: string | null;
  due_text: string | null;
  start_ms: number | null;
  done: boolean;
};

/** The lists are saved as JSON, so make sure we always hand back a list of words. */
function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
}

/** The summary of a note, or undefined when there is none yet. */
export async function getSummary(meetingId: string): Promise<Summary | undefined> {
  const { data, error } = await getSupabase()
    .from('summaries')
    .select('language, overview, key_points, decisions, open_questions')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return {
    language: (data.language as string) ?? 'en',
    overview: (data.overview as string) ?? null,
    key_points: asList(data.key_points),
    decisions: asList(data.decisions),
    open_questions: asList(data.open_questions),
  };
}

/** The action items of a note, earliest moment first. */
export async function listActionItems(meetingId: string): Promise<ActionItem[]> {
  const { data, error } = await getSupabase()
    .from('action_items')
    .select('id, text, owner_name, due_text, start_ms, done')
    .eq('meeting_id', meetingId)
    .order('start_ms', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActionItem[];
}

/** Ticks an action item on or off. This is the only thing the app itself may change here. */
export async function setActionItemDone(id: string, done: boolean): Promise<void> {
  const { error } = await getSupabase().from('action_items').update({ done }).eq('id', id);
  if (error) throw error;
}

/** Asks the server to write the summary. Resolves when the server has accepted the job. */
export async function startSummary(meetingId: string): Promise<void> {
  const { error, response } = (await getSupabase().functions.invoke('summarize', { body: { meeting_id: meetingId } })) as {
    error: { message?: string } | null;
    response?: Response;
  };
  if (!error) return;
  // 409 means one is already being written (for example a double tap). That is fine.
  if (response?.status === 409) return;
  throw new Error(error.message ?? 'summarize_failed');
}

/** The summary as plain words, for the Copy button. */
export function summaryToPlainText(title: string, summary: Summary, items: ActionItem[]): string {
  const parts: string[] = [title.trim()];
  if (summary.overview) parts.push('', summary.overview);

  const section = (heading: string, lines: string[]) => {
    if (lines.length === 0) return;
    parts.push('', heading, ...lines.map((line) => `- ${line}`));
  };
  section('Key points', summary.key_points);
  section('Decisions', summary.decisions);
  section('Open questions', summary.open_questions);

  if (items.length > 0) {
    parts.push('', 'Action items');
    for (const item of items) {
      const extras = [item.owner_name, item.due_text].filter((x): x is string => !!x && x.trim() !== '');
      const when = item.start_ms !== null && item.start_ms !== undefined ? formatTime(item.start_ms) : undefined;
      const tail = [...extras, ...(when ? [`at ${when}`] : [])];
      parts.push(`- [${item.done ? 'x' : ' '}] ${item.text}${tail.length > 0 ? ` (${tail.join(', ')})` : ''}`);
    }
  }
  return `${parts.join('\n')}\n`;
}
