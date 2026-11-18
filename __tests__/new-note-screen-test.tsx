import { act, fireEvent, render, screen } from '@testing-library/react-native';

import NewNoteScreen from '@/app/(app)/(home)/new-note';
import { HELP } from '@/content/help';
import { NoteError } from '@/lib/notes';

const mockReplace = jest.fn();
const mockGetUsage = jest.fn();
const mockSend = jest.fn();
const mockPick = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
jest.mock('@/lib/audio-extract', () => ({ canExtractAudio: false, extractAudio: jest.fn() }));
jest.mock('@/lib/notes', () => ({
  ...jest.requireActual('@/lib/notes'),
  getUsage: () => mockGetUsage(),
  sendAttempt: (...a: unknown[]) => mockSend(...a),
}));

const usage = (used: number, limit: number) => ({ accountId: 'acc-1', planName: 'Free', used, limit });
const picked = (name: string, mimeType: string, size = 1000) => ({ canceled: false, assets: [{ name, mimeType, size, uri: `file:///${name}` }] });

describe('<NewNoteScreen />', () => {
  beforeEach(() => {
    [mockReplace, mockGetUsage, mockSend, mockPick].forEach((m) => m.mockReset());
    mockGetUsage.mockResolvedValue(usage(1, 5));
  });

  test('shows the 4 choices. Record and Meeting link are off with a Coming soon label', async () => {
    await render(<NewNoteScreen />);
    expect(await screen.findByText('Meetings used this month: 1 of 5')).toBeTruthy();
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Record, Coming soon' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Meeting link, Coming soon' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Upload' }).props.accessibilityState.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Paste text' }).props.accessibilityState.disabled).toBe(false);
  });

  test('at the limit, Upload is blocked with a friendly message but Paste text still works', async () => {
    mockGetUsage.mockResolvedValue(usage(3, 3));
    await render(<NewNoteScreen />);
    expect(await screen.findByText(/You have used all your meetings for this month/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload, Limit reached' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Paste text' }).props.accessibilityState.disabled).toBe(false);
  });

  test('one under the limit is still allowed', async () => {
    mockGetUsage.mockResolvedValue(usage(2, 3));
    await render(<NewNoteScreen />);
    await screen.findByText('Meetings used this month: 2 of 3');
    expect(screen.getByRole('button', { name: 'Upload' }).props.accessibilityState.disabled).toBe(false);
  });

  test('pasting text sends a text note and goes Home', async () => {
    mockSend.mockResolvedValue(undefined);
    await render(<NewNoteScreen />);
    await screen.findByText(/Meetings used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Paste text' }));
    await fireEvent.changeText(screen.getByLabelText('Title (optional)'), 'Standup');
    await fireEvent.changeText(screen.getByLabelText('Your text'), 'We shipped it.');
    await fireEvent.press(screen.getByText('Add note'));
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({ source: 'text', title: 'Standup', accountId: 'acc-1' });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('empty text shows a plain message and sends nothing', async () => {
    await render(<NewNoteScreen />);
    await screen.findByText(/Meetings used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Paste text' }));
    await fireEvent.press(screen.getByText('Add note'));
    expect(screen.getByText('Paste or type some text first.')).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('uploading shows progress, then goes Home', async () => {
    let finish: () => void = () => {};
    mockSend.mockImplementation((_a: unknown, onProgress: (f: number) => void) => {
      onProgress(0.4);
      return new Promise<void>((r) => (finish = r));
    });
    mockPick.mockResolvedValue(picked('call.m4a', 'audio/mp4'));
    await render(<NewNoteScreen />);
    await screen.findByText(/Meetings used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Upload' }));
    // Not awaited: the press only finishes when the upload does.
    void fireEvent.press(screen.getByText('Choose a file'));
    expect(await screen.findByText('Uploading…')).toBeTruthy();
    expect(screen.getByText(/40% done/)).toBeTruthy();
    expect(mockSend.mock.calls[0][0]).toMatchObject({ source: 'upload', title: 'call' });
    await act(async () => finish());
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('a failed upload shows a plain message and Retry sends the same note again', async () => {
    mockSend.mockRejectedValueOnce(new NoteError('network')).mockResolvedValueOnce(undefined);
    mockPick.mockResolvedValue(picked('call.m4a', 'audio/mp4'));
    await render(<NewNoteScreen />);
    await screen.findByText(/Meetings used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Upload' }));
    await fireEvent.press(screen.getByText('Choose a file'));
    expect(await screen.findByText('The upload did not finish. Check your internet and try again.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0]).toBe(mockSend.mock.calls[0][0]);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('the server saying the limit is reached shows the limit message', async () => {
    mockSend.mockRejectedValueOnce(new NoteError('limit_reached'));
    mockPick.mockResolvedValue(picked('call.m4a', 'audio/mp4'));
    await render(<NewNoteScreen />);
    await screen.findByText(/Meetings used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Upload' }));
    await fireEvent.press(screen.getByText('Choose a file'));
    expect(await screen.findByText(/You have used all your meetings for this month/)).toBeTruthy();
  });

  test('a wrong file type is refused with a plain message and nothing is sent', async () => {
    mockPick.mockResolvedValue(picked('photo.png', 'image/png'));
    await render(<NewNoteScreen />);
    await screen.findByText(/Meetings used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Upload' }));
    await fireEvent.press(screen.getByText('Choose a file'));
    expect(await screen.findByText(/cannot use that kind of file/)).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('a file over 50 MB is refused with a plain message', async () => {
    mockPick.mockResolvedValue(picked('big.m4a', 'audio/mp4', 51 * 1024 * 1024));
    await render(<NewNoteScreen />);
    await screen.findByText(/Meetings used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Upload' }));
    await fireEvent.press(screen.getByText('Choose a file'));
    expect(await screen.findByText(/bigger than 50 MB/)).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('a big video on a phone (no audio extraction yet) is refused', async () => {
    mockPick.mockResolvedValue(picked('meeting.mp4', 'video/mp4', 80 * 1024 * 1024));
    await render(<NewNoteScreen />);
    await screen.findByText(/Meetings used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Upload' }));
    await fireEvent.press(screen.getByText('Choose a file'));
    expect(await screen.findByText(/bigger than 50 MB/)).toBeTruthy();
  });

  test('has a ? button that opens the New note help with file types and sizes', async () => {
    await render(<NewNoteScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByLabelText(`Help: ${HELP.newNote.title}`)).toBeTruthy();
    expect(await screen.findByText('Files that work')).toBeTruthy();
    expect(screen.getByText('\u2022 Up to 50 MB.')).toBeTruthy();
  });
});
