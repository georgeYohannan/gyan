/**
 * Home and New note (what prompt 4 added), plus the new rule that pasted text goes straight to
 * the summary. Fake data only: no real file is stored and no paid service is called.
 */
import { expect, test } from '@playwright/test';

import { installFakes, noteRow, signIn } from './fixtures/fake-api';

test('Home lists notes with their status and the meetings used this month', async ({ page }) => {
  await installFakes(page, {
    notes: [noteRow({ id: 'n-ready', title: 'Weekly team call', status: 'ready' }), noteRow({ id: 'n-busy', title: 'Budget chat', status: 'transcribing' })],
    usage: { used: 2, limit: 5 },
  });
  await signIn(page);

  await expect(page.getByText('Weekly team call')).toBeVisible();
  await expect(page.getByText('Budget chat')).toBeVisible();
  await expect(page.getByLabel('Status: Ready')).toBeVisible();
  await expect(page.getByLabel('Status: Transcribing')).toBeVisible();
  await expect(page.getByText('Meetings used this month: 2 of 5')).toBeVisible();
});

test('a new person with no notes is invited to make one', async ({ page }) => {
  await installFakes(page, { notes: [] });
  await signIn(page);

  await expect(page.getByText('No notes yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New note' })).toBeVisible();
});

test('New note offers four ways in, and says which are coming later', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await page.getByRole('button', { name: 'New note' }).click();

  await expect(page.getByRole('heading', { name: 'New note' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paste text' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record, Coming soon' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Meeting link, Coming soon' })).toBeDisabled();
});

test('pasted text is sent, and asks for a summary with no transcript step', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await page.getByRole('button', { name: 'New note' }).click();

  await page.getByRole('button', { name: 'Paste text' }).click();
  await page.getByLabel('Title (optional)').fill('Notes from the call');
  await page.getByLabel('Your text').fill('We agreed to ship the sign up screen on Friday. Priya sends the test plan.');
  await page.getByRole('button', { name: 'Add note' }).click();

  // Back on Home once it is sent.
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  const asked = recorder.functionCalls.map((c) => c.name);
  expect(asked).toContain('summarize');
  expect(asked).not.toContain('transcribe');
});

test('empty text is caught before anything is sent', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('button', { name: 'Paste text' }).click();
  await page.getByRole('button', { name: 'Add note' }).click();

  await expect(page.getByText('Paste or type some text first.')).toBeVisible();
  expect(recorder.uploads).toHaveLength(0);
});

test('at the monthly limit, Upload is blocked but Paste text still works', async ({ page }) => {
  await installFakes(page, { usage: { used: 5, limit: 5 } });
  await signIn(page);
  await page.getByRole('button', { name: 'New note' }).click();

  await expect(page.getByRole('button', { name: 'Upload, Limit reached' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Paste text' })).toBeEnabled();
  // The web draws this message twice (once for screen readers), so pick the one people see.
  await expect(page.getByText(/used all your meetings/).filter({ visible: true }).first()).toBeVisible();
});
