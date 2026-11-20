import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('project setup', () => {
  test('NativeWind: Tailwind directives are in global.css', () => {
    const css = read('src/global.css');
    expect(css).toContain('@tailwind base');
    expect(css).toContain('@tailwind utilities');
  });

  test('NativeWind: config files are wired up', () => {
    expect(read('metro.config.js')).toContain('withNativeWind');
    expect(read('babel.config.js')).toContain('nativewind/babel');
    expect(read('tailwind.config.js')).toContain('nativewind/preset');
  });

  test('Reanimated is installed', () => {
    expect(() => require.resolve('react-native-reanimated')).not.toThrow();
  });

  test('app is dark only, with the navy splash color', () => {
    const expo = JSON.parse(read('app.json')).expo;
    expect(expo.userInterfaceStyle).toBe('dark');
    expect(JSON.stringify(expo.plugins)).toContain('"backgroundColor":"#0B1220"');
  });

  test('web uses the Metro bundler (needed by NativeWind)', () => {
    expect(JSON.parse(read('app.json')).expo.web.bundler).toBe('metro');
  });

  test('secret files are ignored by git', () => {
    const ignore = read('.gitignore');
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^\.env\.\*$/m);
  });
});

/**
 * THE BUILDERS' PLAN SWITCH IS NOT PART OF THE APP.
 *
 * This is proved here, against the source, rather than in the browser scripts. The browser
 * scripts run on whatever machine somebody is sitting at, and docs/testing/prompt-10.md
 * tells the founder to switch the builders' tools ON by hand -- so a browser test asserting
 * the switch is absent passes or fails depending on a file that is deliberately changed.
 * These checks cannot drift with anybody's settings.
 */
describe('the builders-only plan switch', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

  test('IT IS OFF UNLESS THE VALUE IS EXACTLY "1", so forgetting the setting hides it', () => {
    const source = read('src/lib/environment.ts');
    // Exactly '1' and nothing else. A loose check such as Boolean(value) or value !== '0'
    // would turn the switch on for 'false', '0 ', 'no' and every typo.
    expect(source).toContain("process.env.EXPO_PUBLIC_GYAN_TEST_TOOLS === '1'");
    expect(source).not.toMatch(/Boolean\(|!==\s*'0'|\.length\s*>\s*0|!!\s*process\.env/);
  });

  test('the switch is drawn in ONE place, and only behind that check', () => {
    const screen = read('src/app/(app)/settings/plan.tsx');
    // One panel, one gate. Two renders would mean one of them could lose its gate.
    expect(screen.match(/Switch plan, for testing/g)).toHaveLength(1);
    expect(screen).toContain('const testTools = testToolsOn();');
    expect(screen).toContain('{testTools ? (');
    // The gate comes before the panel, not somewhere after it.
    expect(screen.indexOf('{testTools ? (')).toBeLessThan(screen.indexOf('Switch plan, for testing'));
  });

  test('it says what it is, so nobody could take it for a real feature', () => {
    expect(read('src/app/(app)/settings/plan.tsx')).toContain('For builders only');
  });

  test('a fresh copy of the project has it switched off', () => {
    // .env.example is what somebody setting Gyan up copies. It must not hand them the
    // builders' tools by default.
    const example = read('.env.example');
    expect(example).not.toMatch(/^EXPO_PUBLIC_GYAN_TEST_TOOLS=1$/m);
  });

  test('and the database refuses it anyway, whatever the app shows', () => {
    // The real lock is not the setting: set_test_plan refuses anybody whose profiles.is_admin
    // is not true, a value no migration ever sets and the app can never change.
    const sql = fs
      .readdirSync(path.join(__dirname, '..', 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', f), 'utf8'))
      .join('\n');
    const fn = sql.slice(sql.indexOf('create function public.set_test_plan'));
    expect(fn).toContain("raise exception 'not_admin'");
    expect(fn).toContain("raise exception 'not_a_test_plan'");
  });
});
