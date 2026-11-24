import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { HelpButton } from '@/components/help/help-button';
import { ChatBody } from '@/components/notes/chat-body';
import { Body } from '@/components/ui/body';
import { Heading } from '@/components/ui/heading';
import { Colors, MinTouchTarget, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
import { type ChatSource } from '@/lib/chat';

type ChatPanelProps = {
  meetingId: string;
  visible: boolean;
  onClose: () => void;
  /** Called when somebody taps a passage number. The note screen jumps to that line. */
  onJump: (source: ChatSource) => void;
};

const SIDE_WIDTH = 420;

/**
 * The side chat in a panel. On a wide web window it floats in from the right. On a phone (or a
 * narrow window) it slides up from the bottom.
 *
 * Everything the chat DOES lives in `chat-body.tsx`. This file is only the way in and the way
 * out: the panel, the backdrop, the slide, the Escape key and the Close button. The note page
 * shows the same `ChatBody` as a tab, with no panel around it at all.
 */
export function ChatPanel({ meetingId, visible, onClose, onJump }: ChatPanelProps) {
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

  // On the web, the Escape key closes the panel.
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
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.55 }));

  if (!mounted) return null;

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.two,
        padding: Spacing.three,
        borderBottomWidth: 1,
        borderBottomColor: Colors.glassBorder,
      }}>
      <Heading level={3}>Ask about this note</Heading>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <HelpButton helpId="noteChat" />
        <Pressable
          accessibilityRole="button"
          testID="chat-close"
          accessibilityLabel="Close chat"
          onPress={onClose}
          style={{ minHeight: MinTouchTarget, minWidth: MinTouchTarget, alignItems: 'center', justifyContent: 'center' }}>
          <Body color="link">Close</Body>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: side ? 'flex-start' : 'flex-end', alignItems: side ? 'flex-end' : 'stretch' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000' }, backdropStyle]}>
          <Pressable
            testID="chat-backdrop"
            accessibilityLabel="Close chat"
            style={{ flex: 1 }}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="Ask about this note"
          style={[
            { backgroundColor: Colors.backgroundElement, borderColor: Colors.glassBorder, borderWidth: 1, overflow: 'hidden' },
            side
              ? { width: SIDE_WIDTH, height: '100%', borderTopLeftRadius: Radius.panel, borderBottomLeftRadius: Radius.panel }
              : { maxHeight: '88%', borderTopLeftRadius: Radius.panel, borderTopRightRadius: Radius.panel },
            panelStyle,
          ]}>
          <ChatBody meetingId={meetingId} active={visible} onJump={onJump} header={header} />
        </Animated.View>
      </View>
    </Modal>
  );
}
