/**
 * The Summary tab: what prompt 6 added.
 * The AI is never called here: tests/fixtures/fake-api.ts answers with a made up summary.
 */
import { expect, test } from '@playwright/test';

import { installFakes, noteRow, openNote, signIn } from './fixtures/fake-api';

test('the Summary tab is the one that opens, and it shows the whole summary', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openNote(page);

  await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');

  await expect(page.getByText(/The team looked at the new sign up screen/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Key points' })).toBeVisible();
  await expect(page.getByText('Sign up is slow on phones')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Decisions' })).toBeVisible();
  await expect(page.getByText('Ship the sign up screen on Friday')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open questions' })).toBeVisible();
  await expect(page.getByText('Who writes the release note?')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Action items' })).toBeVisible();
});

test('action items show who owns them and when, and the count of finished ones', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openNote(page);

  await expect(page.getByText('Priya, Friday, said at 1:05')).toBeVisible();
  await expect(page.getByText('1 of 3 done')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Send the test plan' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('checkbox', { name: 'Book the review call' })).toHaveAttribute('aria-checked', 'true');
});

test('a person can tick an action item off, and only the tick is saved', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openNote(page);

  await page.getByRole('checkbox', { name: 'Send the test plan' }).click();

  await expect(page.getByRole('checkbox', { name: 'Send the test plan' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('2 of 3 done')).toBeVisible();
  await expect.poll(() => recorder.updates.map((u) => u.table)).toContain('action_items');
  expect(recorder.updates[0].body).toEqual({ done: true });
});

test('Copy puts the summary on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installFakes(page);
  await signIn(page);
  await openNote(page);

  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Copied')).toBeVisible();

  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Weekly team call');
  expect(text).toContain('The team looked at the new sign up screen');
  expect(text).toContain('- [ ] Send the test plan');
  expect(text).toContain('- [x] Book the review call');
});

test('Regenerate asks first, because it costs money', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openNote(page);

  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect(page.getByRole('heading', { name: 'Write a new summary?' })).toBeVisible();
  await expect(page.getByText(/costs money/)).toBeVisible();
  expect(recorder.functionCalls.map((c) => c.name)).not.toContain('summarize');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Write a new summary?' })).toBeHidden();
  expect(recorder.functionCalls.map((c) => c.name)).not.toContain('summarize');
});

test('saying yes to Regenerate asks the server for a new summary', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openNote(page);

  await page.getByRole('button', { name: 'Regenerate' }).click();
  await page.getByRole('button', { name: 'Yes, write a new one' }).click();

  await expect.poll(() => recorder.functionCalls.map((c) => c.name)).toContain('summarize');
});

test('a note with no summary yet offers to write one', async ({ page }) => {
  const recorder = await installFakes(page, { summary: null, actionItems: [] });
  await signIn(page);
  await openNote(page);

  await expect(page.getByRole('heading', { name: 'No summary yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Write summary' }).click();
  await expect.poll(() => recorder.functionCalls.map((c) => c.name)).toContain('summarize');
});

test('while the summary is being written, the page says so and waits by itself', async ({ page }) => {
  await installFakes(page, { notes: [noteRow({ status: 'summarizing' })], summary: null, actionItems: [] });
  await signIn(page);
  await openNote(page);

  await expect(page.getByRole('heading', { name: 'No summary yet' })).toBeVisible();
  await expect(page.getByText(/writing the summary/)).toBeVisible();
  await expect(page.getByText(/updates by itself/)).toBeVisible();
});

test('a summary that failed keeps the transcript and offers Retry summary', async ({ page }) => {
  const recorder = await installFakes(page, {
    notes: [noteRow({ status: 'failed', error_message: 'Gyan could not write a summary for this note. Please tap Retry summary.' })],
    summary: null,
    actionItems: [],
  });
  await signIn(page);
  await openNote(page);

  await expect(page.getByText(/could not write a summary/)).toBeVisible();
  await expect(page.getByText(/did not use up one of your meetings/)).toBeVisible();
  await expect(page.getByText(/transcript is still here/)).toBeVisible();

  // The transcript really is still there.
  await page.getByRole('tab', { name: 'Transcript' }).click();
  await expect(page.getByText('Thanks for joining. Let us start with the sign up screen.')).toBeVisible();

  await page.getByRole('tab', { name: 'Summary' }).click();
  await page.getByRole('button', { name: 'Retry summary' }).click();
  await expect.poll(() => recorder.functionCalls.map((c) => c.name)).toContain('summarize');
  // Retrying the summary must never make us pay for the speech service again.
  expect(recorder.functionCalls.map((c) => c.name)).not.toContain('transcribe');
});

test('a meeting with nothing agreed says so, and leaves empty parts out', async ({ page }) => {
  await installFakes(page, {
    summary: {
      language: 'en',
      overview: 'This note was too short to summarize.',
      key_points: [],
      decisions: [],
      open_questions: [],
    },
    actionItems: [],
  });
  await signIn(page);
  await openNote(page);

  await expect(page.getByText('This note was too short to summarize.')).toBeVisible();
  await expect(page.getByText('Nobody agreed to do anything in this note.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Key points' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Decisions' })).toBeHidden();
});

test('if the server says no, the page says so in plain words', async ({ page }) => {
  await installFakes(page, { summary: null, actionItems: [], functionStatus: { summarize: 500 } });
  await signIn(page);
  await openNote(page);

  await page.getByRole('button', { name: 'Write summary' }).click();
  await expect(page.getByText(/could not start it/)).toBeVisible();
});
