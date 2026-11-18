import { getSummary, listActionItems, setActionItemDone, startSummary, summaryToPlainText } from '@/lib/summaries';

let mockResult: { data: unknown; error: unknown };
const mockInvoke = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) chain[m] = () => chain;
      chain.update = (...a: unknown[]) => {
        mockUpdate(...a);
        return chain;
      };
      chain.maybeSingle = async () => mockResult;
      chain.then = (resolve: (v: unknown) => void) => resolve(mockResult);
      return chain;
    },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  }),
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockUpdate.mockReset();
});

describe('reading a summary', () => {
  test('lists that are saved as JSON come back as words', async () => {
    mockResult = {
      data: { language: 'en', overview: 'We shipped it.', key_points: ['One', '  Two  '], decisions: null, open_questions: ['Who?'] },
      error: null,
    };
    const s = await getSummary('n1');
    expect(s?.key_points).toEqual(['One', 'Two']);
    expect(s?.decisions).toEqual([]);
    expect(s?.open_questions).toEqual(['Who?']);
  });

  test('a note with no summary gives nothing back', async () => {
    mockResult = { data: null, error: null };
    expect(await getSummary('n1')).toBeUndefined();
  });

  test('a problem is passed on so the screen can show its error state', async () => {
    mockResult = { data: null, error: { message: 'down' } };
    await expect(getSummary('n1')).rejects.toBeTruthy();
  });

  test('action items come back in time order', async () => {
    const items = [{ id: 'i1', text: 'Do it', owner_name: null, due_text: null, start_ms: 0, done: false }];
    mockResult = { data: items, error: null };
    expect(await listActionItems('n1')).toEqual(items);
  });
});

describe('ticking an action item', () => {
  test('only the done column is changed', async () => {
    mockResult = { data: null, error: null };
    await setActionItemDone('i1', true);
    expect(mockUpdate).toHaveBeenCalledWith({ done: true });
  });

  test('a problem is passed on', async () => {
    mockResult = { data: null, error: { message: 'no' } };
    await expect(setActionItemDone('i1', true)).rejects.toBeTruthy();
  });
});

describe('asking the server for a summary', () => {
  test('it asks the summarize function for that note', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    await startSummary('n1');
    expect(mockInvoke).toHaveBeenCalledWith('summarize', { body: { meeting_id: 'n1' } });
  });

  test('one already being written (409) is fine, not an error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'already_started' }, response: { status: 409 } });
    await expect(startSummary('n1')).resolves.toBeUndefined();
  });

  test('any other problem is an error, so the screen can say so', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'offline' }, response: { status: 500 } });
    await expect(startSummary('n1')).rejects.toThrow('offline');
  });
});

describe('the Copy text', () => {
  const summary = {
    language: 'en',
    overview: 'We agreed to ship on Friday.',
    key_points: ['Sign up is slow'],
    decisions: ['Ship on Friday'],
    open_questions: [],
  };
  const items = [
    { id: 'i1', text: 'Send the test plan', owner_name: 'Priya', due_text: 'Friday', start_ms: 65000, done: false },
    { id: 'i2', text: 'Book the review', owner_name: null, due_text: null, start_ms: null, done: true },
  ];

  test('it reads like plain notes, with ticked items marked', () => {
    const text = summaryToPlainText('Team call', summary, items);
    expect(text).toContain('Team call');
    expect(text).toContain('We agreed to ship on Friday.');
    expect(text).toContain('Key points\n- Sign up is slow');
    expect(text).toContain('Decisions\n- Ship on Friday');
    expect(text).toContain('- [ ] Send the test plan (Priya, Friday, at 1:05)');
    expect(text).toContain('- [x] Book the review');
  });

  test('empty parts are left out instead of showing an empty heading', () => {
    const text = summaryToPlainText('Team call', summary, []);
    expect(text).not.toContain('Open questions');
    expect(text).not.toContain('Action items');
  });
});
