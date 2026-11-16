import {
  classifyFile,
  currentMonthStart,
  getUsage,
  isLimitReached,
  noteTitle,
  prepareAttempt,
  safeFileName,
} from '@/lib/notes';

/** A tiny stand-in for Supabase. `mockTables` holds what each table returns. */
let mockTables: Record<string, unknown>;
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: mockTables[table], error: null });
      return chain;
    },
  }),
}));

describe('monthly limit check', () => {
  test.each([
    [0, 5, false],
    [4, 5, false],
    [5, 5, true],
    [6, 5, true],
    [2, 3, false],
    [3, 3, true],
    [0, 0, true],
  ])('used %i of %i -> reached: %s', (used, limit, reached) => {
    expect(isLimitReached(used, limit)).toBe(reached);
  });

  test('the limit is read from the plans table, so changing 5 to 3 needs no code change', async () => {
    const account = (limit: number) => [{ account_id: 'acc-1', accounts: { plan_id: 'p', plans: { name: 'Free', meetings_per_month: limit } } }];

    mockTables = { account_members: account(5), usage: [{ meetings_used: 2 }] };
    expect(await getUsage()).toEqual({ accountId: 'acc-1', planName: 'Free', used: 2, limit: 5 });

    mockTables = { account_members: account(3), usage: [{ meetings_used: 2 }] };
    const usage = await getUsage();
    expect(usage.limit).toBe(3);
    expect(isLimitReached(usage.used, usage.limit)).toBe(false);

    mockTables = { account_members: account(3), usage: [{ meetings_used: 3 }] };
    const full = await getUsage();
    expect(isLimitReached(full.used, full.limit)).toBe(true);
  });

  test('no usage row yet means 0 used', async () => {
    mockTables = { account_members: [{ account_id: 'a', accounts: [{ plans: [{ name: 'Free', meetings_per_month: 5 }] }] }], usage: [] };
    expect((await getUsage()).used).toBe(0);
  });

  test('the month starts on the 1st (UTC)', () => {
    expect(currentMonthStart(new Date('2026-11-16T10:00:00Z'))).toBe('2026-11-01');
    expect(currentMonthStart(new Date('2027-01-31T23:59:59Z'))).toBe('2027-01-01');
  });
});

describe('file types', () => {
  test.each([
    ['talk.mp3', 'audio/mpeg', 'audio'],
    ['talk.m4a', 'audio/x-m4a', 'audio'],
    ['talk.wav', '', 'audio'],
    ['call.mp4', 'video/mp4', 'video'],
    ['call.MOV', 'video/quicktime', 'video'],
    ['clip.webm', 'video/webm', 'video'],
    ['voice.webm', 'audio/webm', 'audio'],
    ['notes.txt', 'text/plain', 'text'],
    ['notes.md', '', 'text'],
    ['photo.png', 'image/png', undefined],
    ['report.pdf', 'application/pdf', undefined],
    ['noextension', '', undefined],
  ])('%s (%s) is %s', (name, mime, kind) => {
    expect(classifyFile(name, mime)).toBe(kind);
  });
});

describe('making a note ready to send', () => {
  test('files go under account id / note id', () => {
    const a = prepareAttempt('acc-1', { kind: 'file', title: 't', name: 'My call (final).m4a', contentType: 'audio/mp4', body: new Blob(['x']) });
    expect(a.path.startsWith(`acc-1/${a.meetingId}/`)).toBe(true);
    expect(a.path.endsWith('My_call_final_.m4a')).toBe(true);
    expect(a.source).toBe('upload');
    expect(a.created).toBe(false);
  });

  test('pasted text and text files are source "text", so they never count as meetings', () => {
    const pasted = prepareAttempt('acc-1', { kind: 'text', title: '', text: 'hello' });
    expect(pasted.source).toBe('text');
    const file = prepareAttempt('acc-1', { kind: 'file', title: 'n', name: 'n.txt', contentType: 'text/plain', body: new Blob(['x']) });
    expect(file.source).toBe('text');
  });

  test('file names are made safe', () => {
    expect(safeFileName('../../etc/passwd')).not.toContain('/');
    expect(safeFileName('')).toBe('file');
  });

  test('a note with no title gets a plain title', () => {
    expect(noteTitle({ title: null, source: 'text' })).toBe('Pasted text');
    expect(noteTitle({ title: '  ', source: 'upload' })).toBe('Untitled note');
    expect(noteTitle({ title: 'Standup', source: 'upload' })).toBe('Standup');
  });
});
