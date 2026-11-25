/**
 * Getting around.
 *
 * Gyan has five destinations now: Home, Search, New note, Ask and Settings. Before this round
 * phones had a two-item bar (Home and Settings) and the web had a different thing entirely, a
 * floating bar at the TOP with a leftover link to another company's documentation.
 *
 * These scripts check the part a redesign can break without any test noticing: that every
 * destination is reachable, lands on the address it promises, and that nothing scrolls
 * sideways on a phone.
 */
import { expect, test } from '@playwright/test';

import { installFakes, signIn } from './fixtures/fake-api';
import { byId, DESKTOP, expectNoSideScroll, goTo, PHONE, type Destination } from './fixtures/nav';

/** Every destination, the address it goes to, and the screen that proves you arrived. */
const PLACES: { where: Destination; path: string; screen: string }[] = [
  { where: 'home', path: '/', screen: 'home-screen' },
  { where: 'search', path: '/search', screen: 'search-screen' },
  { where: 'new-note', path: '/new-note', screen: 'new-note-screen' },
  { where: 'ask', path: '/ask', screen: 'ask-screen' },
  { where: 'settings', path: '/settings', screen: 'settings-screen' },
];

for (const size of [PHONE, DESKTOP]) {
  test(`every destination is reachable at ${size.width} pixels, and keeps its address`, async ({ page }) => {
    await page.setViewportSize(size);
    await installFakes(page);
    await signIn(page);

    for (const place of PLACES) {
      await goTo(page, place.where);
      await expect(byId(page, place.screen)).toBeVisible();
      // The addresses are the ones people already have. A group in brackets adds nothing to
      // a web address, so moving these screens into their own groups changed none of them.
      expect(new URL(page.url()).pathname).toBe(place.path);
    }
  });

  test(`nothing scrolls sideways on any destination at ${size.width} pixels`, async ({ page }) => {
    await page.setViewportSize(size);
    await installFakes(page);
    await signIn(page);

    for (const place of PLACES) {
      await goTo(page, place.where);
      await expect(byId(page, place.screen)).toBeVisible();
      await expectNoSideScroll(page);
    }
  });
}

test('every destination can be opened by its address, not only by the bar', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  const origin = new URL(page.url()).origin;

  for (const place of PLACES) {
    await page.goto(`${origin}${place.path}`);
    await expect(byId(page, place.screen)).toBeVisible();
  }
});

test('every item in the bar is big enough for a thumb', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installFakes(page);
  await signIn(page);

  for (const place of PLACES) {
    const box = await byId(page, `nav-${place.where}`).boundingBox();
    expect(box).not.toBeNull();
    // 44 by 44 is the smallest target CLAUDE.md allows.
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test('New note is one tap away from everywhere, and offers a fresh one each time', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installFakes(page);
  await signIn(page);

  for (const from of PLACES) {
    await goTo(page, from.where);
    await goTo(page, 'new-note');
    await expect(byId(page, 'new-note-screen')).toBeVisible();
    // Whatever was typed last time is gone: coming back offers a new note, not the old one.
    await expect(byId(page, 'new-note-paste')).toBeVisible();
  }
});

test('the builders-only design page is still reachable by address, with no button for it', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await page.goto(`${new URL(page.url()).origin}/design`);
  await expect(page.getByRole('heading', { name: 'Design', level: 1 })).toBeVisible();
  // It moved into the Home stack, so it needs no hidden entry in the bar any more.
  await expect(page.getByTestId('nav-design')).toHaveCount(0);
});

test('Ask is a real destination, and it is built', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await goTo(page, 'ask');
  await expect(page.getByRole('heading', { name: 'Ask', level: 1 })).toBeVisible();
  // It was a page saying "Not ready yet" for most of this round. It asks across every note
  // now; tests/15-ask.spec.ts covers what it does.
  await expect(page.getByText('Not ready yet')).toHaveCount(0);
  await expect(page.getByTestId('ask-chat')).toBeVisible();
});
