/**
 * Reading the chat about one note, and asking a question.
 * The real server and the real AI are never called here.
 */
import {
  askChat,
  ChatLimitError,
  LIMIT_MESSAGE,
  listChatMessages,
  retryChat,
  SEND_PROBLEM_MESSAGE,
  SUGGESTED,
} from '@/lib/chat';

let mockThread: { data: unknown; error: unknown };
let mockMessages: { data: unknown; error: unknown };
const mockInvoke = jest.fn();
const mockEq = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (...a: unknown[]) => {
        mockEq(table, ...a);
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
  mockEq.mockReset();
  mockThread = { data: { id: 't1' }, error: null };
  mockMessages = { data: [], error: null };
});

describe('reading the chat about a note', () => {
  test('the conversation comes back oldest first, with its passage numbers', async () => {
    mockMessages = {
      data: [
        { id: 'm1', role: 'user', content: 'What were the decisions?', sources: null, created_at: '2026-11-18T10:00:00Z' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Ship on Friday [3].',
          sources: [{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' }],
          created_at: '2026-11-18T10:00:05Z',
        },
      ],
      error: null,
    };

    const messages = await listChatMessages('n1');

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'What were the decisions?', sources: [] });
    expect(messages[1].sources).toEqual([{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' }]);
  });

  test('a note nobody has asked about yet has an empty chat', async () => {
    mockThread = { data: null, error: null };
    expect(await listChatMessages('n1')).toEqual([]);
  });

  test('it asks only for THIS note, and only for the thread it found', async () => {
    await listChatMessages('n1');
    expect(mockEq).toHaveBeenCalledWith('chat_threads', 'meeting_id', 'n1');
    expect(mockEq).toHaveBeenCalledWith('chat_messages', 'thread_id', 't1');
  });

  test('a saved source that makes no sense is left out instead of breaking the screen', async () => {
    mockMessages = {
      data: [{ id: 'm2', role: 'assistant', content: 'Yes [1].', sources: ['nonsense', { n: 1 }, { n: 2, segment_id: 's2' }], created_at: 'x' }],
      error: null,
    };
    const messages = await listChatMessages('n1');
    expect(messages[0].sources).toEqual([{ n: 2, segment_id: 's2', start_ms: 0, speaker_label: null }]);
  });

  test('a problem is passed on so the panel can show its error state', async () => {
    mockThread = { data: null, error: { message: 'down' } };
    await expect(listChatMessages('n1')).rejects.toBeTruthy();
  });
});

describe('asking a question', () => {
  test('the question and the note are sent to the chat server function', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, answer: 'Ship on Friday [3].', sources: [], remaining: 19, message_id: 'q1' }, error: null });

    const result = await askChat('n1', '  What were the decisions?  ');

    expect(mockInvoke).toHaveBeenCalledWith('chat', { body: { meeting_id: 'n1', question: 'What were the decisions?' } });
    expect(result).toEqual({ ok: true, answer: 'Ship on Friday [3].', sources: [], remaining: 19, messageId: 'q1' });
  });

  test('the answer keeps the lines each passage number means', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        ok: true,
        answer: 'Ship on Friday [3].',
        sources: [{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' }],
        remaining: 5,
        message_id: 'q1',
      },
      error: null,
    });
    const result = await askChat('n1', 'What were the decisions?');
    expect(result.ok && result.sources).toEqual([{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' }]);
  });

  test('a plain-words problem comes back with the question id, so Retry can use it', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false, message: 'The answering service is busy.', message_id: 'q1', remaining: 4 }, error: null });

    const result = await askChat('n1', 'What were the decisions?');

    expect(result).toEqual({ ok: false, message: 'The answering service is busy.', messageId: 'q1', remaining: 4 });
  });

  test('AT THE LIMIT: the day being used up is its own thing, with a friendly message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'no' }, response: { status: 402 } });
    await expect(askChat('n1', 'Anything?')).rejects.toBeInstanceOf(ChatLimitError);
    await expect(askChat('n1', 'Anything?')).rejects.toThrow(LIMIT_MESSAGE);
  });

  test('any other problem from the server is thrown so the panel shows Retry', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'down' }, response: { status: 500 } });
    await expect(askChat('n1', 'Anything?')).rejects.toThrow('down');
  });

  test('a reply with nothing useful in it still gives a message a person can read', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    expect(await askChat('n1', 'Anything?')).toEqual({ ok: false, message: SEND_PROBLEM_MESSAGE, messageId: undefined, remaining: undefined });
  });
});

describe('trying a question again', () => {
  test('it sends the id of the question that is ALREADY saved, never a new one', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, answer: 'Ship on Friday [3].', sources: [], remaining: 19, message_id: 'q1' }, error: null });

    await retryChat('q1');

    expect(mockInvoke).toHaveBeenCalledWith('chat', { body: { retry_message_id: 'q1' } });
    // No new question is sent, so a retry can never cost a second question out of the day.
    expect(mockInvoke.mock.calls[0][1].body.question).toBeUndefined();
  });
});

describe('the suggested questions', () => {
  test('there are 3 of them, in short plain words', () => {
    expect(SUGGESTED).toHaveLength(3);
    expect(SUGGESTED).toContain('What were the decisions?');
    expect(SUGGESTED).toContain('What did I promise to do?');
    for (const s of SUGGESTED) expect(s.split(' ').length).toBeLessThanOrEqual(7);
  });
});
