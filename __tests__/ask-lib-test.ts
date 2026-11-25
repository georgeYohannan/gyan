/**
 * The Ask library: reading the all-notes conversation, and asking one question of every note.
 * The real server and the real AI are never called here.
 */
import { askAll, ASK_SUGGESTED, listAskMessages, retryAsk } from '@/lib/ask';
import { ChatLimitError, LIMIT_MESSAGE, SEND_PROBLEM_MESSAGE } from '@/lib/chat';

let mockThread: { data: unknown; error: unknown };
let mockMessages: { data: unknown; error: unknown };
const mockInvoke = jest.fn();
/** Every filter the library put on a read, so a test can prove WHICH thread it asked for. */
const mockFilter = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.is = (...a: unknown[]) => {
        mockFilter(table, 'is', ...a);
        return chain;
      };
      chain.eq = (...a: unknown[]) => {
        mockFilter(table, 'eq', ...a);
        return chain;
      };
      chain.order = () => chain;
      chain.maybeSingle = async () => mockThread;
      chain.then = (resolve: (v: unknown) => void) => resolve(mockMessages);
      return chain;
    },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  }),
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockFilter.mockReset();
  mockThread = { data: { id: 'ask-thread' }, error: null };
  mockMessages = { data: [], error: null };
});

describe('reading the all-notes conversation', () => {
  test('it asks for the thread with NO note on it', async () => {
    await listAskMessages();
    // That is the whole difference in the database between Ask and a note chat.
    expect(mockFilter).toHaveBeenCalledWith('chat_threads', 'is', 'meeting_id', null);
  });

  test('nothing asked yet means an empty conversation, not an error', async () => {
    mockThread = { data: null, error: null };
    await expect(listAskMessages()).resolves.toEqual([]);
  });

  test('an answer keeps the note each passage number came from', async () => {
    mockMessages = {
      data: [
        { id: 'm1', role: 'user', content: 'What did I promise?', sources: null, created_at: '2026-11-20T10:00:00Z' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'You said you would send the plan [2].',
          sources: [
            {
              n: 2,
              segment_id: 'a2',
              start_ms: 65000,
              speaker_label: 'Priya',
              meeting_id: 'note-a',
              note_title: 'Weekly team call',
            },
          ],
          created_at: '2026-11-20T10:00:04Z',
        },
      ],
      error: null,
    };
    const messages = await listAskMessages();
    expect(messages[1].sources[0]).toEqual({
      n: 2,
      segment_id: 'a2',
      start_ms: 65000,
      speaker_label: 'Priya',
      meeting_id: 'note-a',
      note_title: 'Weekly team call',
    });
  });

  test('a source with no note on it is still read, for a chat saved before Ask existed', async () => {
    mockMessages = {
      data: [
        {
          id: 'm2',
          role: 'assistant',
          content: 'Friday [3].',
          sources: [{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' }],
          created_at: '2026-11-18T10:00:00Z',
        },
      ],
      error: null,
    };
    const messages = await listAskMessages();
    expect(messages[0].sources[0].meeting_id).toBeUndefined();
  });

  test('a thread that will not load is reported, not shown as an empty chat', async () => {
    mockThread = { data: null, error: { message: 'down' } };
    await expect(listAskMessages()).rejects.toBeTruthy();
  });
});

describe('asking across every note', () => {
  test('the question goes to the chat function with scope all', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, answer: 'Friday [2].', sources: [], remaining: 17, message_id: 'q1' },
      error: null,
    });
    const result = await askAll('  What did I promise?  ');
    expect(mockInvoke).toHaveBeenCalledWith('chat', { body: { scope: 'all', question: 'What did I promise?' } });
    expect(result).toMatchObject({ ok: true, answer: 'Friday [2].', remaining: 17, messageId: 'q1' });
  });

  test('a retry sends the saved question back, not a new one', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, answer: 'Friday [2].', sources: [], remaining: 17, message_id: 'q1' }, error: null });
    await retryAsk('q1');
    expect(mockInvoke).toHaveBeenCalledWith('chat', { body: { scope: 'all', retry_message_id: 'q1' } });
  });

  test('running out of questions for the day is its own kind of problem', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'limit' }, response: { status: 402 } });
    await expect(askAll('anything')).rejects.toThrow(ChatLimitError);
    await expect(askAll('anything')).rejects.toThrow(LIMIT_MESSAGE);
  });

  test('a problem comes back with words a person can read, and a message to retry', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false, message_id: 'q2' }, error: null });
    await expect(askAll('anything')).resolves.toEqual({
      ok: false,
      message: SEND_PROBLEM_MESSAGE,
      messageId: 'q2',
      remaining: undefined,
    });
  });
});

describe('the questions offered before anybody types', () => {
  test('there are 3, and they are about more than one note', () => {
    expect(ASK_SUGGESTED).toHaveLength(3);
    expect(ASK_SUGGESTED.join(' ')).toContain('across my notes');
  });
});
