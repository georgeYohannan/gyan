/**
 * The Settings hub, Profile, and Plan and usage.
 *
 * Two rules get their own tests here, because they are the ones that would be expensive to get
 * wrong: NO LIMIT IS EVER WRITTEN IN THE APP, and THE TEST-ONLY PLAN SWITCH DOES NOT EXIST
 * unless this build was told to show it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import DataPrivacyScreen from '@/app/(app)/settings/data';
import SettingsScreen from '@/app/(app)/settings/index';
import PlanScreen from '@/app/(app)/settings/plan';
import ProfileScreen from '@/app/(app)/settings/profile';

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
const mockChangePassword = jest.fn(async () => ({}));
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1', email: 'sam@example.test' } },
    signOut: mockSignOut,
    changePassword: mockChangePassword,
  }),
}));

const mockSetLanguage = jest.fn(async () => ({}));
const mockSetDisplayName = jest.fn(async () => ({}));
let mockName = 'Sam Carter';
jest.mock('@/lib/profile', () => ({
  ...jest.requireActual('@/lib/profile'),
  useProfile: () => ({
    languageCode: 'en',
    language: jest.requireActual('@/constants/languages').languageFor('en'),
    displayName: mockName,
    isLoading: false,
    setLanguage: mockSetLanguage,
    setDisplayName: mockSetDisplayName,
  }),
}));

const mockGetPlan = jest.fn();
const mockSetTestPlan = jest.fn();
const mockListSwitchable = jest.fn();
jest.mock('@/lib/plans', () => ({
  ...jest.requireActual('@/lib/plans'),
  getPlanAndUsage: (...a: unknown[]) => mockGetPlan(...a),
  setTestPlan: (...a: unknown[]) => mockSetTestPlan(...a),
  listSwitchablePlans: (...a: unknown[]) => mockListSwitchable(...a),
}));

const mockListTeam = jest.fn();
jest.mock('@/lib/team', () => ({
  ...jest.requireActual('@/lib/team'),
  listTeam: (...a: unknown[]) => mockListTeam(...a),
}));

const mockGetRecapSettings = jest.fn();
jest.mock('@/lib/recaps', () => ({
  ...jest.requireActual('@/lib/recaps'),
  getRecapSettings: (...a: unknown[]) => mockGetRecapSettings(...a),
}));

const mockListNotes = jest.fn();
jest.mock('@/lib/notes', () => ({
  ...jest.requireActual('@/lib/notes'),
  listNotes: (...a: unknown[]) => mockListNotes(...a),
}));

const mockCanDelete = jest.fn();
jest.mock('@/lib/account', () => ({
  ...jest.requireActual('@/lib/account'),
  canDeleteAccount: (...a: unknown[]) => mockCanDelete(...a),
}));

/** A Free plan the way the server sends it: every number from the table, words included. */
const freePlan = (over: Record<string, unknown> = {}) => ({
  accountId: 'a1',
  isOwner: true,
  planName: 'Free',
  planDescription: 'For one person getting started.',
  features: ['5 meetings a month', '20 chat questions a day'],
  isTestPlan: false,
  meetingsPerMonth: 5,
  meetingsUsed: 2,
  chatMessagesPerDay: 20,
  chatMessagesUsed: 4,
  seatsIncluded: 1,
  seatsUsed: 1,
  maxMeetingMinutes: undefined,
  ...over,
});

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockSignOut.mockReset().mockResolvedValue({});
  mockChangePassword.mockReset().mockResolvedValue({});
  mockSetLanguage.mockReset().mockResolvedValue({});
  mockSetDisplayName.mockReset().mockResolvedValue({});
  mockGetPlan.mockReset().mockResolvedValue(freePlan());
  mockSetTestPlan.mockReset().mockResolvedValue('Pro');
  mockListSwitchable.mockReset().mockResolvedValue([
    { name: 'Free', isTest: false },
    { name: 'Pro', isTest: true },
  ]);
  mockListTeam.mockReset().mockResolvedValue({
    accountId: 'a1',
    isOwner: true,
    seatsIncluded: 5,
    seatsUsed: 3,
    members: [],
    invites: [],
  });
  mockGetRecapSettings
    .mockReset()
    .mockResolvedValue({ isOwner: true, settings: { toOwner: true, toMembers: false, autoSend: false } });
  mockListNotes.mockReset().mockResolvedValue([]);
  mockCanDelete.mockReset().mockResolvedValue({
    isOwner: true,
    canDelete: true,
    whatGoes: 'Everything goes.',
    noteCount: 0,
    otherMemberCount: 0,
    pendingInviteCount: 0,
  });
  mockName = 'Sam Carter';
  delete process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS;
});

describe('the Settings list', () => {
  test('every section says what is set, so you often do not have to open it', async () => {
    await act(async () => {
      render(<SettingsScreen />);
    });

    expect(await screen.findByText(/Sam Carter\. Gyan writes in English\./)).toBeTruthy();
    expect(await screen.findByText('Free plan. 2 of 5 meetings used this month.')).toBeTruthy();
    expect(await screen.findByText('3 of 5 seats')).toBeTruthy();
    expect(await screen.findByText('The account owner only')).toBeTruthy();
  });

  test('a summary that will not load still leaves a working way in', async () => {
    mockGetPlan.mockRejectedValue(new Error('no'));
    mockListTeam.mockRejectedValue(new Error('no'));
    mockGetRecapSettings.mockRejectedValue(new Error('no'));

    await act(async () => {
      render(<SettingsScreen />);
    });

    expect(await screen.findByText('Your plan, and how much of it you have used.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText(/^Team\./)));
    expect(mockPush).toHaveBeenCalledWith('/settings/team');
  });

  test('somebody with no name set is called by the front of their address', async () => {
    mockName = '';
    await act(async () => {
      render(<SettingsScreen />);
    });
    expect(await screen.findByText(/^sam\./)).toBeTruthy();
  });

  test('Log out signs out, and says so plainly when it cannot', async () => {
    mockSignOut.mockResolvedValue({ error: 'We could not reach the internet.' });
    await act(async () => {
      render(<SettingsScreen />);
    });
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Log out' })));
    expect(mockSignOut).toHaveBeenCalled();
    expect(await screen.findByText('We could not reach the internet.')).toBeTruthy();
  });
});

describe('Profile', () => {
  test('shows the email, and says it cannot be changed here', async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    expect(screen.getByText('sam@example.test')).toBeTruthy();
    expect(screen.getByText(/This is how you sign in/)).toBeTruthy();
  });

  test('saving a name only offers itself once the name has really changed', async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    const save = screen.getByRole('button', { name: 'Save name' });
    expect(save.props.accessibilityState.disabled).toBe(true);

    await act(async () => fireEvent.changeText(screen.getByLabelText('Name'), 'Sam C'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Save name' })));
    expect(mockSetDisplayName).toHaveBeenCalledWith('Sam C');
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  test('a name that will not save says so, and does not claim it worked', async () => {
    mockSetDisplayName.mockResolvedValue({ error: 'Gyan could not save your name.' });
    await act(async () => {
      render(<ProfileScreen />);
    });
    await act(async () => fireEvent.changeText(screen.getByLabelText('Name'), 'Sam C'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Save name' })));
    expect(await screen.findByText('Gyan could not save your name.')).toBeTruthy();
    expect(screen.queryByText('Saved')).toBeNull();
  });

  test('the language picker is here, and changing it saves', async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    expect(screen.getByText('English')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Change language' })));
    await act(async () => fireEvent.press(await screen.findByLabelText(/Español/)));
    expect(mockSetLanguage).toHaveBeenCalledWith('es');
  });

  test('it says the picker is also on a note, so nobody thinks this is the only way', async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    expect(screen.getByText(/also change this from any note/)).toBeTruthy();
  });

  test('TWO PASSWORDS THAT DO NOT MATCH ARE NEVER SENT', async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    await act(async () => fireEvent.changeText(screen.getByLabelText('New password'), 'longenough1'));
    await act(async () => fireEvent.changeText(screen.getByLabelText('New password again'), 'different1'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Change password' })));

    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(screen.getByText('Those two passwords are not the same. Check them and try again.')).toBeTruthy();
  });

  test('a password that is too short is refused before the server is asked', async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    await act(async () => fireEvent.changeText(screen.getByLabelText('New password'), 'short'));
    await act(async () => fireEvent.changeText(screen.getByLabelText('New password again'), 'short'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Change password' })));

    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
  });

  test('a new password is sent, and then wiped off the screen', async () => {
    await act(async () => {
      render(<ProfileScreen />);
    });
    await act(async () => fireEvent.changeText(screen.getByLabelText('New password'), 'longenough1'));
    await act(async () => fireEvent.changeText(screen.getByLabelText('New password again'), 'longenough1'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Change password' })));

    expect(mockChangePassword).toHaveBeenCalledWith('longenough1');
    expect(await screen.findByText('Your password is changed.')).toBeTruthy();
    expect(screen.getByLabelText('New password').props.value).toBe('');
    expect(screen.getByLabelText('New password again').props.value).toBe('');
  });
});

describe('Plan and usage', () => {
  test('every number on the screen comes from the plan, not from the app', async () => {
    mockGetPlan.mockResolvedValue(
      freePlan({ planName: 'Pro', meetingsPerMonth: 50, meetingsUsed: 7, chatMessagesPerDay: 200, chatMessagesUsed: 9 }),
    );
    await act(async () => {
      render(<PlanScreen />);
    });

    expect(await screen.findByText('7 of 50')).toBeTruthy();
    expect(screen.getByText('9 of 200')).toBeTruthy();
    expect(screen.getByText('43 left. They start again on the 1st.')).toBeTruthy();
  });

  test('the meter tells a screen reader where things stand', async () => {
    await act(async () => {
      render(<PlanScreen />);
    });
    const meter = await screen.findByRole('progressbar');
    expect(meter.props.accessibilityValue).toEqual({ min: 0, max: 5, now: 2 });
    expect(meter.props.accessibilityLabel).toBe('2 of 5 meetings used');
  });

  test('at the limit it says so, and says what still works', async () => {
    mockGetPlan.mockResolvedValue(freePlan({ meetingsUsed: 5 }));
    await act(async () => {
      render(<PlanScreen />);
    });
    expect(await screen.findByText(/used all your meetings for this month/)).toBeTruthy();
    expect(screen.getByText(/Pasted text still works/)).toBeTruthy();
  });

  test('it says plainly which allowance is shared and which is yours alone', async () => {
    await act(async () => {
      render(<PlanScreen />);
    });
    expect(await screen.findByText(/everybody on it shares these meetings/)).toBeTruthy();
    expect(screen.getByText(/A teammate asking questions\s+does not use up yours\./)).toBeTruthy();
  });

  test('what the plan includes is printed from the table, whatever it says', async () => {
    mockGetPlan.mockResolvedValue(freePlan({ features: ['Nine hundred meetings a month', 'A pony'] }));
    await act(async () => {
      render(<PlanScreen />);
    });
    expect(await screen.findByText('•  Nine hundred meetings a month')).toBeTruthy();
    expect(screen.getByText('•  A pony')).toBeTruthy();
  });

  test('Upgrade is there but says it is not built yet', async () => {
    await act(async () => {
      render(<PlanScreen />);
    });
    const upgrade = await screen.findByRole('button', { name: /Upgrade/ });
    expect(upgrade.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/not built yet/)).toBeTruthy();
  });

  test('a stand-in plan says loudly that its numbers are not real', async () => {
    mockGetPlan.mockResolvedValue(
      freePlan({ planName: 'Pro', isTestPlan: true, planDescription: 'STAND-IN NUMBERS, not for sale.' }),
    );
    await act(async () => {
      render(<PlanScreen />);
    });
    expect(await screen.findByText('These numbers are stand-ins')).toBeTruthy();
    expect(screen.getByText('STAND-IN NUMBERS, not for sale.')).toBeTruthy();
  });

  test('THE TEST PLAN SWITCH IS NOT THERE AT ALL in a normal build', async () => {
    await act(async () => {
      render(<PlanScreen />);
    });
    await screen.findByText('2 of 5');

    expect(screen.queryByText('Switch plan, for testing')).toBeNull();
    expect(screen.queryByText('For builders only')).toBeNull();
    expect(screen.queryByRole('button', { name: /Switch to/ })).toBeNull();
    // And it never even asks which plans it could switch to.
    expect(mockListSwitchable).not.toHaveBeenCalled();
  });

  test.each([['0'], ['true'], ['yes'], ['']])(
    'the switch stays hidden when the setting is %p rather than exactly 1',
    async (value) => {
      process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS = value;
      await act(async () => {
        render(<PlanScreen />);
      });
      await screen.findByText('2 of 5');
      expect(screen.queryByText('Switch plan, for testing')).toBeNull();
    },
  );

  test('with the builders setting on, the switch appears and changes the plan', async () => {
    process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS = '1';
    mockGetPlan
      .mockResolvedValueOnce(freePlan())
      .mockResolvedValue(freePlan({ planName: 'Pro', meetingsPerMonth: 50, isTestPlan: true }));

    await act(async () => {
      render(<PlanScreen />);
    });

    expect(await screen.findByText('Switch plan, for testing')).toBeTruthy();
    expect(screen.getByText('For builders only')).toBeTruthy();
    expect(screen.getByText(/does not exist in the real app/)).toBeTruthy();

    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Switch to Pro' })));
    expect(mockSetTestPlan).toHaveBeenCalledWith('Pro');
    // And the numbers follow the new plan.
    expect(await screen.findByText('2 of 50')).toBeTruthy();
  });

  test('a refused switch says why, in plain words from the server', async () => {
    process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS = '1';
    mockSetTestPlan.mockRejectedValue(new Error('This switch is only for the Gyan team.'));
    await act(async () => {
      render(<PlanScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Switch to Pro' })));
    expect(await screen.findByText('This switch is only for the Gyan team.')).toBeTruthy();
  });

  test('a plan that will not load offers a way to try again', async () => {
    mockGetPlan.mockRejectedValue(new Error('no'));
    await act(async () => {
      render(<PlanScreen />);
    });
    expect(await screen.findByText('Gyan could not read your plan')).toBeTruthy();

    mockGetPlan.mockResolvedValue(freePlan());
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Try again' })));
    expect(await screen.findByText('2 of 5')).toBeTruthy();
  });
});

describe('Data and privacy', () => {
  test('it warns that deleting a note does not give the meeting back', async () => {
    await act(async () => {
      render(<DataPrivacyScreen />);
    });
    expect(await screen.findByText(/does not give you the meeting back this month/)).toBeTruthy();
  });
});
