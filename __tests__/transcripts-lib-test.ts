import { formatTime, getNote, listSegments, startTranscription } from '@/lib/transcripts';

let mockResult: { data: unknown; error: unknown };
const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) chain[m] = () => chain;
      chain.maybeSingle = async () => mockResult;
      chain.then = (resolve: (v: unknown) => void) => resolve(mockResult);
      return chain;
    },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  }),
}));

describe('formatTime', () => {
  test.each([
    [0, '0:00'],
    [5000, '0:05'],
    [65000, '1:05'],
    [600000, '10:00'],
    [3725000, '1:02:05'],
    [-5, '0:00'],
  ])('%i ms -> %s', (ms, text) => expect(formatTime(ms)).toBe(text));
});

describe('reading a note', () => {
  test('turns the saved status into the label', async () => {
    mockResult = { data: { id: 'n1', status: 'transcribing', title: 'Call' }, error: null };
    expect((await getNote('n1'))?.status).toBe('Transcribing');
  });
  test('a note that is not found is undefined', async () => {
    mockResult = { data: null, error: null };
    expect(await getNote('nope')).toBeUndefined();
  });
  test('an error is passed on so the screen can show its error state', async () => {
    mockResult = { data: null, error: new Error('down') };
    await expect(getNote('n1')).rejects.toThrow('down');
    await expect(listSegments('n1')).rejects.toThrow('down');
  });
  test('no lines gives an empty list', async () => {
    mockResult = { data: null, error: null };
    expect(await listSegments('n1')).toEqual([]);
  });
});

describe('startTranscription', () => {
  beforeEach(() => mockInvoke.mockReset());
  test('works when the server accepts', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    await expect(startTranscription('n1')).resolves.toBeUndefined();
  });
  test('"already started" (409) is fine', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'x' }, response: { status: 409 } });
    await expect(startTranscription('n1')).resolves.toBeUndefined();
  });
  test('other errors are thrown', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'offline' }, response: { status: 500 } });
    await expect(startTranscription('n1')).rejects.toThrow('offline');
  });
});
