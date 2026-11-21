/**
 * Data and privacy: the two ways to make something go away for good.
 *
 * Everything here is about being hard to do by accident, and honest about what happens.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import DataPrivacyScreen from '@/app/(app)/settings/data';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
}));

const mockSignOut = jest.fn(async () => ({}));
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'u1', email: 'sam@example.test' } }, signOut: mockSignOut }),
}));

const mockListNotes = jest.fn();
jest.mock('@/lib/notes', () => ({
  ...jest.requireActual('@/lib/notes'),
  listNotes: (...a: unknown[]) => mockListNotes(...a),
}));

const mockCanDelete = jest.fn();
const mockDeleteNote = jest.fn();
const mockDeleteAccount = jest.fn();
jest.mock('@/lib/account', () => ({
  ...jest.requireActual('@/lib/account'),
  canDeleteAccount: (...a: unknown[]) => mockCanDelete(...a),
  deleteNote: (...a: unknown[]) => mockDeleteNote(...a),
  deleteAccount: (...a: unknown[]) => mockDeleteAccount(...a),
}));

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  title: 'Monday planning call',
  source: 'upload',
  status: 'Ready',
  error_message: null,
  created_at: '2026-11-18T10:00:00.000Z',
  ...over,
});

const canDelete = (over: Record<string, unknown> = {}) => ({
  isOwner: true,
  canDelete: true,
  whatGoes: 'Everything goes: your login, your name, all 3 of your notes.',
  noteCount: 3,
  otherMemberCount: 0,
  pendingInviteCount: 0,
  ...over,
});

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockSignOut.mockReset().mockResolvedValue({});
  mockListNotes.mockReset().mockResolvedValue([note()]);
  mockCanDelete.mockReset().mockResolvedValue(canDelete());
  mockDeleteNote.mockReset().mockResolvedValue(undefined);
  mockDeleteAccount.mockReset().mockResolvedValue({ ok: true });
});

describe('deleting one note', () => {
  test('it names the note, lists what goes, and asks before anything happens', async () => {
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete' })));

    expect(await screen.findByText('Monday planning call will be gone for good.')).toBeTruthy();
    expect(screen.getByText('•  The transcript and who said what')).toBeTruthy();
    expect(screen.getByText('•  It does not give you the meeting back this month')).toBeTruthy();
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });

  test('confirming deletes it and says so', async () => {
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete' })));
    mockListNotes.mockResolvedValue([]);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Delete this note' })));

    expect(mockDeleteNote).toHaveBeenCalledWith('n1');
    expect(await screen.findByText('Monday planning call is deleted.')).toBeTruthy();
  });

  test('cancelling deletes nothing', async () => {
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Cancel' })));
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });

  test('a note somebody else made says so in plain words', async () => {
    mockDeleteNote.mockRejectedValue(
      new Error('You can only delete a note you made. Ask the account owner to delete this one.'),
    );
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Delete this note' })));
    expect(await screen.findByText(/You can only delete a note you made/)).toBeTruthy();
  });

  test('a pasted note with no title is still named something', async () => {
    mockListNotes.mockResolvedValue([note({ title: null, source: 'text' })]);
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    expect(await screen.findByText('Pasted text')).toBeTruthy();
  });
});

describe('deleting the account', () => {
  test('IT WILL NOT GO UNTIL THE WORD IS TYPED', async () => {
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' })));

    const go = screen.getByRole('button', { name: 'Delete everything' });
    expect(go.props.accessibilityState.disabled).toBe(true);

    // Something close is not close enough.
    await act(async () => fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'delete'));
    expect(screen.getByRole('button', { name: 'Delete everything' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Delete everything' })));
    expect(mockDeleteAccount).not.toHaveBeenCalled();

    await act(async () => fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE'));
    expect(screen.getByRole('button', { name: 'Delete everything' }).props.accessibilityState.disabled).toBe(false);
  });

  test('it lists exactly what goes, and that there is no copy', async () => {
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' })));

    expect(screen.getByText('•  Every note, recording and transcript')).toBeTruthy();
    expect(screen.getByText('•  Your login, so you cannot sign in again')).toBeTruthy();
    expect(screen.getByText('•  None of it can be put back')).toBeTruthy();
  });

  test('once it is done, the person is signed out and sent away', async () => {
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' })));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Delete everything' })));

    expect(mockDeleteAccount).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('a server refusal is shown, and nothing is claimed to have happened', async () => {
    mockDeleteAccount.mockResolvedValue({ ok: false, message: 'Gyan could not remove your files, so nothing has been deleted.' });
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' })));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Delete everything' })));

    expect(await screen.findByText(/nothing has been deleted/)).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  test('AN OWNER WITH A TEAM IS STOPPED, and told where to go instead', async () => {
    mockCanDelete.mockResolvedValue(
      canDelete({
        canDelete: false,
        whatGoes: undefined,
        otherMemberCount: 1,
        reason: 'There is 1 other person on your account. Remove them on the Team screen first, then you can delete your account.',
      }),
    );
    await act(async () => {
      render(<DataPrivacyScreen />);
    });

    expect(await screen.findByText(/There is 1 other person on your account/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Go to Team' })));
    expect(mockPush).toHaveBeenCalledWith('/settings/team');
  });

  test('a member is told their notes stay with the account', async () => {
    mockCanDelete.mockResolvedValue(
      canDelete({
        isOwner: false,
        whatGoes: "Your login, your name and your own chats are deleted. The notes you made stay in Sam Carter's workspace, with your name taken off them.",
      }),
    );
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    expect(await screen.findByText(/The notes you made stay in Sam Carter's workspace/)).toBeTruthy();
  });

  test('the typed word is forgotten when the question is closed and opened again', async () => {
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' })));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Cancel' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Delete my account' })));

    expect(screen.getByRole('button', { name: 'Delete everything' }).props.accessibilityState.disabled).toBe(true);
  });
});

describe('the address a download is opened at', () => {
  // The address comes from our own server, so this is depth rather than a hole being
  // closed. But handing anything to the operating system is the one thing in this app that
  // reaches outside it, and the check costs nothing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isOurDownload } = require('@/app/(app)/settings/data') as { isOurDownload: (u: string) => boolean };

  // Set here rather than read from the environment: Jest does not load the .env files, and
  // a test that quietly does nothing because a setting is missing is worse than no test.
  const ours = 'https://ofnspnobzesxmyqjxzad.supabase.co';
  const before = process.env.EXPO_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = ours;
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = before;
  });

  test('our own project is allowed', () => {
    expect(isOurDownload(`${ours}/storage/v1/object/sign/notes-files/acc/exports/x.zip?token=abc`)).toBe(true);
  });

  test('IT REFUSES EVERYTHING when the project address is not set at all', () => {
    // Fail closed. A missing setting must not turn the check into "anything goes".
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    expect(isOurDownload(`${ours}/x.zip`)).toBe(false);
  });

  test('ANOTHER WEBSITE IS REFUSED, however plausible it looks', () => {
    expect(isOurDownload('https://evil.example/export.zip')).toBe(false);
    // The oldest trick: our address as a prefix of somebody else's.
    expect(isOurDownload(`${ours}.evil.example/export.zip`)).toBe(false);
    expect(isOurDownload(`https://evil.example/?x=${encodeURIComponent(ours)}`)).toBe(false);
  });

  test('ADDRESSES THAT ARE NOT THE WEB AT ALL ARE REFUSED', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      `http://${ours.replace('https://', '')}/x.zip`,
      '',
      'not a url',
    ]) {
      expect(isOurDownload(bad)).toBe(false);
    }
  });
});
