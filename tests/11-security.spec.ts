/**
 * The Security page, as a person would use it: turning on two-factor sign in, changing the
 * automatic sign out time, and reading the record of what has happened.
 *
 * Fake data only, as every script here. No real account, no real authenticator app, and the
 * secret shown on screen is made up.
 */
import { expect, test } from '@playwright/test';

import { installFakes, signIn } from './fixtures/fake-api';

/** Expo Router keeps off-screen screens mounted, so only look at the visible one. */
const shown = (locator: import('@playwright/test').Locator) => locator.filter({ visible: true });

async function openSecurity(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: /^Settings/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /^Security\./ }).click();
  await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible();
}

test('the Settings list says whether two-factor is on, and how long before a sign out', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await page.getByRole('link', { name: /^Settings/ }).first().click();
  await expect(
    page.getByText('Two-factor sign in is off. Signs you out after 30 minutes of doing nothing.'),
  ).toBeVisible();
});

test('TURNING ON TWO-FACTOR shows a code to scan AND one to type, then asks for the 6 digits', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSecurity(page);

  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();

  // A picture to scan -- and it really has to LOAD, not just be on the page. A broken
  // picture is still "visible" to a test, and the first version of this screen showed a
  // blank white square where the code should be. Nothing caught it but a screenshot.
  const qr = page.getByTestId('two-factor-qr');
  await expect(qr).toBeVisible();
  const picture = await qr.evaluate((node) => {
    const image = node as HTMLImageElement;
    return { loaded: image.complete, width: image.naturalWidth };
  });
  expect(picture.loaded).toBe(true);
  expect(picture.width).toBeGreaterThan(0);
  // ...and the same thing in letters, for anybody who cannot scan one.
  await expect(page.getByText('FAKESECRETFORTESTSONLY')).toBeVisible();
  await expect(page.getByText('No camera, or cannot scan it?')).toBeVisible();

  // Nothing is on yet: the code has to be typed back first, which is what proves the app
  // really holds the secret.
  await expect(page.getByRole('button', { name: 'Confirm and turn on' })).toBeDisabled();
});

test('A WRONG CODE SAYS SO, and does not turn anything on', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSecurity(page);
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();

  await page.getByLabel('The 6-digit code from your app').fill('000000');
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();

  await expect(page.getByText(/did not work/)).toBeVisible();
  // Still on the setting-up screen, not pretending it worked.
  await expect(page.getByText('FAKESECRETFORTESTSONLY')).toBeVisible();
});

test('the right code turns it on, and the page then says it is on', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSecurity(page);
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();

  await page.getByLabel('The 6-digit code from your app').fill('123456');
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();

  await expect(page.getByRole('button', { name: 'Turn off' })).toBeVisible();
  await expect(page.getByText('Signing in needs a 6-digit code')).toBeVisible();
});

test('only digits can be typed into the code box', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSecurity(page);
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();

  const box = page.getByLabel('The 6-digit code from your app');
  // Letters are dropped as they are typed, so a code pasted with spaces or stray characters
  // still works instead of being silently wrong.
  await box.fill('1a2b3c');
  await expect(box).toHaveValue('123');
  // And the box itself will not take more than six, so nobody can overrun it.
  await expect(box).toHaveAttribute('maxlength', '6');
});

test('THE SIGN OUT TIME CAN BE CHANGED, and the choice shows which one is on', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSecurity(page);

  await expect(shown(page.getByText('After 30 minutes')).first()).toBeVisible();
  await shown(page.getByRole('radio', { name: '15 minutes' })).click();
  await expect(shown(page.getByText('After 15 minutes')).first()).toBeVisible();
});

test('a team member can see the sign out time but not change it', async ({ page }) => {
  await installFakes(page, { isOwner: false });
  await signIn(page);
  await openSecurity(page);

  await expect(shown(page.getByText('After 30 minutes')).first()).toBeVisible();
  await expect(page.getByText('Only the account owner can change this.')).toBeVisible();
  await expect(page.getByRole('radio', { name: '15 minutes' })).toBeHidden();
});

test('THE RECORD READS AS SENTENCES, newest first, and names the note', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSecurity(page);

  await expect(page.getByText('You signed in')).toBeVisible();
  await expect(page.getByText('You emailed a recap')).toBeVisible();
  await expect(page.getByText('Priya Raman deleted a note')).toBeVisible();
  await expect(page.getByText('Priya Raman turned on two-factor sign in')).toBeVisible();
  // A settings change says WHICH setting, in the words of the screen.
  await expect(page.getByText('You changed how long notes are kept')).toBeVisible();
  // And the note it was about.
  await expect(page.getByText(/Pricing workshop/)).toBeVisible();
  // It says plainly that nobody can tamper with it.
  await expect(page.getByText(/cannot be changed or deleted by anybody/)).toBeVisible();
});

test('A TEAM MEMBER CANNOT SEE THE RECORD AT ALL', async ({ page }) => {
  await installFakes(page, { isOwner: false });
  await signIn(page);
  await openSecurity(page);

  await expect(page.getByText('Only the account owner can see the record')).toBeVisible();
  await expect(page.getByText('You signed in')).toBeHidden();
  await expect(page.getByText('Priya Raman deleted a note')).toBeHidden();
});

test('the Security page works at phone width without sliding sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakes(page);
  await signIn(page);
  await openSecurity(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('THE PAGE SENDS THE SECURITY HEADERS a browser needs', async ({ page }) => {
  await installFakes(page);
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};

  // Gyan cannot be put inside somebody else's website.
  expect(headers['x-frame-options']).toBe('DENY');
  // A browser must believe what a file says it is.
  expect(headers['x-content-type-options']).toBe('nosniff');
  // A note's address is never handed to another website.
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

  const policy = headers['content-security-policy'] ?? '';
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'self'");
  // The line that matters most: even an injected script would have nowhere to send
  // anything it took.
  expect(policy).toContain('connect-src');
  expect(policy).toContain('https://*.supabase.co');
});
