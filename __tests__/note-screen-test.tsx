import { act, fireEvent, render, screen } from '@testing-library/react-native';

import NoteDetailScreen from '@/app/(app)/(home)/note/[id]';
import { HELP } from '@/content/help';

const mockReplace = jest.fn();
const mockGetNote = jest.fn();
const mockList = jest.fn();
const mockStart = jest.fn();
const mockGetSummary = jest.fn();
const mockListItems = jest.fn();
const mockSetDone = jest.fn();
const mockStartSummary = jest.fn();
const mockCopy = jest.fn();

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
jest.mock('@/lib/summaries', () => ({
  ...jest.requireActual('@/lib/summaries'),
  getSummary: (...a: unknown[]) => mockGetSummary(...a),
  listActionItems: (...a: unknown[]) => mockListItems(...a),
  setActionItemDone: (...a: unknown[]) => mockSetDone(...a),
  startSummary: (...a: unknown[]) => mockStartSummary(...a),
}));
jest.mock('@/lib/clipboard', () => ({ copyText: (...a: unknown[]) => mockCopy(...a) }));

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  title: 'Team call',
  source: 'upload',
  status: 'Ready',
  error_message: null,
  created_at: '2026-11-17T10:00:00Z',
  spoken_language: 'en',
  duration_seconds: 120,
  ...over,
});

const lines = [
  { id: 'a', speaker_label: 'Speaker 1', start_ms: 500, end_ms: 3200, text: 'Hi, thanks for joining.' },
  { id: 'b', speaker_label: 'Speaker 2', start_ms: 65000, end_ms: 70000, text: 'Happy to be here.' },
];

const summary = {
  language: 'en',
  overview: 'The team agreed to ship the new sign up screen on Friday.',
  key_points: ['Sign up is slow on phones', 'Two people tested it'],
  decisions: ['Ship on Friday'],
  open_questions: ['Who writes the release note?'],
};

const items = [
  { id: 'i1', text: 'Send the test plan', owner_name: 'Priya', due_text: 'by Friday', start_ms: 65000, done: false },
  { id: 'i2', text: 'Book the review', owner_name: null, due_text: null, start_ms: null, done: true },
];

/** Opens the Transcript tab. The Summary tab is the one that shows first. */
async function openTranscript() {
  await fireEvent.press(await screen.findByRole('tab', { name: 'Transcript' }));
}

beforeEach(() => {
  [mockReplace, mockGetNote, mockList, mockStart, mockGetSummary, mockListItems, mockSetDone, mockStartSummary, mockCopy].forEach(
    (m) => m.mockReset(),
  );
  mockList.mockResolvedValue([]);
  mockGetSummary.mockResolvedValue(undefined);
  mockListItems.mockResolvedValue([]);
  mockSetDone.mockResolvedValue(undefined);
  mockCopy.mockResolvedValue(undefined);
});

describe('<NoteDetailScreen /> Summary tab', () => {
  test('loading state shows while the note is fetched', async () => {
    mockGetNote.mockReturnValue(new Promise(() => {}));
    await render(<NoteDetailScreen />);
    expect(screen.getByLabelText('Loading your note')).toBeTruthy();
  });

  test('both tabs are there, and Summary is the one showing', async () => {
    mockGetNote.mockResolvedValue(note());
    await render(<NoteDetailScreen />);
    const summaryTab = await screen.findByRole('tab', { name: 'Summary' });
    expect(summaryTab.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('tab', { name: 'Transcript' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  test('Ready shows the overview, key points, decisions, open questions, and action items', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    await render(<NoteDetailScreen />);

    expect(await screen.findByText(/agreed to ship the new sign up screen/)).toBeTruthy();
    expect(screen.getByText('Key points')).toBeTruthy();
    expect(screen.getByText('Sign up is slow on phones')).toBeTruthy();
    expect(screen.getByText('Decisions')).toBeTruthy();
    expect(screen.getByText('Ship on Friday')).toBeTruthy();
    expect(screen.getByText('Open questions')).toBeTruthy();
    expect(screen.getByText('Who writes the release note?')).toBeTruthy();
    expect(screen.getByText('Action items')).toBeTruthy();
    // Owner, what was said about the time, and the moment in the recording.
    expect(screen.getByText('Priya, by Friday, said at 1:05')).toBeTruthy();
    expect(screen.getByText('1 of 2 done')).toBeTruthy();
  });

  test('an empty list is left out instead of showing an empty heading', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue({ ...summary, decisions: [], open_questions: [] });
    mockListItems.mockResolvedValue([]);
    await render(<NoteDetailScreen />);
    expect(await screen.findByText('Key points')).toBeTruthy();
    expect(screen.queryByText('Decisions')).toBeNull();
    expect(screen.queryByText('Open questions')).toBeNull();
    expect(screen.getByText('Nobody agreed to do anything in this note.')).toBeTruthy();
  });

  test('a person can tick an action item off', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    await render(<NoteDetailScreen />);

    const box = await screen.findByRole('checkbox', { name: 'Send the test plan' });
    expect(box.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(box);
    await act(async () => {});
    expect(mockSetDone).toHaveBeenCalledWith('i1', true);
    expect(screen.getByRole('checkbox', { name: 'Send the test plan' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('2 of 2 done')).toBeTruthy();
  });

  test('a tick that cannot be saved goes back, with a message', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    mockSetDone.mockRejectedValue(new Error('offline'));
    await render(<NoteDetailScreen />);

    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Send the test plan' }));
    await act(async () => {});
    expect(await screen.findByText(/could not save that tick/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Send the test plan' }).props.accessibilityState).toMatchObject({ checked: false });
  });

  test('Copy puts the summary and the action items on the clipboard', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    await render(<NoteDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Copy' }));
    await act(async () => {});
    expect(await screen.findByText('Copied')).toBeTruthy();
    const text = mockCopy.mock.calls[0][0] as string;
    expect(text).toContain('Team call');
    expect(text).toContain('The team agreed to ship');
    expect(text).toContain('- [ ] Send the test plan');
    expect(text).toContain('- [x] Book the review');
  });

  test('Regenerate asks first, says it costs money, and only then asks the server', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    mockStartSummary.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Regenerate' }));
    expect(await screen.findByText('Write a new summary?')).toBeTruthy();
    expect(screen.getByText(/costs money/)).toBeTruthy();
    expect(mockStartSummary).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Yes, write a new one' }));
    await act(async () => {});
    expect(mockStartSummary).toHaveBeenCalledWith('n1');
  });

  test('Cancel on the Regenerate question changes nothing', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    await render(<NoteDetailScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Regenerate' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));
    await act(async () => {});
    expect(screen.queryByText('Write a new summary?')).toBeNull();
    expect(mockStartSummary).not.toHaveBeenCalled();
  });

  test('Ready with no summary offers to write one', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(undefined);
    mockStartSummary.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);

    expect(await screen.findByText('No summary yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Write summary' }));
    await act(async () => {});
    expect(mockStartSummary).toHaveBeenCalledWith('n1');
  });

  test('Summarizing says the summary is on its way and updates by itself', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Summarizing' }));
    await render(<NoteDetailScreen />);
    expect(await screen.findByText('No summary yet')).toBeTruthy();
    expect(screen.getByText(/writing the summary/)).toBeTruthy();
    expect(screen.getByText(/updates by itself/)).toBeTruthy();
  });

  test('FAILED: keeps the transcript, says it was not counted, and Retry summary starts again', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Failed', error_message: 'Gyan could not write a summary for this note.' }));
    mockList.mockResolvedValue(lines);
    mockStartSummary.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);

    expect(await screen.findByText('Gyan could not write a summary for this note.')).toBeTruthy();
    expect(screen.getByText(/did not use up one of your meetings/)).toBeTruthy();
    expect(screen.getByText(/transcript is still here/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry summary' }));
    await act(async () => {});
    expect(mockStartSummary).toHaveBeenCalledWith('n1');
    expect(mockStart).not.toHaveBeenCalled();
  });

  test('FAILED: if Retry summary cannot start, a message says so', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Failed', error_message: 'Gyan could not write a summary.' }));
    mockStartSummary.mockRejectedValue(new Error('offline'));
    await render(<NoteDetailScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Retry summary' }));
    expect(await screen.findByText(/could not start it again/)).toBeTruthy();
  });
});

describe('<NoteDetailScreen /> Transcript tab', () => {
  test('Ready shows each line with speaker, time, and text, for 2 different speakers', async () => {
    mockGetNote.mockResolvedValue(note());
    mockList.mockResolvedValue(lines);
    await render(<NoteDetailScreen />);
    await openTranscript();

    expect(await screen.findByText('Hi, thanks for joining.')).toBeTruthy();
    expect(screen.getByText('Speaker 1')).toBeTruthy();
    expect(screen.getByText('Speaker 2')).toBeTruthy();
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.getByText('Team call')).toBeTruthy();
    expect(screen.getByLabelText('Status: Ready')).toBeTruthy();
  });

  test('empty state: Ready with no lines', async () => {
    mockGetNote.mockResolvedValue(note());
    mockList.mockResolvedValue([]);
    await render(<NoteDetailScreen />);
    await openTranscript();
    expect(await screen.findByText('No transcript')).toBeTruthy();
  });

  test('Transcribing says no transcript yet and updates by itself', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Transcribing' }));
    await render(<NoteDetailScreen />);
    await openTranscript();
    expect(await screen.findByText('No transcript yet')).toBeTruthy();
    expect(screen.getByText(/updates by itself/)).toBeTruthy();
    expect(screen.queryByText('Start now')).toBeNull();
  });

  test('Queued offers Start now, which asks the server for the transcript', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Queued' }));
    mockStart.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);
    await openTranscript();
    await fireEvent.press(await screen.findByRole('button', { name: 'Start now' }));
    await act(async () => {});
    expect(mockStart).toHaveBeenCalledWith('n1');
  });

  test('FAILED with no transcript offers Retry, which makes the transcript again', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Failed', error_message: 'We could not read this audio file.' }));
    mockList.mockResolvedValue([]);
    mockStart.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);
    await openTranscript();

    expect(await screen.findByText('We could not read this audio file.')).toBeTruthy();
    expect(screen.getByText(/did not use up one of your meetings/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {});
    expect(mockStart).toHaveBeenCalledWith('n1');
  });

  test('FAILED with a transcript keeps showing it and points to the Summary tab', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Failed', error_message: 'Gyan could not write a summary.' }));
    mockList.mockResolvedValue(lines);
    await render(<NoteDetailScreen />);
    await openTranscript();

    expect(await screen.findByText('Hi, thanks for joining.')).toBeTruthy();
    expect(screen.getByText(/Open the Summary tab to try the summary again/)).toBeTruthy();
    // Retrying the transcript here would pay for the speech service twice, so it is not offered.
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('<NoteDetailScreen /> the page itself', () => {
  test('error state: shows a message and Retry loads again', async () => {
    mockGetNote.mockRejectedValueOnce(new Error('down')).mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    await render(<NoteDetailScreen />);
    expect(await screen.findByText(/We could not load this note/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/agreed to ship the new sign up screen/)).toBeTruthy();
  });

  test('a note that does not exist says so', async () => {
    mockGetNote.mockResolvedValue(undefined);
    await render(<NoteDetailScreen />);
    expect(await screen.findByText('Note not found')).toBeTruthy();
  });

  test('has a ? help button', async () => {
    mockGetNote.mockResolvedValue(note());
    await render(<NoteDetailScreen />);
    expect(await screen.findByRole('button', { name: 'Help' })).toBeTruthy();
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

  test('explains the Summary tab, ticking action items, and Regenerate', () => {
    expect(words).toMatch(/Summary tab/);
    expect(words).toMatch(/action item/i);
    expect(words).toMatch(/Regenerate/);
    expect(words).toMatch(/tick/i);
  });

  test('has screenshots', () => {
    expect(HELP.note.images.length).toBeGreaterThanOrEqual(2);
  });
});
