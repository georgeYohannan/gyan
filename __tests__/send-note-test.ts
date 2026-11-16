import { NoteError, prepareAttempt, sendAttempt } from '@/lib/notes';

const mockRpc = jest.fn();
const mockUpload = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }) }));
jest.mock('@/lib/upload', () => ({ uploadFile: (...a: unknown[]) => mockUpload(...a) }));

const make = () => prepareAttempt('acc-1', { kind: 'file', title: 'Call', name: 'call.m4a', contentType: 'audio/mp4', body: new Blob(['x']) });
const calls = () => mockRpc.mock.calls.map((c) => c[0]);

describe('sending a note', () => {
  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({ error: null });
    mockUpload.mockReset().mockResolvedValue(undefined);
  });

  test('makes the note (Uploading), sends the file, then sets Queued', async () => {
    const a = make();
    await sendAttempt(a);
    expect(calls()).toEqual(['create_note', 'mark_note_queued']);
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_account_id: 'acc-1', p_source: 'upload', p_file_path: a.path });
    expect(mockUpload).toHaveBeenCalledWith(a.path, a.body, 'audio/mp4', undefined);
  });

  test('when the upload fails, the note is marked Failed with a plain message', async () => {
    mockUpload.mockRejectedValue(new Error('network'));
    await expect(sendAttempt(make())).rejects.toMatchObject({ code: 'network' });
    expect(calls()).toEqual(['create_note', 'mark_note_failed']);
    expect(mockRpc.mock.calls[1][1].p_message).toMatch(/did not finish/);
  });

  test('Retry restarts the same note instead of making a second one', async () => {
    const a = make();
    mockUpload.mockRejectedValueOnce(new Error('network'));
    await expect(sendAttempt(a)).rejects.toBeInstanceOf(NoteError);
    await sendAttempt(a);
    expect(calls()).toEqual(['create_note', 'mark_note_failed', 'restart_note_upload', 'mark_note_queued']);
  });

  test('the server refusing because of the limit becomes limit_reached and no file is sent', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'limit_reached' } });
    await expect(sendAttempt(make())).rejects.toMatchObject({ code: 'limit_reached' });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test('a file that is too big for storage becomes too_big', async () => {
    mockUpload.mockRejectedValue(new Error('too_big'));
    await expect(sendAttempt(make())).rejects.toMatchObject({ code: 'too_big' });
  });
});
