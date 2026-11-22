import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

function Shows({ value }: { value: string }) {
  const settled = useDebouncedValue(value);
  return <Text>settled:{settled}</Text>;
}

describe('waiting until the typing stops', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('the value a screen opens with is shown at once', async () => {
    // Otherwise opening a link that already carries a search shows an empty list for a moment.
    await render(<Shows value="pricing" />);
    expect(screen.getByText('settled:pricing')).toBeTruthy();
  });

  test('a change waits 300 milliseconds', async () => {
    await render(<Shows value="p" />);
    await act(async () => {
      screen.rerender(<Shows value="pricing" />);
    });
    expect(screen.getByText('settled:p')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(screen.getByText('settled:p')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText('settled:pricing')).toBeTruthy();
  });

  test('typing seven letters causes one change, not seven', async () => {
    await render(<Shows value="" />);
    for (const word of ['p', 'pr', 'pri', 'pric', 'prici', 'pricin', 'pricing']) {
      await act(async () => {
        screen.rerender(<Shows value={word} />);
        jest.advanceTimersByTime(50);
      });
    }
    // Still nothing settled: every letter arrived inside the wait.
    expect(screen.getByText('settled:')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText('settled:pricing')).toBeTruthy();
  });

  test('a value that goes away comes through too, so clearing the box clears the search', async () => {
    await render(<Shows value="pricing" />);
    await act(async () => {
      screen.rerender(<Shows value="" />);
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText('settled:')).toBeTruthy();
  });
});
