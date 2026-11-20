/**
 * The Team screen.
 *
 * The rule under test, over and over: A MEMBER CAN SEE THE TEAM BUT CANNOT CHANGE IT, and the
 * seat limit comes from the plans table rather than from any number in the app.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import TeamScreen from '@/app/(app)/settings/team';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
}));

const mockListTeam = jest.fn();
const mockInvite = jest.fn();
const mockRevoke = jest.fn();
const mockMakeOwner = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/lib/team', () => ({
  ...jest.requireActual('@/lib/team'),
  listTeam: (...a: unknown[]) => mockListTeam(...a),
  inviteByEmail: (...a: unknown[]) => mockInvite(...a),
  revokeInvite: (...a: unknown[]) => mockRevoke(...a),
  makeOwner: (...a: unknown[]) => mockMakeOwner(...a),
  removeMember: (...a: unknown[]) => mockRemove(...a),
}));

const owner = { userId: 'u1', email: 'sam@example.test', name: 'Sam Carter', role: 'owner' as const, isYou: true };
const mate = { userId: 'u2', email: 'ada@example.test', name: 'Ada Blake', role: 'member' as const, isYou: false };

const team = (over: Record<string, unknown> = {}) => ({
  accountId: 'a1',
  isOwner: true,
  seatsIncluded: 5,
  seatsUsed: 2,
  members: [owner, mate],
  invites: [],
  ...over,
});

beforeEach(() => {
  mockPush.mockReset();
  mockListTeam.mockReset().mockResolvedValue(team());
  mockInvite.mockReset().mockResolvedValue({ ok: true, email: 'new@example.test' });
  mockRevoke.mockReset().mockResolvedValue(undefined);
  mockMakeOwner.mockReset().mockResolvedValue(undefined);
  mockRemove.mockReset().mockResolvedValue(undefined);
});

describe('what the team looks like', () => {
  test('the seats and the people come from the server, not from the app', async () => {
    await act(async () => {
      render(<TeamScreen />);
    });
    expect(await screen.findByText('2 of 5 seats')).toBeTruthy();
    expect(screen.getByText('Sam Carter (you)')).toBeTruthy();
    expect(screen.getByText('ada@example.test')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('Member')).toBeTruthy();
  });

  test('one seat reads as a seat, not as seats', async () => {
    mockListTeam.mockResolvedValue(team({ seatsIncluded: 1, seatsUsed: 1, members: [owner] }));
    await act(async () => {
      render(<TeamScreen />);
    });
    expect(await screen.findByText('1 of 1 seat')).toBeTruthy();
  });

  test('a waiting invite is shown, and says it is holding a seat', async () => {
    mockListTeam.mockResolvedValue(
      team({ invites: [{ id: 'i1', email: 'waiting@example.test', createdAt: '2026-11-19' }] }),
    );
    await act(async () => {
      render(<TeamScreen />);
    });
    expect(await screen.findByText('waiting@example.test')).toBeTruthy();
    expect(screen.getByText(/This is holding a seat/)).toBeTruthy();
  });
});

describe('inviting', () => {
  test('an invite goes out and says who it went to', async () => {
    await act(async () => {
      render(<TeamScreen />);
    });
    await act(async () => fireEvent.changeText(screen.getByLabelText('Email address'), 'new@example.test'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send invite' })));

    expect(mockInvite).toHaveBeenCalledWith('new@example.test');
    expect(await screen.findByText('Invite sent to new@example.test.')).toBeTruthy();
  });

  test('something that is not an address never reaches the server', async () => {
    await act(async () => {
      render(<TeamScreen />);
    });
    await act(async () => fireEvent.changeText(screen.getByLabelText('Email address'), 'not-an-address'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send invite' })));

    expect(mockInvite).not.toHaveBeenCalled();
    expect(screen.getByText('That does not look like an email address. Check it and try again.')).toBeTruthy();
  });

  test('a refusal from the server is shown in its own words', async () => {
    mockInvite.mockResolvedValue({ ok: false, message: 'That person is already on your account.' });
    await act(async () => {
      render(<TeamScreen />);
    });
    await act(async () => fireEvent.changeText(screen.getByLabelText('Email address'), 'ada@example.test'));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Send invite' })));
    expect(await screen.findByText('That person is already on your account.')).toBeTruthy();
  });

  test('WHEN THE SEATS ARE FULL THE INVITE IS BLOCKED, with the number from the plan', async () => {
    mockListTeam.mockResolvedValue(team({ seatsIncluded: 2, seatsUsed: 2 }));
    await act(async () => {
      render(<TeamScreen />);
    });

    expect(
      await screen.findByText('All 2 seats are taken. Remove somebody, or change your plan, to invite another person.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send invite' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Email address').props.editable).toBe(false);
  });

  test('a waiting invite fills the last seat, so a second one is blocked', async () => {
    mockListTeam.mockResolvedValue(
      team({
        seatsIncluded: 3,
        seatsUsed: 3,
        invites: [{ id: 'i1', email: 'waiting@example.test', createdAt: '2026-11-19' }],
      }),
    );
    await act(async () => {
      render(<TeamScreen />);
    });
    expect(await screen.findByText(/All 3 seats are taken/)).toBeTruthy();
  });
});

describe('A MEMBER CAN LOOK BUT NOT TOUCH', () => {
  test('a member sees the team, with every control off and the reason given', async () => {
    mockListTeam.mockResolvedValue(team({ isOwner: false, members: [{ ...owner, isYou: false }, { ...mate, isYou: true }] }));
    await act(async () => {
      render(<TeamScreen />);
    });

    // They can still see who they share an account with. That is the point of the page.
    expect(await screen.findByText('Sam Carter')).toBeTruthy();
    expect(screen.getByText('Ada Blake (you)')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Send invite' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Email address').props.editable).toBe(false);
    expect(screen.getAllByText('Only the account owner can change the team.').length).toBeGreaterThan(0);
  });

  test('a member is offered no way to remove or promote anybody', async () => {
    mockListTeam.mockResolvedValue(team({ isOwner: false, members: [{ ...owner, isYou: false }, { ...mate, isYou: true }] }));
    await act(async () => {
      render(<TeamScreen />);
    });
    await screen.findByText('Sam Carter');

    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make owner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take back' })).toBeNull();
  });

  test('a member never gets the chance to call the doors that would refuse them', async () => {
    mockListTeam.mockResolvedValue(
      team({ isOwner: false, members: [{ ...owner, isYou: false }, { ...mate, isYou: true }] }),
    );
    await act(async () => {
      render(<TeamScreen />);
    });
    await screen.findByText('Sam Carter');
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockMakeOwner).not.toHaveBeenCalled();
    expect(mockInvite).not.toHaveBeenCalled();
  });
});

describe('changing the team', () => {
  test('removing somebody asks first, and says what happens to their notes', async () => {
    await act(async () => {
      render(<TeamScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Remove' })));

    expect(await screen.findByText('Ada Blake will lose their way into this account straight away.')).toBeTruthy();
    expect(screen.getByText('•  The notes they made stay here, with you.')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Remove them' })));
    expect(mockRemove).toHaveBeenCalledWith('u2');
  });

  test('cancelling the question changes nothing', async () => {
    await act(async () => {
      render(<TeamScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Remove' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Cancel' })));
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test('HANDING THE ACCOUNT OVER SAYS YOU STOP BEING THE OWNER', async () => {
    await act(async () => {
      render(<TeamScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Make owner' })));

    expect(
      await screen.findByText('Ada Blake becomes the owner, and you become an ordinary member.'),
    ).toBeTruthy();
    expect(screen.getByText('•  They can invite and remove people, including you.')).toBeTruthy();
    expect(screen.getByText('•  You cannot undo this on your own. They would have to hand it back.')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Hand it over' })));
    expect(mockMakeOwner).toHaveBeenCalledWith('u2');
  });

  test('taking an invite back asks, and says the seat comes free', async () => {
    mockListTeam.mockResolvedValue(
      team({ invites: [{ id: 'i1', email: 'waiting@example.test', createdAt: '2026-11-19' }] }),
    );
    await act(async () => {
      render(<TeamScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Take back' })));
    expect(await screen.findByText(/the seat it is holding is free again/)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Take it back' })));
    expect(mockRevoke).toHaveBeenCalledWith('i1');
  });

  test('a refusal from the database is shown, and the question stays open', async () => {
    mockRemove.mockRejectedValue(new Error('You cannot remove the account owner.'));
    await act(async () => {
      render(<TeamScreen />);
    });
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Remove' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Remove them' })));
    expect(await screen.findByText('You cannot remove the account owner.')).toBeTruthy();
  });

  test('a team that will not load offers a way to try again', async () => {
    mockListTeam.mockRejectedValue(new Error('no'));
    await act(async () => {
      render(<TeamScreen />);
    });
    expect(await screen.findByText('Gyan could not read your team')).toBeTruthy();

    mockListTeam.mockResolvedValue(team());
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Try again' })));
    expect(await screen.findByText('2 of 5 seats')).toBeTruthy();
  });
});
