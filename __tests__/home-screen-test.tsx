import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(app)/index';

const mockSignOut = jest.fn();
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { email: 'fake.person@example.com' } }, signOut: mockSignOut }),
}));

describe('<HomeScreen />', () => {
  beforeEach(() => mockSignOut.mockReset());

  test('shows who is logged in', async () => {
    mockSignOut.mockResolvedValue({});
    await render(<HomeScreen />);
    expect(screen.getByText('fake.person@example.com')).toBeTruthy();
  });

  test('Log out calls sign out', async () => {
    mockSignOut.mockResolvedValue({});
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByText('Log out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  test('shows a friendly message when log out fails', async () => {
    mockSignOut.mockResolvedValue({ error: 'Something went wrong. Please try again.' });
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByText('Log out'));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeTruthy();
  });
});
