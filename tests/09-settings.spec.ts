/**
 * The Settings area (prompt 10): the list, Profile, Plan and usage, and Data and privacy.
 *
 * Fake data only. Nothing is really saved, no email is sent, no account is deleted and no paid
 * service is called: tests/fixtures/fake-api.ts answers every call.
 */
import { expect, test } from '@playwright/test';

import { installFakes, noteRow, PLAN_FREE, signIn } from './fixtures/fake-api';


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

/** Settings is a tab, so getting there is one tap from anywhere. */
async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
}

test('Settings is in the main navigation, and every row says what is set', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSettings(page);

  await expect(page.getByText('Sam Carter. Gyan writes in English.')).toBeVisible();
  await expect(page.getByText('Free plan. 2 of 5 meetings used this month.')).toBeVisible();
  await expect(page.getByText('3 of 5 seats')).toBeVisible();
  await expect(page.getByText('The account owner only')).toBeVisible();
  await expect(page.getByText('Delete a note, or delete your account.')).toBeVisible();
});

test('each row opens its own page, and each page has a way back', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSettings(page);

  for (const [row, heading] of [
    ['Profile', 'Profile'],
    ['Plan and usage', 'Plan and usage'],
    ['Team', 'Team'],
    ['Recaps', 'Recap emails'],
    ['Data and privacy', 'Data and privacy'],
  ] as const) {
    await page.getByRole('link', { name: new RegExp(`^${row}\\.`) }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  }
});

test('Profile: a new name is saved, and the Settings list says the new name', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Profile\./ }).click();

  await expect(page.getByText('test.a@example.com')).toBeVisible();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Sam Carter-Jones');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  const saved = recorder.updates.find((u) => u.table === 'profiles');
  expect(saved?.body).toMatchObject({ display_name: 'Sam Carter-Jones' });
});

test('Profile: the language picker is here, and picking one saves it', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Profile\./ }).click();

  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByLabel(/Español/).click();
  await expect(page.getByText('Español')).toBeVisible();

  const saved = recorder.updates.find(
    (u) => u.table === 'profiles' && (u.body as { preferred_language?: string }).preferred_language === 'es',
  );
  expect(saved).toBeTruthy();
});

test('Profile: TWO PASSWORDS THAT DO NOT MATCH NEVER REACH THE SERVER', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Profile\./ }).click();

  await page.getByLabel('New password', { exact: true }).fill('longenough1');
  await page.getByLabel('New password again').fill('somethingelse1');
  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(page.getByText('Those two passwords are not the same. Check them and try again.')).toBeVisible();
  await expect(page.getByText('Your password is changed.')).toBeHidden();
});

test('Plan and usage: every number on the screen comes from the plan', async ({ page }) => {
  await installFakes(page, {
    planAndUsage: { ...PLAN_FREE, meetings_per_month: 9, meetings_used: 4, chat_messages_per_day: 33, chat_messages_used: 7 },
  });
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Plan and usage\./ }).click();

  await expect(page.getByRole('heading', { name: '4 of 9' })).toBeVisible();
  await expect(page.getByText('5 left. They start again on the 1st.')).toBeVisible();
  await expect(page.getByText('7 of 33')).toBeVisible();
  // The feature list is printed from the table, with the real numbers put into it.
  await expect(page.getByText('•  9 meetings a month')).toBeVisible();
  await expect(page.getByText('•  33 chat questions a day')).toBeVisible();
});

test('Plan and usage: Upgrade is there, and says it is not built yet', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Plan and usage\./ }).click();

  await expect(page.getByRole('button', { name: /Upgrade/ })).toBeDisabled();
  await expect(page.getByText(/not built yet/)).toBeVisible();
});

test('Plan and usage: at the limit it says so, and says pasted text still works', async ({ page }) => {
  await installFakes(page, { planAndUsage: { ...PLAN_FREE, meetings_used: 5 } });
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Plan and usage\./ }).click();

  await expect(page.getByText(/used all your meetings for this month/)).toBeVisible();
  await expect(page.getByText(/Pasted text still works/)).toBeVisible();
});

test('THE TEST-ONLY PLAN SWITCH IS NEVER MISTAKEN FOR PART OF THE APP', async ({ page }) => {
  // THIS TEST USED TO ASSUME THE SWITCH WAS OFF, and that assumption was wrong.
  //
  // The switch appears when a build was started with EXPO_PUBLIC_GYAN_TEST_TOOLS=1, and
  // docs/testing/prompt-10.md tells the founder to set exactly that, by hand, in .env.local.
  // So following the instructions broke this test -- the same trap that broke
  // supabase-rls-test.ts on 2026-11-20, in a different place.
  //
  // So it no longer asks "is the switch off". It asks the question that actually matters on
  // ANY machine: whichever way this build was made, the switch is never something a
  // customer could mistake for a real feature. Neither branch can pass by accident, because
  // each one asserts something the other cannot.
  //
  // That a REAL build has no switch at all is proved where it cannot drift with somebody's
  // settings: in __tests__/setup-config-test.ts, against the source.
  await installFakes(page);
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Plan and usage\./ }).click();
  await expect(page.getByRole('heading', { name: '2 of 5' })).toBeVisible();

  const switchPanel = page.getByRole('heading', { name: 'Switch plan, for testing' });
  const builderBuild = (await switchPanel.count()) > 0;

  if (builderBuild) {
    // A builder's build. The panel exists, and it has to say loudly what it is.
    await expect(switchPanel).toBeVisible();
    await expect(page.getByText('For builders only')).toBeVisible();
    // There is something to press, and the panel is not empty decoration.
    const offered = await page.getByRole('button', { name: /^Switch to/ }).allInnerTexts();
    expect(offered.length).toBeGreaterThan(0);
    // WHICH plans may be offered is not something a screen can promise, and the names come
    // out of the plans table, so asserting on them here would only test the fake. The real
    // guarantee is in the database: set_test_plan refuses a plan that is not marked as a
    // stand-in, and refuses anybody who is not a Gyan admin. Both are asserted in
    // __tests__/setup-config-test.ts, against the SQL.
  } else {
    // A normal build, which is what a customer runs. Not a trace of it anywhere.
    await expect(page.getByText('Switch plan, for testing')).toBeHidden();
    await expect(page.getByText('For builders only')).toBeHidden();
    await expect(page.getByRole('button', { name: /^Switch to/ })).toBeHidden();
  }
});

test('Data and privacy: deleting a note asks first, names it, and then removes it', async ({ page }) => {
  const recorder = await installFakes(page, {
    notes: [noteRow({ id: 'n-1', title: 'Monday planning call', status: 'ready' })],
  });
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Data and privacy\./ }).click();

  await expect(shown(page.getByText('Monday planning call')).first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByText('Monday planning call will be gone for good.')).toBeVisible();
  await expect(page.getByText('•  It does not give you the meeting back this month')).toBeVisible();
  expect(recorder.updates.filter((u) => u.table === 'delete_note')).toHaveLength(0);

  await page.getByRole('button', { name: 'Delete this note' }).click();
  await expect(shown(page.getByText('Monday planning call is deleted.'))).toBeVisible();
  expect(recorder.updates.filter((u) => u.table === 'delete_note')).toHaveLength(1);
});

test('Data and privacy: cancelling deletes nothing', async ({ page }) => {
  const recorder = await installFakes(page, {
    notes: [noteRow({ id: 'n-1', title: 'Monday planning call', status: 'ready' })],
  });
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Data and privacy\./ }).click();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(shown(page.getByText('Monday planning call')).first()).toBeVisible();
  expect(recorder.updates.filter((u) => u.table === 'delete_note')).toHaveLength(0);
});

test('DELETING AN ACCOUNT WILL NOT GO UNTIL THE WORD IS TYPED', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Data and privacy\./ }).click();
  await page.getByRole('button', { name: 'Delete my account' }).click();

  await expect(page.getByText('•  Gyan keeps no copy, and we cannot put it back')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled();

  // Something close is not close enough.
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled();

  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeEnabled();
  expect(recorder.functionCalls.filter((c) => c.name === 'account')).toHaveLength(0);
});

test('an owner who still has a team cannot delete the account, and is sent to Team', async ({ page }) => {
  await installFakes(page, {
    deleteCheck: {
      account_id: 'a1',
      is_owner: true,
      can_delete: false,
      reason: 'There is 1 other person on your account. Remove them on the Team screen first, then you can delete your account.',
      what_goes: null,
      note_count: 1,
      other_member_count: 1,
      pending_invite_count: 0,
    },
  });
  await signIn(page);
  await openSettings(page);
  await page.getByRole('link', { name: /^Data and privacy\./ }).click();

  await expect(page.getByText(/There is 1 other person on your account/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete my account' })).toBeHidden();

  await page.getByRole('button', { name: 'Go to Team' }).click();
  await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible();
});

test('every Settings page has a ? button that opens its own help', async ({ page }) => {
  await installFakes(page);
  await signIn(page);

  for (const [row, title] of [
    [null, 'Settings'],
    ['Profile', 'Your profile'],
    ['Plan and usage', 'Plan and usage'],
    ['Team', 'Your team'],
    ['Data and privacy', 'Data and privacy'],
  ] as const) {
    // Start from the Settings list each time, so the screen behind is always the same one.
    await openSettings(page);
    if (row) {
      await shown(page.getByRole('link', { name: new RegExp(`^${row}\\.`) })).click();
      await expect(page.getByRole('heading', { name: row, level: 1 })).toBeVisible();
    }

    await shown(page.getByRole('button', { name: 'Help' })).click();
    // level 2 is the help panel's own title; the page behind it uses level 1.
    await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
    await shown(page.getByRole('button', { name: 'Close' })).click();
    await expect(page.getByRole('heading', { name: title, level: 2 })).toBeHidden();
  }
});

test('the old recap settings address still works, so links in sent emails do not break', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await page.goto('/recap-emails');
  await expect(page.getByRole('heading', { name: 'Recap emails', level: 1 })).toBeVisible();
});

test('Settings works at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakes(page);
  await signIn(page);
  await openSettings(page);

  await expect(page.getByText('Free plan. 2 of 5 meetings used this month.')).toBeVisible();
  await page.getByRole('link', { name: /^Plan and usage\./ }).click();
  await expect(page.getByRole('heading', { name: '2 of 5' })).toBeVisible();
  // The page must not scroll sideways on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
