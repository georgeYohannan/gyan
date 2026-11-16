import { Text, type TextProps } from 'react-native';

import { Colors, FontFamily, type ThemeColor } from '@/constants/theme';

type BodyProps = TextProps & {
  /** 'text' (default), 'textSecondary' (quieter), 'link' (light blue), 'danger'. */
  color?: Extract<ThemeColor, 'text' | 'textSecondary' | 'link' | 'danger' | 'success'>;
  small?: boolean;
};

/** Body text in IBM Plex Sans. Never uses brand blue; links use light blue. */
export function Body({ color = 'text', small, style, ...rest }: BodyProps) {
  const size = small ? 14 : 16;
  return (
    <Text
      style={[{ color: Colors[color], fontFamily: FontFamily.body, fontSize: size, lineHeight: size * 1.5 }, style]}
      {...rest}
    />
  );
}
