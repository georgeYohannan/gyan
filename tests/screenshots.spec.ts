/**
 * Takes the screenshots used in the in-app help, at phone width (390) and web width (1280).
 * Fake data only: no real email, no real name, no key, no password is ever on screen.
 * Run with:  npm run e2e:shots
 */
import { expect, test } from '@playwright/test';

import {
  CHAT_MESSAGES,
  DELETE_CHECK,
  installFakes,
  noteRow,
  openNote,
  signIn,
  type FakeData,
} from './fixtures/fake-api';

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

  await page.getByTestId('note-tab-chat').click();
  await expect(page.getByTestId('note-chat')).toBeVisible();

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
  await page.getByTestId('note-more').click();
  await page.getByTestId('note-translate').click();
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

/** One screenshot of the Send recap dialog, open on a Ready note. */
async function shootRecap(
  { page, context }: { page: import('@playwright/test').Page; context: import('@playwright/test').BrowserContext },
  file: string,
  size: { width: number; height: number },
  data: Partial<FakeData> = {},
) {
  await page.setViewportSize(size);
  await installFakes(page, data);
  await signIn(page);
  await openNote(page);
  await page.getByTestId('note-more').click();
  await page.getByTestId('note-send-recap').click();
  await expect(page.getByRole('heading', { name: 'Send recap' })).toBeVisible();
  await page.waitForTimeout(700); // let the panel finish sliding in
  await page.screenshot({ path: `${IMAGES}/${file}`, fullPage: true });
  await context.clearCookies();
}

/** One screenshot of the Recap emails settings page. */
async function shootRecapSettings(
  { page, context }: { page: import('@playwright/test').Page; context: import('@playwright/test').BrowserContext },
  file: string,
  size: { width: number; height: number },
  data: Partial<FakeData> = {},
) {
  await page.setViewportSize(size);
  await installFakes(page, data);
  await signIn(page);
  // The recap settings live in Settings now, so this walks the way a person would.
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-row-recaps').click();
  await expect(page.getByRole('heading', { name: 'Recap emails', level: 1 })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${IMAGES}/${file}`, fullPage: true });
  await context.clearCookies();
}

for (const w of WIDTHS) {
  test(`the Send recap dialog at ${w.name} pixels`, async ({ page, context }) => {
    await shootRecap({ page, context }, `recap-dialog-${w.name}.png`, { width: w.width, height: w.full });
  });

  test(`the Recap emails settings at ${w.name} pixels`, async ({ page, context }) => {
    await shootRecapSettings({ page, context }, `recap-settings-${w.name}.png`, {
      width: w.width,
      height: w.full,
    });
  });
}

/**
 * The five Settings pages (prompt 10).
 *
 * These use their own helper, because they live on the Settings tab rather than on a note.
 * Every name, address and number on screen is made up.
 */
async function shootSettings(
  { page, context }: { page: import('@playwright/test').Page; context: import('@playwright/test').BrowserContext },
  file: string,
  size: { width: number; height: number },
  /** The stable name of the Settings row to open, or null to photograph the list itself. */
  row: string | null,
  /** The heading to wait for once it is open. Still the words, because that is the assertion. */
  waitFor: string,
  data: Partial<FakeData> = {},
) {
  await page.setViewportSize(size);
  await installFakes(page, data);
  await signIn(page);
  await page.getByTestId('nav-settings').click();
  if (row) await page.getByTestId(`settings-row-${row}`).click();
  await expect(page.getByRole('heading', { name: waitFor, level: 1 })).toBeVisible();
  await page.waitForTimeout(600); // let the fonts settle
  await page.screenshot({ path: `${IMAGES}/${file}`, fullPage: true });
  await context.clearCookies();
}

for (const w of WIDTHS) {
  test(`the Settings list at ${w.name} pixels`, async ({ page, context }) => {
    // Tall enough to show the Log out box under the five rows, rather than cutting it off.
    await shootSettings({ page, context }, `settings-${w.name}.png`, { width: w.width, height: w.full }, null, 'Settings');
  });

  test(`Profile at ${w.name} pixels`, async ({ page, context }) => {
    await shootSettings(
      { page, context },
      `settings-profile-${w.name}.png`,
      { width: w.width, height: w.full },
      'profile',
      'Profile',
    );
  });

  test(`Plan and usage at ${w.name} pixels`, async ({ page, context }) => {
    await shootSettings(
      { page, context },
      `settings-plan-${w.name}.png`,
      { width: w.width, height: w.full },
      'plan',
      'Plan and usage',
    );
  });

  test(`Team at ${w.name} pixels`, async ({ page, context }) => {
    await shootSettings(
      { page, context },
      `settings-team-${w.name}.png`,
      { width: w.width, height: w.full },
      'team',
      'Team',
    );
  });

  test(`Security at ${w.name} pixels`, async ({ page, context }) => {
    await shootSettings(
      { page, context },
      `settings-security-${w.name}.png`,
      { width: w.width, height: w.full },
      'security',
      'Security',
    );
  });

  test(`Data and privacy at ${w.name} pixels`, async ({ page, context }) => {
    await shootSettings(
      { page, context },
      `settings-data-${w.name}.png`,
      // Taller than the other Settings pictures: ten note rows and the Show more button sit
      // between the panels and the Delete account box, and React Native Web scrolls an inner
      // element, so anything past the viewport is simply not in the picture. The phone needs
      // more again, because everything wraps onto more lines at 390.
      { width: w.width, height: w.full + (w.width < 768 ? 1500 : 1000) },
      'data',
      'Data and privacy',
      // Twelve notes, so the picture shows what somebody with a real pile of them sees: the
      // count, the ten newest, and a Show more button. With one note there was nothing to show.
      // The account panel's count has to agree with the list, or the picture contradicts itself.
      {
        notes: dataNotes(),
        deleteCheck: {
          ...DELETE_CHECK,
          note_count: 12,
          what_goes: (DELETE_CHECK.what_goes as string).replace('all 1 of your notes', 'all 12 of your notes'),
        },
      },
    );
  });
}

/** Twelve believable notes, one of them a teammate's, for the Data and privacy picture. */
function dataNotes() {
  const now = Date.now();
  const titles = [
    'Weekly team call',
    'Customer call: Northwind',
    'Pricing review',
    'Notes from the roadmap chat',
    'Design review',
    'Hiring catch-up',
    'Support handover',
    'Board prep',
    'Onboarding walkthrough',
    'Partner intro call',
    'Quarterly numbers',
    'Retro: the launch',
  ];
  return titles.map((title, i) =>
    noteRow({
      id: `data-${String(i + 1).padStart(2, '0')}`,
      title,
      source: i % 4 === 0 ? 'text' : i % 3 === 0 ? 'bot' : 'upload',
      created_at: new Date(now - i * DAY).toISOString(),
    }),
  );
}

// ---------------------------------------------------------------------------
// Home and Search (prompt 12)
// ---------------------------------------------------------------------------
// Home's pictures used to be taken by hand, which is why their descriptions in
// src/content/help.ts had drifted from what the screen actually showed. They are made here now.

const DAY = 24 * 60 * 60 * 1000;

/** A believable handful of notes: two from today and yesterday, the rest older. */
function homeNotes() {
  const now = Date.now();
  const titles = [
    'Weekly team call',
    'Customer call: Northwind',
    'Pricing review',
    'Notes from the roadmap chat',
    'Design review',
    'Hiring catch-up',
  ];
  const statuses = ['ready', 'transcribing', 'ready', 'ready', 'failed', 'ready'] as const;
  const sources = ['upload', 'upload', 'bot', 'text', 'upload', 'phone'] as const;
  return titles.map((title, i) =>
    noteRow({
      id: `shot-${i}`,
      title,
      status: statuses[i],
      source: sources[i],
      error_message: statuses[i] === 'failed' ? 'We could not read this audio file.' : null,
      created_at: new Date(now - (i === 0 ? 0 : i === 1 ? DAY : (i + 2) * DAY)).toISOString(),
    }),
  );
}

/** The words inside those notes, so a search has something true to find. */
const homeSearchText = {
  'shot-2': {
    transcript: 'We agreed the pricing has to go up before the quarter ends, so Priya will redo the sheet.',
    startMs: 64000,
  },
  'shot-3': { summary: 'A roadmap chat. The pricing question comes back in March.' },
};

/** One screenshot of Home, at one width, after doing `then` to it. */
async function shootHome(
  { page, context }: { page: import('@playwright/test').Page; context: import('@playwright/test').BrowserContext },
  file: string,
  size: { width: number; height: number },
  data: Partial<FakeData>,
  then?: (page: import('@playwright/test').Page) => Promise<void>,
) {
  await page.setViewportSize(size);
  await installFakes(page, data);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Your notes' })).toBeVisible();
  if (then) await then(page);
  // Tapping a note part-way down scrolls the list. React Native Web scrolls an element inside
  // the page rather than the page itself, so fullPage would otherwise photograph it mid-list.
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(700); // let the fonts and any panel settle
  await page.screenshot({ path: `${IMAGES}/${file}`, fullPage: true });
  await context.clearCookies();
}

for (const w of WIDTHS) {
  test(`Home with notes at ${w.name} pixels`, async ({ page, context }) => {
    await shootHome({ page, context }, `home-notes-${w.name}.png`, { width: w.width, height: w.full }, {
      notes: homeNotes(),
      usage: { used: 2, limit: 5 },
      openActions: ['shot-0'],
    });
  });

  test(`Home with no notes at ${w.name} pixels`, async ({ page, context }) => {
    await shootHome({ page, context }, `home-empty-${w.name}.png`, { width: w.width, height: w.short }, {
      notes: [],
      usage: { used: 0, limit: 5 },
    });
  });

  test(`Home with a search word at ${w.name} pixels`, async ({ page, context }) => {
    await shootHome(
      { page, context },
      `home-search-${w.name}.png`,
      { width: w.width, height: w.short },
      { notes: homeNotes(), usage: { used: 2, limit: 5 }, searchText: homeSearchText },
      async (page) => {
        await page.getByLabel('Search your notes').fill('pricing');
        await expect(page.getByText('2 notes found').filter({ visible: true }).first()).toBeVisible();
      },
    );
  });

  test(`the filters at ${w.name} pixels`, async ({ page, context }) => {
    await shootHome(
      { page, context },
      `home-filters-${w.name}.png`,
      { width: w.width, height: w.full },
      { notes: homeNotes(), usage: { used: 2, limit: 5 } },
      async (page) => {
        await page.getByRole('button', { name: /^Filters(, \d+ on)?$/ }).click();
        await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible();
      },
    );
  });

  test(`picking a custom date range at ${w.name} pixels`, async ({ page, context }) => {
    await shootHome(
      { page, context },
      `home-dates-${w.name}.png`,
      { width: w.width, height: w.full },
      { notes: homeNotes(), usage: { used: 2, limit: 5 } },
      async (page) => {
        await page.getByRole('button', { name: /^Filters(, \d+ on)?$/ }).click();
        await page.getByRole('radio', { name: 'Custom range' }).filter({ visible: true }).first().click();
        await expect(page.getByText('Pick the first day.')).toBeVisible();
      },
    );
  });

  test(`Select mode at ${w.name} pixels`, async ({ page, context }) => {
    await shootHome(
      { page, context },
      `home-select-${w.name}.png`,
      { width: w.width, height: w.full },
      { notes: homeNotes(), usage: { used: 2, limit: 5 } },
      async (page) => {
        await page.getByRole('button', { name: 'Select notes' }).click();
        await page.getByText('Weekly team call').click();
        await page.getByText('Pricing review').click();
        await expect(page.getByText('2 notes selected')).toBeVisible();
      },
    );
  });

  test(`the box that asks before deleting at ${w.name} pixels`, async ({ page, context }) => {
    await shootHome(
      { page, context },
      `home-delete-${w.name}.png`,
      { width: w.width, height: w.full },
      { notes: homeNotes(), usage: { used: 2, limit: 5 } },
      async (page) => {
        await page.getByRole('button', { name: 'Select notes' }).click();
        await page.getByText('Weekly team call').click();
        await page.getByText('Pricing review').click();
        await page.getByRole('button', { name: 'Delete selected notes' }).click();
        await expect(page.getByRole('heading', { name: 'Delete 2 notes?' })).toBeVisible();
      },
    );
  });

  test(`the Search screen at ${w.name} pixels`, async ({ page, context }) => {
    await shootHome(
      { page, context },
      `search-${w.name}.png`,
      { width: w.width, height: w.short },
      { notes: homeNotes(), usage: { used: 2, limit: 5 }, searchText: homeSearchText },
      async (page) => {
        await page.getByLabel('Search your notes').fill('sign up');
        await page.getByRole('link', { name: 'See every matching line' }).click();
        await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
        await expect(page.getByText(/lines? in 1 note/).filter({ visible: true }).first()).toBeVisible();
      },
    );
  });
}
