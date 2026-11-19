import { act, fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(app)/(home)/index';
import { HELP } from '@/content/help';

const mockSignOut = jest.fn();
const mockPush = jest.fn();
const mockListNotes = jest.fn();
const mockGetUsage = jest.fn();
const mockSetLanguage = jest.fn();
/** The preferred language the fake profile reports. Tests change it. */
let mockMyLanguage = 'en';

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { email: 'fake.person@example.com' } }, signOut: mockSignOut }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ push: mockPush }),
    // Run the screen's loader once when it appears.
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
jest.mock('@/lib/notes', () => ({
  ...jest.requireActual('@/lib/notes'),
  listNotes: () => mockListNotes(),
  getUsage: () => mockGetUsage(),
}));
jest.mock('@/lib/profile', () => ({
  useProfile: () => ({
    languageCode: mockMyLanguage,
    language: jest.requireActual('@/constants/languages').languageFor(mockMyLanguage),
    isLoading: false,
    setLanguage: (...a: unknown[]) => mockSetLanguage(...a),
  }),
}));

const note = (over: object = {}) => ({
  id: '1', title: 'Weekly team check-in', source: 'text', status: 'Queued', error_message: null, created_at: '2026-11-15T12:00:00Z', ...over,
});

describe('<HomeScreen />', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockPush.mockReset();
    mockListNotes.mockReset();
    mockGetUsage.mockReset();
    mockGetUsage.mockResolvedValue({ accountId: 'a', planName: 'Free', used: 2, limit: 5 });
    mockMyLanguage = 'en';
    mockSetLanguage.mockReset().mockResolvedValue({});
  });

  test('shows loading first, then the notes newest first with title, date, source, and status', async () => {
    let finish: (v: unknown) => void = () => {};
    mockListNotes.mockReturnValue(new Promise((r) => (finish = r)));
    await render(<HomeScreen />);
    expect(screen.getByLabelText('Loading your notes')).toBeTruthy();

    await act(async () => finish([note({ id: '1', title: 'Newest note', status: 'Ready' }), note({ id: '2', title: 'Older note', source: 'upload', status: 'Queued' })]));
    expect(screen.queryByLabelText('Loading your notes')).toBeNull();
    expect(screen.getByText('Newest note')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.getByText(/Nov 15, 2026 · Upload/)).toBeTruthy();
  });

  test('shows meetings used next to the limit read from the plan', async () => {
    mockListNotes.mockResolvedValue([]);
    mockGetUsage.mockResolvedValue({ accountId: 'a', planName: 'Free', used: 1, limit: 3 });
    await render(<HomeScreen />);
    expect(await screen.findByText('Meetings used this month: 1 of 3')).toBeTruthy();
    expect(screen.queryByText(/used all your meetings/)).toBeNull();
  });

  test('at the limit it shows a friendly message', async () => {
    mockListNotes.mockResolvedValue([]);
    mockGetUsage.mockResolvedValue({ accountId: 'a', planName: 'Free', used: 3, limit: 3 });
    await render(<HomeScreen />);
    expect(await screen.findByText(/You have used all your meetings for this month/)).toBeTruthy();
  });

  test('empty state', async () => {
    mockListNotes.mockResolvedValue([]);
    await render(<HomeScreen />);
    expect(await screen.findByText('No notes yet')).toBeTruthy();
  });

  test('error state with a Retry that loads again', async () => {
    mockListNotes.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([note()]);
    await render(<HomeScreen />);
    expect(await screen.findByText(/We could not load your notes/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Weekly team check-in')).toBeTruthy();
  });

  test('a failed note shows its plain message', async () => {
    mockListNotes.mockResolvedValue([note({ status: 'Failed', error_message: 'The upload did not finish.' })]);
    await render(<HomeScreen />);
    expect(await screen.findByText('The upload did not finish.')).toBeTruthy();
  });

  test('New note opens the New note screen', async () => {
    mockListNotes.mockResolvedValue([]);
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByText('New note'));
    expect(mockPush).toHaveBeenCalledWith('/new-note');
  });

  test('has a ? button that opens the Home help', async () => {
    mockListNotes.mockResolvedValue([]);
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByLabelText(`Help: ${HELP.home.title}`)).toBeTruthy();
    expect(await screen.findByText('What each status means')).toBeTruthy();
  });

  test('shows who is logged in and Log out calls sign out', async () => {
    mockListNotes.mockResolvedValue([]);
    mockSignOut.mockResolvedValue({});
    await render(<HomeScreen />);
    expect(screen.getByText('fake.person@example.com')).toBeTruthy();
    await fireEvent.press(screen.getByText('Log out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  test('shows a friendly message when log out fails', async () => {
    mockListNotes.mockResolvedValue([]);
    mockSignOut.mockResolvedValue({ error: 'Something went wrong. Please try again.' });
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByText('Log out'));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
  });

  test('a note that is still being made updates by itself, without a refresh', async () => {
    jest.useFakeTimers();
    try {
      mockListNotes.mockResolvedValueOnce([note({ source: 'upload', status: 'Transcribing' })]);
      mockListNotes.mockResolvedValue([note({ source: 'upload', status: 'Failed', error_message: 'We could not read this audio file.' })]);
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

  test('when every note is done, Home stops checking', async () => {
    jest.useFakeTimers();
    try {
      mockListNotes.mockResolvedValue([note({ status: 'Ready' })]);
      await render(<HomeScreen />);
      await screen.findByLabelText('Status: Ready');
      const calls = mockListNotes.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });
      expect(mockListNotes.mock.calls.length).toBe(calls);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('<HomeScreen /> your language', () => {
  beforeEach(() => {
    mockListNotes.mockReset().mockResolvedValue([]);
    mockGetUsage.mockReset().mockResolvedValue({ accountId: 'a', planName: 'Free', used: 0, limit: 5 });
    mockMyLanguage = 'en';
    mockSetLanguage.mockReset().mockResolvedValue({});
  });

  test('the account panel says which language you are on, and what it is used for', async () => {
    await act(async () => {
      await render(<HomeScreen />);
    });
    expect(await screen.findByRole('header', { name: 'Your account' })).toBeTruthy();
    expect(screen.getByText('Your language')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
    expect(
      screen.getByText('Gyan writes your summaries, your to-dos and its chat answers in this language.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change language' })).toBeTruthy();
  });

  test('Change language opens the list and saves what you pick', async () => {
    await act(async () => {
      await render(<HomeScreen />);
    });
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Change language' }));
    });
    expect(screen.getByRole('header', { name: 'Your language' })).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Hindi, हिन्दी' }));
    });
    expect(mockSetLanguage).toHaveBeenCalledWith('hi');
  });

  test('a language you saved before shows when Home opens', async () => {
    mockMyLanguage = 'ar';
    await act(async () => {
      await render(<HomeScreen />);
    });
    expect(await screen.findByText('Arabic')).toBeTruthy();
  });

  test('if saving fails, it says so in plain words', async () => {
    mockSetLanguage.mockResolvedValue({ error: 'Gyan could not save your language. Please check your connection and try again.' });
    await act(async () => {
      await render(<HomeScreen />);
    });
    await act(async () => {
      fireEvent.press(await screen.findByRole('button', { name: 'Change language' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Spanish, Español' }));
    });
    expect(screen.getByText(/could not save your language/)).toBeTruthy();
  });
});
