import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { TextField } from '@/components/ui/text-field';
import { Colors, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  /** What will happen, in plain words. The person reads this and then decides. */
  message: string;
  /** Extra lines under the message: exactly what goes, one per line. */
  details?: string[];
  /** What the button that does it says. Says the thing, never "OK". */
  confirmLabel: string;
  /** When set, the person must type this word before the button works. */
  typeToConfirm?: string;
  /** One short sentence telling them what to type. */
  typeHint?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const SIDE_WIDTH = 420;

/**
 * Asks before something that cannot be undone.
 *
 * It is deliberately a little awkward to get through. The thing it is about is named in the
 * button ("Delete this note", not "OK"), what will go is listed out, and the heaviest actions
 * make you type a word first, so nobody deletes a year of notes with a stray tap.
 *
 * It opens the same way the help, the chat and the language list do: up from the bottom of a
 * phone, in from the right of a wide window.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  details,
  confirmLabel,
  typeToConfirm,
  typeHint,
  busy,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { width, height } = useWindowDimensions();
  const { reveal } = useMotion();
  const side = Platform.OS === 'web' && width >= WideBreakpoint;

  const [typed, setTyped] = useState('');
  // `mounted` keeps the panel on screen while it slides away.
  const [mounted, setMounted] = useState(visible);
  const [wasVisible, setWasVisible] = useState(visible);
  const progress = useSharedValue(0);

  if (visible && !mounted) setMounted(true);

  // Start from empty every time it opens, so a word typed and then cancelled never counts.
  // Done here rather than in an effect, because it is state that follows a prop, and React
  // would otherwise draw the old word for one frame before clearing it.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setTyped('');
  }

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, reveal));
      return;
    }
    progress.set(withTiming(0, reveal));
    const t = setTimeout(() => setMounted(false), reveal.duration);
    return () => clearTimeout(t);
  }, [visible, reveal, progress]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onCancel]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: side
      ? [{ translateX: (1 - progress.value) * SIDE_WIDTH }]
      : [{ translateY: (1 - progress.value) * height * 0.5 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!mounted) return null;

  const ready = !typeToConfirm || typed.trim() === typeToConfirm;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onCancel} statusBarTranslucent>
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
          <Pressable accessibilityLabel={`Close ${title}`} style={{ flex: 1 }} onPress={onCancel} />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={title}
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
          <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }}>
            <Heading level={3}>{title}</Heading>

            <Body>{message}</Body>

            {details && details.length > 0 ? (
              <View style={{ gap: Spacing.one }}>
                {details.map((line) => (
                  <Body key={line} small color="textSecondary">
                    {`•  ${line}`}
                  </Body>
                ))}
              </View>
            ) : null}

            {typeToConfirm ? (
              <TextField
                label={typeHint ?? `Type ${typeToConfirm} to confirm`}
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={typeToConfirm}
                editable={!busy}
              />
            ) : null}

            {error ? (
              <Body small color="danger" accessibilityRole="alert">
                {error}
              </Body>
            ) : null}

            <View style={{ gap: Spacing.two }}>
              <Button
                label={confirmLabel}
                variant="secondary"
                loading={busy}
                disabled={!ready || busy}
                onPress={onConfirm}
              />
              <Button label="Cancel" variant="secondary" disabled={busy} onPress={onCancel} />
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
