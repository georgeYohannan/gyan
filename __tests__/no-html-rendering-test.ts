/**
 * NOTHING A PERSON OR AN AI WROTE IS EVER SHOWN AS HTML.
 *
 * This is why a <script> tag in a summary, or a markdown link an AI invented, is just
 * characters on a screen in Gyan rather than something that runs. React Native draws text
 * through Text, which cannot interpret tags -- but only as long as nobody adds a way round
 * it. One `dangerouslySetInnerHTML`, one markdown renderer, or one WebView would quietly
 * undo it, and the change would look harmless in review.
 *
 * So this test watches the whole app for those ways round, rather than testing a screen.
 */
import fs from 'fs';
import path from 'path';

import { renderRecap } from '../supabase/functions/recap/email';
import { renderInvite } from '../supabase/functions/team/invite-email';

const root = path.join(__dirname, '..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const appFiles = walk(path.join(root, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));

describe('the app has no way to show text as HTML', () => {
  test('there are app files to check (so this test cannot pass by finding nothing)', () => {
    expect(appFiles.length).toBeGreaterThan(50);
  });

  test.each([
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML', /\binnerHTML\b/],
    ['outerHTML', /\bouterHTML\b/],
    ['document.write', /document\s*\.\s*write/],
    ['a web page inside the app', /\bWebView\b|react-native-webview/],
    // Matched as IMPORTS, not as words: "marked" is an ordinary English word and appears
    // in several comments.
    ['an HTML or markdown renderer', /(?:from|require\s*\()\s*['"](?:react-native-render-html|react-markdown|marked|markdown-it|html-react-parser)['"]/],
    ['running text as code', /\beval\s*\(|new Function\s*\(/],
    ['an iframe', /<iframe|srcdoc/],
  ])('no %s anywhere in the app', (_what, pattern) => {
    const offenders = appFiles.filter((f) => pattern.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  test('no HTML renderer is even installed', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const installed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const risky of ['react-native-webview', 'react-native-render-html', 'react-markdown', 'marked', 'markdown-it', 'dompurify']) {
      expect(installed).not.toContain(risky);
    }
  });

  test('THE ONLY WAY GYAN OPENS A LINK TAKES A FIXED ADDRESS, never text from a note', () => {
    // openBrowserAsync is the one place the app hands an address to the outside world. Its
    // type refuses anything but a known route, and every caller passes a literal, so an
    // address an AI made up cannot reach it.
    const linkFile = path.join(root, 'src/components/external-link.tsx');
    const source = fs.readFileSync(linkFile, 'utf8');
    expect(source).toContain('openBrowserAsync');
    expect(source).toMatch(/href:\s*Href/);

    // And nothing else in the app opens anything at all.
    const openers = appFiles
      .filter((f) => f !== linkFile)
      .filter((f) => /openBrowserAsync|Linking\s*\.\s*openURL/.test(fs.readFileSync(f, 'utf8')));
    expect(openers.map((f) => path.relative(root, f))).toEqual([]);
  });
});

describe('the two emails are the only place HTML is built, and both escape everything', () => {
  const emailFiles = [
    'supabase/functions/recap/email.ts',
    'supabase/functions/team/invite-email.ts',
  ];

  test.each(emailFiles)('%s escapes every piece of text it is given', (file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    // One shared escaper, so the two copies cannot drift apart again. They already had:
    // the invite one was missing the single quote.
    expect(source).toContain("from '../_shared/html.ts'");
    expect(source).not.toMatch(/function escapeHtml/);
  });

  test('EVERY PIECE OF TEXT A PERSON OR AN AI WROTE COMES OUT ESCAPED', () => {
    // Tested by RENDERING rather than by reading the source. A real email is built with a
    // hostile string in every single field a person or an AI can fill, and then checked.
    // This cannot go stale the way a list of allowed names would.
    const nasty = `<script>alert('x')</script><img src=x onerror=alert(1)>" & '`;

    const email = renderRecap({
      body: {
        title: nasty,
        overview: nasty,
        keyPoints: [nasty],
        decisions: [nasty],
        actionItems: [{ text: nasty, owner: nasty, due: nasty }],
      },
      date: '2026-11-19T09:30:00Z',
      language: 'en',
      translated: true,
      ownerName: nasty,
      noteUrl: 'https://app.example.test/note/abc',
      settingsUrl: 'https://app.example.test/settings/recaps',
      sender: { name: 'gyan', email: 'gyan@example.test', replyTo: 'gyan@example.test' },
    });

    // No tag of theirs survives as a tag. Note that the TEXT "onerror=" does appear, inside
    // "&lt;img src=x onerror=alert(1)&gt;" -- that is the escaped version, which is just
    // characters on the page. What must not appear is a real "<img" or "<script".
    expect(email.html).not.toContain('<script');
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain("alert('x')");
    // The words are still there, written out safely, so nothing has been silently dropped.
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('&#39;');
    expect(email.html).toContain('&quot;');
    expect(email.html).toContain('&amp;');

    // The plain words version is text, not a page, so it needs no escaping -- and must
    // still carry the same facts.
    expect(email.text).toContain('<script>');
    expect(email.subject).not.toContain('\n');

    // And the same for the invite email.
    const invite = renderInvite({ ownerName: nasty, joinUrl: 'https://app.example.test/join?token=abc' });
    expect(invite.html).not.toContain('<script');
    expect(invite.html).not.toContain('<img');
    expect(invite.html).toContain('&lt;script&gt;');
    // The single quote, which one of the two old copies of the escaper missed.
    expect(invite.html).toContain('&#39;');
    // A Subject is one line, whatever the name holds.
    expect(renderInvite({ ownerName: 'Sam\r\nBcc: someone@else.test', joinUrl: 'https://x.test/join' }).subject).toBe(
      'Sam Bcc: someone@else.test invited you to gyan',
    );
  });
});
