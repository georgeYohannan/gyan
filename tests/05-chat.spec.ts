/**
 * The side chat: what prompt 7 added.
 * The AI is never called here: tests/fixtures/fake-api.ts answers with a made up answer.
 */
import { expect, test } from '@playwright/test';

import {
  CHAT_ANSWER,
  CHAT_MESSAGES,
  CHAT_NOT_FOUND,
  CHAT_SOURCES,
  installFakes,
  noteRow,
  openNote,
  signIn,
} from './fixtures/fake-api';

/** Opens a note and opens the chat panel on it. */
async function openChat(page: import('@playwright/test').Page) {
  await openNote(page);
  await page.getByRole('button', { name: 'Ask about this note' }).click();
  await expect(page.getByRole('heading', { name: 'Ask about this note' })).toBeVisible();
}

test('a note with words has an Ask button, and it opens the chat', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openChat(page);

  await expect(page.getByText(/answers only from what was said in it/)).toBeVisible();
  await expect(page.getByLabel('Your question')).toBeVisible();
});

test('the empty chat offers 3 questions to start with', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openChat(page);

  await expect(page.getByRole('button', { name: 'What were the decisions?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'What did I promise to do?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'What is still open?' })).toBeVisible();
});

test('tapping a suggested question gets an answer with a numbered chip', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openChat(page);

  await page.getByRole('button', { name: 'What were the decisions?' }).click();

  await expect(page.getByText(/agreed to ship the sign up screen on Friday/)).toBeVisible();
  // The question is on screen too, so the conversation reads properly.
  await expect(page.getByLabel('You: What were the decisions?')).toBeVisible();
  // The passage number became a chip you can tap.
  await expect(page.getByRole('link', { name: 'Go to the line at 1:05' })).toBeVisible();

  const chat = recorder.functionCalls.filter((c) => c.name === 'chat');
  expect(chat).toHaveLength(1);
  expect(chat[0].body).toEqual({ meeting_id: '33333333-3333-4333-8333-333333333333', question: 'What were the decisions?' });
});

test('typing a question of your own works too', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openChat(page);

  await page.getByLabel('Your question').fill('Who tested the sign up screen?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText(/agreed to ship the sign up screen on Friday/)).toBeVisible();
  await expect.poll(() => recorder.functionCalls.filter((c) => c.name === 'chat').length).toBe(1);
  expect((recorder.functionCalls.find((c) => c.name === 'chat')!.body as { question: string }).question).toBe(
    'Who tested the sign up screen?',
  );
});

test('tapping a chip jumps to that transcript line and lights it up', async ({ page }) => {
  await installFakes(page, { chatMessages: CHAT_MESSAGES });
  await signIn(page);
  await openChat(page);

  // The saved conversation is there as soon as the panel opens.
  await expect(page.getByText(/agreed to ship the sign up screen on Friday/)).toBeVisible();

  await page.getByRole('link', { name: 'Go to the line at 1:05' }).click();

  // The chat closed, the Transcript tab opened, and the right line is marked.
  await expect(page.getByRole('heading', { name: 'Ask about this note' })).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Transcript' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel(/Priya will send the test plan on Friday.*Highlighted/)).toBeVisible();
});

test('a question the note cannot answer gets an honest reply, with no chips', async ({ page }) => {
  await installFakes(page, { chatAnswers: [{ ok: true, answer: CHAT_NOT_FOUND, sources: [], remaining: 18 }] });
  await signIn(page);
  await openChat(page);

  await page.getByLabel('Your question').fill('What is the budget for next year?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText(/could not find that in your notes/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Go to the line/ })).toBeHidden();
});

test('the conversation is still there after a refresh', async ({ page }) => {
  await installFakes(page, { chatMessages: CHAT_MESSAGES });
  await signIn(page);
  await openChat(page);
  await expect(page.getByText(/agreed to ship the sign up screen on Friday/)).toBeVisible();

  // Reload the whole page, the way a person pressing refresh would.
  await page.reload();
  await page.getByRole('button', { name: 'Ask about this note' }).click();

  await expect(page.getByLabel('You: What were the decisions?')).toBeVisible();
  await expect(page.getByText(/agreed to ship the sign up screen on Friday/)).toBeVisible();
});

test('AT THE LIMIT: a friendly message replaces the question box', async ({ page }) => {
  await installFakes(page, { chatLimitReached: true });
  await signIn(page);
  await openChat(page);

  await page.getByLabel('Your question').fill('One more question?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText(/used all your questions for today/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeHidden();
});

test('when few questions are left, the panel quietly says how many', async ({ page }) => {
  await installFakes(page, { chatAnswers: [{ ok: true, answer: CHAT_ANSWER, sources: CHAT_SOURCES, remaining: 2 }] });
  await signIn(page);
  await openChat(page);

  await page.getByRole('button', { name: 'What were the decisions?' }).click();

  await expect(page.getByText('2 questions left today.')).toBeVisible();
});

test('a problem shows plain words and a Retry that works', async ({ page }) => {
  const recorder = await installFakes(page, {
    chatAnswers: [
      { ok: false, message: 'The answering service is busy. Please try again in a minute.' },
      { ok: true, answer: CHAT_ANSWER, sources: CHAT_SOURCES, remaining: 18 },
    ],
  });
  await signIn(page);
  await openChat(page);

  await page.getByLabel('Your question').fill('What were the decisions?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText(/answering service is busy/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByText(/agreed to ship the sign up screen on Friday/)).toBeVisible();
  // The retry sent the id of the question that was already saved, not a new question.
  const calls = recorder.functionCalls.filter((c) => c.name === 'chat');
  expect(calls).toHaveLength(2);
  expect(calls[1].body).toEqual({ retry_message_id: 'q1' });
});

test('a note with no words yet cannot be asked about, and says why', async ({ page }) => {
  await installFakes(page, { notes: [noteRow({ status: 'transcribing' })], segments: [], summary: null, actionItems: [] });
  await signIn(page);
  await openNote(page);

  await expect(page.getByText('You can ask questions once this note has its words.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask about this note' })).toBeDisabled();
});

test('the chat closes again, and the note is still there behind it', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openChat(page);

  await page.getByRole('button', { name: 'Close chat' }).click();

  await expect(page.getByRole('heading', { name: 'Ask about this note' })).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
});

test('on a phone-sized window the chat still works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakes(page);
  await signIn(page);
  await openChat(page);

  await page.getByRole('button', { name: 'What were the decisions?' }).click();

  await expect(page.getByText(/agreed to ship the sign up screen on Friday/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the line at 1:05' })).toBeVisible();
});
