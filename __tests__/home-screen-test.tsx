import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('<HomeScreen /> (starter screen)', () => {
  test('renders without crashing and shows the welcome text', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText(/welcome/i)).toBeTruthy();
  });
});
