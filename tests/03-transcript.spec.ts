/**
 * The Transcript tab (what prompt 5 added), now that it sits next to the Summary tab.
 * Fake data only. Deepgram is never called.
 */
import { expect, test } from '@playwright/test';

import { installFakes, noteRow, openNote, signIn } from './fixtures/fake-api';

test('the transcript shows who spoke, when, and what they said', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openNote(page);

  await page.getByRole('tab', { name: 'Transcript' }).click();

  await expect(page.getByText('Speaker 1').first()).toBeVisible();
  await expect(page.getByText('Speaker 2')).toBeVisible();
  await expect(page.getByText('Thanks for joining. Let us start with the sign up screen.')).toBeVisible();
  await expect(page.getByText('1:05')).toBeVisible();
  await expect(page.getByText('Spoken language: en')).toBeVisible();
});

test('while the words are being made, the page says so and waits by itself', async ({ page }) => {
  await installFakes(page, { notes: [noteRow({ status: 'transcribing' })], segments: [] });
  await signIn(page);
  await openNote(page);

  await page.getByRole('tab', { name: 'Transcript' }).click();
  await expect(page.getByText('No transcript yet')).toBeVisible();
  await expect(page.getByText(/updates by itself/)).toBeVisible();
});

test('a note that failed with no transcript offers Retry', async ({ page }) => {
  const recorder = await installFakes(page, {
    notes: [noteRow({ status: 'failed', error_message: 'We could not read this audio file.' })],
    segments: [],
    summary: null,
    actionItems: [],
  });
  await signIn(page);
  await openNote(page);

  await page.getByRole('tab', { name: 'Transcript' }).click();
  await expect(page.getByText('We could not read this audio file.')).toBeVisible();
  await expect(page.getByText(/did not use up one of your meetings/)).toBeVisible();

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => recorder.functionCalls.map((c) => c.name)).toContain('transcribe');
});

test('a note that is not yours says so instead of showing anything', async ({ page }) => {
  await installFakes(page, { notes: [] });
  await signIn(page);
  await openNote(page, '99999999-9999-4999-8999-999999999999');

  await expect(page.getByText('Note not found')).toBeVisible();
});
