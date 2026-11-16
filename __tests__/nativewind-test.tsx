import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('NativeWind', () => {
  test('a className prop is accepted and the element renders', async () => {
    await render(<Text className="text-lg font-bold">Hello Gyan</Text>);
    expect(screen.getByText('Hello Gyan')).toBeTruthy();
  });
});
