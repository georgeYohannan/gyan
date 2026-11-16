import { View, type ViewProps } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type GlassPanelProps = ViewProps & {
  /** Stronger glass (14% white) instead of the soft one (6%). */
  strong?: boolean;
};

/** A see-through panel: white at 6% to 14% with a 14% white border. */
export function GlassPanel({ strong, style, ...rest }: GlassPanelProps) {
  return (
    <View
      style={[
        {
          backgroundColor: strong ? Colors.backgroundSelected : Colors.glass,
          borderColor: Colors.glassBorder,
          borderWidth: 1,
          borderRadius: Radius.panel,
          padding: Spacing.three,
          gap: Spacing.two,
        },
        style,
      ]}
      {...rest}
    />
  );
}
