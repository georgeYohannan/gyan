import { Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

/**
 * The little square that is either ticked or not.
 *
 * It is only the picture. Whatever wraps it owns the pressing and the accessibility, because the
 * whole row should be the target, not a 24 point square. The to-do list and the Send recap
 * dialog both use this, so a tick looks the same wherever it appears.
 */
export function TickBox({ checked, nudgeDown = false }: { checked: boolean; nudgeDown?: boolean }) {
  return (
    <View
      // The box itself is 24 wide, but it sits in a 44 high row, so the whole row is the target.
      style={{
        width: 24,
        height: 24,
        marginTop: nudgeDown ? Spacing.two : 0,
        borderRadius: Radius.panel / 4,
        borderWidth: 1,
        borderColor: checked ? Colors.successFill : Colors.glassBorder,
        backgroundColor: checked ? Colors.successFill : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {checked ? (
        // The tick mark is drawn in the device's own font, because IBM Plex Sans makes it look
        // like a letter V. The color still comes from the theme.
        <Text style={{ color: Colors.success, fontSize: 16, lineHeight: 20, fontWeight: '700' }}>{'✓'}</Text>
      ) : null}
    </View>
  );
}
