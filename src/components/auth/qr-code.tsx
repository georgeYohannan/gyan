import { Image } from 'react-native';

type Props = {
  /** A data address holding the picture, as src/lib/security.ts builds it. */
  uri: string;
  size: number;
  label: string;
};

/**
 * The square code somebody scans with their authenticator app.
 *
 * On a phone this is an ordinary React Native Image, which handles a picture written
 * straight into the address without complaint. The web needs its own version -- see
 * qr-code.web.tsx, and the note there about why.
 */
export function QrCode({ uri, size, label }: Props) {
  return (
    <Image
      testID="two-factor-qr"
      source={{ uri }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible
      accessibilityLabel={label}
    />
  );
}
