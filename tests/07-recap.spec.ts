/**
 * Recap emails: what prompt 9 added.
 *
 * NO EMAIL IS EVER SENT HERE. tests/fixtures/fake-api.ts answers the recap server function as if
 * one had been, so these scripts cost nothing and can be run as often as you like. Every address
 * is made up. The real end to end check, with a real email, is docs/testing/prompt-9.md.
 */
import { expect, test, type Page } from '@playwright/test';

import { FAKE_USER, installFakes, openNote, signIn, TEAMMATE } from './fixtures/fake-api';

/** The recap settings now live in Settings, so every test gets there the way a person would. */
async function openRecapSettings(page: Page) {
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-row-recaps').click();
}

/**
 * Opens the "More" menu on a note page.
 *
 * Language, Translate and Send recap used to be three buttons on the line above the note,
 * beside the tabs. That line had grown to six things and pushed the page sideways on a phone,
 * so everything that is not reading the note moved behind one button. The actions kept their
 * names, so these scripts gained one press each and nothing else changed.
 */
async function openMore(page: Page) {
  await page.getByTestId('note-more').click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
}

/** Opens a Ready note and opens the Send recap dialog. */
async function openRecap(page: Page) {
  await openNote(page);
  await openMore(page);
  await page.getByTestId('note-send-recap').click();
  await expect(page.getByRole('heading', { name: 'Send recap' })).toBeVisible();
}

test('the dialog shows exactly who would get the recap, and why', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openRecap(page);

  // It says what is being sent and that only the account can be picked.
  await expect(
    page.getByText(
      'The summary and action items of this note, by email. Only people on your account can be picked.',
    ),
  ).toBeVisible();

  // Both people on the account are listed, by address.
  await expect(page.getByText(FAKE_USER.email, { exact: true })).toBeVisible();
  await expect(page.getByText(TEAMMATE.email, { exact: true })).toBeVisible();

  // The signed-in person is "you". The teammate is described in plain words, with their language.
  await expect(page.getByText('you', { exact: true })).toBeVisible();
  await expect(page.getByText('on your team, in Hindi')).toBeVisible();

  // And it says where the ticks came from, so nobody thinks they changed a setting.
  await expect(
    page.getByText('The ticks come from your recap settings. Changing them here changes this one email only.'),
  ).toBeVisible();
  await expect(
    page.getByText('Anybody who reads another language gets their own copy, translated by AI.'),
  ).toBeVisible();
});

test('the ticks start where the account settings put them', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openRecap(page);

  // The default is the owner only, so the owner is ticked and the teammate is not.
  await expect(page.getByRole('checkbox', { name: `${FAKE_USER.email}, you` })).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: `${TEAMMATE.email}, on your team, in Hindi` }),
  ).not.toBeChecked();
});

test('it asks before anything is sent, and Cancel sends nothing', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openRecap(page);

  await page.getByRole('button', { name: 'Send recap' }).click();
  await expect(page.getByRole('heading', { name: 'Send this recap to 1 person?' })).toBeVisible();
  await expect(page.getByText('An email cannot be taken back once it has gone.')).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Send this recap to 1 person?' })).toBeHidden();

  // Nothing was sent: the only call was the one that worked out the list.
  const calls = recorder.functionCalls.filter((c) => c.name === 'recap');
  expect(calls).toHaveLength(1);
  expect((calls[0].body as { preview?: boolean }).preview).toBe(true);
});

test('ticking a teammate on and sending reaches both, each in their own language', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openRecap(page);

  await page.getByRole('checkbox', { name: `${TEAMMATE.email}, on your team, in Hindi` }).click();
  await page.getByRole('button', { name: 'Send recap' }).click();
  await expect(page.getByRole('heading', { name: 'Send this recap to 2 people?' })).toBeVisible();
  await page.getByRole('button', { name: 'Send recap' }).click();

  // The success message is the receipt: who got it, and in which language.
  await expect(page.getByText('Recap sent to 2 people.')).toBeVisible();
  await expect(page.getByText('Sent in English')).toBeVisible();
  await expect(page.getByText('Sent in Hindi, translated by AI')).toBeVisible();

  // IDS WENT TO THE SERVER, NEVER ADDRESSES.
  const send = recorder.functionCalls.filter((c) => c.name === 'recap').at(-1)!;
  expect(send.body).toEqual({
    meeting_id: expect.any(String),
    recipient_user_ids: [FAKE_USER.id, TEAMMATE.id],
  });
  expect(JSON.stringify(send.body)).not.toContain('@');
});

test('unticking everybody leaves nothing to send', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openRecap(page);

  await page.getByRole('checkbox', { name: `${FAKE_USER.email}, you` }).click();
  await expect(page.getByRole('button', { name: 'Send recap' })).toBeDisabled();
});

test('one person failing is named, so it is clear who to try again', async ({ page }) => {
  await installFakes(page, {
    recapSettings: { to_owner: true, to_members: true, auto_send: false },
    recapPeople: [
      { user_id: FAKE_USER.id, email: FAKE_USER.email, name: 'Test Person A', role: 'owner', language: 'en', default_on: true, is_you: true },
      { user_id: TEAMMATE.id, email: TEAMMATE.email, name: 'Test Person B', role: 'member', language: 'hi', default_on: true, is_you: false },
    ],
    recapFailsFor: [TEAMMATE.email],
  });
  await signIn(page);
  await openRecap(page);

  await page.getByRole('button', { name: 'Send recap' }).click();
  await page.getByRole('button', { name: 'Send recap' }).click();

  await expect(page.getByText('Recap sent to 1 person.')).toBeVisible();
  await expect(page.getByText('Did not go. Try this one again.')).toBeVisible();
});

test('a send that goes wrong says so, and says nothing was sent', async ({ page }) => {
  await installFakes(page, { recapProblem: 'The email service is busy. Please try again in a minute.' });
  await signIn(page);
  await openRecap(page);

  await page.getByRole('button', { name: 'Send recap' }).click();
  await page.getByRole('button', { name: 'Send recap' }).click();

  await expect(page.getByText('The email service is busy. Please try again in a minute.')).toBeVisible();
  await expect(page.getByText('Nothing was sent. You can try again.')).toBeVisible();
});

test('a note that is not finished has no Send recap to press, and says why', async ({ page }) => {
  await installFakes(page, { summary: null });
  await signIn(page);
  await openNote(page);
  await openMore(page);
  await expect(page.getByTestId('note-send-recap')).toBeDisabled();
  // A row that cannot be used says why. A greyed-out button never could.
  await expect(
    page.getByText('There is nothing to send until this note is finished and has a summary.'),
  ).toBeVisible();
});

test('the recap settings open from Settings, and the row says what is set', async ({ page }) => {
  await installFakes(page);
  await signIn(page);

  // The Settings row says what is set, so you can often check it without opening the page.
  await page.getByTestId('nav-settings').click();
  await expect(page.getByText('The account owner only')).toBeVisible();

  await page.getByRole('link', { name: /^Recaps\./ }).click();
  await expect(page.getByRole('heading', { name: 'Recap emails' })).toBeVisible();
  await expect(
    page.getByText('Recaps go to the account owner only, only when somebody presses Send recap on a note.'),
  ).toBeVisible();
});

test('the switches are grouped by who gets one and when, and say On or Off in words', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openRecapSettings(page);

  await expect(page.getByRole('heading', { name: 'Who gets a recap' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'When it is sent' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'The account owner' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Everyone on the team' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Send on its own when a note is ready' })).toBeVisible();

  // Colour is never the only way to tell which way a switch is set.
  await expect(page.getByText('On', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Off', { exact: true })).toHaveCount(2);
});

test('the owner changes a switch, the sentence changes with it, and it is remembered', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openRecapSettings(page);

  await page.getByRole('switch', { name: 'Everyone on the team' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await expect(
    page.getByText(
      'Recaps go to the account owner and everyone on the team, only when somebody presses Send recap on a note.',
    ),
  ).toBeVisible();

  const saved = recorder.updates.filter((u) => u.table === 'save_recap_settings');
  expect(saved).toHaveLength(1);
  expect(saved[0].body).toEqual({
    p_settings: { to_owner: true, to_members: true, auto_send: false },
  });

  // The server remembers it, so going back to Settings shows the new state.
  await page.getByRole('link', { name: 'Back to Settings' }).click();
  await expect(page.getByText('The account owner and the team')).toBeVisible();
});

test('turning the automatic send on says so in the sentence and back in Settings', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openRecapSettings(page);

  await page.getByRole('switch', { name: 'Send on its own when a note is ready' }).click();
  await expect(
    page.getByText('Recaps go to the account owner only, as soon as a note is ready.'),
  ).toBeVisible();

  // And the Settings row says it too, so it can be read without opening this page.
  await page.getByRole('link', { name: 'Back to Settings' }).click();
  await expect(page.getByRole('link', { name: /^Recaps\. The account owner only/ })).toBeVisible();
});

test('A TEAM MEMBER CAN SEE THE SETTINGS BUT NOT CHANGE THEM', async ({ page }) => {
  const recorder = await installFakes(page, {
    isOwner: false,
    recapSettings: { to_owner: true, to_members: true, auto_send: true },
  });
  await signIn(page);
  await openRecapSettings(page);

  // They can read what is set, so they know why they are getting emails.
  await expect(
    page.getByText('Recaps go to the account owner and everyone on the team, as soon as a note is ready.'),
  ).toBeVisible();

  // Every switch is locked, and the reason is on screen.
  for (const name of ['The account owner', 'Everyone on the team', 'Send on its own when a note is ready']) {
    await expect(page.getByRole('switch', { name })).toBeDisabled();
  }
  await expect(
    page.getByText('Only the account owner can change who gets recap emails.').first(),
  ).toBeVisible();

  // Pressing one changes nothing at all.
  await page.getByRole('switch', { name: 'Everyone on the team' }).click({ force: true });
  expect(recorder.updates.filter((u) => u.table === 'save_recap_settings')).toHaveLength(0);
});

test('a save the server refuses puts the switch back and says why', async ({ page }) => {
  await installFakes(page, { saveSettingsError: 'not_owner' });
  await signIn(page);
  await openRecapSettings(page);

  await page.getByRole('switch', { name: 'Everyone on the team' }).click();
  await expect(page.getByText('Only the account owner can change who gets recap emails.')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Everyone on the team' })).not.toBeChecked();
});

test('the page says a recap can only ever go to people on the account', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openRecapSettings(page);

  await expect(
    page.getByText(
      'A recap can only ever go to people on this account. Gyan never emails an address typed in by hand.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'A note only ever sends itself once, so writing a new summary does not email everybody again.',
    ),
  ).toBeVisible();
});

test('on a phone the dialog slides up from the bottom and still works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakes(page);
  await signIn(page);
  await openRecap(page);

  await expect(page.getByText(FAKE_USER.email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send recap' }).click();
  await page.getByRole('button', { name: 'Send recap' }).click();
  await expect(page.getByText('Recap sent to 1 person.')).toBeVisible();
});

test('the dialog has a ? button that opens the recap help', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openRecap(page);

  await page.getByRole('button', { name: 'Help' }).last().click();
  await expect(page.getByLabel('Help: Sending a recap by email')).toBeVisible();
});
