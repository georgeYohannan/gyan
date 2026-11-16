import { Colors, FontFamily, Motion, MinTouchTarget, Radius, Spacing } from '@/constants/theme';

// --- helpers: contrast ratio (WCAG) ---
function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('Gyan colors (from CLAUDE.md Design section)', () => {
  test('exact brand values', () => {
    expect(Colors.background).toBe('#0B1220');
    expect(Colors.backgroundElement).toBe('#0F172A');
    expect(Colors.heading).toBe('#FFFFFF');
    expect(Colors.text).toBe('#E2E8F0');
    expect(Colors.brand).toBe('#0066FF');
    expect(Colors.link).toBe('#99CBFF');
    expect(Colors.record).toBe('#C2410C');
  });

  test('glass is white at 6% to 14% with a 14% white border', () => {
    expect(Colors.glass).toBe('rgba(255,255,255,0.06)');
    expect(Colors.backgroundSelected).toBe('rgba(255,255,255,0.14)');
    expect(Colors.glassBorder).toBe('rgba(255,255,255,0.14)');
  });

  test.each(['heading', 'text', 'textSecondary', 'link'] as const)(
    '%s text has at least 4.5:1 contrast on the background and on panels',
    (name) => {
      expect(contrast(Colors[name], Colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(Colors[name], Colors.backgroundElement)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('brand blue is NOT readable as body text on navy (so it must never be used for text)', () => {
    expect(contrast(Colors.brand, Colors.background)).toBeLessThan(4.5);
  });
});

describe('other design tokens', () => {
  test('pill radius, touch target, motion', () => {
    expect(Radius.pill).toBe(999);
    expect(MinTouchTarget).toBe(44);
    expect(Motion.uiMs).toBe(200);
    expect(Motion.revealMs).toBe(320);
    expect(Motion.easing).toEqual([0.16, 1, 0.3, 1]);
  });

  test('fonts: Schibsted Grotesk Bold for headings, IBM Plex Sans for body', () => {
    expect(FontFamily.heading).toBe('SchibstedGrotesk_700Bold');
    expect(FontFamily.body).toMatch(/^IBMPlexSans_/);
  });

  test('spacing steps grow in order', () => {
    const steps = Object.values(Spacing);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });
});

describe('Tailwind config stays in sync with the tokens', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tw = require('../tailwind.config.js').theme.extend;

  test('colors match', () => {
    expect(tw.colors.background).toBe(Colors.background);
    expect(tw.colors.panel).toBe(Colors.backgroundElement);
    expect(tw.colors.glass).toBe(Colors.glass);
    expect(tw.colors['glass-strong']).toBe(Colors.backgroundSelected);
    expect(tw.colors['glass-border']).toBe(Colors.glassBorder);
    expect(tw.colors.heading).toBe(Colors.heading);
    expect(tw.colors.body).toBe(Colors.text);
    expect(tw.colors.muted).toBe(Colors.textSecondary);
    expect(tw.colors.brand).toBe(Colors.brand);
    expect(tw.colors.link).toBe(Colors.link);
    expect(tw.colors.record).toBe(Colors.record);
  });

  test('fonts, pill radius, and motion match', () => {
    expect(tw.fontFamily.heading).toEqual([FontFamily.heading]);
    expect(tw.fontFamily.body).toEqual([FontFamily.body]);
    expect(tw.borderRadius.pill).toBe(`${Radius.pill}px`);
    expect(tw.transitionDuration.ui).toBe(`${Motion.uiMs}ms`);
    expect(tw.transitionDuration.reveal).toBe(`${Motion.revealMs}ms`);
  });
});
