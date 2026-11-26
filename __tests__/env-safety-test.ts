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

  test('.env.example names the two meeting-bot secrets and has no values for them', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(example).toMatch(/^MEETING_BOT_API_KEY=$/m);
    expect(example).toMatch(/^MEETING_BOT_WEBHOOK_SECRET=$/m);
  });

  test('the meeting-bot secrets never appear in app code, and the app never reads them', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx|js)$/.test(f))) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).not.toMatch(/MEETING_BOT_API_KEY|MEETING_BOT_WEBHOOK_SECRET/);
      // Nor the service's own address, nor the shape of a webhook signing secret.
      expect(text).not.toMatch(/recall\.ai|whsec_/i);
    }
  });

  test('the two bot server functions read their secrets from server secrets', () => {
    const bot = fs.readFileSync(path.join(root, 'supabase/functions/bot/index.ts'), 'utf8');
    expect(bot).toContain("Deno.env.get('MEETING_BOT_API_KEY')");
    const webhook = fs.readFileSync(path.join(root, 'supabase/functions/bot-webhook/index.ts'), 'utf8');
    expect(webhook).toContain("Deno.env.get('MEETING_BOT_API_KEY')");
    expect(webhook).toContain("Deno.env.get('MEETING_BOT_WEBHOOK_SECRET')");
    // And neither has a key written into it.
    for (const fn of [bot, webhook]) expect(fn).not.toMatch(/Token [A-Za-z0-9]{20,}/);
  });

  test('THE WEBHOOK SAYS NOTHING ABOUT WHY IT REFUSED, so nobody can work out how to forge one', () => {
    const webhook = fs.readFileSync(path.join(root, 'supabase/functions/bot-webhook/index.ts'), 'utf8');
    // One log line, with no detail in it at all.
    expect(webhook).toContain("console.error('bot webhook rejected')");
    // And it does nothing else: the verify comes before any database client is made.
    const verifyAt = webhook.indexOf('verifyEvent');
    const clientAt = webhook.indexOf('createClient(url, secretKey');
    expect(verifyAt).toBeGreaterThan(0);
    expect(verifyAt).toBeLessThan(clientAt);
  });

  test('.env.example has no mailbox password value, and names the app address setting', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(example).toMatch(/^EXPO_SMTP_PASSWORD=$/m);
    expect(example).toMatch(/^EXPO_GYAN_APP_URL=$/m);
  });

  test('THE MAILBOX PASSWORD NEVER APPEARS IN APP CODE, and the app never reads it', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx|js)$/.test(f))) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).not.toMatch(/smtp_password|smtp\.hostinger\.com/i);
      // The app must not know how to send email at all.
      expect(text).not.toMatch(/denomailer|SMTPClient/i);
    }
  });

  // Two functions send email now: recap (a note's summary) and team (an invite). Both read the
  // password from the same server secret and send through the same shared mailer.
  test.each(['recap', 'team'])(
    'the %s server function reads the mailbox password from a server secret',
    (name) => {
      const fn = fs.readFileSync(path.join(root, `supabase/functions/${name}/index.ts`), 'utf8');
      expect(fn).toContain("Deno.env.get('SMTP_PASSWORD')");
      // The password only ever goes into the sign in, never into a log.
      expect(fn).not.toMatch(/console\.(log|error)[^;]*password/i);
    },
  );

  test('the mail server is named in ONE settings file, not in any code that sends', () => {
    const sender = fs.readFileSync(path.join(root, 'supabase/functions/_shared/sender.ts'), 'utf8');
    expect(sender).toContain("hostname: 'smtp.hostinger.com'");
    expect(sender).toContain('port: 465');
    expect(sender).toContain("email: 'gyan@gyantechai.com'");

    // The one place that opens a connection reads the host and port from that file.
    const mailer = fs.readFileSync(path.join(root, 'supabase/functions/_shared/mailer.ts'), 'utf8');
    expect(mailer).toContain('SMTP.hostname');
    expect(mailer).toContain('SMTP.port');
    expect(mailer).not.toContain('smtp.hostinger.com');

    // And no function that sends writes the address, the host or the port down a second time.
    // Comments are taken out first: naming the mailbox in a note to the next person is the
    // point, what must not happen is a second copy the code actually uses.
    const withoutComments = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const name of ['recap', 'team']) {
      const fn = withoutComments(
        fs.readFileSync(path.join(root, `supabase/functions/${name}/index.ts`), 'utf8'),
      );
      expect(fn).not.toContain('smtp.hostinger.com');
      expect(fn).not.toContain('gyan@gyantechai.com');
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
      // Two files have to write key shapes down in order to look for them: the secret
      // scanner and its own test. Both say so out loud in their first lines, and a test in
      // secret-scan-test.ts checks that no third file ever claims the same exception.
      if (text.split('\n', 25).join('\n').includes('secret-scanner: allow-patterns')) continue;
      // A real Anthropic key starts with sk-ant- and is long. Short things like the "sk-ant-..."
      // placeholder in the test checklist are fine; a real key could never be that short.
      expect(text).not.toMatch(/sk-ant-[A-Za-z0-9_-]{30,}/);
    }
  });
  // ---------------------------------------------------------------------------
  // Added in the security round (prompt 11).
  // ---------------------------------------------------------------------------

  test('NO SERVER SECRET CAN EVER REACH THE APP BUNDLE under an EXPO_PUBLIC_ name', () => {
    // Anything named EXPO_PUBLIC_* is compiled into the web page and the phone app, where
    // anybody can read it. Five of Gyan's secrets are named EXPO_DEEPGRAM_KEY,
    // EXPO_ANTHROPIC_KEY, EXPO_SMTP_PASSWORD and so on -- ONE WORD away from shipping.
    // The only EXPO_PUBLIC_ name allowed to look like a key is the Supabase public key,
    // which is meant to be public.
    const allowed = new Set(['EXPO_PUBLIC_SUPABASE_KEY']);
    const skip = new Set(['node_modules', '.git', '.expo', 'dist', 'web-build', '.playwright-mcp', 'example', 'test-results', 'playwright-report']);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (skip.has(e.name)) return [];
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });

    const offenders: string[] = [];
    for (const file of walk(root).filter((f) => /\.(ts|tsx|js|json|sql|md)$/.test(f))) {
      // The scanner and its own test have to write these names down to look for them.
      if (/scan-secrets\.js$|secret-scan-test\.ts$/.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const hit of text.matchAll(/\bEXPO_PUBLIC_[A-Z0-9_]*(?:KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)\b/g)) {
        if (!allowed.has(hit[0])) offenders.push(`${path.relative(root, file)}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('.env and every .env.local stay ignored, and only .env.example is committed', () => {
    const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    const lines = ignore.split('\n').map((l) => l.trim());
    expect(lines).toContain('.env');
    expect(lines).toContain('.env.*');
    expect(lines).toContain('.env*.local');
    // The one deliberate exception, so the list of setting NAMES can be shared.
    expect(lines).toContain('!.env.example');

    // And git really is ignoring them, not just told to.
    const { execFileSync } = require('node:child_process') as typeof import('child_process');
    const committed = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /(^|\/)\.env/.test(f));
    expect(committed).toEqual(['.env.example']);
  });

  test('the secret check is wired to run before every commit', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    // npm runs "prepare" by itself after npm install, so nobody has to remember.
    expect(pkg.scripts.prepare).toBe('node scripts/install-hooks.js');
    expect(pkg.scripts['scan:secrets']).toBe('node scripts/scan-secrets.js');
    expect(fs.existsSync(path.join(root, 'scripts/scan-secrets.js'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'scripts/install-hooks.js'))).toBe(true);
  });
});
