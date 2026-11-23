import { View } from 'react-native';

import { Body } from '@/components/ui/body';
import { Spacing } from '@/constants/theme';

type SettingRowProps = {
  /** What it is set to right now. Leads the row: the thing itself, not a label for it. */
  value: string;
  /** One short sentence saying what this setting does. */
  note: string;
  /** The button that changes it, if there is one. */
  action?: React.ReactNode;
  error?: string;
};

/**
 * One line of a settings panel: what it is set to, what that means, and how to change it.
 *
 * The value leads and the explanation sits under it, rather than a quiet label above a value.
 * Stacking a label, a value and a note would make three lines where two will do, and the thing
 * a person came to read would be the second one. (Settled in the prompt 8 design pass.)
 */
export function SettingRow({ value, note, action, error }: SettingRowProps) {
  return (
    <View style={{ gap: Spacing.two }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two }}>
        <View style={{ flex: 1, minWidth: 180, gap: Spacing.half }}>
          <Body>{value}</Body>
          <Body small color="textSecondary">
            {note}
          </Body>
        </View>
        {action}
      </View>
      {error ? (
        <Body small color="danger" accessibilityRole="alert">
          {error}
        </Body>
      ) : null}
    </View>
  );
}
