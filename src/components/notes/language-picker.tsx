import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { HelpButton } from '@/components/help/help-button';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { ScriptText } from '@/components/ui/script-text';
import { LANGUAGES, sameLanguage } from '@/constants/languages';
import { Colors, MinTouchTarget, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';

type LanguagePickerProps = {
  title: string;
  /** One short sentence under the title saying what picking a language will do. */
  hint: string;
  /** The language that is already chosen, shown with a tick. */
  selected: string;
  visible: boolean;
  onPick: (code: string) => void;
  onClose: () => void;
  /** Set while a translation is being fetched, so the list cannot be tapped twice. */
  busyCode?: string;
  /** Adds a "?" button to the header, pointing at this help entry. */
  helpId?: string;
};

const SIDE_WIDTH = 420;

/**
 * Pick a language. On a phone (or a narrow web window) it slides up from the bottom.
 * On a wide web window it opens as a panel on the right side, like the help and the chat.
 *
 * Each language shows its own name first, in its own letters, so somebody who does not read
 * English can still find theirs.
 */
export function LanguagePicker({
  title,
  hint,
  selected,
  visible,
  onPick,
  onClose,
  busyCode,
  helpId,
}: LanguagePickerProps) {
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
          <Pressable accessibilityLabel="Close the language list" style={{ flex: 1 }} onPress={onClose} />
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
          <View style={{ padding: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.two, borderBottomWidth: 1, borderBottomColor: Colors.glassBorder }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }}>
              <Heading level={3}>{title}</Heading>
              {helpId ? <HelpButton helpId={helpId} /> : null}
            </View>
            <Body small color="textSecondary">
              {hint}
            </Body>
          </View>

          <ScrollView
            accessibilityRole="radiogroup"
            contentContainerStyle={{ padding: Spacing.three, gap: Spacing.one }}>
            {LANGUAGES.map((language) => {
              const chosen = sameLanguage(language.code, selected);
              const busy = busyCode !== undefined && sameLanguage(language.code, busyCode);
              return (
                <Pressable
                  key={language.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen, disabled: busyCode !== undefined }}
                  accessibilityLabel={`${language.name}, ${language.nativeName}`}
                  disabled={busyCode !== undefined}
                  onPress={() => onPick(language.code)}
                  style={({ pressed }) => ({
                    minHeight: MinTouchTarget,
                    paddingVertical: Spacing.two,
                    paddingHorizontal: Spacing.three,
                    borderRadius: Radius.panel,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Spacing.two,
                    // The one you are on is outlined. A press is only a fill, so "this is mine"
                    // and "my finger is here" never look the same.
                    borderWidth: 1,
                    borderColor: chosen ? Colors.brand : 'transparent',
                    backgroundColor: chosen || pressed ? Colors.backgroundSelected : 'transparent',
                  })}>
                  <View style={{ flex: 1, gap: Spacing.half }}>
                    {/* The list itself reads left to right, so even a right-to-left name sits
                        on the left here. Only the translated note itself turns around. */}
                    <ScriptText language={language.code} strong style={{ textAlign: 'left' }}>
                      {language.nativeName}
                    </ScriptText>
                    <Body small color="textSecondary">
                      {language.name}
                    </Body>
                  </View>
                  {busy ? (
                    <Body small color="link">
                      Translating…
                    </Body>
                  ) : chosen ? (
                    <Body small color="success" accessibilityElementsHidden>
                      {'✓'}
                    </Body>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ padding: Spacing.three, borderTopWidth: 1, borderTopColor: Colors.glassBorder }}>
            <Button label="Close" variant="secondary" onPress={onClose} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
