// secret-scanner: allow-patterns
//
// Proves the secret scanner really catches a leaked key, and really leaves alone the
// things that only look like one. Every value below is made up. None is a real key.
//
// This file carries the "allow-patterns" marker in its first lines, because it has to
// write key shapes down in order to test for them. Only this file and the scanner do.

const { problemsIn, isPlaceholder } = require('../scripts/scan-secrets.js') as {
  problemsIn: (text: string, where: string) => { what: string }[];
  isPlaceholder: (value: string) => boolean;
};

const caught = (text: string) => problemsIn(text, 'sample').length > 0;

describe('the secret scanner catches a leaked key', () => {
  test.each([
    ['a Supabase or any other JWT', 'KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.AbCdEfGhIjKlMnOpQrStUvWx'],
    ['a service_role JWT', 'SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.ZZZZZZZZZZZZZZZZ'],
    ['a Claude API key', 'ANTHROPIC_API_KEY=sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['a Supabase secret key', 'SUPABASE_SECRET=sb_secret_AAAAAAAAAAAAAAAAAAAA'],
    ['a Supabase access token', 'TOKEN=sbp_0123456789abcdef0123456789abcdef01234567'],
    ['a Google API key', 'GOOGLE=AIzaSy' + 'A'.repeat(33)],
    ['an AWS key id', 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE'],
    ['a GitHub token', 'GH=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['a private key file', '-----BEGIN PRIVATE KEY-----'],
    ['a real mailbox password', 'SMTP_PASSWORD=Hx7!qPz92Lmv'],
  ])('catches %s', (_name, text) => {
    expect(caught(text)).toBe(true);
  });

  test('catches a server secret renamed so it would ship inside the app', () => {
    // One character away from a real mistake: EXPO_PUBLIC_ names are built into the
    // web and phone bundles, where anybody can read them.
    expect(caught('EXPO_PUBLIC_DEEPGRAM_KEY=anything')).toBe(true);
    expect(caught('EXPO_PUBLIC_ANTHROPIC_KEY=anything')).toBe(true);
    expect(caught('EXPO_PUBLIC_SMTP_PASSWORD=anything')).toBe(true);
  });
});

describe('the secret scanner leaves alone things that are not keys', () => {
  test.each([
    ['the one public key the app is meant to have', 'EXPO_PUBLIC_SUPABASE_KEY=eyJhbGciOiJIUzI1NiJ9'],
    ['a server function reading its own secret', "const key = Deno.env.get('ANTHROPIC_API_KEY');"],
    ['the app reading a public setting', 'const url = process.env.EXPO_PUBLIC_SUPABASE_URL;'],
    ['an empty line in .env.example', 'EXPO_DEEPGRAM_KEY='],
    ['a stand-in that trails off', 'EXPO_ANTHROPIC_KEY=sk-ant-...'],
    ['a stand-in written as words', 'EXPO_SMTP_PASSWORD=the_mailbox_password'],
    ['a printf line showing the SHAPE of a key', "printf 'ANTHROPIC_API_KEY=sk-ant-%s\\n' \"rest\""],
    ['a shell variable', 'ANTHROPIC_API_KEY=$ANTHROPIC_KEY'],
    ['a template slot', 'ANTHROPIC_API_KEY=${THE_REAL_KEY}'],
    ['a vendor doc example', 'ANTHROPIC_API_KEY=YOUR_DEEPGRAM_API_KEY'],
    ['the words service_role in SQL', "grant execute on function public.claim_recap to service_role;"],
    ['a React key prop', '<Row key={note.id} />'],
  ])('leaves alone %s', (_name, text) => {
    expect(caught(text)).toBe(false);
  });

  test('a file may opt out, and only two files do', () => {
    expect(caught('// secret-scanner: allow-patterns\nKEY=sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);

    const fs = require('node:fs') as typeof import('fs');
    const path = require('node:path') as typeof import('path');
    const root = path.join(__dirname, '..');
    const skip = new Set(['node_modules', '.git', '.expo', 'dist', 'web-build', 'test-results', 'playwright-report', '.playwright-mcp', 'example', 'assets']);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (skip.has(e.name)) return [];
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
    const optedOut = walk(root)
      .filter((f) => /\.(ts|tsx|js|md|sql)$/.test(f))
      .filter((f) => fs.readFileSync(f, 'utf8').split('\n', 25).join('\n').includes('secret-scanner: allow-patterns'))
      .map((f) => path.relative(root, f));
    expect(optedOut.sort()).toEqual(['__tests__/secret-scan-test.ts', 'scripts/scan-secrets.js']);
  });
});

describe('placeholders', () => {
  test.each([['sk-ant-...'], ['the_mailbox_password'], ['your-key-here'], ['sk-ant-%s'], ['${KEY}'], ['YOUR_API_KEY']])('%s is a stand-in', (value) => {
    expect(isPlaceholder(value)).toBe(true);
  });

  test.each([['Hx7!qPz92Lmv'], ['sk-ant-api03-AAAAAAAAAAAA']])('%s is not a stand-in', (value) => {
    expect(isPlaceholder(value)).toBe(false);
  });
});
