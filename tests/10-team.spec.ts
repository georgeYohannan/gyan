/**
 * The Team screen (prompt 10): seats, inviting, joining, and who is allowed to change what.
 *
 * NO EMAIL IS EVER SENT. The team server function is faked, so the whole invite flow can be
 * walked through without anything leaving the machine.
 */
import { expect, test } from '@playwright/test';

import { installFakes, signIn, TEAM } from './fixtures/fake-api';


/**
 * Only the thing you can actually see.
 *
 * The app keeps more than one screen in the page at a time (a tab you came from, a page you
 * pushed from), so plain text can match something on a screen that is no longer showing. Every
 * check below looks only at what is on screen.
 */
function shown(locator: import('@playwright/test').Locator) {
  return locator.filter({ visible: true });
}

async function openTeam(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: /^Team\./ }).click();
  await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible();
}

test('the team shows the seats, the people and the invites still waiting', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTeam(page);

  await expect(page.getByRole('heading', { name: '3 of 5 seats' })).toBeVisible();
  await expect(page.getByText('Sam Carter (you)')).toBeVisible();
  await expect(page.getByText('Ada Blake')).toBeVisible();
  await expect(page.getByText('test.c@example.com')).toBeVisible();
  await expect(page.getByText('Invited, not joined yet. This is holding a seat.')).toBeVisible();
});

test('inviting somebody sends the invite and shows them waiting, holding a seat', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openTeam(page);

  await page.getByLabel('Email address').fill('new.person@example.com');
  await page.getByRole('button', { name: 'Send invite' }).click();

  await expect(page.getByText('Invite sent to new.person@example.com.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '4 of 5 seats' })).toBeVisible();
  // Exactly the address, not the "Invite sent to ..." line that also contains it.
  await expect(shown(page.getByText('new.person@example.com', { exact: true }))).toBeVisible();

  // The app asked the SERVER to send it. It never made an invite itself, and never saw a token.
  const call = recorder.functionCalls.find((c) => c.name === 'team');
  expect(call?.body).toEqual({ email: 'new.person@example.com' });
  expect(JSON.stringify(recorder.updates)).not.toContain('token');
});

test('something that is not an address never reaches the server', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openTeam(page);

  await page.getByLabel('Email address').fill('not-an-address');
  await page.getByRole('button', { name: 'Send invite' }).click();

  await expect(page.getByText('That does not look like an email address. Check it and try again.')).toBeVisible();
  expect(recorder.functionCalls.filter((c) => c.name === 'team')).toHaveLength(0);
});

test('a refusal from the server is shown in its own words', async ({ page }) => {
  await installFakes(page, { inviteProblem: 'That person is already on your account.' });
  await signIn(page);
  await openTeam(page);

  await page.getByLabel('Email address').fill('ada@example.com');
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('That person is already on your account.')).toBeVisible();
});

test('WHEN THE SEATS ARE FULL THE INVITE IS BLOCKED, with the number from the plan', async ({ page }) => {
  await installFakes(page, { team: { ...TEAM, seats_included: 3, seats_used: 3 } });
  await signIn(page);
  await openTeam(page);

  await expect(
    page.getByText('All 3 seats are taken. Remove somebody, or change your plan, to invite another person.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send invite' })).toBeDisabled();
});

test('taking an invite back frees the seat again', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTeam(page);

  await page.getByRole('button', { name: 'Take back' }).click();
  await expect(page.getByText(/the seat it is holding is free again/)).toBeVisible();
  await page.getByRole('button', { name: 'Take it back' }).click();

  await expect(page.getByRole('heading', { name: '2 of 5 seats' })).toBeVisible();
  await expect(page.getByText('test.c@example.com')).toBeHidden();
});

test('removing somebody asks first, and says their notes stay', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openTeam(page);

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Ada Blake will lose their way into this account straight away.')).toBeVisible();
  await expect(page.getByText('•  The notes they made stay here, with you.')).toBeVisible();
  expect(recorder.updates.filter((u) => u.table === 'remove_member')).toHaveLength(0);

  await page.getByRole('button', { name: 'Remove them' }).click();
  await expect(shown(page.getByText('Ada Blake'))).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '2 of 5 seats' })).toBeVisible();
});

test('HANDING THE ACCOUNT OVER SAYS YOU STOP BEING THE OWNER', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTeam(page);

  await page.getByRole('button', { name: 'Make owner' }).click();
  await expect(page.getByText('Ada Blake becomes the owner, and you become an ordinary member.')).toBeVisible();
  await expect(page.getByText('•  You cannot undo this on your own. They would have to hand it back.')).toBeVisible();

  await page.getByRole('button', { name: 'Hand it over' }).click();
  // Having handed it over, this person is now an ordinary member and the controls are gone.
  await expect(page.getByText('Only the account owner can change the team.').first()).toBeVisible();
});

test('A TEAM MEMBER CAN SEE THE TEAM BUT CANNOT CHANGE IT', async ({ page }) => {
  await installFakes(page, {
    team: {
      ...TEAM,
      is_owner: false,
      members: [
        { user_id: 'owner-id', email: 'owner@example.com', name: 'Sam Carter', role: 'owner', is_you: false },
        { user_id: 'me-id', email: 'test.a@example.com', name: 'Ada Blake', role: 'member', is_you: true },
      ],
    },
  });
  await signIn(page);
  await openTeam(page);

  // They can still see who they share an account with. That is the point of the page.
  await expect(shown(page.getByText('Sam Carter')).first()).toBeVisible();
  await expect(shown(page.getByText('Ada Blake (you)'))).toBeVisible();

  await expect(page.getByRole('button', { name: 'Send invite' })).toBeDisabled();
  await expect(page.getByText('Only the account owner can change the team.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Make owner' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Take back' })).toBeHidden();
});

test('A NON-OWNER CANNOT CHANGE THE RECAP SETTINGS EITHER', async ({ page }) => {
  await installFakes(page, { isOwner: false });
  await signIn(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: /^Recaps\./ }).click();

  await expect(page.getByRole('heading', { name: 'Recap emails', level: 1 })).toBeVisible();
  await expect(page.getByText('Only the account owner can change who gets recap emails.').first()).toBeVisible();
  await expect(page.getByRole('switch', { name: 'The account owner' })).toBeDisabled();
});

test('joining from an invite link lands the person on the team', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await page.goto('/join?token=fake-invite-token');

  await expect(page.getByRole('heading', { name: 'You are in' })).toBeVisible();
  await expect(page.getByText(/You are now on Sam Carter's account/)).toBeVisible();
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
});

test.describe('an invite link that will not work says why, in plain words', () => {
  for (const [reason, words] of [
    ['wrong_email', 'That invite was sent to a different email address. Sign in with that address to join.'],
    ['invite_expired', 'That invite link has run out. Ask for a new one.'],
    ['bad_invite', 'That invite link does not work any more. Ask for a new one.'],
    ['seats_full', 'That account has no seats left. Ask the owner to free one up.'],
    ['own_notes', 'You already have notes in Gyan on your own account.'],
  ] as const) {
    test(reason, async ({ page }) => {
      await installFakes(page, { acceptInviteError: reason });
      await signIn(page);
      await page.goto('/join?token=fake-invite-token');

      await expect(page.getByRole('heading', { name: 'Gyan could not let you in' })).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: words })).toBeVisible();
    });
  }
});

test('Team works at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakes(page);
  await signIn(page);
  await openTeam(page);

  await expect(page.getByRole('heading', { name: '3 of 5 seats' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
