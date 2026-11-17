import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

describe('secrets safety', () => {
  test('.env.example names both Supabase settings and has no values', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(example).toMatch(/^EXPO_PUBLIC_SUPABASE_URL=$/m);
    expect(example).toMatch(/^EXPO_PUBLIC_SUPABASE_KEY=$/m);
  });

  test('no secret service_role key is used in app code', () => {
    const lib = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8');
    expect(lib).not.toMatch(/SERVICE_ROLE\s*[:=]/i);
  });

  test('the Deepgram key never appears in app code, and the app never reads it', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx|js)$/.test(f))) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/deepgram_(api_)?key|api\.deepgram\.com/i);
    }
  });

  test('.env.example has no Deepgram key value', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(example).toMatch(/^EXPO_DEEPGRAM_KEY=$/m);
  });

  test('the server function reads the key from a server secret, not from a file in the code', () => {
    const fn = fs.readFileSync(path.join(root, 'supabase/functions/transcribe/index.ts'), 'utf8');
    expect(fn).toContain("Deno.env.get('DEEPGRAM_API_KEY')");
    expect(fn).not.toMatch(/Token [A-Za-z0-9]{20,}/);
  });
});
