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

  test('web uses the Metro bundler (needed by NativeWind)', () => {
    expect(JSON.parse(read('app.json')).expo.web.bundler).toBe('metro');
  });

  test('secret files are ignored by git', () => {
    const ignore = read('.gitignore');
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^\.env\.\*$/m);
  });
});
