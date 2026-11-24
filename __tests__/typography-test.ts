/**
 * Weight is a font family here, not a number.
 *
 * In React Native every weight is its own font: IBMPlexSans_400Regular and
 * IBMPlexSans_600SemiBold are two different families, not one family with a dial. So
 * `style={{ fontWeight: '600' }}` on text set in the Regular family does nothing on a phone.
 *
 * Ten places in this app did exactly that, and no screenshot ever showed it, because a browser
 * will happily fake a bold by smearing the Regular -- so the bug was invisible to every
 * browser script and visible only on a real phone. `<Body weight="semibold">` picks the real
 * family instead. This test keeps it that way.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { FontFamily, Type } from '@/constants/theme';

const SRC = join(__dirname, '..', 'src');

/** Every .ts/.tsx file under src/, with its path, so a failure can name the file. */
function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push({ path: full.slice(SRC.length + 1), text: readFileSync(full, 'utf8') });
    }
  };
  walk(SRC);
  return out;
}

describe('type', () => {
  const files = sources();

  test('nothing asks a named font family for a weight it does not have', () => {
    const offenders = files
      .filter((f) => /fontWeight/.test(f.text))
      // body.tsx explains the rule in a comment; tick-box draws its tick in the DEVICE font,
      // which has real weights, so a number is right there.
      .filter((f) => !['components/ui/body.tsx', 'components/ui/tick-box.tsx'].includes(f.path))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  test('the three weights Gyan loads are the three it can ask for', () => {
    expect(FontFamily.body).toBe('IBMPlexSans_400Regular');
    expect(FontFamily.bodyMedium).toBe('IBMPlexSans_500Medium');
    expect(FontFamily.bodySemiBold).toBe('IBMPlexSans_600SemiBold');
  });

  test('every loaded family is actually loaded at startup', () => {
    const layout = files.find((f) => f.path === 'app/_layout.tsx')!.text;
    for (const family of Object.values(FontFamily)) {
      expect(layout).toContain(family);
    }
  });

  test('the type scale goes down in order, with no two sizes the same', () => {
    const sizes = [Type.display, Type.heading1, Type.heading2, Type.heading3, Type.body, Type.small, Type.tiny];
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  test('the smallest text is still big enough to read', () => {
    // Nothing load-bearing is set in `tiny`; it is for the labels in the bottom bar.
    expect(Type.tiny).toBeGreaterThanOrEqual(12);
  });

  test('headings are set tighter than prose, because a heading is read as a shape', () => {
    expect(Type.headingLineHeight).toBeLessThan(Type.bodyLineHeight);
  });
});
