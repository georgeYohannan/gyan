import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { ScriptText } from '@/components/ui/script-text';
import { TickBox } from '@/components/ui/tick-box';
import { DEFAULT_LANGUAGE } from '@/constants/languages';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import type { ActionItem } from '@/lib/summaries';
import { formatTime } from '@/lib/transcripts';

type ActionItemRowProps = {
  item: ActionItem;
  onToggle: (item: ActionItem) => void;
  /** True while the tick is being saved. */
  saving?: boolean;
  /** The language the words are in. Set when a translation is on screen. */
  language?: string;
};

/** One to-do, with a tick box big enough for a thumb (44 by 44). */
export function ActionItemRow({ item, onToggle, saving, language = DEFAULT_LANGUAGE }: ActionItemRowProps) {
  const extras: string[] = [];
  if (item.owner_name?.trim()) extras.push(item.owner_name.trim());
  if (item.due_text?.trim()) extras.push(item.due_text.trim());
  if (item.start_ms !== null && item.start_ms !== undefined) extras.push(`said at ${formatTime(item.start_ms)}`);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={item.text}
      accessibilityState={{ checked: item.done, busy: !!saving, disabled: !!saving }}
      // Phones read accessibilityState; the web reads aria-checked. Screen readers need both.
      aria-checked={item.done}
      disabled={saving}
      onPress={() => onToggle(item)}
      style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start', minHeight: MinTouchTarget, paddingVertical: Spacing.one }}>
      <TickBox checked={item.done} nudgeDown />
      <View style={{ flex: 1, gap: Spacing.half }}>
        <ScriptText
          language={language}
          color={item.done ? 'textSecondary' : 'text'}
          style={item.done ? { textDecorationLine: 'line-through' } : undefined}>
          {item.text}
        </ScriptText>
        {extras.length > 0 ? (
          <Body small color="textSecondary">
            {extras.join(', ')}
          </Body>
        ) : null}
      </View>
    </Pressable>
  );
}
