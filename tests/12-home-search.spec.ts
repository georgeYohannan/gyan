/**
 * Finding a note: paging, searching, filtering, and deleting several at once (prompt 12).
 *
 * Fake data only. The stand-in server in tests/fixtures/fake-api.ts does the filtering and
 * paging in JavaScript, so nothing here touches a database and no paid service is called.
 * Whether the real search understands English word endings is proved against a real Postgres
 * by `npm run check:db`, not here.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { ACCOUNT_ID, installFakes, noteRow, signIn } from './fixtures/fake-api';

/** Expo Router keeps screens mounted off to the side, so only count what people can see. */
const shown = (locator: Locator) => locator.filter({ visible: true });

/** Every note row on screen. The titles are "Note 01", "Note 02", and so on. */
const rows = (page: Page) => shown(page.getByText(/^Note \d\d$/));

/** The Filters button, which reads "Filters" or "Filters, 3 on". Plain "Filters" would also
 *  match "Clear filters", so it is matched from the start of the label. */
const filtersButton = (page: Page) => page.getByRole('button', { name: /^Filters(, \d+ on)?$/ });

const DAY = 24 * 60 * 60 * 1000;

/** `count` notes, newest first, one every other day, with a few made different on purpose. */
function manyNotes(count: number) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return noteRow({
      id: `note-${String(n).padStart(2, '0')}`,
      title: `Note ${String(n).padStart(2, '0')}`,
      // The first two are today and yesterday, so the day headings have something to show.
      created_at: new Date(now - (i === 0 ? 0 : i === 1 ? DAY : i * 2 * DAY)).toISOString(),
      status: n % 7 === 0 ? 'failed' : n % 5 === 0 ? 'transcribing' : 'ready',
      source: n % 4 === 0 ? 'text' : n % 3 === 0 ? 'bot' : 'upload',
      error_message: n % 7 === 0 ? 'We could not read this audio file.' : null,
      file_path: `${ACCOUNT_ID}/note-${String(n).padStart(2, '0')}/recording.mp3`,
    });
  });
}

test('Home opens with ten notes under day headings, and Show more adds twenty', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(35) });
  await signIn(page);

  // Ten to begin with, out of thirty-five.
  await expect(rows(page)).toHaveCount(10);
  await expect(shown(page.getByText('35 notes')).first()).toBeVisible();
  await expect(shown(page.getByText('Today')).first()).toBeVisible();
  await expect(shown(page.getByText('Yesterday')).first()).toBeVisible();

  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(rows(page)).toHaveCount(30);

  // The last five, and then no more button.
  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(rows(page)).toHaveCount(35);
  await expect(page.getByRole('button', { name: 'Show more' })).toBeHidden();
});

test('no single request ever asks for more than thirty notes', async ({ page }) => {
  const recorder = await installFakes(page, { notes: manyNotes(60) });
  await signIn(page);
  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(rows(page)).toHaveCount(30);
  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(rows(page)).toHaveCount(50);

  const asks = recorder.searches.filter((u) => u.name === 'find_notes');
  expect(asks.length).toBeGreaterThan(1);
  for (const ask of asks) {
    expect((ask.body as { p_limit: number }).p_limit).toBeLessThanOrEqual(30);
  }
});

test('searching a word shows a snippet, says where it was found, and counts the matches', async ({ page }) => {
  await installFakes(page, {
    notes: manyNotes(12),
    searchText: {
      'note-03': { transcript: 'We agreed the pricing has to go up before the quarter ends.', startMs: 64000 },
      'note-08': { summary: 'The team settled the pricing question.' },
    },
  });
  await signIn(page);

  await page.getByLabel('Search your notes').fill('pricing');

  await expect(rows(page)).toHaveCount(2);
  await expect(shown(page.getByText('2 notes found')).first()).toBeVisible();
  await expect(shown(page.getByText(/has to go up before the quarter/)).first()).toBeVisible();
  await expect(shown(page.getByText('Found in the transcript')).first()).toBeVisible();
  await expect(shown(page.getByText('Found in the summary')).first()).toBeVisible();
  // The moment the line was said comes with it.
  await expect(shown(page.getByText('1:04')).first()).toBeVisible();
  // While searching, the list is in best-match order, so there are no day headings.
  await expect(shown(page.getByText('Today'))).toHaveCount(0);
});

test('it waits for the typing to stop rather than searching every letter', async ({ page }) => {
  const recorder = await installFakes(page, {
    notes: manyNotes(5),
    searchText: { 'note-02': { transcript: 'all about pricing' } },
  });
  await signIn(page);

  const before = recorder.searches.filter((u) => u.name === 'find_notes').length;
  await page.getByLabel('Search your notes').pressSequentially('pricing', { delay: 20 });
  await expect(rows(page)).toHaveCount(1);

  const searches = recorder.searches
    .filter((u) => u.name === 'find_notes')
    .slice(before)
    .filter((u) => (u.body as { p_query: string | null }).p_query !== null);
  // Seven letters, far fewer than seven searches.
  expect(searches.length).toBeLessThan(4);
});

test('clearing the box brings the whole list back', async ({ page }) => {
  await installFakes(page, {
    notes: manyNotes(12),
    searchText: { 'note-03': { transcript: 'about pricing' } },
  });
  await signIn(page);

  await page.getByLabel('Search your notes').fill('pricing');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear the search' }).click();
  await expect(rows(page)).toHaveCount(10);
});

test('a word nobody said says so, and offers the whole list back', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(12) });
  await signIn(page);

  await page.getByLabel('Search your notes').fill('zebra');
  await expect(shown(page.getByText('No notes match')).first()).toBeVisible();
  // Not "No notes yet": this person has twelve.
  await expect(page.getByText('No notes yet')).toBeHidden();

  await shown(page.getByRole('button', { name: 'Show all notes' })).first().click();
  await expect(rows(page)).toHaveCount(10);
});

test('the date presets narrow the list, and each one can be taken off again', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(20) });
  await signIn(page);

  await filtersButton(page).click();
  await shown(page.getByRole('radio', { name: 'Last 7 days' })).first().click();
  await shown(page.getByRole('button', { name: 'Show these notes' })).first().click();

  // Notes are every other day, so the last seven days holds today, yesterday and two more.
  await expect(rows(page)).toHaveCount(4);
  await expect(shown(page.getByText('4 notes found')).first()).toBeVisible();
  await expect(shown(page.getByText('Filters (1)')).first()).toBeVisible();

  await page.getByRole('button', { name: 'Remove the Last 7 days filter' }).click();
  await expect(rows(page)).toHaveCount(10);
  await expect(shown(page.getByText('Filters')).first()).toBeVisible();
});

test('Today and This month are offered as well, and work', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(20) });
  await signIn(page);

  await filtersButton(page).click();
  await shown(page.getByRole('radio', { name: 'Today', exact: true })).first().click();
  await shown(page.getByRole('button', { name: 'Show these notes' })).first().click();
  await expect(rows(page)).toHaveCount(1);

  await filtersButton(page).click();
  await shown(page.getByRole('radio', { name: 'Last 30 days' })).first().click();
  await shown(page.getByRole('button', { name: 'Show these notes' })).first().click();
  await expect(rows(page)).toHaveCount(10);
});

test('a custom range is picked on a calendar, and both days are included', async ({ page }) => {
  const now = new Date();
  // Three notes, on three days this month that are safely in the past.
  const day = (n: number) => new Date(now.getFullYear(), now.getMonth(), n, 12, 0).toISOString();
  await installFakes(page, {
    notes: [
      noteRow({ id: 'note-01', title: 'Note 01', created_at: day(3) }),
      noteRow({ id: 'note-02', title: 'Note 02', created_at: day(5) }),
      noteRow({ id: 'note-03', title: 'Note 03', created_at: day(9) }),
    ],
  });
  await signIn(page);

  await filtersButton(page).click();
  await shown(page.getByRole('radio', { name: 'Custom range' })).first().click();
  await expect(page.getByText('Pick the first day.')).toBeVisible();

  const pick = (n: number) =>
    page
      .getByRole('button', {
        name: new Date(now.getFullYear(), now.getMonth(), n).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      })
      .click();

  await pick(3);
  await expect(page.getByText('Now pick the last day.')).toBeVisible();
  await pick(5);
  await expect(page.getByText('Both days are included.')).toBeVisible();
  await shown(page.getByRole('button', { name: 'Show these notes' })).first().click();

  // The 3rd and the 5th, including the whole of the 5th. Not the 9th.
  await expect(rows(page)).toHaveCount(2);
  await expect(shown(page.getByText('Note 03'))).toHaveCount(0);
});

test('status, source and open to-dos work together with a search word', async ({ page }) => {
  await installFakes(page, {
    notes: [
      noteRow({ id: 'note-01', title: 'Note 01', status: 'ready', source: 'upload' }),
      noteRow({ id: 'note-02', title: 'Note 02', status: 'failed', source: 'upload' }),
      noteRow({ id: 'note-03', title: 'Note 03', status: 'ready', source: 'text' }),
      noteRow({ id: 'note-04', title: 'Note 04', status: 'ready', source: 'upload' }),
    ],
    openActions: ['note-01'],
    searchText: {
      'note-01': { transcript: 'the budget went up' },
      'note-02': { transcript: 'the budget went up' },
      'note-03': { transcript: 'the budget went up' },
      'note-04': { transcript: 'the budget went down' },
    },
  });
  await signIn(page);

  await page.getByLabel('Search your notes').fill('budget went up');
  await expect(rows(page)).toHaveCount(3);

  await filtersButton(page).click();
  await shown(page.getByRole('checkbox', { name: 'Ready', exact: true })).first().click();
  await shown(page.getByRole('checkbox', { name: 'Upload', exact: true })).first().click();
  await shown(page.getByRole('button', { name: 'Show these notes' })).first().click();

  // Ready AND an upload AND those words: only Note 01.
  await expect(rows(page)).toHaveCount(1);
  await expect(shown(page.getByText('Note 01')).first()).toBeVisible();

  // And adding "still has something to do" keeps it, because Note 01 has one.
  await filtersButton(page).click();
  await shown(page.getByRole('checkbox', { name: 'Still has something to do' })).first().click();
  await shown(page.getByRole('button', { name: 'Show these notes' })).first().click();
  await expect(rows(page)).toHaveCount(1);
  await expect(shown(page.getByText('Still has something to do')).first()).toBeVisible();
});

test('Clear filters puts everything back in one press', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(12), searchText: { 'note-02': { transcript: 'pricing' } } });
  await signIn(page);

  await page.getByLabel('Search your notes').fill('pricing');
  await filtersButton(page).click();
  await shown(page.getByRole('checkbox', { name: 'Ready', exact: true })).first().click();
  await shown(page.getByRole('button', { name: 'Show these notes' })).first().click();
  await expect(shown(page.getByText('Filters (1)')).first()).toBeVisible();

  await shown(page.getByRole('button', { name: 'Clear filters' })).first().click();
  await expect(rows(page)).toHaveCount(10);
  await expect(page.getByLabel('Search your notes')).toHaveValue('');
  // And the address goes back to a plain Home, with no leftovers in it.
  await page.waitForURL((url) => url.search === '');
});

test('the search and the filters survive a refresh, and the back button', async ({ page }) => {
  const data = { notes: manyNotes(12), searchText: { 'note-03': { transcript: 'about pricing' } } };
  await installFakes(page, data);
  await signIn(page);

  await page.getByLabel('Search your notes').fill('pricing');
  await filtersButton(page).click();
  await shown(page.getByRole('checkbox', { name: 'Ready', exact: true })).first().click();
  await shown(page.getByRole('button', { name: 'Show these notes' })).first().click();
  await expect(shown(page.getByText('Filters (1)')).first()).toBeVisible();
  await expect(rows(page)).toHaveCount(1);

  // The address carries it all, and nothing it does not need. It catches up a moment after the
  // screen does, so this waits for it rather than reading it the instant the list changes.
  await page.waitForURL(/\?q=pricing&status=Ready$/);

  // A refresh brings back the same view, not a blank Home.
  await installFakes(page, data);
  await page.reload();
  await expect(page.getByLabel('Search your notes')).toHaveValue('pricing');
  await expect(shown(page.getByText('Filters (1)')).first()).toBeVisible();
  await expect(rows(page)).toHaveCount(1);

  // Opening a note and pressing back comes back to the same view too.
  await page.getByText('Note 03').click();
  await expect(page.getByRole('heading', { name: 'Note' }).first()).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Search your notes')).toHaveValue('pricing');
  await expect(rows(page)).toHaveCount(1);
});

test('Select mode deletes several notes at once, with one box, and removes their files', async ({ page }) => {
  const recorder = await installFakes(page, { notes: manyNotes(12) });
  await signIn(page);

  await page.getByRole('button', { name: 'Select notes' }).click();
  await expect(page.getByText('Tap the notes you want to delete.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete selected notes' })).toBeDisabled();

  await page.getByText('Note 01').click();
  await page.getByText('Note 02').click();
  await expect(page.getByText('2 notes selected')).toBeVisible();

  await page.getByRole('button', { name: 'Delete selected notes' }).click();
  // One box, and it says exactly what will go.
  await expect(page.getByRole('heading', { name: 'Delete 2 notes?' })).toBeVisible();
  // The box names the notes, and says underneath what deleting them means.
  await expect(page.getByText('"Note 01" and "Note 02" will be deleted.')).toBeVisible();
  await expect(page.getByText(/does not give you 2 meetings back this month/)).toBeVisible();
  await expect(page.getByText(/recordings and files are removed/)).toBeVisible();

  await page.getByRole('button', { name: 'Delete 2 notes' }).click();
  await expect(page.getByText('2 notes deleted.')).toBeVisible();

  // Both rows are gone, the server was asked once, and the files were removed.
  await expect(shown(page.getByText('Note 01'))).toHaveCount(0);
  const asked = recorder.updates.filter((u) => u.table === 'delete_notes');
  expect(asked).toHaveLength(1);
  expect((asked[0].body as { p_ids: string[] }).p_ids).toEqual(['note-01', 'note-02']);
  expect(recorder.storageRemovals.flat()).toContain(`${ACCOUNT_ID}/note-01/recording.mp3`);
});

test('a note somebody else made cannot be ticked, and says why', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(3), notMine: ['note-02'] });
  await signIn(page);

  await page.getByRole('button', { name: 'Select notes' }).click();
  await expect(page.getByText('Somebody else made this note, so you cannot delete it.')).toBeVisible();

  await page.getByText('Note 02').click({ force: true });
  // Still nothing selected, so Delete stays off.
  await expect(page.getByRole('button', { name: 'Delete selected notes' })).toBeDisabled();
});

test('Cancel leaves Select mode without deleting anything', async ({ page }) => {
  const recorder = await installFakes(page, { notes: manyNotes(3) });
  await signIn(page);

  await page.getByRole('button', { name: 'Select notes' }).click();
  await page.getByText('Note 01').click();
  await page.getByRole('button', { name: 'Cancel selecting' }).click();

  await expect(page.getByText('1 note selected')).toBeHidden();
  expect(recorder.updates.filter((u) => u.table === 'delete_notes')).toHaveLength(0);
});

test('a person with no notes at all still sees the invitation to make one', async ({ page }) => {
  await installFakes(page, { notes: [] });
  await signIn(page);

  await expect(page.getByText('No notes yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New note' })).toBeVisible();
  // Nothing to select, so no Select button.
  await expect(page.getByRole('button', { name: 'Select notes' })).toBeHidden();
});

test('when the list cannot be loaded it says so, and Retry works', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(3), findNotesError: 'the server fell over' });
  await signIn(page);

  await expect(page.getByText(/We could not load your notes/)).toBeVisible();

  // Put the server back, then press Retry.
  await installFakes(page, { notes: manyNotes(3) });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(rows(page)).toHaveCount(3);
});

test('the Search screen finds the line somebody said, and opens the note at that moment', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(3) });
  await signIn(page);

  await page.getByLabel('Search your notes').fill('sign up');
  await page.getByRole('link', { name: 'See every matching line' }).click();

  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
  // The fake transcript lines belong to the first note.
  await expect(shown(page.getByText(/sign up/)).first()).toBeVisible();
  await expect(shown(page.getByText(/lines? in 1 note/)).first()).toBeVisible();

  await shown(page.getByRole('link', { name: /Speaker . at/ })).first().click();

  // The note opens on the Transcript tab with that line lit up.
  await expect(page.getByRole('tab', { name: 'Transcript' })).toBeVisible();
  await expect(shown(page.getByLabel(/Highlighted/)).first()).toBeVisible();
});

test('the Search screen says what it is for before anybody types', async ({ page }) => {
  await installFakes(page, { notes: manyNotes(3) });
  await signIn(page);
  await page.goto(`${new URL(page.url()).origin}/search`);

  await expect(page.getByRole('heading', { name: 'Search across every note' })).toBeVisible();
});
