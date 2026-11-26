/**
 * ONE FILE NAMES THE BOT SERVICE. THIS IS THE TEST THAT MAKES THAT A PROMISE.
 *
 * Gyan starts on Recall.ai and may not stay there: Vexa is a third cheaper and genuinely
 * Apache-2.0, Attendee's API is nearly the same shape, and self-hosting becomes arguable once the
 * bill passes about $50 a month (docs/decisions/bot-provider.md). Swapping should be writing ONE
 * new file and changing ONE line.
 *
 * That is easy to claim and easy to break: somebody adds a URL to a settings file, a price to a
 * screen, a status code to a hook, and six months later the "provider layer" is decoration. So
 * this file reads every line of the app and the server and fails if the vendor is named anywhere
 * but the two places it is allowed to be.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

/** The provider's own file, and the one line that chooses it. Nothing else. */
const ALLOWED = [
  'supabase/functions/_shared/meeting-bot/recall.ts',
  'supabase/functions/_shared/meeting-bot/index.ts',
];

/**
 * The file with its comments taken out.
 *
 * Comments are allowed to name the service, and should: a comment explaining WHY something is
 * shaped the way it is has to be able to say "their pages disagree about this". What must not
 * happen is the vendor appearing in anything that RUNS -- a URL, a field name, a status code, a
 * price, a branch on its name. That is what makes a swap one file instead of a search.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^\s*--.*$/gm, ' ')
    .replace(/^\s*#.*$/gm, ' ');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|sql|toml)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'supabase'))];

describe('the provider layer is real, not decoration', () => {
  test('NO CODE IN THE APP OR THE SERVER NAMES THE BOT SERVICE, outside its own file', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const relative = path.relative(root, file);
      if (ALLOWED.includes(relative)) continue;
      if (code(fs.readFileSync(file, 'utf8')).match(/\brecall\b/i)) offenders.push(relative);
    }
    expect(offenders).toEqual([]);
  });

  test('and the line that chooses it is one line, so a swap is one edit', () => {
    const chooser = fs.readFileSync(path.join(root, ALLOWED[1]), 'utf8');
    const picks = chooser.match(/from '\.\/[a-z-]+\.ts'/g) ?? [];
    // Three: the provider, the interface, and the link reader. Only one of them is a vendor.
    expect(picks).toContain("from './recall.ts'");
    expect(chooser.match(/from '\.\/recall\.ts'/g)).toHaveLength(1);
  });

  test('NO SCREEN AND NO OTHER SERVER FUNCTION knows a URL, a price or a status code', () => {
    const vendorish = [
      // Addresses.
      /recall\.ai/i,
      /us-east-1\./i,
      /api\/v1\/bot/i,
      // The service's own words for things.
      /\bsvix\b/i,
      /in_call_recording\b/,
      /audio_mixed/,
      /delete_media/,
      /leave_call/,
      /automatic_leave/,
      /media_shortcuts/,
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const relative = path.relative(root, file);
      if (ALLOWED.includes(relative)) continue;
      const text = code(fs.readFileSync(file, 'utf8'));
      for (const pattern of vendorish) {
        if (pattern.test(text)) offenders.push(`${relative}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the secrets are named for the JOB, not the vendor, so a swap keeps the same names', () => {
    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(example).toMatch(/^MEETING_BOT_API_KEY=$/m);
    expect(example).toMatch(/^MEETING_BOT_WEBHOOK_SECRET=$/m);
    expect(example).not.toMatch(/^RECALL_/m);
    const bot = fs.readFileSync(path.join(root, 'supabase/functions/bot/index.ts'), 'utf8');
    expect(bot).toContain("Deno.env.get('MEETING_BOT_API_KEY')");
    const webhook = fs.readFileSync(path.join(root, 'supabase/functions/bot-webhook/index.ts'), 'utf8');
    expect(webhook).toContain("Deno.env.get('MEETING_BOT_WEBHOOK_SECRET')");
  });

  test('a second provider has an exact target to write against', () => {
    const contract = fs.readFileSync(
      path.join(root, 'supabase/functions/_shared/meeting-bot/provider.ts'),
      'utf8',
    );
    for (const method of [
      'startBot', 'stopBot', 'verifyEvent', 'findAudio', 'deleteRecording', 'usdPerHour', 'name',
    ]) {
      expect(contract).toContain(method);
    }
    // And the interface itself names no vendor, which the first test above already proves.
  });

  test('the comparison the choice was made from is written down, with the date it was checked', () => {
    const doc = fs.readFileSync(path.join(root, 'docs/decisions/bot-provider.md'), 'utf8');
    expect(doc).toContain('2026-11-25');
    for (const name of ['Recall.ai', 'Vexa', 'Attendee', 'MeetingBaaS']) expect(doc).toContain(name);
    // Every price claim has to be reachable, so there has to be a link per option.
    expect(doc).toContain('https://www.recall.ai/pricing');
    expect(doc).toContain('https://vexa.ai/pricing');
    expect(doc).toContain('https://attendee.dev/pricing.html');
    expect(doc).toContain('https://meetingbaas.com/en/pricing');
    // And whether each one can really be self-hosted, which is the whole reason to keep the list.
    expect(doc).toContain('Apache-2.0');
    expect(doc).toContain('Elastic Licence 2.0');
  });
});
