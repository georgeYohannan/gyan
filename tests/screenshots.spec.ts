/**
 * Takes the screenshots used in the in-app help, at phone width (390) and web width (1280).
 * Fake data only: no real email, no real name, no key, no password is ever on screen.
 * Run with:  npm run e2e:shots
 */
import { expect, test } from '@playwright/test';

import { CHAT_MESSAGES, installFakes, noteRow, openNote, signIn, type FakeData } from './fixtures/fake-api';

const IMAGES = 'docs/help/images';
// Each picture gets a tall enough window to show the whole thing, with no empty space below.
const WIDTHS = [
  { name: 390, width: 390, full: 1200, short: 700 },
  { name: 1280, width: 1280, full: 1180, short: 600 },
] as const;

/** One screenshot of the note page at one width. */
async function shoot(
  { page, context }: { page: import('@playwright/test').Page; context: import('@playwright/test').BrowserContext },
  file: string,
  size: { width: number; height: number },
  data: Partial<FakeData>,
) {
  await page.setViewportSize(size);
  await installFakes(page, data);
  await signIn(page);
  await openNote(page);
  // Wait for the thing the picture is meant to show before taking it.
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
  await page.waitForTimeout(600); // let the fonts settle
  await page.screenshot({ path: `${IMAGES}/${file}`, fullPage: true });
  await context.clearCookies();
}

for (const w of WIDTHS) {
  test(`the Summary tab at ${w.name} pixels`, async ({ page, context }) => {
    await shoot({ page, context }, `note-summary-${w.name}.png`, { width: w.width, height: w.full }, {});
  });

  test(`an empty Summary tab at ${w.name} pixels`, async ({ page, context }) => {
    await shoot({ page, context }, `note-summary-empty-${w.name}.png`, { width: w.width, height: w.short }, {
      notes: [noteRow({ status: 'summarizing' })],
      summary: null,
      actionItems: [],
    });
  });

  test(`a Failed note at ${w.name} pixels`, async ({ page, context }) => {
    await shoot({ page, context }, `note-failed-${w.name}.png`, { width: w.width, height: w.short }, {
      notes: [
        noteRow({
          status: 'failed',
          error_message: 'Gyan could not write a summary for this note. Please tap Retry summary.',
        }),
      ],
      summary: null,
      actionItems: [],
    });
  });
}

/**
 * One screenshot of the note page with the chat panel open.
 * `cite` taps a passage number first, so the picture shows a lit-up transcript line instead.
 */
async function shootChat(
  { page, context }: { page: import('@playwright/test').Page; context: import('@playwright/test').BrowserContext },
  file: string,
  size: { width: number; height: number },
  data: Partial<FakeData>,
  options: { cite?: boolean } = {},
) {
  await page.setViewportSize(size);
  await installFakes(page, data);
  await signIn(page);
  await openNote(page);

  await page.getByRole('button', { name: 'Ask about this note' }).click();
  await expect(page.getByRole('heading', { name: 'Ask about this note' })).toBeVisible();

  if (options.cite) {
    await page.getByRole('link', { name: 'Go to the line at 1:05' }).click();
    await expect(page.getByLabel(/Highlighted/)).toBeVisible();
  }

  await page.waitForTimeout(700); // let the panel finish sliding and the fonts settle
  await page.screenshot({ path: `${IMAGES}/${file}`, fullPage: true });
  await context.clearCookies();
}

for (const w of WIDTHS) {
  test(`the chat with a conversation at ${w.name} pixels`, async ({ page, context }) => {
    await shootChat({ page, context }, `note-chat-${w.name}.png`, { width: w.width, height: w.short }, {
      chatMessages: CHAT_MESSAGES,
    });
  });

  test(`the chat with its suggested questions at ${w.name} pixels`, async ({ page, context }) => {
    await shootChat({ page, context }, `note-chat-empty-${w.name}.png`, { width: w.width, height: w.short }, {});
  });

  test(`a highlighted transcript line at ${w.name} pixels`, async ({ page, context }) => {
    await shootChat(
      { page, context },
      `note-chat-cited-${w.name}.png`,
      { width: w.width, height: w.short },
      { chatMessages: CHAT_MESSAGES },
      { cite: true },
    );
  });
}
