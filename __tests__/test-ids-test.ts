/**
 * Every control the browser scripts drive has a stable name, and keeps it.
 *
 * The browser scripts used to find things by the words on screen. That worked until a redesign
 * moved a button or reworded a sentence, and then about five hundred assertions broke at once
 * for one reason -- which is exactly when a real problem is impossible to see. So the scripts
 * now PRESS things by `testID` and only ASSERT on words. A testID is a promise: delete one and
 * the scripts break silently the next time somebody runs them.
 *
 * This test is the promise written down. If you remove or rename a name below, this fails and
 * tells you which browser scripts to fix in the same change.
 *
 * It reads the source rather than rendering anything, because several of these live on screens
 * that need a signed-in account, a note and a server to render at all.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', 'src');

/** Every .ts/.tsx file under src/, read once. */
function sourceText(): string {
  const parts: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) parts.push(readFileSync(full, 'utf8'));
    }
  };
  walk(SRC);
  return parts.join('\n');
}

/** Names written out in full, exactly as a browser script asks for them. */
const EXACT = [
  // The way in. signIn() in tests/fixtures/fake-api.ts waits on home-screen, so every
  // single browser script depends on this one name.
  'home-screen',
  'auth-email',
  'auth-password',
  'auth-submit',
  'auth-switch-mode',
  // Getting around.
  'nav-home',
  'nav-settings',
  'nav-ask',
  // Home.
  'home-new-note',
  'home-filters',
  'home-clear-filters',
  'home-see-lines',
  'home-select',
  'home-note-action-share',
  'home-note-action-delete',
  'home-select-cancel',
  'home-select-delete',
  // The other four screens.
  'new-note-screen',
  'new-note-record',
  'new-note-upload',
  'new-note-paste',
  'new-note-meeting-link',
  'new-note-title',
  'new-note-text',
  'new-note-add',
  // Meeting link (prompt 14). Named for the purpose, so restyling cannot touch them.
  'new-note-bot-hours',
  'meeting-link-screen',
  'meeting-link-coming-soon',
  'meeting-link-url',
  'meeting-link-what-happens',
  'meeting-link-consent',
  'meeting-link-send',
  'meeting-link-hours',
  'meeting-link-max-minutes',
  'note-bot-live',
  'note-bot-stop',
  'settings-plan-bot-hours',
  'search-screen',
  'ask-screen',
  'ask-chat',
  'settings-screen',
  'settings-log-out',
  'settings-row-profile',
  'settings-row-plan',
  'settings-row-team',
  'settings-row-recaps',
  'settings-row-security',
  'settings-row-data',
  'note-screen',
  'note-chat',
  'note-back',
  'note-more',
  'note-language',
  'note-translate',
  'note-send-recap',
  // Panels, which all close the same way.
  'filters-backdrop',
  'language-backdrop',
  'recap-backdrop',
  'help-backdrop',
  // Two-factor, the one name that existed before this round.
  'two-factor-qr',
];

/**
 * Names built at render time. The test checks the piece that builds them, because the finished
 * name only exists once there is a real note or a real help entry on screen.
 */
const BUILT = [
  ['a name per sign-in screen', 'auth-screen-${mode}'],
  ['a name per note row', 'home-note-row-${note.id}'],
  ['a name per row menu button', 'home-note-more-${note.id}'],
  ['a name per swipe Share', 'home-note-share-${note.id}'],
  ['a name per swipe Delete', 'home-note-delete-${note.id}'],
  ['a name per filter chip', 'home-filter-chip-${label}'],
  ['a name per help button', 'help-button-${helpId}'],
  ['a name per note tab', '${testIDPrefix}-${tab.toLowerCase()'],
  ['a name per search box', '${testIDPrefix}-field'],
  ['a name per confirm dialog', '${testIDPrefix}-confirm'],
  ['a name per slide panel backdrop', '${testIDPrefix}-backdrop'],
] as const;

describe('stable test names', () => {
  const text = sourceText();

  test.each(EXACT)('%s is still in the app', (id) => {
    // Either quote. Most names are written as a JSX attribute, `testID="note-back"`, but the
    // ones the "More" menu is built from are values in an array of items, where the project's
    // own style is single quotes. A name is a name whichever way it is written down.
    expect(`${text.includes(`"${id}`)}|${text.includes(`'${id}'`)}`).not.toBe('false|false');
  });

  test.each(BUILT)('%s is still built (%s)', (_what, snippet) => {
    expect(text).toContain(snippet);
  });

  test('the prefixes that build names are actually passed in', () => {
    // A prefix with no caller builds nothing, so the names would quietly not exist.
    expect(text).toContain('testIDPrefix="home-search"');
    expect(text).toContain('testIDPrefix="note-tab"');
    expect(text).toContain('testIDPrefix="home-delete"');
    expect(text).toContain('testIDPrefix="note-more"');
    expect(text).toContain('testIDPrefix="home-note-actions"');
  });

  test('brand blue is never used as a test name, because names are not styling', () => {
    // A guard against somebody "helpfully" keying a name off a colour or a size.
    expect(text).not.toContain('testID={Colors');
  });
});
