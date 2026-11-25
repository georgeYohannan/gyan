import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Colors, Radius, WideBreakpoint } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';

/** How wide a panel is when it comes in from the side of a wide window. */
const SIDE_WIDTH = 420;

type SlidePanelProps = {
  visible: boolean;
  onClose: () => void;
  /** What a screen reader calls this panel, and what the backdrop says it closes. */
  label: string;
  /** A stable name for the backdrop, so a test can close a panel without knowing its words. */
  testIDPrefix: string;
  children: ReactNode;
};

/**
 * Something that comes in over the page: up from the bottom of a phone, in from the right of
 * a wide window.
 *
 * Every panel in Gyan behaves this way -- the help, the filters, the language list, the recap
 * dialog, the confirmations -- and each of them grew its own copy of these forty lines. They
 * agreed on everything that matters and drifted on everything that did not. This is the one
 * copy. **The five older panels have not been moved onto it yet**: they are heavily tested and
 * late in a large round is the wrong time to re-lay five working panels, so that is written
 * down in docs/decisions.md as work still to do rather than quietly left.
 *
 * It owns the way in and the way out, and nothing else. What goes inside -- a scrolling list,
 * a form, a row of buttons -- is the caller's business.
 */
export function SlidePanel({ visible, onClose, label, testIDPrefix, children }: SlidePanelProps) {
  const { width, height } = useWindowDimensions();
  const { reveal } = useMotion();
  const side = Platform.OS === 'web' && width >= WideBreakpoint;

  // `mounted` keeps the panel on screen while it slides away.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, reveal));
      return;
    }
    progress.set(withTiming(0, reveal));
    const t = setTimeout(() => setMounted(false), reveal.duration);
    return () => clearTimeout(t);
  }, [visible, reveal, progress]);

  // On the web, the Escape key closes it.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: side
      ? [{ translateX: (1 - progress.value) * SIDE_WIDTH }]
      : [{ translateY: (1 - progress.value) * height * 0.5 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={{
          flex: 1,
          justifyContent: side ? 'flex-start' : 'flex-end',
          alignItems: side ? 'flex-end' : 'stretch',
        }}>
        <Animated.View
          style={[
            { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
            backdropStyle,
          ]}>
          <Pressable
            testID={`${testIDPrefix}-backdrop`}
            accessibilityLabel={`Close ${label}`}
            style={{ flex: 1 }}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          style={[
            {
              backgroundColor: Colors.backgroundElement,
              borderColor: Colors.glassBorder,
              borderWidth: 1,
              overflow: 'hidden',
            },
            side
              ? { width: SIDE_WIDTH, height: '100%', borderTopLeftRadius: Radius.panel, borderBottomLeftRadius: Radius.panel }
              : { maxHeight: '88%', borderTopLeftRadius: Radius.panel, borderTopRightRadius: Radius.panel },
            panelStyle,
          ]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
