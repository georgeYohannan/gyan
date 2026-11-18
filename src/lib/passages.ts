/**
 * Pasted text and uploaded text files have no transcript, because nobody spoke them.
 * Instead their words are cut into numbered paragraphs, so the Transcript tab can show them and
 * the chat can point at them.
 *
 * IMPORTANT: splitPassages below is copied word for word in supabase/functions/chat/chat.ts.
 * Both sides must cut the text the same way, or a number in an answer would point at the wrong
 * paragraph. A test (__tests__/passages-test.ts) keeps the two copies in step.
 */
import { getSupabase } from '@/lib/supabase';

const BUCKET = 'notes-files';

export type Passage = { id: string; text: string };

/**
 * Cuts text into numbered paragraphs.
 * Paragraphs are blocks separated by a blank line. If the whole thing is one block with no blank
 * lines, every line becomes its own paragraph instead.
 */
export function splitPassages(raw: string): Passage[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (text === '') return [];

  let chunks = text.split(/\n\s*\n+/);
  if (chunks.length === 1) chunks = text.split(/\n+/);

  return chunks
    .map((c) => c.trim())
    .filter((c) => c !== '')
    .map((c, i) => ({ id: `p${i + 1}`, text: c }));
}

/**
 * The paragraphs of a pasted-text note, read from the private bucket.
 * Returns nothing when the note has no file, so the screen shows its empty state instead.
 */
export async function listPassages(filePath: string | null): Promise<Passage[]> {
  if (!filePath) return [];
  const { data, error } = await getSupabase().storage.from(BUCKET).download(filePath);
  if (error || !data) throw error ?? new Error('download_failed');
  return splitPassages(await data.text());
}
