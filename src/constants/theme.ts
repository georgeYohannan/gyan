/**
 * Gyan design tokens. Use these names in the code instead of loose color values.
 * The values come from the Design section of CLAUDE.md. The app is dark navy only.
 * tailwind.config.js repeats the colors for className use. A test keeps the two in sync.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  /** Screen background. */
  background: '#0B1220',
  /** Panels and cards. */
  backgroundElement: '#0F172A',
  /** Glass fill for selected or raised items: white at 14%. */
  backgroundSelected: 'rgba(255,255,255,0.14)',
  /** Softer glass fill: white at 6%. Glass can be anything from 6% to 14%. */
  glass: 'rgba(255,255,255,0.06)',
  /** Border on glass: white at 14%. */
  glassBorder: 'rgba(255,255,255,0.14)',
  /** Headings. */
  heading: '#FFFFFF',
  /** Body text. */
  text: '#E2E8F0',
  /** Quieter body text. Not in CLAUDE.md. Chosen to keep 4.5:1 contrast on navy. */
  textSecondary: '#94A3B8',
  /** Brand blue. For glows, buttons, and borders only. Never for body text on navy. */
  brand: '#0066FF',
  /** Blue text and links. */
  link: '#99CBFF',
  /** Record button and highlights. Fill only. */
  record: '#C2410C',
  /** Text on the record button (white on #C2410C passes 4.5:1). */
  onRecord: '#FFFFFF',
  /** Status text. Not in CLAUDE.md; see docs/decisions.md. Both pass 4.5:1 on navy. */
  success: '#86EFAC',
  danger: '#FCA5A5',
  /** Soft tinted fills behind status text and error borders. */
  successFill: 'rgba(134,239,172,0.12)',
  dangerFill: 'rgba(252,165,165,0.12)',
  dangerBorder: 'rgba(252,165,165,0.55)',
  /** Skeleton block fill. */
  skeleton: 'rgba(255,255,255,0.08)',
  /** Blue glow color (brand blue at 55%). Used for shadows only. */
  glow: 'rgba(0,102,255,0.55)',
} as const;

export type ThemeColor = keyof typeof Colors;

/** Font family names. They match the names loaded with useFonts in src/app/_layout.tsx. */
export const FontFamily = {
  heading: 'SchibstedGrotesk_700Bold',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemiBold: 'IBMPlexSans_600SemiBold',
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: FontFamily.body,
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: FontFamily.body,
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: FontFamily.body,
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Pill buttons are fully rounded. */
export const Radius = {
  pill: 999,
  /** Glass panels and text fields. */
  panel: 20,
} as const;

/** Animation timing. UI changes take 0.2 seconds. Reveals take 0.32 seconds. */
export const Motion = {
  uiMs: 200,
  revealMs: 320,
  /** cubic-bezier(.16, 1, .3, 1) as the four numbers Reanimated's Easing.bezier wants. */
  easing: [0.16, 1, 0.3, 1] as const,
} as const;

/** Phone touch targets are at least 44 by 44 points. */
export const MinTouchTarget = 44;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/** Breakpoint (in points) where the help panel becomes a side panel on wide web screens. */
export const WideBreakpoint = 768;
