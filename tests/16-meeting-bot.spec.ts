/**
 * Meeting link: sending a bot to a Zoom, Google Meet or Microsoft Teams call (prompt 14).
 *
 * NO REAL BOT IS EVER SENT, and that is structural rather than careful: these scripts run the web
 * app against a made-up Supabase address with every call intercepted by
 * tests/fixtures/fake-api.ts, so the real `bot` server function never runs and the real bot
 * service is never reached. The fake walks a note through simulated events -- joining, waiting
 * room, recording, ended, failed -- as the screen polls, which is the only way to watch the whole
 * of a call happen in a test.
 *
 * The two things a browser cannot check are checked in Jest instead, which is the stronger place
 * for them: a forged signature changes nothing (__tests__/bot-webhook-test.ts) and the request to
 * the service asks for audio only (__tests__/bot-provider-test.ts).
 */
import { expect, test } from '@playwright/test';

import { gotoApp, installFakes, noteRow, PLAN_PRO, signIn } from './fixtures/fake-api';
import { byId, DESKTOP, expectNoSideScroll, PHONE } from './fixtures/nav';

/**
 * The status badge, by its exact label.
 *
 * `getByLabel` matches a SUBSTRING, and the Summary tab's "not ready" panel carries a badge of
 * its own labelled "Summary is not ready. Status: Recording" -- so a plain name matches twice and
 * fails for a reason that looks nothing like the real one. That is the FOURTH time a locator
 * matching part of a name has cost an hour in this project (see docs/decisions.md, 2026-11-24).
 */

/** An account with the switch on and hours to spend, which is what the founder's test account is. */
const ON = { botEnabled: true, planAndUsage: PLAN_PRO };

const MEET = 'https://meet.google.com/abc-defg-hij';

// ---------------------------------------------------------------------------
// With the switch off, which is where every account starts
// ---------------------------------------------------------------------------

test('with the switch off, New note still says Coming soon', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await byId(page, 'home-new-note').click();

  await expect(page.getByRole('button', { name: 'Meeting link, Coming soon' })).toBeDisabled();
});

test('with the switch off, typing the address in gets a screen that refuses', async ({ page }) => {
  // The card being dimmed is the polite half. Somebody who types the address has to be refused
  // too, or the switch would be decoration.
  await installFakes(page);
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  await expect(byId(page, 'meeting-link-coming-soon')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meeting link is coming soon' })).toBeVisible();
  await expect(page.getByText(/checked by a lawyer/)).toBeVisible();
  // Nothing to paste and nothing to press.
  await expect(page.getByTestId('meeting-link-url')).toBeHidden();
  await expect(page.getByTestId('meeting-link-send')).toBeHidden();
});

// ---------------------------------------------------------------------------
// With the switch on
// ---------------------------------------------------------------------------

test('with the switch on, the card opens the Meeting link screen', async ({ page }) => {
  await installFakes(page, ON);
  await signIn(page);
  await byId(page, 'home-new-note').click();

  await byId(page, 'new-note-meeting-link').click();
  await expect(byId(page, 'meeting-link-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meeting link' })).toBeVisible();
  await expect(page.getByText('Gyan joins the call, records it, and writes the notes afterwards.')).toBeVisible();
});

test('a Google Meet link is recognised, and the screen says what will happen in the call', async ({ page }) => {
  await installFakes(page, ON);
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  // Nothing is said about the call until there is a call to say something about.
  await expect(page.getByTestId('meeting-link-what-happens')).toBeHidden();

  await byId(page, 'meeting-link-url').fill(MEET);
  await expect(byId(page, 'meeting-link-what-happens')).toBeVisible();
  await expect(page.getByText('Gyan joins your Google Meet call as gyan Notetaker (Sam Carter).')).toBeVisible();
  // The waiting room, in plain words, and the Google Meet detail that catches people out.
  await expect(page.getByText(/Somebody already in the call has to let Gyan in/)).toBeVisible();
  await expect(page.getByText(/signed in to the host’s Google Workspace/)).toBeVisible();
  await expect(page.getByText(/says in the meeting chat that it is recording/)).toBeVisible();
});

test('each of the three platforms is recognised by name', async ({ page }) => {
  await installFakes(page, ON);
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  for (const [link, said] of [
    [MEET, 'Google Meet'],
    ['https://zoom.us/j/1234567890', 'Zoom'],
    ['https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0', 'Microsoft Teams'],
  ] as const) {
    await byId(page, 'meeting-link-url').fill(link);
    await expect(page.getByText(new RegExp(`Gyan joins your ${said} call`))).toBeVisible();
  }
});

test('A LINK GYAN DOES NOT SUPPORT GETS A FRIENDLY MESSAGE, and nothing is sent', async ({ page }) => {
  const recorder = await installFakes(page, ON);
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  for (const bad of ['hello', 'https://example.com/meeting/1', 'https://zoom.us/about']) {
    await byId(page, 'meeting-link-url').fill(bad);
    await expect(
      page.getByText(
        'Gyan could not read that as a meeting link. Paste the whole link to a Zoom, Google Meet or Microsoft Teams call.',
      ),
    ).toBeVisible();
    await expect(byId(page, 'meeting-link-send')).toBeDisabled();
  }
  expect(recorder.functionCalls.filter((c) => c.name === 'bot')).toEqual([]);
});

test('THE CONSENT HAS TO BE TICKED, and until it is, nothing can be sent', async ({ page }) => {
  const recorder = await installFakes(page, ON);
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  // The three promises are on the screen before anything else about consent.
  await expect(page.getByRole('heading', { name: 'Before Gyan joins' })).toBeVisible();
  await expect(page.getByText('I have the right to record this meeting.')).toBeVisible();
  await expect(page.getByText('I will tell everyone in the call that it is being recorded.')).toBeVisible();
  await expect(page.getByText('Gyan will also say so in the meeting chat when it joins.')).toBeVisible();
  // And the screen says the wording has not been through a lawyer.
  await expect(page.getByText(/DRAFT wording: a lawyer has not checked these words yet/)).toBeVisible();

  await byId(page, 'meeting-link-url').fill(MEET);
  await expect(byId(page, 'meeting-link-send')).toBeDisabled();
  await expect(page.getByText('Tick the box to confirm, and Gyan will send the bot.')).toBeVisible();
  expect(recorder.functionCalls.filter((c) => c.name === 'bot')).toEqual([]);

  await byId(page, 'meeting-link-consent').click();
  await expect(byId(page, 'meeting-link-send')).toBeEnabled();
});

test('a bot is sent, and the consent goes with it', async ({ page }) => {
  const recorder = await installFakes(page, ON);
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  await byId(page, 'meeting-link-url').fill(MEET);
  await byId(page, 'meeting-link-consent').click();
  await byId(page, 'meeting-link-send').click();

  // Straight to the note, because the next thing that happens is in the call, not here.
  await expect(page.getByLabel(/^Status: /)).toBeVisible();

  const sent = recorder.functionCalls.filter((c) => c.name === 'bot');
  expect(sent).toHaveLength(1);
  const body = sent[0].body as { meeting_url: string; consent: { version: string; hash: string } };
  expect(body.meeting_url).toBe(MEET);
  // The version AND a fingerprint of the exact words that were on the screen. The server refuses
  // anything that is not the current pair, so an old copy of the app cannot send a bot.
  expect(body.consent.version).toBe('v1');
  expect(body.consent.hash).toMatch(/^v1-[0-9a-f]{8}-\d+$/);
});

test('the hours the plan allows are on the screen, read from the plan', async ({ page }) => {
  await installFakes(page, ON);
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  // 3.2 of 10 used, so 6.8 left. Not one of those numbers is written in the app.
  await expect(page.getByText('6.8 of 10 hours left this month')).toBeVisible();
  await expect(page.getByText('Up to 180 minutes in one call')).toBeVisible();
});

test('BEING OUT OF HOURS BLOCKS A NEW BOT, with a friendly message', async ({ page }) => {
  const recorder = await installFakes(page, {
    botEnabled: true,
    planAndUsage: { ...PLAN_PRO, bot_hours_used: 10 },
  });
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  await byId(page, 'meeting-link-url').fill(MEET);
  await byId(page, 'meeting-link-consent').click();
  await expect(byId(page, 'meeting-link-send')).toBeDisabled();
  await expect(
    page.getByText(/used all your meeting bot hours this month. They start again on the 1st/),
  ).toBeVisible();
  expect(recorder.functionCalls.filter((c) => c.name === 'bot')).toEqual([]);
});

test('a plan with no bot hours says so, rather than looking broken', async ({ page }) => {
  // The Free plan has 0 hours, which is what makes bot_hours_per_month the thing that blocks a
  // bot with no code change.
  await installFakes(page, { botEnabled: true });
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  await expect(page.getByText('No meeting bot hours on this plan')).toBeVisible();
  await expect(page.getByText(/does not include meeting bot hours/)).toBeVisible();
  await byId(page, 'meeting-link-url').fill(MEET);
  await byId(page, 'meeting-link-consent').click();
  await expect(byId(page, 'meeting-link-send')).toBeDisabled();
});

test('the server refusing says which limit it was, in the server\'s own words', async ({ page }) => {
  await installFakes(page, {
    ...ON,
    botProblem:
      'Gyan has reached its meeting bot limit for today. This is a safety limit, not a problem with your account. Please try again tomorrow.',
  });
  await signIn(page);
  await gotoApp(page, '/meeting-link');

  await byId(page, 'meeting-link-url').fill(MEET);
  await byId(page, 'meeting-link-consent').click();
  await byId(page, 'meeting-link-send').click();

  await expect(page.getByText(/reached its meeting bot limit for today/)).toBeVisible();
  // Still on the screen, so the link does not have to be pasted again.
  await expect(byId(page, 'meeting-link-screen')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Watching the call happen, on the note
// ---------------------------------------------------------------------------

/**
 * Each phase on its own, rather than one script watching all three go by.
 *
 * A bot really does move on by itself every few seconds, so a script that asserted "joining",
 * then "in the waiting room", then "recording" in one run was racing the thing it was testing --
 * and lost, intermittently, which is the worst kind of test there is. One phase per run proves
 * exactly the same thing and cannot flake. The script below it proves a note really does move.
 */
const botNote = (status: string) => [
  { ...noteRow({ id: '77777777-7777-4777-8777-777777777777', title: null, status }), source: 'bot' },
];

test('while the bot is asking to join, the note says so', async ({ page }) => {
  await installFakes(page, {
    ...ON,
    notes: botNote('joining'),
    botPhases: [{ phase: 'joining', status: 'joining' }],
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await expect(byId(page, 'note-bot-live')).toBeVisible();
  await expect(page.getByText('gyan Notetaker (Sam Carter) is asking to join')).toBeVisible();
  await expect(page.getByLabel('Status: Joining', { exact: true })).toBeVisible();
});

test('IN THE WAITING ROOM, the note says what the person has to do about it', async ({ page }) => {
  // This is the one state where somebody has something to do, and it is the commonest reason a
  // bot never records anything. So it asks, by name, rather than describing a state.
  await installFakes(page, {
    ...ON,
    notes: botNote('waiting'),
    botPhases: [{ phase: 'waiting', status: 'waiting' }],
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await expect(page.getByText('Let gyan Notetaker (Sam Carter) in')).toBeVisible();
  await expect(page.getByText(/signed in to the host’s Google Workspace/)).toBeVisible();
  await expect(page.getByLabel('Status: In waiting room', { exact: true })).toBeVisible();
});

test('while recording, the note says it is in the call and offers to stop', async ({ page }) => {
  await installFakes(page, {
    ...ON,
    notes: botNote('recording'),
    botPhases: [{ phase: 'recording', status: 'recording' }],
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await expect(page.getByText('gyan Notetaker (Sam Carter) is in the call')).toBeVisible();
  await expect(page.getByLabel('Status: Recording', { exact: true })).toBeVisible();
  await expect(byId(page, 'note-bot-stop')).toBeVisible();
});

test('and the note really does move on by itself, without being reloaded', async ({ page }) => {
  // Only the END is asserted, because the states in between go past on their own. What this
  // proves is the thing that matters: nobody has to press anything for a note to finish.
  await installFakes(page, {
    ...ON,
    notes: botNote('joining'),
    botPhases: [
      { phase: 'joining', status: 'joining' },
      { phase: 'waiting', status: 'waiting' },
      { phase: 'recording', status: 'recording' },
      { phase: 'ready', status: 'ready' },
    ],
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await expect(byId(page, 'note-bot-live')).toBeVisible();
  // Four phases at three seconds each, and the panel goes when there is nothing left to stop.
  await expect(page.getByLabel('Status: Ready', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('note-bot-live')).toBeHidden();
});

test('Stop recording asks the server, and says what happened', async ({ page }) => {
  const recorder = await installFakes(page, {
    ...ON,
    notes: [{ ...noteRow({ id: '77777777-7777-4777-8777-777777777777', title: null, status: 'recording' }), source: 'bot' }],
    botPhases: [{ phase: 'recording', status: 'recording' }],
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await byId(page, 'note-bot-stop').click();
  await expect(page.getByText('Gyan is leaving the call. The note will be ready in a few minutes.')).toBeVisible();

  const stops = recorder.functionCalls.filter(
    (c) => c.name === 'bot' && (c.body as { action?: string } | undefined)?.action === 'stop',
  );
  expect(stops).toHaveLength(1);
});

test('a bot that could not be stopped says so, and says what will happen anyway', async ({ page }) => {
  await installFakes(page, {
    ...ON,
    notes: [{ ...noteRow({ id: '77777777-7777-4777-8777-777777777777', title: null, status: 'recording' }), source: 'bot' }],
    botPhases: [{ phase: 'recording', status: 'recording' }],
    botStopProblem: 'Gyan could not reach the bot to stop it. It will leave by itself when the call ends.',
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await byId(page, 'note-bot-stop').click();
  await expect(page.getByText(/It will leave by itself when the call ends/)).toBeVisible();
});

test('A BOT NOBODY LET IN ENDS AS FAILED, with a reason in plain words', async ({ page }) => {
  await installFakes(page, {
    ...ON,
    notes: [{ ...noteRow({ id: '77777777-7777-4777-8777-777777777777', title: null, status: 'joining' }), source: 'bot' }],
    botPhases: [
      { phase: 'waiting', status: 'waiting' },
      {
        phase: 'failed',
        status: 'failed',
        reason: 'Nobody let Gyan into the meeting. Somebody in the call has to admit it from the waiting room.',
      },
    ],
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await expect(page.getByLabel('Status: Failed', { exact: true })).toBeVisible();
  await expect(page.getByText(/Nobody let Gyan into the meeting/)).toBeVisible();
  // And the live panel is gone: there is nothing left to stop.
  await expect(page.getByTestId('note-bot-live')).toBeHidden();
});

test('a bad link ends as Failed too, saying the link did not work', async ({ page }) => {
  await installFakes(page, {
    ...ON,
    notes: [{ ...noteRow({ id: '77777777-7777-4777-8777-777777777777', title: null, status: 'joining' }), source: 'bot' }],
    botPhases: [
      { phase: 'failed', status: 'failed', reason: 'That link did not work. Check you pasted the whole invitation link.' },
    ],
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await expect(page.getByLabel('Status: Failed', { exact: true })).toBeVisible();
  await expect(page.getByText(/That link did not work/)).toBeVisible();
});

test('a finished bot note is an ordinary note, with no bot panel on it', async ({ page }) => {
  await installFakes(page, {
    ...ON,
    notes: [{ ...noteRow({ id: '77777777-7777-4777-8777-777777777777', title: 'Weekly team call', status: 'ready' }), source: 'bot' }],
    botPhases: [{ phase: 'ready', status: 'ready' }],
  });
  await signIn(page);
  await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

  await expect(page.getByLabel('Status: Ready', { exact: true })).toBeVisible();
  await expect(page.getByTestId('note-bot-live')).toBeHidden();
});

test('and on Home it is labelled as having come from a meeting link', async ({ page }) => {
  // Home has offered "Meeting link" as a source since prompt 12. This round is what makes a note
  // really arrive that way.
  await installFakes(page, {
    ...ON,
    notes: [{ ...noteRow({ id: '77777777-7777-4777-8777-777777777777', title: 'Weekly team call', status: 'ready' }), source: 'bot' }],
    botPhases: [{ phase: 'ready', status: 'ready' }],
  });
  await signIn(page);

  await expect(page.getByText('Meeting link')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Settings, and both window sizes
// ---------------------------------------------------------------------------

test('Settings shows the bot hours against the allowance', async ({ page }) => {
  await installFakes(page, ON);
  await signIn(page);
  await gotoApp(page, '/settings/plan');

  await expect(byId(page, 'settings-plan-bot-hours')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meeting bot hours this month' })).toBeVisible();
  await expect(page.getByText('3.2 of 10')).toBeVisible();
  // And the plan's own feature line, with the number filled in from the plans table.
  await expect(page.getByText('•  10 hours of meeting bot a month')).toBeVisible();
});

test('Settings says plainly when a plan has no bot hours', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await gotoApp(page, '/settings/plan');

  await expect(page.getByText('Not included on this plan')).toBeVisible();
  await expect(page.getByText(/needs a bigger plan. Uploading a recording works on every plan/)).toBeVisible();
});

for (const size of [PHONE, DESKTOP]) {
  test(`Meeting link fits at ${size.width} pixels`, async ({ page }) => {
    await page.setViewportSize(size);
    await installFakes(page, ON);
    await signIn(page);
    await gotoApp(page, '/meeting-link');

    await expect(byId(page, 'meeting-link-screen')).toBeVisible();
    await byId(page, 'meeting-link-url').fill(MEET);
    await expect(byId(page, 'meeting-link-what-happens')).toBeVisible();
    await expectNoSideScroll(page);
  });

  test(`a note with a bot in a call fits at ${size.width} pixels`, async ({ page }) => {
    await page.setViewportSize(size);
    await installFakes(page, {
      ...ON,
      notes: [{ ...noteRow({ id: '77777777-7777-4777-8777-777777777777', title: null, status: 'waiting' }), source: 'bot' }],
      botPhases: [{ phase: 'waiting', status: 'waiting' }],
    });
    await signIn(page);
    await gotoApp(page, '/note/77777777-7777-4777-8777-777777777777');

    await expect(byId(page, 'note-bot-live')).toBeVisible();
    await expectNoSideScroll(page);
  });
}

// ---------------------------------------------------------------------------
// The longest one note may be, which this round made real for every source
// ---------------------------------------------------------------------------

test('New note says nothing about bot hours while the switch is off', async ({ page }) => {
  // A line about something somebody cannot use is noise on the screen they use most.
  await installFakes(page);
  await signIn(page);
  await byId(page, 'home-new-note').click();

  await expect(byId(page, 'new-note-screen')).toBeVisible();
  await expect(page.getByTestId('new-note-bot-hours')).toBeHidden();
});

test('New note shows the bot hours once the switch is on', async ({ page }) => {
  // Its own script rather than a second half of the one above: signing in twice in one run
  // cannot work, because the second signIn lands on Home with nowhere to type an address.
  await installFakes(page, ON);
  await signIn(page);
  await byId(page, 'home-new-note').click();

  await expect(byId(page, 'new-note-bot-hours')).toBeVisible();
  await expect(page.getByText(/Meeting bot: 3.2 of 10 hours used this month/)).toBeVisible();
  // And the longest one note may be, from the same plan.
  await expect(page.getByText(/One note can be up to 180 minutes long/)).toBeVisible();
});

test('New note says when a plan has no bot hours at all', async ({ page }) => {
  await installFakes(page, { botEnabled: true });
  await signIn(page);
  await byId(page, 'home-new-note').click();

  await expect(page.getByText('Meeting bot: not included on this plan.')).toBeVisible();
});
