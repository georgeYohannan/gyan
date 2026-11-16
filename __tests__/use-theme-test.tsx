import { renderHook } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

describe('useTheme', () => {
  test('always returns the dark navy palette', async () => {
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toBe(Colors);
    expect(result.current.background).toBe('#0B1220');
  });
});
