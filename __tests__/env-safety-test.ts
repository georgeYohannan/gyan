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

  test('.env.example has no Anthropic key value', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(example).toMatch(/^EXPO_ANTHROPIC_KEY=$/m);
  });

  test('the Anthropic key never appears in app code, and the app never reads it', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx|js)$/.test(f))) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/anthropic_api_key|api\.anthropic\.com/i);
    }
  });

  test('the summary server function reads its key from a server secret', () => {
    const fn = fs.readFileSync(path.join(root, 'supabase/functions/summarize/index.ts'), 'utf8');
    expect(fn).toContain("Deno.env.get('ANTHROPIC_API_KEY')");
  });

  test('.env.example has no Resend key value, and names the app address setting', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(example).toMatch(/^EXPO_RESEND_KEY=$/m);
    expect(example).toMatch(/^EXPO_GYAN_APP_URL=$/m);
  });

  test('the Resend key never appears in app code, and the app never reads it', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx|js)$/.test(f))) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/resend_api_key|api\.resend\.com|\bre_[A-Za-z0-9]{10,}/i);
    }
  });

  test('the recap server function reads its key from a server secret', () => {
    const fn = fs.readFileSync(path.join(root, 'supabase/functions/recap/index.ts'), 'utf8');
    expect(fn).toContain("Deno.env.get('RESEND_API_KEY')");
    // The key only ever goes into the Authorization header of the send, never into a log.
    expect(fn).not.toMatch(/console\.(log|error)[^;]*apiKey/);
    expect(fn).not.toMatch(/\bre_[A-Za-z0-9]{10,}/);
  });

  test('no real Resend key is written anywhere that gets committed', () => {
    const skip = new Set(['node_modules', '.git', '.expo', 'dist', '.playwright-mcp', 'example', 'test-results', 'playwright-report']);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (skip.has(e.name) || e.name.startsWith('.env')) return [];
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
    for (const file of walk(root).filter((f) => /\.(ts|tsx|js|json|md|sql|yml)$/.test(f))) {
      // A real Resend key starts with re_ and is long. The placeholder "re_..." is fine.
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/\bre_[A-Za-z0-9]{24,}/);
    }
  });

  test('no real key is written anywhere that gets committed', () => {
    const skip = new Set(['node_modules', '.git', '.expo', 'dist', '.playwright-mcp', 'example', 'test-results', 'playwright-report']);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (skip.has(e.name) || e.name.startsWith('.env')) return [];
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
    for (const file of walk(root).filter((f) => /\.(ts|tsx|js|json|md|sql|yml)$/.test(f))) {
      const text = fs.readFileSync(file, 'utf8');
      // A real Anthropic key starts with sk-ant- and is long. Short things like the "sk-ant-..."
      // placeholder in the test checklist are fine; a real key could never be that short.
      expect(text).not.toMatch(/sk-ant-[A-Za-z0-9_-]{30,}/);
    }
  });
});
