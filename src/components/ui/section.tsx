import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { Body } from '@/components/ui/body';
import { Heading } from '@/components/ui/heading';
import { Colors, Spacing } from '@/constants/theme';

type SectionProps = ViewProps & {
  /** What this group of things is. */
  title: string;
  /** A quiet line under the title. */
  hint?: string;
  /** Something at the right of the title, such as a count or one small button. */
  right?: ReactNode;
};

/**
 * A named group of things, with a hairline under the name.
 *
 * This is the piece that lets a screen stop being a stack of identical glass cards. Before
 * it, every group on every screen was a `GlassPanel`, so a list of settings, an error and a
 * transcript line all had the same border, the same fill and the same corners -- which told
 * a reader nothing about which was which.
 *
 * The line does one job: it says "a new group starts here". It is not decoration, and there
 * is no fill, no border and no shadow, because none of those would say anything true.
 */
export function Section({ title, hint, right, children, style, ...rest }: SectionProps) {
  return (
    <View style={[{ gap: Spacing.three }, style]} {...rest}>
      <View style={{ gap: Spacing.two }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three }}>
          <View style={{ flex: 1 }}>
            <Heading level={2}>{title}</Heading>
          </View>
          {right}
        </View>
        {hint ? (
          <Body small color="textSecondary">
            {hint}
          </Body>
        ) : null}
        <View style={{ height: 1, backgroundColor: Colors.glassBorder }} />
      </View>
      {children}
    </View>
  );
}
