import { Text, type TextProps } from 'react-native';

import { Colors, FontFamily, Type } from '@/constants/theme';

const sizes = { 1: Type.heading1, 2: Type.heading2, 3: Type.heading3 } as const;

type HeadingProps = TextProps & {
  level?: 1 | 2 | 3;
  /**
   * The single largest thing on a screen.
   *
   * It is still an h1 to a screen reader: this changes how big the words are, not what they
   * are. One per screen at most -- two large things on one screen means neither is large.
   */
  display?: boolean;
};

/** White headings in Schibsted Grotesk Bold, at the sizes named in `Type`. */
export function Heading({ level = 1, display, style, ...rest }: HeadingProps) {
  const size = display ? Type.display : sizes[level];
  return (
    <Text
      accessibilityRole="header"
      aria-level={level}
      style={[
        {
          color: Colors.heading,
          fontFamily: FontFamily.heading,
          fontSize: size,
          lineHeight: size * Type.headingLineHeight,
        },
        style,
      ]}
      {...rest}
    />
  );
}
