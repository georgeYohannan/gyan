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
const mockChatList = jest.fn();
const mockAsk = jest.fn();
const mockPassages = jest.fn();
const mockSetLanguage = jest.fn();
const mockSaved = jest.fn();
const mockTranslate = jest.fn();
const mockPreviewRecap = jest.fn();
const mockPush = jest.fn();
/** The preferred language the fake profile reports. Tests change it. */
let mockMyLanguage = 'en';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
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
jest.mock('@/lib/passages', () => ({
  ...jest.requireActual('@/lib/passages'),
  listPassages: (...a: unknown[]) => mockPassages(...a),
}));
jest.mock('@/lib/chat', () => ({
  ...jest.requireActual('@/lib/chat'),
  listChatMessages: (...a: unknown[]) => mockChatList(...a),
  askChat: (...a: unknown[]) => mockAsk(...a),
  retryChat: jest.fn(),
  // The Chat tab reaches the server through a transport now, not by calling these three
  // directly -- that is what lets the Ask destination reuse the same chat. Mocking the
  // three on their own would no longer be seen, because `noteChat` calls them from inside
  // the real module, so the transport itself is the seam and it is replaced here.
  noteChat: (id: string) => ({
    list: () => mockChatList(id),
    ask: (question: string) => mockAsk(id, question),
    retry: () => Promise.resolve({ ok: false as const, message: 'not used in these tests' }),
  }),
}));
jest.mock('@/lib/profile', () => ({
  useProfile: () => ({
    languageCode: mockMyLanguage,
    language: jest.requireActual('@/constants/languages').languageFor(mockMyLanguage),
    isLoading: false,
    setLanguage: (...a: unknown[]) => mockSetLanguage(...a),
  }),
}));
jest.mock('@/lib/recaps', () => ({
  ...jest.requireActual('@/lib/recaps'),
  previewRecap: (...a: unknown[]) => mockPreviewRecap(...a),
  sendRecap: jest.fn(),
}));
jest.mock('@/lib/translations', () => ({
  ...jest.requireActual('@/lib/translations'),
  getSavedTranslation: (...a: unknown[]) => mockSaved(...a),
  translate: (...a: unknown[]) => mockTranslate(...a),
}));

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  title: 'Team call',
  source: 'upload',
  status: 'Ready',
  error_message: null,
  created_at: '2026-11-17T10:00:00Z',
  spoken_language: 'en',
  duration_seconds: 120,
  file_path: 'acc/n1/call.mp3',
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
  mockChatList.mockReset().mockResolvedValue([]);
  mockAsk.mockReset();
  mockPassages.mockReset().mockResolvedValue([]);
  mockMyLanguage = 'en';
  mockSetLanguage.mockReset().mockResolvedValue({});
  mockSaved.mockReset().mockResolvedValue(undefined);
  mockTranslate.mockReset();
  mockPush.mockReset();
  mockPreviewRecap.mockReset().mockResolvedValue({
    ok: true,
    recipients: [
      {
        userId: '11111111-1111-1111-1111-111111111111',
        email: 'owner@example.test',
        name: 'Sam Carter',
        role: 'owner',
        language: 'en',
        defaultOn: true,
        isYou: true,
      },
    ],
    settings: { toOwner: true, toMembers: false, autoSend: false },
    canSend: true,
  });
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

  test('a summary that gets stuck offers to start it again, and only after a wait', async () => {
    jest.useFakeTimers();
    try {
      mockGetNote.mockResolvedValue(note({ status: 'Summarizing' }));
      mockStartSummary.mockResolvedValue(undefined);
      await render(<NoteDetailScreen />);
      expect(await screen.findByText('No summary yet')).toBeTruthy();
      // Straight away there is no button: the summary is probably just being written.
      expect(screen.queryByText('Start summary again')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(46_000);
      });
      expect(screen.getByText(/taking longer than usual/)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Start summary again' }));
      await act(async () => {});
      expect(mockStartSummary).toHaveBeenCalledWith('n1');
    } finally {
      jest.useRealTimers();
    }
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

/**
 * Opens the "More" menu, which is where Language, Translate and Send recap live now.
 *
 * They used to be three buttons on the line above the note, beside the tabs. The line had
 * grown to six things and pushed the page sideways on a phone, so everything that is not
 * reading the note moved behind one button. The actions themselves are unchanged -- same
 * names, same labels, same behaviour -- so these tests gained one press each and nothing more.
 */
async function openMore() {
  await act(async () => {
    fireEvent.press(await screen.findByTestId('note-more'));
  });
}

describe('<NoteDetailScreen /> the Chat tab', () => {
  const CHAT = [
    { id: 'c1', role: 'user' as const, content: 'What were the decisions?', sources: [], created_at: 'x' },
    {
      id: 'c2',
      role: 'assistant' as const,
      content: 'We are happy to be here [2].',
      // Passage 2 is the second transcript line, which is the one with id 'b'.
      sources: [{ n: 2, segment_id: 'b', start_ms: 65000, speaker_label: 'Speaker 2' }],
      created_at: 'y',
    },
  ];

  /** The Chat tab, which is how anybody reaches the chat now. */
  const openChat = async () => {
    await act(async () => {
      fireEvent.press(await screen.findByRole('tab', { name: 'Chat' }));
    });
  };

  test('a Ready note with words offers a Chat tab', async () => {
    mockGetNote.mockResolvedValue(note());
    mockList.mockResolvedValue(lines);
    await render(<NoteDetailScreen />);

    expect(await screen.findByRole('tab', { name: 'Chat' })).toBeTruthy();
  });

  test('a note with no words yet says why there is nothing to ask about', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Transcribing' }));
    mockList.mockResolvedValue([]);
    await render(<NoteDetailScreen />);
    await openChat();

    // The tab is NOT switched off. A tab you cannot press says nothing about why; a tab that
    // explains itself does. It also means the chat is never somewhere people cannot look.
    expect(screen.getByText('You can ask questions once this note has its words.')).toBeTruthy();
    expect(mockChatList).not.toHaveBeenCalled();
  });

  test('opening the Chat tab reads the conversation from the database', async () => {
    mockGetNote.mockResolvedValue(note());
    mockList.mockResolvedValue(lines);
    await render(<NoteDetailScreen />);
    await openChat();

    expect(mockChatList).toHaveBeenCalledWith('n1');
  });

  test('the ? at the top follows the tab, so Chat opens the chat help', async () => {
    mockGetNote.mockResolvedValue(note());
    mockList.mockResolvedValue(lines);
    await render(<NoteDetailScreen />);
    await openChat();

    await act(async () => {
      fireEvent.press(screen.getByTestId('help-button-noteChat'));
    });
    expect(screen.getByRole('header', { name: HELP.noteChat.title })).toBeTruthy();
  });

  test('tapping a passage number opens the Transcript tab and lights up that line', async () => {
    mockGetNote.mockResolvedValue(note());
    mockList.mockResolvedValue(lines);
    mockChatList.mockResolvedValue(CHAT);
    await render(<NoteDetailScreen />);

    await openChat();
    await act(async () => {
      fireEvent.press(await screen.findByRole('link', { name: 'Go to the line at 1:05' }));
    });

    // The Transcript tab is now the one showing.
    expect(screen.getByRole('tab', { name: 'Transcript' }).props.accessibilityState).toMatchObject({ selected: true });
    // And the line the number pointed at is marked as highlighted.
    expect(screen.getByLabelText('Speaker 2, 1:05. Happy to be here.. Highlighted')).toBeTruthy();
    // The other line is not.
    expect(screen.getByLabelText('Speaker 1, 0:00. Hi, thanks for joining.')).toBeTruthy();
  });

  test('changing tab by hand clears the highlight', async () => {
    mockGetNote.mockResolvedValue(note());
    mockList.mockResolvedValue(lines);
    mockChatList.mockResolvedValue(CHAT);
    await render(<NoteDetailScreen />);

    await openChat();
    await act(async () => {
      fireEvent.press(await screen.findByRole('link', { name: 'Go to the line at 1:05' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('tab', { name: 'Summary' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('tab', { name: 'Transcript' }));
    });

    expect(screen.queryByLabelText(/Highlighted/)).toBeNull();
  });
});

describe('help for the chat', () => {
  const entry = HELP.noteChat;
  const words = [...entry.sentences, ...(entry.lists ?? []).flatMap((l) => [l.heading, ...l.items])].join(' ');

  test('it exists and is written in short plain words', () => {
    expect(entry.title.length).toBeGreaterThan(0);
    // No jargon a 15 year old would have to look up.
    expect(words).not.toMatch(/token|prompt|API|model|embedding|passage number/i);
  });

  test('it explains what you can ask, the little numbers, and the daily limit', () => {
    expect(words).toMatch(/ask/i);
    expect(words).toMatch(/little numbers|small numbers/i);
    expect(words).toMatch(/could not find/i);
    expect(words).toMatch(/day/i);
  });

  test('it has screenshots', () => {
    expect(entry.images.length).toBeGreaterThanOrEqual(2);
    for (const img of entry.images) expect(img.alt.length).toBeGreaterThan(0);
  });
});

describe('<NoteDetailScreen /> a pasted-text note', () => {
  const textNote = () => note({ source: 'text', title: 'gyan development', file_path: 'acc/n1/notes.txt' });

  const PARAGRAPHS = [
    { id: 'p1', text: 'The module ingests financial documents for a family-law matter.' },
    { id: 'p2', text: 'Audience: forensic accountants and family-law attorneys.' },
    { id: 'p3', text: 'Frontend: React 18, TypeScript and Vite.' },
  ];

  test('its words show in the Transcript tab as numbered paragraphs', async () => {
    mockGetNote.mockResolvedValue(textNote());
    mockPassages.mockResolvedValue(PARAGRAPHS);
    await render(<NoteDetailScreen />);
    await openTranscript();

    expect(screen.getByText('Paragraph 1')).toBeTruthy();
    expect(screen.getByText('Paragraph 2')).toBeTruthy();
    expect(screen.getByText('Audience: forensic accountants and family-law attorneys.')).toBeTruthy();
    // Nobody spoke these words, so no speaker and no time is invented for them.
    expect(screen.queryByText('Speaker 1')).toBeNull();
  });

  test('it reads the words from the note file, not from transcript lines', async () => {
    mockGetNote.mockResolvedValue(textNote());
    mockPassages.mockResolvedValue(PARAGRAPHS);
    await render(<NoteDetailScreen />);
    await screen.findByRole('tab', { name: 'Transcript' });

    expect(mockPassages).toHaveBeenCalledWith('acc/n1/notes.txt');
    expect(mockList).not.toHaveBeenCalled();
  });

  test('THE BUG THIS FIXES: a pasted-text note CAN be asked about', async () => {
    mockGetNote.mockResolvedValue(textNote());
    mockPassages.mockResolvedValue(PARAGRAPHS);
    await render(<NoteDetailScreen />);

    await act(async () => {
      fireEvent.press(await screen.findByRole('tab', { name: 'Chat' }));
    });
    expect(screen.getByLabelText('Your question')).toBeTruthy();
    expect(screen.queryByText('You can ask questions once this note has its words.')).toBeNull();
  });

  test('tapping a number jumps to that paragraph and lights it up', async () => {
    mockGetNote.mockResolvedValue(textNote());
    mockPassages.mockResolvedValue(PARAGRAPHS);
    mockChatList.mockResolvedValue([
      { id: 'c1', role: 'user', content: 'Who is it for?', sources: [], created_at: 'x' },
      {
        id: 'c2',
        role: 'assistant',
        content: 'Forensic accountants and family-law attorneys [2].',
        sources: [{ n: 2, segment_id: 'p2', start_ms: 0, speaker_label: null }],
        created_at: 'y',
      },
    ]);
    await render(<NoteDetailScreen />);

    await act(async () => {
      fireEvent.press(await screen.findByRole('tab', { name: 'Chat' }));
    });
    await act(async () => {
      fireEvent.press(await screen.findByRole('link', { name: 'Go to the line at 0:00' }));
    });

    expect(screen.getByRole('tab', { name: 'Transcript' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText(/Paragraph 2\..*Highlighted/)).toBeTruthy();
  });

  test('a text note with nothing in it says so, and cannot be asked about', async () => {
    mockGetNote.mockResolvedValue(textNote());
    mockPassages.mockResolvedValue([]);
    await render(<NoteDetailScreen />);

    await act(async () => {
      fireEvent.press(await screen.findByRole('tab', { name: 'Chat' }));
    });
    expect(screen.getByText('This note has no words in it, so there is nothing to ask about.')).toBeTruthy();
    expect(screen.queryByLabelText('Your question')).toBeNull();

    await openTranscript();
    expect(screen.getByText('No words')).toBeTruthy();
  });

  test('words that will not open leave the rest of the note working', async () => {
    mockGetNote.mockResolvedValue(textNote());
    mockPassages.mockRejectedValue(new Error('down'));
    mockGetSummary.mockResolvedValue(summary);
    await render(<NoteDetailScreen />);

    // The summary still shows. Only the words are missing.
    expect(await screen.findByText(/agreed to ship the new sign up screen/)).toBeTruthy();
  });
});

describe('<NoteDetailScreen /> your language', () => {
  test('the pill shows the language you are on, and opens the list', async () => {
    mockGetNote.mockResolvedValue(note());
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Your language: English' }));
    });
    expect(screen.getByRole('header', { name: 'Your language' })).toBeTruthy();
    expect(screen.getByText('Gyan writes your summaries, your to-dos and its chat answers in this language.')).toBeTruthy();
  });

  test('picking a language saves it on your profile', async () => {
    mockGetNote.mockResolvedValue(note());
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Your language: English' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Hindi, हिन्दी' }));
    });
    expect(mockSetLanguage).toHaveBeenCalledWith('hi');
  });

  test('a language that is already saved shows in the menu after a reload', async () => {
    mockMyLanguage = 'ja';
    mockGetNote.mockResolvedValue(note());
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    expect(await screen.findByRole('button', { name: 'Your language: Japanese' })).toBeTruthy();
  });
});

describe('<NoteDetailScreen /> translating', () => {
  const spanishSummary = {
    overview: 'El equipo acordó lanzar la nueva pantalla de registro el viernes.',
    key_points: ['El registro es lento en los teléfonos', 'Dos personas lo probaron'],
    decisions: ['Lanzar el viernes'],
    open_questions: ['¿Quién escribe la nota de lanzamiento?'],
    action_items: [
      { text: 'Enviar el plan de pruebas', due: 'para el viernes' },
      { text: 'Reservar la revisión', due: null },
    ],
  };

  /** Opens the note with a summary, then opens the Translate list. */
  async function openTranslate() {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    mockList.mockResolvedValue(lines);
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    await openMore();
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Translate this summary' }));
    });
  }

  test('Translate is off until there is something to translate, and says why', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Queued' }));
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    const button = await screen.findByRole('button', { name: 'Translate this summary' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    // A row that cannot be used says why, which is the one thing a greyed-out button cannot.
    expect(screen.getByText('There is nothing to translate yet.')).toBeTruthy();
  });

  test('a translated summary shows the Spanish words and says it was translated by AI', async () => {
    mockTranslate.mockResolvedValue({ ok: true, kind: 'summary', language: 'es', content: spanishSummary, reused: false });
    await openTranslate();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Spanish, Español' }));
    });

    expect(mockTranslate).toHaveBeenCalledWith('n1', 'summary', 'es');
    expect(await screen.findByText('Translated by AI')).toBeTruthy();
    expect(screen.getByText('El equipo acordó lanzar la nueva pantalla de registro el viernes.')).toBeTruthy();
    expect(screen.getByText('Lanzar el viernes')).toBeTruthy();
    // The to-dos are translated too, and keep their own tick boxes. A screen reader reads the
    // translated words, which is the point of translating them.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Enviar el plan de pruebas' })).toBeTruthy();
    expect(screen.getByText('Enviar el plan de pruebas')).toBeTruthy();
    // The English words are gone while the translation is on screen.
    expect(screen.queryByText('Ship on Friday')).toBeNull();
  });

  test('Show original brings the English back, and Show translation puts it back', async () => {
    mockTranslate.mockResolvedValue({ ok: true, kind: 'summary', language: 'es', content: spanishSummary, reused: false });
    await openTranslate();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Spanish, Español' }));
    });

    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Show original' }));
    });
    expect(screen.getByText('Ship on Friday')).toBeTruthy();
    expect(screen.queryByText('Lanzar el viernes')).toBeNull();
    expect(screen.getByText('Your Spanish translation is saved.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Show translation' }));
    });
    expect(screen.getByText('Lanzar el viernes')).toBeTruthy();
    expect(screen.getByText('Translated by AI')).toBeTruthy();
  });

  test('PAID ONCE: a saved translation appears without asking the server at all', async () => {
    mockSaved.mockResolvedValue(spanishSummary);
    await openTranslate();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Spanish, Español' }));
    });

    expect(mockSaved).toHaveBeenCalledWith('n1', 'summary', 'es');
    expect(mockTranslate).not.toHaveBeenCalled();
    expect(await screen.findByText('Translated by AI')).toBeTruthy();
    expect(screen.getByText('Lanzar el viernes')).toBeTruthy();
  });

  test('ALREADY IN THAT LANGUAGE: it says so instead of paying for nothing', async () => {
    await openTranslate();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'English, English' }));
    });
    expect(screen.getByText('This note is already in that language, so there is nothing to translate.')).toBeTruthy();
    expect(mockSaved).not.toHaveBeenCalled();
    expect(mockTranslate).not.toHaveBeenCalled();
  });

  test('a problem shows a plain sentence, and the English stays on screen', async () => {
    mockTranslate.mockResolvedValue({ ok: false, message: 'Gyan could not translate this note just now. Please try again.' });
    await openTranslate();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Arabic, العربية' }));
    });
    expect(await screen.findByText(/could not translate this note just now/)).toBeTruthy();
    expect(screen.getByText('Ship on Friday')).toBeTruthy();
  });

  test('a translated transcript keeps every speaker and every time', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    mockList.mockResolvedValue(lines);
    mockTranslate.mockResolvedValue({
      ok: true,
      kind: 'transcript',
      language: 'ar',
      content: { lines: ['شكرا لانضمامكم.', 'يسعدني وجودي هنا.'] },
      reused: false,
    });
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openTranscript();
    await openMore();
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Translate this transcript' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Arabic, العربية' }));
    });

    expect(mockTranslate).toHaveBeenCalledWith('n1', 'transcript', 'ar');
    expect(await screen.findByText('Translated by AI')).toBeTruthy();
    expect(screen.getByText('شكرا لانضمامكم.')).toBeTruthy();
    // The speaker and the time are not words to translate, so they are untouched.
    expect(screen.getByText('Speaker 1')).toBeTruthy();
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.queryByText('Happy to be here.')).toBeNull();
  });

  test('ticking a translated to-do still saves the right one', async () => {
    mockTranslate.mockResolvedValue({ ok: true, kind: 'summary', language: 'es', content: spanishSummary, reused: false });
    await openTranslate();
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Spanish, Español' }));
    });
    await act(async () => {
      fireEvent.press(await screen.findByRole('checkbox', { name: 'Enviar el plan de pruebas' }));
    });
    // The row shows Spanish, but it is still to-do i1 that gets ticked.
    expect(mockSetDone).toHaveBeenCalledWith('i1', true);
  });

  test('each tab keeps its own translation', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockListItems.mockResolvedValue(items);
    mockList.mockResolvedValue(lines);
    mockTranslate.mockResolvedValue({ ok: true, kind: 'summary', language: 'es', content: spanishSummary, reused: false });
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Translate this summary' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Spanish, Español' }));
    });
    expect(await screen.findByText('Translated by AI')).toBeTruthy();

    // The Transcript tab has not been translated, so it shows no label.
    await openTranscript();
    expect(screen.queryByText(/Translated by AI/)).toBeNull();
    expect(screen.getByText('Happy to be here.')).toBeTruthy();

    // Back on the Summary tab, the Spanish is still there.
    await act(async () => {
      fireEvent.press(screen.getByRole('tab', { name: 'Summary' }));
    });
    expect(screen.getByText('Translated by AI')).toBeTruthy();
  });
});

describe('help for languages and translating', () => {
  const entry = HELP.translation;
  const words = [...entry.sentences, ...(entry.lists ?? []).flatMap((l) => [l.heading, ...l.items])].join(' ');

  test('it exists and is written in short plain words', () => {
    expect(entry.title.length).toBeGreaterThan(0);
    // No jargon a 15 year old would have to look up.
    expect(words).not.toMatch(/token|prompt|API|model|embedding|translation table|row/i);
    for (const sentence of entry.sentences) expect(sentence.length).toBeLessThan(160);
  });

  test('it explains the label, the toggle, and that a repeat costs nothing', () => {
    expect(words).toContain('Translated by AI');
    expect(words).toContain('Show original');
    expect(words).toContain('costs nothing');
    expect(words).toContain('right to left');
    // It says what is left alone, so nobody worries about names and times changing.
    expect(words).toMatch(/Names, numbers, dates and times/);
  });

  test('it has a picture at both sizes, and every picture has a description', () => {
    expect(entry.images.length).toBeGreaterThanOrEqual(2);
    for (const image of entry.images) expect(image.alt.length).toBeGreaterThan(10);
  });
});

describe('<NoteDetailScreen /> sending a recap', () => {
  test('a Ready note with a summary has a Send recap button', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockList.mockResolvedValue(lines);
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    const button = await screen.findByLabelText('Send a recap of this note by email');
    expect(button.props.accessibilityState.disabled).toBe(false);
  });

  test('a note with no summary yet has nothing to send', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(undefined);
    mockList.mockResolvedValue(lines);
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    expect(
      (await screen.findByLabelText('Send a recap of this note by email')).props.accessibilityState
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText('There is nothing to send until this note is finished and has a summary.'),
    ).toBeTruthy();
  });

  test('a note that is still being made has nothing to send either', async () => {
    mockGetNote.mockResolvedValue(note({ status: 'Summarizing' }));
    mockList.mockResolvedValue(lines);
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    expect(
      (await screen.findByLabelText('Send a recap of this note by email')).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  test('pressing it opens the dialog, which asks who would get the recap', async () => {
    mockGetNote.mockResolvedValue(note());
    mockGetSummary.mockResolvedValue(summary);
    mockList.mockResolvedValue(lines);
    await act(async () => {
      await render(<NoteDetailScreen />);
    });
    await openMore();
    await act(async () =>
      fireEvent.press(await screen.findByLabelText('Send a recap of this note by email')),
    );
    expect(await screen.findByRole('header', { name: 'Send recap' })).toBeTruthy();
    expect(mockPreviewRecap).toHaveBeenCalledWith('n1');
    expect(await screen.findByText('owner@example.test')).toBeTruthy();
  });
});
