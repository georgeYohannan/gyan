/**
 * Ask: one question answered from EVERY note, not one note.
 *
 * docs/product-spec.md feature 5 promises asking "about this note or all notes". The per-note
 * half shipped in prompt 7 and the Ask tab was a placeholder until now. The AI is never called
 * here: tests/fixtures/fake-api.ts answers with a made up answer.
 *
 * The chat itself -- asking, answering, limits, retries, the skeleton, the three suggested
 * questions -- is the SAME component the note page draws, and tests/05-chat.spec.ts covers all
 * of that. These scripts cover only what is different about asking across notes:
 *   1. the request says scope: all, and carries no note id;
 *   2. an answer's numbers name WHICH note, and tapping one opens that note at that line;
 *   3. the conversation is its own thread, kept apart from any note's chat.
 */
import { expect, test } from '@playwright/test';

import {
  ASK_ANSWER,
  ASK_MESSAGES,
  CHAT_MESSAGES,
  installFakes,
  NOTE_ID,
  signIn,
} from './fixtures/fake-api';
import { byId, expectNoSideScroll, goTo, PHONE } from './fixtures/nav';

/** Signs in and goes to the Ask destination. */
async function openAsk(page: import('@playwright/test').Page) {
  await signIn(page);
  await goTo(page, 'ask');
  await expect(byId(page, 'ask-chat')).toBeVisible();
}

test('Ask is a real destination, with a question box', async ({ page }) => {
  await installFakes(page);
  await openAsk(page);

  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByRole('heading', { name: 'Ask', exact: true })).toBeVisible();
  // Exact, because getByLabel matches a SUBSTRING and the loading skeleton beside it is
  // labelled "Reading your chat" for that reason.
  await expect(page.getByLabel('Your question', { exact: true })).toBeVisible();
});

test('it says plainly that it reads your notes and names where an answer came from', async ({ page }) => {
  await installFakes(page);
  await openAsk(page);

  await expect(page.getByText(/Gyan reads your notes to answer it/)).toBeVisible();
  await expect(page.getByText(/every answer says which note it came from/)).toBeVisible();
});

test('the empty screen offers 3 questions, and they are about more than one note', async ({ page }) => {
  await installFakes(page);
  await openAsk(page);

  await expect(page.getByRole('button', { name: 'What did I promise to do?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'What is still open across my notes?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'What has been decided about pricing?' })).toBeVisible();
});

test('asking sends scope all, and NO note id', async ({ page }) => {
  const recorder = await installFakes(page);
  await openAsk(page);

  await page.getByRole('button', { name: 'What did I promise to do?' }).click();
  await expect(page.getByText(/you promised to ship the sign up screen on Friday/)).toBeVisible();

  const calls = recorder.functionCalls.filter((c) => c.name === 'chat');
  expect(calls).toHaveLength(1);
  // The whole difference, in one line: no meeting_id, and scope: all.
  expect(calls[0].body).toEqual({ scope: 'all', question: 'What did I promise to do?' });
});

test('an answer reads across notes, and names each note it used', async ({ page }) => {
  await installFakes(page);
  await openAsk(page);

  await page.getByLabel('Your question', { exact: true }).fill('What did I promise to do?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText(/In Weekly team call you promised/)).toBeVisible();
  await expect(page.getByText(/In Pricing chat you agreed/)).toBeVisible();
});

test('a number in an answer says WHICH note it points at, not just a time', async ({ page }) => {
  await installFakes(page);
  await openAsk(page);

  await page.getByRole('button', { name: 'What did I promise to do?' }).click();

  // On a note the same chip reads "Go to the line at 1:05". Here that would be a link to
  // somewhere unnamed, so it names the note.
  await expect(page.getByRole('link', { name: 'Go to Weekly team call at 1:05' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Pricing chat at 0:00' })).toBeVisible();
});

test('tapping a number leaves Ask and opens that note at that line', async ({ page }) => {
  await installFakes(page);
  await openAsk(page);

  await page.getByRole('button', { name: 'What did I promise to do?' }).click();
  await page.getByRole('link', { name: 'Go to Weekly team call at 1:05' }).click();

  // The note opens, at the line the number meant.
  await expect(byId(page, 'note-screen')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/note/${NOTE_ID}\\?line=s3`));
  // Opening a note at a line puts you on the Transcript tab with that line marked -- the same
  // place a number inside that note's own chat would have taken you.
  await expect(page.getByRole('tab', { name: 'Transcript' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel(/Priya will send the test plan on Friday.*Highlighted/)).toBeVisible();
});

test('the Ask conversation is still there when you come back', async ({ page }) => {
  await installFakes(page, { askMessages: ASK_MESSAGES });
  await openAsk(page);

  await expect(page.getByLabel('You: What did I promise to do?')).toBeVisible();
  await expect(page.getByText(/In Weekly team call you promised/)).toBeVisible();

  // Away and back: it is read from the database, not held in the screen.
  await goTo(page, 'home');
  await goTo(page, 'ask');
  await expect(page.getByText(/In Weekly team call you promised/)).toBeVisible();
});

test('a note chat and the Ask conversation are kept apart', async ({ page }) => {
  // Both threads have something saved, and they are different things.
  await installFakes(page, { askMessages: ASK_MESSAGES, chatMessages: CHAT_MESSAGES });
  await openAsk(page);

  // The Ask screen shows only the all-notes conversation. The note's own chat -- which is
  // saved too, and asks a different question -- is nowhere on this screen.
  await expect(page.getByText(/In Weekly team call you promised/)).toBeVisible();
  await expect(page.getByText(/In Pricing chat you agreed/)).toBeVisible();
  await expect(page.getByLabel('You: What were the decisions?')).toHaveCount(0);
});

test('running out of questions for the day says so, and takes the box away', async ({ page }) => {
  await installFakes(page, { chatLimitReached: true });
  await openAsk(page);

  await page.getByRole('button', { name: 'What did I promise to do?' }).click();

  await expect(page.getByText(/used all your questions for today/)).toBeVisible();
  await expect(page.getByLabel('Your question', { exact: true })).toHaveCount(0);
});

test('a problem can be tried again, and the second go costs no extra question', async ({ page }) => {
  const recorder = await installFakes(page, {
    askAnswers: [
      { ok: false, message: 'Something went wrong while answering. Please try again.' },
      { ok: true, answer: ASK_ANSWER, sources: [], remaining: 17 },
    ],
  });
  await openAsk(page);

  await page.getByRole('button', { name: 'What did I promise to do?' }).click();
  await expect(page.getByText('Something went wrong while answering. Please try again.')).toBeVisible();

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText(/In Weekly team call you promised/)).toBeVisible();

  // The retry sends the id of the question that is already saved, not the question again.
  const calls = recorder.functionCalls.filter((c) => c.name === 'chat');
  expect(calls).toHaveLength(2);
  expect(calls[1].body).toEqual({ scope: 'all', retry_message_id: 'q1' });
});

test('Ask fits a phone, and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await installFakes(page, { askMessages: ASK_MESSAGES });
  await openAsk(page);

  await expectNoSideScroll(page);

  // The question box and Send are within reach at the bottom, and big enough for a finger.
  const box = await page.getByLabel('Your question', { exact: true }).first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
  expect(send).not.toBeNull();
  expect(send!.height).toBeGreaterThanOrEqual(44);
});
