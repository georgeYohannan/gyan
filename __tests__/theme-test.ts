import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

describe('theme tokens', () => {
  test('light and dark palettes define the same color names', () => {
    expect(Object.keys(Colors.dark).sort()).toEqual(Object.keys(Colors.light).sort());
  });

  test('spacing steps grow in order', () => {
    const steps = Object.values(Spacing);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  test('content width is set', () => {
    expect(MaxContentWidth).toBeGreaterThan(0);
  });
});
