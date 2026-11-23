/**
 * The Send recap dialog and the Recap emails page, as a person meets them.
 * Nothing real is called: every lib module is faked. No email is ever sent.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import RecapEmailsScreen, { stateSentence } from '@/app/(app)/settings/recaps';
import { RecapDialog } from '@/components/notes/recap-dialog';
import { MESSAGES } from '@/lib/recaps';

const mockPreview = jest.fn();
const mockSend = jest.fn();
const mockGetSettings = jest.fn();
const mockSaveSettings = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockOpenSettings = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock('@/lib/recaps', () => ({
  ...jest.requireActual('@/lib/recaps'),
  previewRecap: (...a: unknown[]) => mockPreview(...a),
  sendRecap: (...a: unknown[]) => mockSend(...a),
  getRecapSettings: (...a: unknown[]) => mockGetSettings(...a),
  saveRecapSettings: (...a: unknown[]) => mockSaveSettings(...a),
}));

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

const PEOPLE = [
  { userId: OWNER_ID, email: 'owner@example.test', name: 'Sam Carter', role: 'owner' as const, language: 'en', defaultOn: true, isYou: true },
  { userId: MEMBER_ID, email: 'priya@example.test', name: 'Priya Shah', role: 'member' as const, language: 'hi', defaultOn: false, isYou: false },
];

function okPreview(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    recipients: PEOPLE,
    settings: { toOwner: true, toMembers: false, autoSend: false },
    canSend: true,
    ...over,
  };
}

beforeEach(() => {
  mockPreview.mockReset();
  mockSend.mockReset();
  mockGetSettings.mockReset();
  mockSaveSettings.mockReset();
  mockReplace.mockReset();
  mockOpenSettings.mockReset();
});

async function openDialog() {
  await act(async () => {
    render(
      <RecapDialog
        meetingId="note-1"
        visible
        onClose={jest.fn()}
        noteLanguage="en"
        onOpenSettings={mockOpenSettings}
      />,
    );
  });
}

describe('the Send recap dialog', () => {
  test('it says what a recap is and that only the account can be picked', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    expect(await screen.findByRole('header', { name: 'Send recap' })).toBeTruthy();
    expect(
      screen.getByText(
        'The summary and action items of this note, by email. Only people on your account can be picked.',
      ),
    ).toBeTruthy();
  });

  test('IT SHOWS WHO WILL RECEIVE IT, by address', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    expect(await screen.findByText('owner@example.test')).toBeTruthy();
    expect(screen.getByText('priya@example.test')).toBeTruthy();
  });

  test('it describes each person in words a person would use, not database words', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    // The signed-in person is "you", not "the account owner".
    expect(await screen.findByText('you')).toBeTruthy();
    expect(screen.queryByText('owner')).toBeNull();
    expect(screen.queryByText('member')).toBeNull();
  });

  test('a person who reads another language is told their copy will be in it', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    expect(await screen.findByText('on your team, in Hindi')).toBeTruthy();
  });

  test('the ticks start where the account settings put them', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    const owner = await screen.findByRole('checkbox', { name: 'owner@example.test, you' });
    const member = screen.getByRole('checkbox', { name: 'priya@example.test, on your team, in Hindi' });
    expect(owner.props.accessibilityState.checked).toBe(true);
    expect(member.props.accessibilityState.checked).toBe(false);
  });

  test('and it says where the ticks came from, so nobody thinks they changed a setting', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    expect(
      await screen.findByText(
        'The ticks come from your recap settings. Changing them here changes this one email only.',
      ),
    ).toBeTruthy();
  });

  test('you can tick somebody on and off', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    const member = await screen.findByRole('checkbox', { name: 'priya@example.test, on your team, in Hindi' });
    await act(async () => fireEvent.press(member));
    expect(
      screen.getByRole('checkbox', { name: 'priya@example.test, on your team, in Hindi' }).props
        .accessibilityState.checked,
    ).toBe(true);
  });

  test('IT ASKS BEFORE ANYTHING IS SENT, and names everybody', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Send recap' })));
    expect(await screen.findByRole('header', { name: 'Send this recap to 1 person?' })).toBeTruthy();
    expect(screen.getByText('An email cannot be taken back once it has gone.')).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('Cancel goes back and sends nothing', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Send recap' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Cancel' })));
    expect(screen.queryByRole('header', { name: 'Send this recap to 1 person?' })).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('saying yes sends to the ticked people, by id', async () => {
    mockPreview.mockResolvedValue(okPreview());
    mockSend.mockResolvedValue({
      ok: true,
      sent: 1,
      failed: 0,
      outcomes: [{ email: 'owner@example.test', name: 'Sam Carter', language: 'English', translated: false, ok: true }],
    });
    await openDialog();
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Send recap' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send recap' })));
    expect(mockSend).toHaveBeenCalledWith('note-1', [OWNER_ID]);
  });

  test('the success message names who got it and in which language', async () => {
    mockPreview.mockResolvedValue(okPreview());
    mockSend.mockResolvedValue({
      ok: true,
      sent: 2,
      failed: 0,
      outcomes: [
        { email: 'owner@example.test', name: 'Sam Carter', language: 'English', translated: false, ok: true },
        { email: 'priya@example.test', name: 'Priya Shah', language: 'Hindi', translated: true, ok: true },
      ],
    });
    await openDialog();
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Send recap' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send recap' })));
    expect(await screen.findByText('Recap sent to 2 people.')).toBeTruthy();
    expect(screen.getByText('Sent in English')).toBeTruthy();
    expect(screen.getByText('Sent in Hindi, translated by AI')).toBeTruthy();
  });

  test('a failed send says so, and says nothing was sent', async () => {
    mockPreview.mockResolvedValue(okPreview());
    mockSend.mockResolvedValue({ ok: false, message: MESSAGES.problem });
    await openDialog();
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Send recap' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send recap' })));
    expect(await screen.findByText(MESSAGES.problem)).toBeTruthy();
    expect(screen.getByText('Nothing was sent. You can try again.')).toBeTruthy();
  });

  test('one person failing is named, so it is clear who to try again', async () => {
    mockPreview.mockResolvedValue(okPreview());
    mockSend.mockResolvedValue({
      ok: true,
      sent: 1,
      failed: 1,
      outcomes: [
        { email: 'owner@example.test', name: 'Sam Carter', language: 'English', translated: false, ok: true },
        { email: 'priya@example.test', name: 'Priya Shah', language: 'Hindi', translated: true, ok: false },
      ],
    });
    await openDialog();
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Send recap' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send recap' })));
    expect(await screen.findByText('Did not go. Try this one again.')).toBeTruthy();
  });

  test('WHEN EMAIL IS NOT SET UP it says so, and never claims a send failed', async () => {
    const reason = 'Gyan cannot send emails yet. The email service is not set up on the server.';
    mockPreview.mockResolvedValue(okPreview({ canSend: false, sendProblem: reason }));
    await openDialog();
    expect(await screen.findByText(reason)).toBeTruthy();
    // Nothing was attempted, so nothing may claim it failed to send.
    expect(screen.queryByText(MESSAGES.problem)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send recap' })).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('a problem working out the list offers to try again', async () => {
    mockPreview.mockResolvedValue({ ok: false, message: MESSAGES.loadProblem });
    await openDialog();
    expect(await screen.findByText(MESSAGES.loadProblem)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send recap' })).toBeNull();
  });

  test('with nobody ticked, Send recap cannot be pressed', async () => {
    mockPreview.mockResolvedValue(
      okPreview({ recipients: PEOPLE.map((p) => ({ ...p, defaultOn: false })) }),
    );
    await openDialog();
    const button = await screen.findByRole('button', { name: 'Send recap' });
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  test('it can take you to the settings instead', async () => {
    mockPreview.mockResolvedValue(okPreview());
    await openDialog();
    await act(async () =>
      fireEvent.press(await screen.findByRole('button', { name: 'Change recap settings' })),
    );
    expect(mockOpenSettings).toHaveBeenCalled();
  });
});

describe('the one sentence that says what is set', () => {
  test('it reads as a sentence for every combination', () => {
    expect(stateSentence({ toOwner: true, toMembers: false, autoSend: false })).toBe(
      'Recaps go to the account owner only, only when somebody presses Send recap on a note.',
    );
    expect(stateSentence({ toOwner: true, toMembers: true, autoSend: true })).toBe(
      'Recaps go to the account owner and everyone on the team, as soon as a note is ready.',
    );
    expect(stateSentence({ toOwner: false, toMembers: true, autoSend: true })).toBe(
      'Recaps go to the team, but not the account owner, as soon as a note is ready.',
    );
    expect(stateSentence({ toOwner: false, toMembers: false, autoSend: true })).toContain(
      'Nobody is sent a recap on their own',
    );
  });
});

describe('the Recap emails page', () => {
  test('it opens with what is set, in one plain sentence', async () => {
    mockGetSettings.mockResolvedValue({
      isOwner: true,
      settings: { toOwner: true, toMembers: false, autoSend: false },
    });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    expect(await screen.findByRole('header', { name: 'Recap emails' })).toBeTruthy();
    expect(
      screen.getByText(
        'Recaps go to the account owner only, only when somebody presses Send recap on a note.',
      ),
    ).toBeTruthy();
  });

  test('the switches are grouped by who gets one and when it goes', async () => {
    mockGetSettings.mockResolvedValue({ isOwner: true, settings: { toOwner: true, toMembers: false, autoSend: false } });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    expect(await screen.findByRole('header', { name: 'Who gets a recap' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'When it is sent' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'The account owner' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Everyone on the team' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Send on its own when a note is ready' })).toBeTruthy();
  });

  test('a switch says On or Off in words, not only by colour', async () => {
    mockGetSettings.mockResolvedValue({ isOwner: true, settings: { toOwner: true, toMembers: false, autoSend: false } });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    await screen.findByRole('header', { name: 'Recap emails' });
    expect(screen.getAllByText('On')).toHaveLength(1);
    expect(screen.getAllByText('Off')).toHaveLength(2);
  });

  test('the owner can change a switch, and it saves', async () => {
    mockGetSettings.mockResolvedValue({ isOwner: true, settings: { toOwner: true, toMembers: false, autoSend: false } });
    mockSaveSettings.mockResolvedValue({ toOwner: true, toMembers: true, autoSend: false });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    await act(async () =>
      fireEvent.press(await screen.findByRole('switch', { name: 'Everyone on the team' })),
    );
    expect(mockSaveSettings).toHaveBeenCalledWith({ toOwner: true, toMembers: true, autoSend: false });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  test('the sentence changes as the switches do', async () => {
    mockGetSettings.mockResolvedValue({ isOwner: true, settings: { toOwner: true, toMembers: false, autoSend: false } });
    mockSaveSettings.mockResolvedValue({ toOwner: true, toMembers: false, autoSend: true });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    await act(async () =>
      fireEvent.press(await screen.findByRole('switch', { name: 'Send on its own when a note is ready' })),
    );
    expect(
      await screen.findByText('Recaps go to the account owner only, as soon as a note is ready.'),
    ).toBeTruthy();
  });

  test('ONLY THE ACCOUNT OWNER CAN CHANGE THEM. A member sees why not', async () => {
    mockGetSettings.mockResolvedValue({
      isOwner: false,
      settings: { toOwner: true, toMembers: true, autoSend: true },
    });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    const owner = await screen.findByRole('switch', { name: 'The account owner' });
    expect(owner.props.accessibilityState.disabled).toBe(true);
    for (const name of ['Everyone on the team', 'Send on its own when a note is ready']) {
      expect(screen.getByRole('switch', { name }).props.accessibilityState.disabled).toBe(true);
    }
    expect(screen.getAllByText(MESSAGES.notOwner).length).toBeGreaterThan(0);
  });

  test('a member pressing a switch changes nothing', async () => {
    mockGetSettings.mockResolvedValue({
      isOwner: false,
      settings: { toOwner: true, toMembers: false, autoSend: false },
    });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    await act(async () =>
      fireEvent.press(await screen.findByRole('switch', { name: 'Everyone on the team' })),
    );
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  test('a save that fails puts the switch back and says so', async () => {
    mockGetSettings.mockResolvedValue({ isOwner: true, settings: { toOwner: true, toMembers: false, autoSend: false } });
    mockSaveSettings.mockRejectedValue(new Error(MESSAGES.settingsProblem));
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    await act(async () =>
      fireEvent.press(await screen.findByRole('switch', { name: 'Everyone on the team' })),
    );
    expect(await screen.findByText(MESSAGES.settingsProblem)).toBeTruthy();
    expect(
      screen.getByRole('switch', { name: 'Everyone on the team' }).props.accessibilityState.checked,
    ).toBe(false);
  });

  test('it says a recap can only go to people on the account', async () => {
    mockGetSettings.mockResolvedValue({ isOwner: true, settings: { toOwner: true, toMembers: false, autoSend: false } });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    expect(
      await screen.findByText(
        'A recap can only ever go to people on this account. Gyan never emails an address typed in by hand.',
      ),
    ).toBeTruthy();
  });

  test('a page that will not load offers to try again, and says nothing changed', async () => {
    mockGetSettings.mockRejectedValue(new Error('offline'));
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    expect(await screen.findByRole('header', { name: 'Gyan could not open your settings' })).toBeTruthy();
    expect(screen.getByText('This usually means the connection dropped. Nothing has changed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  test('there is a way back to Settings', async () => {
    mockGetSettings.mockResolvedValue({ isOwner: true, settings: { toOwner: true, toMembers: false, autoSend: false } });
    await act(async () => {
      render(<RecapEmailsScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByLabelText('Back to Settings')));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });
});
