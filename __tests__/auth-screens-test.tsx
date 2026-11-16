import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LogInScreen from '@/app/(auth)/log-in';
import SignUpScreen from '@/app/(auth)/sign-up';

const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ signUp: mockSignUp, signIn: mockSignIn }),
}));
// Links need a navigator. Tests only need to see the words.
jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return { Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});

beforeEach(() => {
  mockSignUp.mockReset();
  mockSignIn.mockReset();
});

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

describe('Sign up screen', () => {
  test('has a help button and the words people expect', async () => {
    await render(<SignUpScreen />);
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
    expect(screen.getByText('Create your account')).toBeTruthy();
    expect(screen.getByText('Log in')).toBeTruthy();
  });

  test('does not call the server with a bad email or short password', async () => {
    await render(<SignUpScreen />);
    await fill('not-an-email', 'short');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByText(/Enter your email/)).toBeTruthy();
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  test('tells the person to check their email when confirmation is on', async () => {
    mockSignUp.mockResolvedValue({ needsConfirmation: true });
    await render(<SignUpScreen />);
    await fill('fake.person@example.com', 'a-long-fake-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign up' }));
    expect(mockSignUp).toHaveBeenCalledWith('fake.person@example.com', 'a-long-fake-password');
    expect(await screen.findByText(/We sent a link to your email/)).toBeTruthy();
  });

  test('shows a friendly error from the server', async () => {
    mockSignUp.mockResolvedValue({ error: 'That email already has an account. Try logging in instead.' });
    await render(<SignUpScreen />);
    await fill('fake.person@example.com', 'a-long-fake-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByText(/already has an account/)).toBeTruthy();
  });
});

describe('Log in screen', () => {
  test('has a help button', async () => {
    await render(<LogInScreen />);
    expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
    expect(screen.getByText('Welcome back')).toBeTruthy();
  });

  test('logs in with the email and password', async () => {
    mockSignIn.mockResolvedValue({});
    await render(<LogInScreen />);
    await fill('fake.person@example.com', 'a-long-fake-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('fake.person@example.com', 'a-long-fake-password'));
  });

  test('asks for a password when it is empty', async () => {
    await render(<LogInScreen />);
    await fill('fake.person@example.com', '');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('shows wrong password in plain words', async () => {
    mockSignIn.mockResolvedValue({ error: 'That email and password do not match. Check them and try again.' });
    await render(<LogInScreen />);
    await fill('fake.person@example.com', 'wrong-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(/do not match/)).toBeTruthy();
  });
});
