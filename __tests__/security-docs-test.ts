/**
 * The security documents, kept honest.
 *
 * Two things these check, and both are about what the documents CLAIM rather than how they
 * are written:
 *
 *  1. Nowhere says Gyan is HIPAA or GDPR compliant. It is not, and a sentence like that in a
 *     document a customer reads is the kind of mistake that is very expensive and very easy
 *     to make by accident.
 *  2. The vendor register keeps the difference between "I checked this" and "I could not
 *     check this". A compliance document with an unverified claim in it is worse than one
 *     with an admitted gap.
 */
import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, '..', 'docs', 'security');
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');

const DOCS = ['audit-1.md', 'vendors.md', 'hipaa-checklist.md', 'incident-plan.md'];

describe('the security documents exist', () => {
  test.each(DOCS)('%s is there and is not a stub', (name) => {
    const text = read(name);
    expect(text.length).toBeGreaterThan(1500);
  });
});

describe('NOTHING CLAIMS GYAN IS COMPLIANT WITH ANYTHING', () => {
  test.each(DOCS)('%s never says it is compliant', (name) => {
    const text = read(name);
    // The sentences that would be untrue. Written out one by one rather than as a clever
    // pattern, so what is forbidden is obvious to somebody reading this test.
    for (const forbidden of [
      'gyan is hipaa compliant',
      'is hipaa compliant',
      'is gdpr compliant',
      'we are hipaa compliant',
      'fully compliant',
      'hipaa certified',
      'gdpr certified',
      'hipaa-compliant app',
    ]) {
      const haystack = text.toLowerCase();
      // "Supabase is HIPAA compliant" is a quote from Supabase about THEMSELVES, and is
      // allowed. Anything saying it about Gyan is not.
      const hits = [...haystack.matchAll(new RegExp(forbidden, 'g'))];
      for (const hit of hits) {
        const before = haystack.slice(Math.max(0, hit.index! - 60), hit.index!);
        const aboutSomebodyElse = /supabase|anthropic|deepgram|hostinger|recall/.test(before);
        const saysItIsNot = /not |never |does not |is not /.test(before);
        if (!aboutSomebodyElse && !saysItIsNot) {
          throw new Error(`${name} claims compliance: "...${before}${forbidden}..."`);
        }
      }
    }
  });

  test.each(DOCS)('%s uses the exact words we are allowed to use', (name) => {
    // Line breaks and quote markers are stripped first: whether the sentence happens to
    // wrap is incidental, and a test that fails on word wrapping teaches people to fight
    // the test rather than read it.
    const flat = read(name).toLowerCase().replace(/[\s>*]+/g, ' ');
    expect(flat).toContain('built to support hipaa and gdpr requirements, pending legal review');
  });
});

describe('the vendor register', () => {
  const vendors = read('vendors.md');

  test('every vendor that sees data is listed', () => {
    for (const vendor of ['Supabase', 'Deepgram', 'Anthropic', 'Hostinger', 'Recall.ai']) {
      expect(vendors).toContain(vendor);
    }
    // Resend no longer sends anything, but its DNS records still exist, so it stays listed.
    expect(vendors).toContain('Resend');
  });

  test('IT SAYS WHAT WAS CHECKED AND WHAT WAS NOT', () => {
    // The distinction is the whole value of the document.
    expect(vendors).toContain('**Verified**');
    expect(vendors).toContain('**Not found**');
    expect(vendors).toContain('Could not check');
    expect(vendors).toContain('What I could not check at all');
  });

  test('the signed column is left blank, because that is the founder’s to fill in', () => {
    const signedRows = [...vendors.matchAll(/\| \*\*Signed\*\* \|([^\n]*)\|/g)];
    expect(signedRows.length).toBeGreaterThanOrEqual(4);
    for (const [, value] of signedRows) expect(value.trim()).toBe('');
  });

  test('it warns that these pages change', () => {
    expect(vendors).toContain('When to check this again');
    expect(vendors.toLowerCase()).toContain('these pages change');
  });

  test('THE DEEPGRAM TRAINING PROBLEM IS WRITTEN DOWN, including what it does not fix', () => {
    expect(vendors).toContain('mip_opt_out=true');
    // The part that is easy to leave out: it does nothing about what was already sent.
    expect(vendors).toContain('changes nothing about recordings already sent');
  });
});

describe('the HIPAA checklist', () => {
  const checklist = read('hipaa-checklist.md');

  test('it separates what is code from what is paperwork', () => {
    expect(checklist).toContain('Part 1: the code');
    expect(checklist).toContain('Part 2: the paperwork');
  });

  test('IT SAYS PLAINLY THAT CODE DOES NOT FINISH THE JOB', () => {
    expect(checklist).toContain('No amount of code finishes this part');
  });

  test('the things that are NOT done are marked as not done', () => {
    expect(checklist).toContain('**NOT DONE**');
    // And the honest limit on two-factor is spelled out rather than glossed over.
    expect(checklist).toContain('A way back in first, then the stricter rule');
    expect(checklist).toContain('marked experimental');
  });

  test('no BAA is claimed as signed', () => {
    expect(checklist).toContain('No BAA is signed with any vendor');
  });
});

describe('the incident plan', () => {
  const plan = read('incident-plan.md');

  test('IT IS MARKED AS A DRAFT FOR A LAWYER, right at the top', () => {
    const top = plan.slice(0, 400);
    expect(top).toContain('DRAFT');
    expect(top.toLowerCase()).toContain('lawyer');
  });

  test('it does not state legal deadlines as fact', () => {
    expect(plan).toContain('need a lawyer to confirm');
  });

  test('it says what to do first, and what not to do', () => {
    expect(plan).toContain('Do not delete anything');
    expect(plan.toLowerCase()).toContain('passwords are the one thing you can be calm about');
  });
});

describe('nothing ANYWHERE in the project claims compliance', () => {
  // Not just the four security documents: the app's own words, the help text and every
  // other document too. This is the sentence that would be most expensive to get wrong,
  // and the easiest to write by accident while describing what was built.
  test('no file says Gyan is compliant with anything', () => {
    const root = path.join(__dirname, '..');
    const skip = new Set(['node_modules', '.git', '.expo', 'dist', 'web-build', 'test-results', 'playwright-report', '.playwright-mcp', 'example', 'assets']);
    const walk = (at: string): string[] =>
      fs.readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
        if (skip.has(entry.name)) return [];
        const full = path.join(at, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      });

    const offenders: string[] = [];
    for (const file of walk(root).filter((f) => /\.(ts|tsx|md|sql|json)$/.test(f))) {
      // This test has to write the forbidden sentences down in order to look for them.
      if (/security-docs-test\.ts$/.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const hit of text.matchAll(/(?:gyan|we|the app|this app)\s+(?:is|are)\s+(hipaa|gdpr)[ -]?compliant/gi)) {
        // Saying what we must NOT claim is the point of several of these documents, so a
        // sentence like "it is not the same as saying Gyan is HIPAA compliant" is fine.
        // Only an actual claim counts.
        const before = text.slice(Math.max(0, hit.index! - 120), hit.index!).toLowerCase();
        const denied = /\bnot\b|\bnever\b|\bavoid\b|\bforbidden\b|rather than|instead of/.test(before);
        if (!denied) offenders.push(`${path.relative(root, file)}: claims ${hit[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
