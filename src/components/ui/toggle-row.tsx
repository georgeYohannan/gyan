import { Pressable, View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Colors, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

type ToggleRowProps = {
  /** What the setting is, in a few plain words. Leads the row, as a setting should. */
  label: string;
  /** One short sentence saying what turning it on does. */
  note: string;
  value: boolean;
  onChange: (next: boolean) => void;
  /** True while the change is being saved, so it cannot be tapped twice. */
  saving?: boolean;
  /** Set when this person may look but not change. The row says why. */
  lockedReason?: string;
};

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const KNOB = 22;

/**
 * One on/off setting: what it is, what it does, and a switch.
 *
 * Built by hand rather than with a native switch, because this row has to look and behave the
 * same on the web and on a phone, and because the whole row is the target (a 48 point switch on
 * its own is a small thing to hit).
 *
 * The switch always shows the word On or Off next to it. Colour alone is never the only way to
 * tell which way it is set.
 */
export function ToggleRow({ label, note, value, onChange, saving, lockedReason }: ToggleRowProps) {
  const locked = !!lockedReason;
  const disabled = locked || !!saving;

  return (
    <View style={{ gap: Spacing.one }}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled, busy: !!saving }}
        // Phones read accessibilityState; the web reads aria-checked. Screen readers need both.
        aria-checked={value}
        disabled={disabled}
        onPress={() => onChange(!value)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.three,
          minHeight: MinTouchTarget,
          paddingVertical: Spacing.one,
          opacity: disabled ? 0.6 : 1,
        }}>
        <View style={{ flex: 1, minWidth: 160, gap: Spacing.half }}>
          <Body>{label}</Body>
          <Body small color="textSecondary">
            {note}
          </Body>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <Body small color="textSecondary">
            {value ? 'On' : 'Off'}
          </Body>
          <View
            style={{
              width: TRACK_WIDTH,
              height: TRACK_HEIGHT,
              borderRadius: Radius.pill,
              borderWidth: 1,
              borderColor: value ? Colors.brand : Colors.glassBorder,
              backgroundColor: value ? Colors.brand : Colors.glass,
              justifyContent: 'center',
              paddingHorizontal: 2,
            }}>
            <View
              style={{
                width: KNOB,
                height: KNOB,
                borderRadius: Radius.pill,
                backgroundColor: value ? Colors.heading : Colors.textSecondary,
                alignSelf: value ? 'flex-end' : 'flex-start',
              }}
            />
          </View>
        </View>
      </Pressable>

      {lockedReason ? (
        <Body small color="textSecondary">
          {lockedReason}
        </Body>
      ) : null}
    </View>
  );
}
