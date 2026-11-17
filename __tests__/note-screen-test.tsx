import { act, fireEvent, render, screen } from '@testing-library/react-native';

import NoteDetailScreen from '@/app/(app)/note/[id]';
import { HELP } from '@/content/help';

const mockReplace = jest.fn();
const mockGetNote = jest.fn();
const mockList = jest.fn();
const mockStart = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'n1' }),
}));
jest.mock('@/lib/transcripts', () => ({
  ...jest.requireActual('@/lib/transcripts'),
  getNote: (...a: unknown[]) => mockGetNote(...a),
  listSegments: (...a: unknown[]) => mockList(...a),
  startTranscription: (...a: unknown[]) => mockStart(...a),
}));

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1', title: 'Team call', source: 'upload', status: 'Ready', error_message: null,
  created_at: '2026-11-17T10:00:00Z', spoken_language: 'en', duration_seconds: 120, ...over,
});
const lines = [
  { id: 'a', speaker_label: 'Speaker 1', start_ms: 500, end_ms: 3200, text: 'Hi, thanks for joining.' },
  { id: 'b', speaker_label: 'Speaker 2', start_ms: 65000, end_ms: 70000, text: 'Happy to be here.' },
];

beforeEach(() => {
  [mockReplace, mockGetNote, mockList, mockStart].forEach((m) => m.mockReset());
  mockList.mockResolvedValue([]);
});

describe('<NoteDetailScreen />', () => {
  test('loading state shows while the note is fetched', async () => {
    mockGetNote.mockReturnValue(new Promise(() => {}));
    await render(<NoteDetailScreen />);
    expect(screen.getByLabelText('Loading your note')).toBeTruthy();
  });

  test('Ready shows each line with speaker, time, and text, for 2 different speakers', async () => {
    mockGetNote.mockResolvedValue(note());
    mockList.mockResolvedValue(lines);
    await render(<NoteDetailScreen />);
    expect(await screen.findByText('Hi, thanks for joining.')).toBeTruthy();
    expect(screen.getByText('Speaker 1')).toBeTruthy();
    expect(screen.getByText('Speaker 2')).toBeTruthy();
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.getByText('Team call')).toBeTruthy();
    expect(screen.getByLabelText('Status: Ready')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Transcript' })).toBeTruthy();
  });

  test('empty state: Ready with no lines', async () => {
    mockGetNote.mockResolvedValue(note());
    await render(<NoteDetailScreen />);
    expect(await screen.findByText('No transcript')).toBeTruthy();
  });

  test('Transcribing says no transcript yet and updates by itself', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Transcribing' }));
    await render(<NoteDetailScreen />);
    expect(await screen.findByText('No transcript yet')).toBeTruthy();
    expect(screen.getByText(/updates by itself/)).toBeTruthy();
    expect(screen.queryByText('Start now')).toBeNull();
  });

  test('Queued offers Start now, which asks the server', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Queued' }));
    mockStart.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Start now' }));
    await act(async () => {});
    expect(mockStart).toHaveBeenCalledWith('n1');
  });

  test('error state: shows a message and Retry loads again', async () => {
    mockGetNote.mockRejectedValueOnce(new Error('down')).mockResolvedValue(note());
    mockList.mockResolvedValue(lines);
    await render(<NoteDetailScreen />);
    expect(await screen.findByText(/We could not load this note/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Speaker 1')).toBeTruthy();
  });

  test('FAILED: shows the saved message, says it was not counted, and Retry starts again', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Failed', error_message: 'We could not read this audio file.' }));
    mockStart.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);
    expect(await screen.findByText('We could not read this audio file.')).toBeTruthy();
    expect(screen.getByText(/did not use up one of your meetings/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {});
    expect(mockStart).toHaveBeenCalledWith('n1');
  });

  test('FAILED: if Retry cannot start, a message says so', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Failed', error_message: 'Oops' }));
    mockStart.mockRejectedValue(new Error('offline'));
    await render(<NoteDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/could not start it again/)).toBeTruthy();
  });

  test('a note that does not exist says so', async () => {
    mockGetNote.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);
    expect(await screen.findByText('Note not found')).toBeTruthy();
  });

  test('has a ? help button', async () => {
    mockGetNote.mockResolvedValue(note());
    await render(<NoteDetailScreen />);
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
  });
});

describe('help for the note screen', () => {
  const words = [...HELP.note.sentences, ...(HELP.note.lists ?? []).flatMap((l) => [l.heading, ...l.items])].join(' ');
  test('explains every status, speaker labels, wrong speakers, and Failed', () => {
    for (const s of ['Uploading', 'Queued', 'Transcribing', 'Summarizing', 'Ready', 'Failed']) expect(words).toContain(s);
    expect(words).toMatch(/speaker labels/i);
    expect(words).toMatch(/Why a speaker can be wrong/);
    expect(words).toMatch(/If your note says Failed/);
    expect(words).toMatch(/Retry/);
  });
  test('has screenshots', () => {
    expect(HELP.note.images.length).toBeGreaterThanOrEqual(2);
  });
});
