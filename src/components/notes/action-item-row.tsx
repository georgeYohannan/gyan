import { Pressable, Text, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import type { ActionItem } from '@/lib/summaries';
import { formatTime } from '@/lib/transcripts';

type ActionItemRowProps = {
  item: ActionItem;
  onToggle: (item: ActionItem) => void;
  /** True while the tick is being saved. */
  saving?: boolean;
};

/** One to-do, with a tick box big enough for a thumb (44 by 44). */
export function ActionItemRow({ item, onToggle, saving }: ActionItemRowProps) {
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
      <View
        // The box itself is 24 wide, but it sits in a 44 high row, so the whole row is the target.
        style={{
          width: 24,
          height: 24,
          marginTop: Spacing.two,
          borderRadius: Radius.panel / 4,
          borderWidth: 1,
          borderColor: item.done ? Colors.successFill : Colors.glassBorder,
          backgroundColor: item.done ? Colors.successFill : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {item.done ? (
          // The tick mark is drawn in the device's own font, because IBM Plex Sans makes it look
          // like a letter V. The color still comes from the theme.
          <Text style={{ color: Colors.success, fontSize: 16, lineHeight: 20, fontWeight: '700' }}>{'✓'}</Text>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: Spacing.half }}>
        <Body
          color={item.done ? 'textSecondary' : 'text'}
          style={item.done ? { textDecorationLine: 'line-through' } : undefined}>
          {item.text}
        </Body>
        {extras.length > 0 ? (
          <Body small color="textSecondary">
            {extras.join(', ')}
          </Body>
        ) : null}
      </View>
    </Pressable>
  );
}
