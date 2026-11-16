import { Text, type TextProps } from 'react-native';

import { Colors, FontFamily } from '@/constants/theme';

const sizes = { 1: 36, 2: 26, 3: 20 } as const;

type HeadingProps = TextProps & { level?: 1 | 2 | 3 };

/** White headings in Schibsted Grotesk Bold. */
export function Heading({ level = 1, style, ...rest }: HeadingProps) {
  const size = sizes[level];
  return (
    <Text
      accessibilityRole="header"
      aria-level={level}
      style={[{ color: Colors.heading, fontFamily: FontFamily.heading, fontSize: size, lineHeight: size * 1.2 }, style]}
      {...rest}
    />
  );
}
