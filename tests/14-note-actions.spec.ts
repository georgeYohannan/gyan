/**
 * What you can do to a note from the list: share it, or delete it.
 *
 * Two ways in, and they are deliberately the same two things. A swipe is a SHORTCUT: it is
 * invisible to a keyboard, silent to a screen reader and undiscoverable with a mouse, so every
 * row also carries a "..." button. Almost every script here drives that button, because that
 * is the path everybody can use. Exactly one drives the gesture.
 *
 * Fake data only. No file is stored, no email is sent, no paid service is called.
 */
import { expect, test, type Page } from '@playwright/test';

import { installFakes, noteRow, signIn } from './fixtures/fake-api';
import { PHONE } from './fixtures/nav';

const NOTES = [
  noteRow({ id: 'note-01', title: 'Weekly team call', status: 'ready' }),
  noteRow({ id: 'note-02', title: 'Budget chat', status: 'transcribing' }),
];

/** Opens the two things you can do to one note. */
async function openActions(page: Page, id: string) {
  await page.getByTestId(`home-note-more-${id}`).click();
  await expect(page.getByTestId('home-note-action-delete')).toBeVisible();
}

test('every note row has a More button, and it names the note', async ({ page }) => {
  await installFakes(page, { notes: NOTES });
  await signIn(page);

  await expect(page.getByRole('button', { name: 'More for Weekly team call' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More for Budget chat' })).toBeVisible();
});

test('More offers exactly the two things a swipe does', async ({ page }) => {
  await installFakes(page, { notes: NOTES });
  await signIn(page);
  await openActions(page, 'note-01');

  await expect(page.getByRole('button', { name: 'Send a recap of Weekly team call by email' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Delete Weekly team call' })).toBeEnabled();
  // The menu is titled with the note, so there is never a doubt which one it is about.
  await expect(page.getByRole('heading', { name: 'Weekly team call' })).toBeVisible();
});

test('a note still being made has nothing to share yet, and says so', async ({ page }) => {
  await installFakes(page, { notes: NOTES });
  await signIn(page);
  await openActions(page, 'note-02');

  await expect(page.getByTestId('home-note-action-share')).toBeDisabled();
  await expect(page.getByText('There is nothing to send until this note is finished.')).toBeVisible();
  // Deleting an unfinished note is fine, and still asks first.
  await expect(page.getByTestId('home-note-action-delete')).toBeEnabled();
});

test('Delete asks first, names the note, and says it does not give the meeting back', async ({ page }) => {
  const recorder = await installFakes(page, { notes: NOTES });
  await signIn(page);
  await openActions(page, 'note-01');
  await page.getByTestId('home-note-action-delete').click();

  // The SAME box Select mode uses, with the same wording. Nothing here is new copy.
  await expect(page.getByRole('heading', { name: 'Delete this note?' })).toBeVisible();
  await expect(page.getByText('"Weekly team call" will be deleted.')).toBeVisible();
  await expect(page.getByText('It does not give you the meeting back this month')).toBeVisible();

  await page.getByTestId('home-delete-confirm').click();

  await expect(page.getByText('1 note deleted.')).toBeVisible();
  await expect(page.locator('[data-testid="home-note-row-note-01"]')).toBeHidden();
  expect(recorder.updates.filter((u) => u.table === 'delete_notes')).toHaveLength(1);
});

test('Cancel in the box leaves the note exactly where it was', async ({ page }) => {
  const recorder = await installFakes(page, { notes: NOTES });
  await signIn(page);
  await openActions(page, 'note-01');
  await page.getByTestId('home-note-action-delete').click();
  await page.getByTestId('home-delete-cancel').click();

  await expect(page.getByRole('heading', { name: 'Delete this note?' })).toBeHidden();
  await expect(page.getByTestId('home-note-row-note-01')).toBeVisible();
  expect(recorder.updates.filter((u) => u.table === 'delete_notes')).toHaveLength(0);
});

test('Share opens the note with the Send recap dialog already open', async ({ page }) => {
  await installFakes(page, { notes: NOTES });
  await signIn(page);
  await openActions(page, 'note-01');
  await page.getByTestId('home-note-action-share').click();

  // Share means "send a recap by email", because that is the only sharing Gyan has.
  // docs/testing/prompt-13.md says so in plain words, since "share" suggests a link.
  await expect(page.getByTestId('note-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Send recap' })).toBeVisible();
  await expect(page).toHaveURL(/\/note\/note-01\?.*recap=1/);
});

test('a note somebody else made cannot be deleted, and the menu says why', async ({ page }) => {
  await installFakes(page, { notes: NOTES, notMine: ['note-01'] });
  await signIn(page);
  await openActions(page, 'note-01');

  await expect(page.getByTestId('home-note-action-delete')).toBeDisabled();
  // The row says it too, so this looks only inside the menu.
  await expect(
    page.getByTestId('home-note-action-delete').getByText('Somebody else made this note, so you cannot delete it.'),
  ).toBeVisible();
  // Sharing it is still fine: it is not yours to delete, but it is yours to send on.
  await expect(page.getByTestId('home-note-action-share')).toBeEnabled();
});

test('Select mode takes the More buttons away, so there is one way to delete at a time', async ({ page }) => {
  await installFakes(page, { notes: NOTES });
  await signIn(page);

  await page.getByTestId('home-select').click();
  await expect(page.getByTestId('home-note-more-note-01')).toBeHidden();

  await page.getByTestId('home-select-cancel').click();
  await expect(page.getByTestId('home-note-more-note-01')).toBeVisible();
});

test('ON A PHONE: the More button is big enough for a thumb', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installFakes(page, { notes: NOTES });
  await signIn(page);

  const box = await page.getByTestId('home-note-more-note-01').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

/**
 * THE SWIPE ITSELF IS NOT TESTED HERE, AND THAT IS SAID OUT LOUD RATHER THAN HIDDEN.
 *
 * These scripts drive a desktop browser with a mouse. A mouse drag does not open a swipe:
 * gesture handler's pan is a touch gesture, and this was tried twice with Playwright's mouse
 * before giving up on it rather than loosening a check until it went green. So on the web the
 * "..." button is how anybody opens these two actions, which is the path everybody can use
 * anyway, and it is covered by every script above.
 *
 * Swiping is checked BY HAND on a real phone, and docs/testing/prompt-13.md says so and says
 * exactly what to try. An untested gesture that nobody admits is untested is the worse of the
 * two outcomes.
 */
test('the swipe actions are hidden from screen readers, because the menu is the real path', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installFakes(page, { notes: NOTES });
  await signIn(page);

  // Gesture handler keeps the swipe buttons in the page whether the row is open or shut.
  // Without hiding them, a screen reader would find two "Delete Weekly team call" buttons for
  // every note -- sixty of them on a list of thirty, half off the side of the screen.
  await expect(page.getByTestId('home-note-delete-note-01')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Delete Weekly team call' })).toHaveCount(0);

  await openActions(page, 'note-01');
  await expect(page.getByRole('button', { name: 'Delete Weekly team call' })).toHaveCount(1);
});
