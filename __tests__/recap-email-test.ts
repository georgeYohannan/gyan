/**
 * The words and the layout of one recap email.
 *
 * Nothing here sends anything: email.ts is pure, which is the whole reason the layout lives in
 * its own file. Every name and address below is made up.
 */
import fs from 'fs';
import path from 'path';

import {
  escapeHtml,
  fromHeader,
  itemNote,
  LANGUAGE_NAMES,
  languageName,
  messageForSendError,
  MESSAGES,
  noteUrlFor,
  plainDate,
  renderRecap,
  RTL_LANGUAGES,
  sameLanguage,
  settingsUrlFor,
  TRANSLATED_LABEL,
  type RecapBody,
  type Sender,
} from '../supabase/functions/recap/email';
import { SENDER } from '../supabase/functions/recap/settings';

const SENDER_FOR_TESTS: Sender = {
  name: 'gyan',
  email: 'recaps@example.test',
  replyTo: 'hello@example.test',
};

const BODY: RecapBody = {
  title: 'Monday planning call',
  overview: 'The team agreed to ship the new sign up screen on Friday.',
  keyPoints: ['Sign up is slow on phones', 'Two people tested it'],
  decisions: ['Ship on Friday'],
  actionItems: [
    { text: 'Send the test plan', owner: 'Priya Shah', due: 'Friday' },
    { text: 'Book the review', owner: null, due: null },
  ],
};

function render(over: Partial<Parameters<typeof renderRecap>[0]> = {}) {
  return renderRecap({
    body: BODY,
    date: '2026-11-19T09:30:00Z',
    language: 'en',
    translated: false,
    ownerName: 'Sam Carter',
    noteUrl: 'https://app.example.test/note/abc',
    settingsUrl: 'https://app.example.test/settings/recaps',
    sender: SENDER_FOR_TESTS,
    ...over,
  });
}

describe('who the email comes from', () => {
  test('the address is kept in ONE setting, never written into the layout', () => {
    const layout = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'recap', 'email.ts'),
      'utf8',
    );
    // The real sender appears in settings.ts and nowhere else in the code that builds the email.
    // Checked against whatever the address IS, so this keeps working if it ever changes again.
    expect(layout).not.toContain(SENDER.email);
    expect(layout).not.toContain(SENDER.replyTo);
    expect(layout).not.toContain('gyantechai.com');
    expect(SENDER.email).toBe('gyan@gyantechai.com');
    expect(SENDER.replyTo).toBe('gyan@gyantechai.com');
    expect(SENDER.name).toBe('gyan');
  });

  test('the name and the reply address travel together, in one object', () => {
    expect(Object.keys(SENDER).sort()).toEqual(['email', 'name', 'replyTo']);
  });

  test('it is written the way an email names a sender', () => {
    expect(fromHeader(SENDER_FOR_TESTS)).toBe('gyan <recaps@example.test>');
  });
});

describe('the subject and the date', () => {
  test('the subject names the note', () => {
    expect(render().subject).toBe('Recap: Monday planning call');
  });

  test('a note with no title still gets a subject that makes sense', () => {
    expect(render({ body: { ...BODY, title: '   ' } }).subject).toBe('Recap: Your note');
  });

  test('the date is a plain date, never a raw timestamp', () => {
    expect(plainDate('2026-11-19T09:30:00Z')).toBe('19 November 2026');
    expect(render().text).toContain('19 November 2026');
    expect(render().html).toContain('19 November 2026');
  });

  test('a missing or broken date leaves the line out rather than printing nonsense', () => {
    expect(plainDate(null)).toBe('');
    expect(plainDate('not a date')).toBe('');
    const empty = render({ date: null });
    expect(empty.text).not.toContain('undefined');
    expect(empty.html).not.toContain('Invalid');
  });
});

describe('what is in the email', () => {
  test('both versions carry every section', () => {
    const { html, text } = render();
    for (const version of [html, text]) {
      expect(version).toContain('Monday planning call');
      expect(version).toContain('The team agreed to ship the new sign up screen on Friday.');
      expect(version).toContain('Sign up is slow on phones');
      expect(version).toContain('Two people tested it');
      expect(version).toContain('Ship on Friday');
      expect(version).toContain('Send the test plan');
      expect(version).toContain('Book the review');
    }
    expect(html).toContain('Key points');
    expect(html).toContain('Decisions');
    expect(html).toContain('Action items');
    expect(text).toContain('KEY POINTS');
    expect(text).toContain('DECISIONS');
    expect(text).toContain('ACTION ITEMS');
  });

  test('a to-do says who it is for and when it is due, in plain words', () => {
    expect(itemNote({ text: 'x', owner: 'Priya Shah', due: 'Friday' })).toBe('Priya Shah, by Friday');
    expect(itemNote({ text: 'x', owner: 'Priya Shah', due: null })).toBe('Priya Shah');
    expect(itemNote({ text: 'x', owner: null, due: 'Friday' })).toBe('by Friday');
    expect(itemNote({ text: 'x', owner: null, due: null })).toBe('');
    expect(render().html).toContain('Priya Shah, by Friday');
    expect(render().text).toContain('Send the test plan (Priya Shah, by Friday)');
  });

  test('an empty section is left out instead of showing an empty heading', () => {
    const bare = render({
      body: { title: 'Quick chat', overview: '', keyPoints: [], decisions: [], actionItems: [] },
    });
    expect(bare.html).not.toContain('Key points');
    expect(bare.html).not.toContain('Action items');
    expect(bare.text).not.toContain('KEY POINTS');
  });

  test('there is a button that opens the note in the app', () => {
    const { html, text } = render();
    expect(html).toContain('https://app.example.test/note/abc');
    expect(html).toContain('Open this note in gyan');
    // Plain text has no buttons, so the address is written out.
    expect(text).toContain('Open this note in gyan:\nhttps://app.example.test/note/abc');
  });

  test('the app addresses are built from one app address', () => {
    expect(noteUrlFor('https://app.example.test', 'abc')).toBe('https://app.example.test/note/abc');
    expect(noteUrlFor('https://app.example.test/', 'abc')).toBe('https://app.example.test/note/abc');
    expect(settingsUrlFor('https://app.example.test/')).toBe('https://app.example.test/settings/recaps');
  });
});

describe('the footer', () => {
  test('every email says why it arrived and how to stop it', () => {
    const { html, text } = render();
    for (const version of [html, text]) {
      expect(version).toContain("Sam Carter's workspace in gyan");
      expect(version).toContain('Turn off recaps');
      expect(version).toContain('https://app.example.test/settings/recaps');
      expect(version).toContain('hello@example.test');
    }
  });

  test('the Turn off recaps link really is a link, pointing at a page in the app', () => {
    expect(render().html).toContain('href="https://app.example.test/settings/recaps"');
  });

  test('it is there even when the note is almost empty', () => {
    const bare = render({
      body: { title: '', overview: '', keyPoints: [], decisions: [], actionItems: [] },
      date: null,
    });
    expect(bare.html).toContain('Turn off recaps');
    expect(bare.text).toContain('Turn off recaps');
  });
});

describe('translated words', () => {
  test('a translated email says "Translated by AI" and names the language', () => {
    const { html, text } = render({ translated: true, language: 'es' });
    expect(html).toContain(TRANSLATED_LABEL);
    expect(html).toContain('Spanish');
    expect(html).toContain('Names, numbers and times are unchanged.');
    expect(text).toContain('Translated by AI. Spanish. Names, numbers and times are unchanged.');
  });

  test('an email that was NOT translated never claims it was', () => {
    const { html, text } = render();
    expect(html).not.toContain(TRANSLATED_LABEL);
    expect(text).not.toContain(TRANSLATED_LABEL);
  });

  test('Arabic words read right to left, while the page around them does not move', () => {
    const arabic = render({ translated: true, language: 'ar' });
    expect(arabic.html).toContain('dir="rtl"');
    expect(RTL_LANGUAGES).toEqual(['ar']);
    // English stays the other way round.
    expect(render().html).toContain('dir="ltr"');
    expect(render().html).not.toContain('dir="rtl"');
  });
});

describe('safety and good manners', () => {
  test('a quote mark or an angle bracket in a note can never break the layout', () => {
    expect(escapeHtml(`<b>"Sam's" & co</b>`)).toBe(
      '&lt;b&gt;&quot;Sam&#39;s&quot; &amp; co&lt;/b&gt;',
    );
    const nasty = render({
      body: { ...BODY, overview: '<script>alert("x")</script>' },
    });
    expect(nasty.html).not.toContain('<script>');
    expect(nasty.html).toContain('&lt;script&gt;');
  });

  test('the colours are the Gyan ones, written inline because email throws style sheets away', () => {
    const { html } = render();
    expect(html).toContain('#0B1220'); // the navy page
    expect(html).toContain('#0F172A'); // the panel
    expect(html).toContain('#E2E8F0'); // body text
    expect(html).toContain('#0066FF'); // the button fill
    expect(html).not.toContain('<style');
    expect(html).not.toContain('var(--');
  });

  test('brand blue is only ever a fill, never words sitting on the navy', () => {
    const { html } = render();
    // Brand blue is only ever a background-color or a bgcolor. Links use the light blue instead.
    expect(html).not.toMatch(/[^-]color:\s*#0066FF/i);
    expect(html).toContain('background-color:#0066FF');
    expect(html).toContain('#99CBFF');
  });

  test('it is a whole page, so every email program knows what to do with it', () => {
    const { html } = render();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('max-width:600px');
    expect(html.trim().endsWith('</html>')).toBe(true);
  });
});

describe('plain words when something goes wrong', () => {
  test('no message mentions a password, a code, or anything technical', () => {
    for (const message of Object.values(MESSAGES)) {
      expect(message).not.toMatch(/token|api|http|smtp|port|password|[0-9]{3}|hostinger|supabase/i);
      expect(message.endsWith('.')).toBe(true);
    }
  });

  test('a wrong password reads as not being able to sign in', () => {
    // Every mail server words this differently, so both the code and the words are read.
    expect(messageForSendError(new Error('535 5.7.8 Authentication credentials invalid'))).toBe(MESSAGES.signIn);
    expect(messageForSendError(new Error('530 Must issue a STARTTLS command first'))).toBe(MESSAGES.signIn);
    expect(messageForSendError('Authentication failed')).toBe(MESSAGES.signIn);
  });

  test('a refused address is told apart from everything else', () => {
    expect(messageForSendError(new Error('550 5.1.1 No such user here'))).toBe(MESSAGES.badRecipient);
    expect(messageForSendError(new Error('553 Requested action not taken: mailbox name not allowed'))).toBe(
      MESSAGES.badRecipient,
    );
  });

  test('sending too much for one day says to come back tomorrow, not "try again"', () => {
    expect(messageForSendError(new Error('Daily sending quota exceeded'))).toBe(MESSAGES.tooMany);
    expect(messageForSendError(new Error('too many messages'))).toBe(MESSAGES.tooMany);
  });

  test('a busy server says to try again in a minute', () => {
    expect(messageForSendError(new Error('421 Service not available, closing channel'))).toBe(MESSAGES.busy);
    expect(messageForSendError(new Error('451 Temporarily deferred'))).toBe(MESSAGES.busy);
  });

  test('NEVER REACHING THE MAIL SERVER AT ALL has its own message', () => {
    // This is what a blocked port looks like, which is the one real risk in sending this way.
    expect(messageForSendError(new Error('connection refused'))).toBe(MESSAGES.service);
    expect(messageForSendError(new Error('Connection timed out'))).toBe(MESSAGES.service);
    expect(messageForSendError(new TypeError('error sending request: tls handshake eof'))).toBe(MESSAGES.service);
  });

  test('anything it does not recognise becomes plain words, never the server\'s own jargon', () => {
    expect(messageForSendError(new Error('�� 999 weird'))).toBe(MESSAGES.problem);
    expect(messageForSendError(undefined)).toBe(MESSAGES.problem);
    expect(messageForSendError(null)).toBe(MESSAGES.problem);
  });
});

describe('languages', () => {
  test('it knows all 16 languages Gyan offers', () => {
    expect(Object.keys(LANGUAGE_NAMES)).toHaveLength(16);
    expect(languageName('hi')).toBe('Hindi');
    expect(languageName('pt-BR')).toBe('Portuguese');
    expect(languageName(null)).toBe('English');
  });

  test('two codes for the same language count as the same language', () => {
    expect(sameLanguage('pt-BR', 'pt')).toBe(true);
    expect(sameLanguage('pt', 'es')).toBe(false);
    expect(sameLanguage(null, 'en')).toBe(false);
    expect(sameLanguage('', '')).toBe(false);
  });
});
