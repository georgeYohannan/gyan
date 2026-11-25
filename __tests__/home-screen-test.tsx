import { act, fireEvent, render as renderRaw, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import HomeScreen from '@/app/(app)/(home)/index';
import { HELP } from '@/content/help';

/**
 * Draws a screen with a gesture root above it, the way the real app does.
 *
 * Note rows can be swiped now, and react-native-gesture-handler refuses to draw a gesture
 * that has no `GestureHandlerRootView` above it -- a good error, because a gesture with no
 * root silently does nothing. The real one lives at the very top of `src/app/_layout.tsx`;
 * a test that draws one screen on its own has to supply it.
 */
const render = (ui: React.ReactElement) => renderRaw(<GestureHandlerRootView>{ui}</GestureHandlerRootView>);

const mockSignOut = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockFindNotes = jest.fn();
const mockDeleteNotes = jest.fn();
const mockGetUsage = jest.fn();
const mockRefreshStatuses = jest.fn();
const mockSetLanguage = jest.fn();
/** What the web address says when the screen opens. Tests change it. */
let mockParams: Record<string, string> = {};
/** The preferred language the fake profile reports. */
let mockMyLanguage = 'en';

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { email: 'fake.person@example.com' } }, signOut: mockSignOut }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
    // Run the screen's loader once when it appears.
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock('@/lib/notes', () => ({
  ...jest.requireActual('@/lib/notes'),
  getUsage: () => mockGetUsage(),
  refreshNoteStatuses: (...a: unknown[]) => mockRefreshStatuses(...a),
}));
jest.mock('@/lib/notes-search', () => ({
  ...jest.requireActual('@/lib/notes-search'),
  findNotes: (...a: unknown[]) => mockFindNotes(...a),
  deleteNotes: (...a: unknown[]) => mockDeleteNotes(...a),
}));
jest.mock('@/lib/profile', () => ({
  useProfile: () => ({
    languageCode: mockMyLanguage,
    language: jest.requireActual('@/constants/languages').languageFor(mockMyLanguage),
    isLoading: false,
    setLanguage: (...a: unknown[]) => mockSetLanguage(...a),
  }),
}));

/** One note as find_notes hands it back. */
const hit = (over: object = {}) => ({
  id: '1',
  title: 'Weekly team check-in',
  source: 'text',
  status: 'Queued',
  error_message: null,
  created_at: '2026-11-15T12:00:00Z',
  hasOpenActions: false,
  canDelete: true,
  matchedIn: [],
  ...over,
});

/** A page of notes, with the total the database would report. */
const page = (notes: object[], total = notes.length) => ({ notes, total });

describe('<HomeScreen />', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockPush.mockReset();
    mockSetParams.mockReset();
    mockFindNotes.mockReset();
    mockDeleteNotes.mockReset();
    mockRefreshStatuses.mockReset().mockResolvedValue([]);
    mockGetUsage.mockReset();
    mockGetUsage.mockResolvedValue({ accountId: 'a', planName: 'Free', used: 2, limit: 5 });
    mockParams = {};
    mockMyLanguage = 'en';
    mockSetLanguage.mockReset().mockResolvedValue({});
  });

  test('shows loading first, then the notes newest first with title, date, source, and status', async () => {
    let finish: (v: unknown) => void = () => {};
    mockFindNotes.mockReturnValue(new Promise((r) => (finish = r)));
    await render(<HomeScreen />);
    expect(screen.getByLabelText('Loading your notes')).toBeTruthy();

    await act(async () =>
      finish(
        page([
          hit({ id: '1', title: 'Newest note', status: 'Ready' }),
          hit({ id: '2', title: 'Older note', source: 'upload', status: 'Queued' }),
        ]),
      ),
    );
    expect(screen.queryByLabelText('Loading your notes')).toBeNull();
    expect(screen.getByText('Newest note')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Queued')).toBeTruthy();
    // The date and the source are two facts, so they are two pieces of text. They used to be
    // one line joined by a middle dot, which docs/decisions.md names as a tell of generated
    // design -- see the 2026-11-18 entry.
    expect(screen.getAllByText('Nov 15, 2026').length).toBeGreaterThan(0);
    expect(screen.getByText('Upload')).toBeTruthy();
    expect(screen.queryByText(/Nov 15, 2026 ·/)).toBeNull();
  });

  test('asks for only ten notes to begin with', async () => {
    mockFindNotes.mockResolvedValue(page([]));
    await render(<HomeScreen />);
    expect(mockFindNotes).toHaveBeenCalledWith(expect.anything(), { limit: 10 });
  });

  // Home used to open with a panel saying "Meetings used this month: 1 of 3", above a person's
  // own notes. It is a warning now, not a dashboard: nothing is said while there is room, one
  // quiet line when the next meeting is the last, and the full message at the limit. The whole
  // meter still lives on Settings -> Plan and usage for anybody who wants the number.
  test('says nothing about meetings while there is still room', async () => {
    mockFindNotes.mockResolvedValue(page([]));
    mockGetUsage.mockResolvedValue({ accountId: 'a', planName: 'Free', used: 1, limit: 3 });
    await render(<HomeScreen />);
    expect(await screen.findByText('No notes yet')).toBeTruthy();
    expect(screen.queryByText(/Meetings used this month/)).toBeNull();
    expect(screen.queryByText(/meetings? left this month/)).toBeNull();
    expect(screen.queryByText(/used all your meetings/)).toBeNull();
  });

  test('with one meeting left it says so, in one line', async () => {
    mockFindNotes.mockResolvedValue(page([]));
    mockGetUsage.mockResolvedValue({ accountId: 'a', planName: 'Free', used: 2, limit: 3 });
    await render(<HomeScreen />);
    expect(
      await screen.findByText('1 meeting left this month on the Free plan. Pasted text is always free.'),
    ).toBeTruthy();
    expect(screen.queryByText(/used all your meetings/)).toBeNull();
  });

  test('at the limit it shows a friendly message', async () => {
    mockFindNotes.mockResolvedValue(page([]));
    mockGetUsage.mockResolvedValue({ accountId: 'a', planName: 'Free', used: 3, limit: 3 });
    await render(<HomeScreen />);
    expect(await screen.findByText(/You have used all your meetings for this month/)).toBeTruthy();
  });

  test('empty state', async () => {
    mockFindNotes.mockResolvedValue(page([]));
    await render(<HomeScreen />);
    expect(await screen.findByText('No notes yet')).toBeTruthy();
  });

  test('an account with no notes at all is not offered a search box or filters', async () => {
    // One obvious thing to do. Searching nothing, and filtering a list that does not exist,
    // would only crowd it.
    mockFindNotes.mockResolvedValue(page([]));
    await render(<HomeScreen />);
    expect(await screen.findByText('No notes yet')).toBeTruthy();
    expect(screen.queryByLabelText('Search your notes')).toBeNull();
    expect(screen.queryByLabelText('Filters')).toBeNull();
    expect(screen.getByText('New note')).toBeTruthy();
  });

  test('but the search box stays when a search is what emptied the list', async () => {
    mockParams = { q: 'pricing' };
    mockFindNotes.mockResolvedValue(page([]));
    await render(<HomeScreen />);
    expect(await screen.findByText('No notes match')).toBeTruthy();
    expect(screen.getByLabelText('Search your notes')).toBeTruthy();
  });

  test('nothing matching offers a way back to the whole list, in its own words', async () => {
    // Not "Clear filters": that button already exists next to the filters, and two controls
    // with the same name on one screen is one too many.
    mockParams = { q: 'pricing' };
    mockFindNotes.mockResolvedValue(page([]));
    await render(<HomeScreen />);
    expect(await screen.findByText('Show all notes')).toBeTruthy();
  });

  test('nothing matching is a different message from having no notes at all', async () => {
    // Reusing "No notes yet" for an empty search would tell somebody with 300 notes that they
    // have none.
    mockParams = { q: 'pricing' };
    mockFindNotes.mockResolvedValue(page([]));
    await render(<HomeScreen />);
    expect(await screen.findByText('No notes match')).toBeTruthy();
    expect(screen.queryByText('No notes yet')).toBeNull();
  });

  test('error state with a Retry that loads again', async () => {
    mockFindNotes.mockRejectedValueOnce(new Error('down')).mockResolvedValue(page([hit()]));
    await render(<HomeScreen />);
    expect(await screen.findByText(/We could not load your notes/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Weekly team check-in')).toBeTruthy();
  });

  test('a failed note shows its plain message', async () => {
    mockFindNotes.mockResolvedValue(
      page([hit({ status: 'Failed', error_message: 'The upload did not finish.' })]),
    );
    await render(<HomeScreen />);
    expect(await screen.findByText('The upload did not finish.')).toBeTruthy();
  });

  test('New note opens the New note screen', async () => {
    mockFindNotes.mockResolvedValue(page([]));
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByText('New note'));
    expect(mockPush).toHaveBeenCalledWith('/new-note');
  });

  test('has a ? button that opens the Home help', async () => {
    mockFindNotes.mockResolvedValue(page([]));
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByLabelText(`Help: ${HELP.home.title}`)).toBeTruthy();
    expect(await screen.findByText('What each status means')).toBeTruthy();
  });

  describe('day headings', () => {
    test('notes are grouped under the day they happened', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      mockFindNotes.mockResolvedValue(
        page([
          hit({ id: 'a', title: 'From today', created_at: now.toISOString() }),
          hit({ id: 'b', title: 'From yesterday', created_at: yesterday.toISOString() }),
        ]),
      );
      await render(<HomeScreen />);
      expect(await screen.findByText('Today')).toBeTruthy();
      expect(screen.getByText('Yesterday')).toBeTruthy();
    });

    test('a day that runs across two pages gets one heading, not two', async () => {
      const { groupByDay } = jest.requireActual('@/app/(app)/(home)/index');
      const now = new Date();
      const three = [1, 2, 3].map((n) => hit({ id: String(n), created_at: now.toISOString() }));
      const headings = groupByDay(three, false, now).filter((e: { kind: string }) => e.kind === 'heading');
      expect(headings).toHaveLength(1);
    });

    test('there are no day headings while searching, because the order is by best match', async () => {
      const { groupByDay } = jest.requireActual('@/app/(app)/(home)/index');
      const now = new Date();
      const notes = [hit({ id: '1', created_at: now.toISOString() })];
      expect(groupByDay(notes, true, now).every((e: { kind: string }) => e.kind === 'note')).toBe(true);
    });
  });

  describe('searching and filtering', () => {
    test('the words in the address are searched for as soon as Home opens', async () => {
      mockParams = { q: 'pricing' };
      mockFindNotes.mockResolvedValue(
        page([hit({ title: 'Pricing call', snippet: 'we raised pricing again', matchedIn: ['transcript'] })]),
      );
      await render(<HomeScreen />);
      expect(mockFindNotes).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'pricing' }),
        { limit: 10 },
      );
      // The snippet shows, with the marks turned into styling rather than left in the words.
      expect(await screen.findByText(/we raised/)).toBeTruthy();
      expect(screen.queryByText(//)).toBeNull();
      expect(screen.getByText('Found in the transcript')).toBeTruthy();
    });

    test('the filters in the address are applied as soon as Home opens', async () => {
      mockParams = { status: 'Ready,Failed', source: 'upload', open: '1', preset: 'last7' };
      mockFindNotes.mockResolvedValue(page([]));
      await render(<HomeScreen />);
      expect(mockFindNotes).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: ['Ready', 'Failed'],
          sources: ['upload'],
          openActions: true,
          from: expect.any(String),
        }),
        { limit: 10 },
      );
      // Four groups are on: the dates, the statuses, the source, and the open to-dos.
      expect(await screen.findByText('Filters (4)')).toBeTruthy();
    });

    test('how many were found is shown, and says "found" only when something is narrowing it', async () => {
      mockFindNotes.mockResolvedValue(page([hit()], 12));
      await render(<HomeScreen />);
      expect(await screen.findByText('12 notes')).toBeTruthy();

      mockParams = { q: 'pricing' };
      mockFindNotes.mockResolvedValue(page([hit()], 3));
      await render(<HomeScreen />);
      expect(await screen.findByText('3 notes found')).toBeTruthy();
    });

    test('a filter can be taken off on its own, and the address is told', async () => {
      mockParams = { status: 'Ready' };
      mockFindNotes.mockResolvedValue(page([hit({ status: 'Ready' })]));
      await render(<HomeScreen />);
      await fireEvent.press(await screen.findByLabelText('Remove the Ready filter'));
      // Undefined rather than empty: that is what takes the key out of the address altogether,
      // so a link somebody keeps is "/?q=pricing" and not "/?q=pricing&status=&source=&open=".
      expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
    });

    test('applying filters keeps what is in the search box, even if typing has not settled', async () => {
      // The sheet keeps the view as it was when it opened. If it handed the words back too, a
      // word typed just before opening it would be thrown away.
      // It needs a note: Home hides the search box entirely on an account with none.
      mockFindNotes.mockResolvedValue(page([hit()]));
      await render(<HomeScreen />);
      await act(async () => {
        fireEvent.changeText(screen.getByLabelText('Search your notes'), 'pricing');
      });
      await fireEvent.press(screen.getByLabelText('Filters'));
      await fireEvent.press(await screen.findByLabelText('Ready'));
      await fireEvent.press(screen.getByText('Show these notes'));

      expect(mockFindNotes).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: 'pricing', statuses: ['Ready'] }),
        { limit: 10 },
      );
    });

    test('Clear filters puts everything back and empties the address', async () => {
      mockParams = { q: 'pricing', status: 'Ready', preset: 'last7' };
      mockFindNotes.mockResolvedValue(page([]));
      await render(<HomeScreen />);
      await fireEvent.press(await screen.findByLabelText('Clear filters'));
      expect(mockSetParams).toHaveBeenCalledWith({
        q: undefined,
        preset: undefined,
        from: undefined,
        to: undefined,
        status: undefined,
        source: undefined,
        open: undefined,
      });
    });
  });

  describe('Show more', () => {
    test('it asks for twenty more, carrying on from the last note shown', async () => {
      mockFindNotes.mockResolvedValueOnce(
        page([hit({ id: 'a', created_at: '2026-11-15T12:00:00Z' })], 30),
      );
      await render(<HomeScreen />);
      mockFindNotes.mockResolvedValueOnce(page([hit({ id: 'b', title: 'Page two note' })], 30));
      await fireEvent.press(await screen.findByText('Show more'));

      expect(mockFindNotes).toHaveBeenLastCalledWith(expect.anything(), {
        limit: 20,
        after: expect.objectContaining({ id: 'a' }),
      });
      expect(await screen.findByText('Page two note')).toBeTruthy();
      // The first page is still there: the second is added, not swapped in.
      expect(screen.getByText('Weekly team check-in')).toBeTruthy();
    });

    test('while searching it counts forward instead, because best-match order does not move', async () => {
      mockParams = { q: 'pricing' };
      mockFindNotes.mockResolvedValueOnce(page([hit({ id: 'a' })], 30));
      await render(<HomeScreen />);
      mockFindNotes.mockResolvedValueOnce(page([hit({ id: 'b' })], 30));
      await fireEvent.press(await screen.findByText('Show more'));
      expect(mockFindNotes).toHaveBeenLastCalledWith(expect.anything(), { limit: 20, offset: 1 });
    });

    test('there is no Show more once everything is shown', async () => {
      mockFindNotes.mockResolvedValue(page([hit()], 1));
      await render(<HomeScreen />);
      await screen.findByText('Weekly team check-in');
      expect(screen.queryByText('Show more')).toBeNull();
    });
  });

  describe('Select mode', () => {
    const two = [
      hit({ id: '1', title: 'First note' }),
      hit({ id: '2', title: 'Second note' }),
    ];

    test('notes can be ticked and deleted, with one box that says what will go', async () => {
      mockFindNotes.mockResolvedValue(page(two));
      mockDeleteNotes.mockResolvedValue([
        { id: '1', filePath: 'a/b/c.mp3', errorCode: null },
        { id: '2', filePath: null, errorCode: null },
      ]);
      await render(<HomeScreen />);

      await fireEvent.press(await screen.findByLabelText('Select notes'));
      await fireEvent.press(screen.getByText('First note'));
      await fireEvent.press(screen.getByText('Second note'));
      expect(screen.getByText('2 notes selected')).toBeTruthy();

      await fireEvent.press(screen.getByLabelText('Delete selected notes'));
      expect(await screen.findByText('Delete 2 notes?')).toBeTruthy();
      // Which notes go in the message; what it means goes in the list under it.
      expect(screen.getByText('"First note" and "Second note" will be deleted.')).toBeTruthy();
      // The thing the founder decided must always be said, in the plural.
      expect(screen.getByText(/does not give you 2 meetings back this month/)).toBeTruthy();

      await fireEvent.press(screen.getByText('Delete 2 notes'));
      expect(mockDeleteNotes).toHaveBeenCalledWith(['1', '2']);
      expect(await screen.findByText('2 notes deleted.')).toBeTruthy();
    });

    test('Delete does nothing until something is ticked', async () => {
      mockFindNotes.mockResolvedValue(page(two));
      await render(<HomeScreen />);
      await fireEvent.press(await screen.findByLabelText('Select notes'));
      expect(screen.getByText('Tap the notes you want to delete.')).toBeTruthy();
      expect(screen.getByLabelText('Delete selected notes')).toBeDisabled();
    });

    test('a note somebody else made cannot be ticked, and says why', async () => {
      mockFindNotes.mockResolvedValue(
        page([hit({ id: '1', title: 'Their note', canDelete: false })]),
      );
      await render(<HomeScreen />);
      await fireEvent.press(await screen.findByLabelText('Select notes'));
      expect(screen.getByText('Somebody else made this note, so you cannot delete it.')).toBeTruthy();
    });

    test('when one note cannot be deleted, it says so rather than failing the lot', async () => {
      mockFindNotes.mockResolvedValue(page(two));
      mockDeleteNotes.mockResolvedValue([
        { id: '1', filePath: null, errorCode: null },
        { id: '2', filePath: null, errorCode: 'not_yours' },
      ]);
      await render(<HomeScreen />);
      await fireEvent.press(await screen.findByLabelText('Select notes'));
      await fireEvent.press(screen.getByText('First note'));
      await fireEvent.press(screen.getByText('Second note'));
      await fireEvent.press(screen.getByLabelText('Delete selected notes'));
      await fireEvent.press(screen.getByText('Delete 2 notes'));
      expect(await screen.findByText(/1 note deleted\. 1 could not be/)).toBeTruthy();
    });

    test('Cancel leaves Select mode with nothing deleted', async () => {
      mockFindNotes.mockResolvedValue(page(two));
      await render(<HomeScreen />);
      await fireEvent.press(await screen.findByLabelText('Select notes'));
      await fireEvent.press(screen.getByText('First note'));
      await fireEvent.press(screen.getByLabelText('Cancel selecting'));
      expect(screen.queryByText('1 note selected')).toBeNull();
      expect(mockDeleteNotes).not.toHaveBeenCalled();
    });
  });

  describe('the check while a note is being made', () => {
    test('a note still being made updates by itself, without a refresh', async () => {
      jest.useFakeTimers();
      try {
        mockFindNotes.mockResolvedValue(page([hit({ source: 'upload', status: 'Transcribing' })]));
        mockRefreshStatuses.mockResolvedValue([
          { id: '1', status: 'Failed', error_message: 'We could not read this audio file.' },
        ]);
        await render(<HomeScreen />);
        expect(await screen.findByLabelText('Status: Transcribing')).toBeTruthy();
        await act(async () => {
          jest.advanceTimersByTime(3100);
        });
        expect(await screen.findByLabelText('Status: Failed')).toBeTruthy();
        expect(screen.getByText('We could not read this audio file.')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    test('it asks only about the busy notes, never for the whole list again', async () => {
      // Asking for the list again would quietly throw away every page after the first.
      jest.useFakeTimers();
      try {
        mockFindNotes.mockResolvedValue(
          page([
            hit({ id: 'busy', status: 'Transcribing' }),
            hit({ id: 'done', status: 'Ready' }),
          ]),
        );
        await render(<HomeScreen />);
        await screen.findByLabelText('Status: Transcribing');
        const asks = mockFindNotes.mock.calls.length;
        await act(async () => {
          jest.advanceTimersByTime(3100);
        });
        expect(mockRefreshStatuses).toHaveBeenCalledWith(['busy']);
        expect(mockFindNotes.mock.calls.length).toBe(asks);
      } finally {
        jest.useRealTimers();
      }
    });

    test('when every note is done, Home stops checking', async () => {
      jest.useFakeTimers();
      try {
        mockFindNotes.mockResolvedValue(page([hit({ status: 'Ready' })]));
        await render(<HomeScreen />);
        await screen.findByLabelText('Status: Ready');
        await act(async () => {
          jest.advanceTimersByTime(10000);
        });
        expect(mockRefreshStatuses).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
