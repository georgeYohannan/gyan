import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DateRangeCalendar } from '@/components/notes/date-range-calendar';
import { Body } from '@/components/ui/body';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { STATUSES, type Status } from '@/components/ui/status-badge';
import { Colors, MinTouchTarget, Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
import { DATE_PRESETS, PRESET_LABEL, type DatePreset } from '@/lib/dates';
import { SOURCE_LABEL, type Source } from '@/lib/notes';
import { ALL_SOURCES, type ViewState } from '@/lib/notes-search';

type FilterSheetProps = {
  visible: boolean;
  /** The filters as they stand. The sheet edits a copy and only reports when Apply is pressed. */
  view: ViewState;
  onApply: (next: ViewState) => void;
  onClose: () => void;
  onClear: () => void;
  now?: Date;
};

const SIDE_WIDTH = 420;

/**
 * The filters: when, what state, where it came from, and whether it still has anything to do.
 *
 * They live behind a button rather than on Home, because Home's job is to show notes. Four rows
 * of controls above the list would make finding a note harder, not easier.
 *
 * Same shape as the help panel and the chat: it slides up from the bottom on a phone, and in
 * from the right on a wide web window.
 */
export function FilterSheet({ visible, view, onApply, onClose, onClear, now = new Date() }: FilterSheetProps) {
  const { width, height } = useWindowDimensions();
  const { reveal } = useMotion();
  const side = Platform.OS === 'web' && width >= WideBreakpoint;

  const [draft, setDraft] = useState(view);
  const [mounted, setMounted] = useState(visible);
  const [wasOpen, setWasOpen] = useState(visible);
  const progress = useSharedValue(0);

  if (visible && !mounted) setMounted(true);

  // Opening the sheet starts from whatever is on now. It is deliberately only on OPENING:
  // something changing underneath while the sheet is open -- the search words settling a third
  // of a second after somebody stopped typing, for instance -- must not quietly undo a filter
  // they have just ticked.
  if (visible !== wasOpen) {
    setWasOpen(visible);
    if (visible) setDraft(view);
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

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: side ? 'flex-start' : 'flex-end', alignItems: side ? 'flex-end' : 'stretch' }}>
        <Animated.View
          style={[
            { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
            backdropStyle,
          ]}>
          <Pressable
            testID="filters-backdrop"
            accessibilityLabel="Close the filters"
            style={{ flex: 1 }}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="Filters"
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
          <View
            style={{
              padding: Spacing.four,
              paddingBottom: Spacing.three,
              gap: Spacing.two,
              borderBottomWidth: 1,
              borderBottomColor: Colors.glassBorder,
            }}>
            <Heading level={3}>Filters</Heading>
            <Body small color="textSecondary">
              Narrow the list down. Filters work together, and with whatever you have searched for.
            </Body>
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.four }}>
            <Group title="When">
              <Chips
                options={DATE_PRESETS.map((p) => ({ key: p, label: PRESET_LABEL[p] }))}
                chosen={[draft.preset]}
                role="radio"
                onPress={(key) => setDraft({ ...draft, preset: key as DatePreset })}
              />
              {draft.preset === 'custom' ? (
                <View style={{ gap: Spacing.two }}>
                  <DateRangeCalendar
                    value={draft.custom}
                    onChange={(custom) => setDraft({ ...draft, custom })}
                    now={now}
                  />
                  <Body small color="textSecondary">
                    {draft.custom.from && draft.custom.to
                      ? 'Both days are included.'
                      : draft.custom.from
                        ? 'Now pick the last day.'
                        : 'Pick the first day.'}
                  </Body>
                </View>
              ) : null}
            </Group>

            <Group title="Status">
              <Chips
                options={STATUSES.map((s) => ({ key: s, label: s }))}
                chosen={draft.statuses}
                onPress={(key) => setDraft({ ...draft, statuses: toggle(draft.statuses, key as Status) })}
              />
            </Group>

            <Group title="Where it came from">
              <Chips
                options={ALL_SOURCES.map((s) => ({ key: s, label: SOURCE_LABEL[s] }))}
                chosen={draft.sources}
                onPress={(key) => setDraft({ ...draft, sources: toggle(draft.sources, key as Source) })}
              />
            </Group>

            <Group title="To-dos">
              <Chips
                options={[{ key: 'open', label: 'Still has something to do' }]}
                chosen={draft.openActions ? ['open'] : []}
                onPress={() => setDraft({ ...draft, openActions: !draft.openActions })}
              />
            </Group>
          </ScrollView>

          <View
            style={{
              padding: Spacing.three,
              gap: Spacing.two,
              borderTopWidth: 1,
              borderTopColor: Colors.glassBorder,
            }}>
            <Button label="Show these notes" onPress={() => onApply(draft)} />
            <Button label="Clear filters" variant="secondary" onPress={onClear} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Body weight="semibold">{title}</Body>
      {children}
    </View>
  );
}

type Option = { key: string; label: string };

/** A row of pills that wraps. One choice or several, depending on what it is for. */
function Chips({
  options,
  chosen,
  onPress,
  role = 'checkbox',
}: {
  options: Option[];
  chosen: string[];
  onPress: (key: string) => void;
  role?: 'checkbox' | 'radio';
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
      {options.map((option) => {
        const on = chosen.includes(option.key);
        return (
          <Pressable
            key={option.key}
            accessibilityRole={role}
            accessibilityState={{ checked: on, selected: on }}
            accessibilityLabel={option.label}
            onPress={() => onPress(option.key)}
            style={({ pressed }) => ({
              minHeight: MinTouchTarget,
              justifyContent: 'center',
              paddingHorizontal: Spacing.three,
              borderRadius: Radius.pill,
              borderWidth: 1,
              borderColor: on ? Colors.brand : Colors.glassBorder,
              backgroundColor: on || pressed ? Colors.backgroundSelected : Colors.glass,
            })}>
            <Body small>{option.label}</Body>
          </Pressable>
        );
      })}
    </View>
  );
}
