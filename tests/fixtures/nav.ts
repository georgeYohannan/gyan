/**
 * Getting around, and the two checks every screen owes a phone.
 *
 * Every script used to click the navigation by the words on it, and walk into Settings with a
 * regular expression over a row's summary sentence -- `/^Recaps\./`. Both break the moment the
 * navigation is replaced or a summary is reworded, neither of which has anything to do with what
 * the script was testing. These helpers press by name instead.
 *
 * The rule, everywhere in tests/: press things by `testID`, assert on words.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * One control, by name, that a person can actually see.
 *
 * React Navigation keeps the screen you came from mounted while it slides away, so for a moment
 * two Settings lists are really in the page and a name matches twice. This did not show up while
 * the scripts used `getByRole`, because role locators skip anything hidden from the
 * accessibility tree -- `getByTestId` does not, so moving to names surfaced it. That is a
 * difference worth knowing: a name finds what is in the page, a role finds what is announced.
 */
export function byId(page: Page, testID: string): Locator {
  return page.getByTestId(testID).filter({ visible: true }).first();
}

/** The five places the navigation can take you. */
export type Destination = 'home' | 'search' | 'new-note' | 'ask' | 'settings';

/** Press a destination in the navigation, wherever the navigation happens to be drawn. */
export async function goTo(page: Page, where: Destination): Promise<void> {
  await byId(page, `nav-${where}`).click();
}

export const goHome = (page: Page) => goTo(page, 'home');
export const goSettings = (page: Page) => goTo(page, 'settings');

/** The six pages inside Settings, by name rather than by their summary sentence. */
export type SettingsPage = 'profile' | 'plan' | 'team' | 'recaps' | 'security' | 'data';

/** Settings, then one of its pages -- the way a person gets there. */
export async function openSettingsPage(page: Page, which: SettingsPage): Promise<void> {
  await goSettings(page);
  await expect(byId(page, 'settings-screen')).toBeVisible();
  await byId(page, `settings-row-${which}`).click();
}

/**
 * Nothing on this page scrolls sideways.
 *
 * This is the only automated proof the phone layout actually fits, which is why it is worth
 * having in one place and calling from everywhere rather than being copied into three files.
 * A failure means the layout is wrong, not that the check is too strict -- the only honest
 * reason to loosen it is a region that is deliberately scrolled sideways, and there are none.
 */
export async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  // One pixel, not zero: sub-pixel rounding in the browser can leave a hairline that nobody
  // can see or scroll. This is the tolerance the three hand-written copies already used.
  expect(overflow).toBeLessThanOrEqual(1);
}

/** A phone-sized window, the width every help picture is taken at. */
export const PHONE = { width: 390, height: 844 } as const;
/** A web-sized window, wide enough for the sidebar. */
export const DESKTOP = { width: 1280, height: 900 } as const;
