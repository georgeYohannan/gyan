import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ConsentGate } from '@/components/auth/consent-gate';

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'fake-user-1' } } }),
}));

beforeEach(() => AsyncStorage.clear());

describe('ConsentGate', () => {
  test('shows the consent note first, then the app after "I understand"', async () => {
    await render(
      <ConsentGate>
        <Text>The app</Text>
      </ConsentGate>,
    );
    expect(await screen.findByText(/Always tell everyone/)).toBeTruthy();
    expect(screen.queryByText('The app')).toBeNull();

    await fireEvent.press(screen.getByText('I understand'));
    expect(await screen.findByText('The app')).toBeTruthy();
    expect(await AsyncStorage.getItem('gyan.consent.v1.fake-user-1')).toBe('yes');
  });

  test('does not show the note again once accepted', async () => {
    await AsyncStorage.setItem('gyan.consent.v1.fake-user-1', 'yes');
    await render(
      <ConsentGate>
        <Text>The app</Text>
      </ConsentGate>,
    );
    expect(await screen.findByText('The app')).toBeTruthy();
    expect(screen.queryByText(/Always tell everyone/)).toBeNull();
  });
});
