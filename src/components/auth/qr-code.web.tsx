import { createElement } from 'react';

type Props = {
  /** A data address holding the picture, as src/lib/security.ts builds it. */
  uri: string;
  size: number;
  label: string;
};

/**
 * The square code somebody scans with their authenticator app, on the web.
 *
 * WHY THIS FILE EXISTS. Neither expo-image nor React Native's own Image will show a picture
 * that is written straight into the address, which is how the code arrives. expo-image drew
 * an empty box; React Native's Image drew nothing either. The browser itself loads exactly
 * the same address without complaint -- that was checked directly -- so the picture was
 * fine and the wrapper around it was not.
 *
 * It showed up as A BLANK WHITE SQUARE where the code should be. That is worse than an
 * error: the screen looks finished, the words around it say "scan this", and there is
 * nothing to scan. It was found by looking at a screenshot, not by a test, which is why
 * CLAUDE.md asks for screenshots of any screen work.
 *
 * So on the web this is a plain picture element, the same trick file-pick-button.web.tsx
 * uses for the file chooser.
 */
export function QrCode({ uri, size, label }: Props) {
  return createElement('img', {
    'data-testid': 'two-factor-qr',
    src: uri,
    alt: label,
    width: size,
    height: size,
    style: { width: size, height: size, display: 'block' },
  });
}
