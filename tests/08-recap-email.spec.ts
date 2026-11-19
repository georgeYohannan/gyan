/**
 * The recap email itself, as a picture.
 *
 * NO EMAIL IS SENT AND NO EMAIL IS RECEIVED HERE. The layout code is pure, so this script asks
 * it for the words of one email, opens them in the browser, and photographs the result. That is
 * how you can see what an email looks like without one ever leaving the machine.
 *
 * Fake data only: made up names, made up addresses, no key and no real note.
 * Pictures land in docs/help/images/ and are used by the in-app help.
 */
import { expect, test } from '@playwright/test';

import { renderRecap, type RecapBody, type Sender } from '../supabase/functions/recap/email';

const IMAGES = 'docs/help/images';

/** A made up sender. The real one lives in supabase/functions/recap/settings.ts. */
const SENDER: Sender = { name: 'gyan', email: 'recaps@example.com', replyTo: 'hello@example.com' };

const BODY: RecapBody = {
  title: 'Team call',
  overview:
    'The team agreed to ship the new sign up screen on Friday. Two people tested it on a phone and found it slow, so Priya will send a test plan before then.',
  keyPoints: [
    'Sign up is slow on phones',
    'Two people tested it and both got stuck on the password step',
    'The new screen is ready apart from the error messages',
  ],
  decisions: ['Ship on Friday', 'Keep the old screen available for a week'],
  actionItems: [
    { text: 'Send the test plan', owner: 'Test Person A', due: 'Friday' },
    { text: 'Rewrite the password error message', owner: 'Test Person B', due: null },
    { text: 'Book the review', owner: null, due: null },
  ],
};

/** The same note, as a saved Spanish translation would hand it back. Made up words, not real. */
const BODY_ES: RecapBody = {
  title: 'Team call',
  overview:
    'El equipo acordó lanzar la nueva pantalla de registro el viernes. Dos personas la probaron en un teléfono y les pareció lenta, así que Priya enviará un plan de pruebas antes.',
  keyPoints: [
    'El registro es lento en los teléfonos',
    'Dos personas lo probaron y ambas se atascaron en el paso de la contraseña',
    'La nueva pantalla está lista salvo por los mensajes de error',
  ],
  decisions: ['Lanzar el viernes', 'Mantener la pantalla antigua disponible una semana'],
  actionItems: [
    // The names are NOT translated, exactly as the translating rules say.
    { text: 'Enviar el plan de pruebas', owner: 'Test Person A', due: 'viernes' },
    { text: 'Reescribir el mensaje de error de la contraseña', owner: 'Test Person B', due: null },
    { text: 'Reservar la revisión', owner: null, due: null },
  ],
};

function email(translated: boolean) {
  return renderRecap({
    body: translated ? BODY_ES : BODY,
    date: '2026-11-19T09:30:00Z',
    language: translated ? 'es' : 'en',
    translated,
    ownerName: 'Test Person A',
    noteUrl: 'https://app.example.com/note/33333333-3333-4333-8333-333333333333',
    settingsUrl: 'https://app.example.com/recap-emails',
    sender: SENDER,
  });
}

test('the recap email reads properly, and is photographed at phone and web width', async ({ page }) => {
  const { subject, html, text } = email(false);

  expect(subject).toBe('Recap: Team call');

  for (const size of [
    { name: 390, width: 390, height: 1100 },
    { name: 1280, width: 1280, height: 820 },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.setContent(html);

    // Everything the founder asked for is really on screen, not just in the code.
    await expect(page.getByRole('heading', { name: 'Team call', level: 1 })).toBeVisible();
    await expect(page.getByText('19 November 2026')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Key points' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Decisions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Action items' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open this note in gyan' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Turn off recaps' })).toBeVisible();
    await expect(page.getByText(/You are getting this because you are on Test Person A/)).toBeVisible();

    await page.waitForTimeout(300);
    await page.screenshot({ path: `${IMAGES}/recap-email-${size.name}.png`, fullPage: true });
  }

  // The plain version carries the same facts, for anyone whose email hides styling.
  for (const fact of ['Team call', '19 November 2026', 'KEY POINTS', 'Send the test plan', 'Turn off recaps']) {
    expect(text).toContain(fact);
  }
});

test('a translated recap says "Translated by AI" right at the top', async ({ page }) => {
  const { html } = email(true);
  await page.setViewportSize({ width: 390, height: 1160 });
  await page.setContent(html);

  await expect(page.getByText('Translated by AI')).toBeVisible();
  await expect(page.getByText('Spanish. Names, numbers and times are unchanged.')).toBeVisible();
  // The first match is the hidden one-line preview many email programs show; the visible one
  // is the overview itself.
  await expect(page.getByText(/El equipo acordó lanzar/).last()).toBeVisible();
  // The date and the people's names are untouched, which is what the label promises.
  await expect(page.getByText('19 November 2026')).toBeVisible();
  await expect(page.getByText(/Test Person A/).first()).toBeVisible();

  await page.waitForTimeout(300);
  await page.screenshot({ path: `${IMAGES}/recap-email-translated-390.png`, fullPage: true });
});

test('the button and the unsubscribe link really point at the app', async ({ page }) => {
  const { html } = email(false);
  await page.setContent(html);

  await expect(page.getByRole('link', { name: 'Open this note in gyan' })).toHaveAttribute(
    'href',
    'https://app.example.com/note/33333333-3333-4333-8333-333333333333',
  );
  await expect(page.getByRole('link', { name: 'Turn off recaps' })).toHaveAttribute(
    'href',
    'https://app.example.com/recap-emails',
  );
});
