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

/**
 * One screenshot of the note page with a translation on it.
 *
 * `stop` says how far to go:
 *  - 'picker'   the language list, open
 *  - 'translated' the translated words, with the "Translated by AI" label
 *  - 'original' the same note after tapping Show original
 */
async function shootTranslate(
  { page, context }: { page: import('@playwright/test').Page; context: import('@playwright/test').BrowserContext },
  file: string,
  size: { width: number; height: number },
  options: { stop: 'picker' | 'translated' | 'original'; language?: string; tab?: 'Summary' | 'Transcript' },
) {
  const language = options.language ?? 'Spanish, Español';
  await page.setViewportSize(size);
  await installFakes(page);
  await signIn(page);
  await openNote(page);

  if (options.tab === 'Transcript') await page.getByRole('tab', { name: 'Transcript' }).click();
  const tab = (options.tab ?? 'Summary').toLowerCase();
  await page.getByRole('button', { name: `Translate this ${tab}` }).click();
  await expect(page.getByRole('heading', { name: `Translate this ${tab}` })).toBeVisible();

  if (options.stop !== 'picker') {
    await page.getByRole('radio', { name: language }).click();
    await expect(page.getByText(/Translated by AI/)).toBeVisible();
    if (options.stop === 'original') {
      await page.getByRole('button', { name: 'Show original' }).click();
      await expect(page.getByRole('button', { name: 'Show translation' })).toBeVisible();
    }
  }

  await page.waitForTimeout(700); // let the panel finish sliding and the fonts settle
  await page.screenshot({ path: `${IMAGES}/${file}`, fullPage: true });
  await context.clearCookies();
}

for (const w of WIDTHS) {
  test(`the language list at ${w.name} pixels`, async ({ page, context }) => {
    await shootTranslate({ page, context }, `language-picker-${w.name}.png`, { width: w.width, height: w.short }, {
      stop: 'picker',
    });
  });

  test(`a translated summary at ${w.name} pixels`, async ({ page, context }) => {
    await shootTranslate({ page, context }, `note-translated-${w.name}.png`, { width: w.width, height: w.full }, {
      stop: 'translated',
    });
  });

  test(`the Show original toggle at ${w.name} pixels`, async ({ page, context }) => {
    await shootTranslate({ page, context }, `note-original-${w.name}.png`, { width: w.width, height: w.full }, {
      stop: 'original',
    });
  });

  // Arabic, to check by eye that it reads right to left and that the letters join up.
  test(`an Arabic transcript at ${w.name} pixels`, async ({ page, context }) => {
    await shootTranslate({ page, context }, `note-translated-arabic-${w.name}.png`, { width: w.width, height: w.full }, {
      stop: 'translated',
      language: 'Arabic, العربية',
      tab: 'Transcript',
    });
  });

  // Hindi and Japanese, to check the fonts cover both scripts.
  test(`a Hindi summary at ${w.name} pixels`, async ({ page, context }) => {
    await shootTranslate({ page, context }, `note-translated-hindi-${w.name}.png`, { width: w.width, height: w.full }, {
      stop: 'translated',
      language: 'Hindi, हिन्दी',
    });
  });

  test(`a Japanese summary at ${w.name} pixels`, async ({ page, context }) => {
    await shootTranslate({ page, context }, `note-translated-japanese-${w.name}.png`, { width: w.width, height: w.full }, {
      stop: 'translated',
      language: 'Japanese, 日本語',
    });
  });
}
