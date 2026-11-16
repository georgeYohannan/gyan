import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Colors, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import type { HelpEntry } from '@/content/help';
import { useMotion } from '@/hooks/use-motion';

type HelpPanelProps = { entry: HelpEntry; visible: boolean; onClose: () => void };

const SIDE_WIDTH = 420;

/**
 * The help panel. On a phone (or a narrow web window) it slides up from the bottom.
 * On a wide web window it opens as a panel on the right side.
 */
export function HelpPanel({ entry, visible, onClose }: HelpPanelProps) {
  const { width, height } = useWindowDimensions();
  const { reveal } = useMotion();
  const side = Platform.OS === 'web' && width >= WideBreakpoint;

  // `mounted` keeps the panel on screen while it slides away.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  // Show the panel as soon as it is asked for (set during render, not in an effect).
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
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: side ? 'flex-start' : 'flex-end', alignItems: side ? 'flex-end' : 'stretch' }}>
        <Animated.View style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)' }, backdropStyle]}>
          <Pressable accessibilityLabel="Close help" style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={`Help: ${entry.title}`}
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
            {entry.builderOnly ? (
              <Body small color="link" style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
                For builders only
              </Body>
            ) : null}
            <Heading level={2}>{entry.title}</Heading>
            {entry.sentences.map((s) => (
              <Body key={s}>{s}</Body>
            ))}
            {entry.lists?.map((list) => (
              <View key={list.heading} style={{ gap: Spacing.one }}>
                <Heading level={3}>{list.heading}</Heading>
                {list.items.map((item) => (
                  <Body key={item}>{`\u2022 ${item}`}</Body>
                ))}
              </View>
            ))}
            {entry.images.map((img, i) => (
              <Image
                key={i}
                source={img.source}
                alt={img.alt}
                accessibilityLabel={img.alt}
                contentFit="contain"
                style={{ width: '100%', aspectRatio: 1.6, borderRadius: Radius.panel, backgroundColor: Colors.background }}
              />
            ))}
            <Button label="Close" variant="secondary" onPress={onClose} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
