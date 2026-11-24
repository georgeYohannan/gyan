import { Text, type TextProps } from 'react-native';

import { Colors, FontFamily, Type, type ThemeColor } from '@/constants/theme';

export type BodyWeight = 'regular' | 'medium' | 'semibold';

type BodyProps = TextProps & {
  /** 'text' (default), 'textSecondary' (quieter), 'link' (light blue), 'danger'. */
  color?: Extract<ThemeColor, 'text' | 'textSecondary' | 'link' | 'danger' | 'success'>;
  small?: boolean;
  /**
   * How heavy the words are.
   *
   * This exists because `style={{ fontWeight: '600' }}` does NOT work here. In React Native
   * every weight is its own font family -- IBMPlexSans_400Regular and
   * IBMPlexSans_600SemiBold are two different fonts, not one font with a dial -- so asking a
   * Regular family for weight 600 gets you Regular. Eleven places in this app did that and
   * none of them was bold on a phone. The web hid it, because a browser will happily fake a
   * bold by smearing the Regular, which is why no screenshot ever showed the problem.
   */
  weight?: BodyWeight;
};

const FAMILY: Record<BodyWeight, string> = {
  regular: FontFamily.body,
  medium: FontFamily.bodyMedium,
  semibold: FontFamily.bodySemiBold,
};

/** Body text in IBM Plex Sans. Never uses brand blue; links use light blue. */
export function Body({ color = 'text', small, weight = 'regular', style, ...rest }: BodyProps) {
  const size = small ? Type.small : Type.body;
  return (
    <Text
      style={[
        {
          color: Colors[color],
          fontFamily: FAMILY[weight],
          fontSize: size,
          lineHeight: size * Type.bodyLineHeight,
        },
        style,
      ]}
      {...rest}
    />
  );
}
