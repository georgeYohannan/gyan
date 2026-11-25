/**
 * Preferred language and translation: what prompt 8 added.
 * The AI is never called here: tests/fixtures/fake-api.ts answers with made up translations.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  installFakes,
  noteRow,
  openNote,
  PROMPT_VERSION,
  signIn,
  SUMMARY_TRANSLATIONS,
  TEXT_NOTE_ID,
  textNoteRow,
  TRANSCRIPT_TRANSLATIONS,
} from './fixtures/fake-api';

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

/** Opens a note and opens the Translate list on the tab that is showing. */
async function openTranslate(page: Page, tab: 'summary' | 'transcript' = 'summary') {
  await openNote(page);
  if (tab === 'transcript') await page.getByRole('tab', { name: 'Transcript' }).click();
  await openMore(page);
  await page.getByTestId('note-translate').click();
  await expect(page.getByRole('heading', { name: `Translate this ${tab}` })).toBeVisible();
}

test('Settings is where you set your language, and it is remembered after a refresh', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);

  // Settings > Profile is where a person looks for their own settings (it moved here in
  // prompt 10; the note page keeps the picker as a shortcut).
  await page.getByTestId('nav-settings').click();
  await page.getByRole('link', { name: /^Profile\./ }).click();
  await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
  await expect(page.getByText('English', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Gyan writes your summaries, your to-dos and its chat answers in this language.').first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('radio', { name: 'Spanish, Español' }).click();

  const saved = recorder.updates.filter((u) => u.table === 'profiles');
  expect(saved).toHaveLength(1);
  expect(saved[0].body).toEqual({ preferred_language: 'es' });

  // Now the server remembers it, so a refresh still shows Spanish.
  await installFakes(page, { preferredLanguage: 'es' });
  await page.reload();
  await expect(page.getByText('Spanish', { exact: true }).first()).toBeVisible();
});

test('a saved translation made by OLDER rules is not shown, so a rule change reaches you', async ({ page }) => {
  // The words below have no version in them, which is what a translation saved before the rules
  // were tightened looks like. The app must ask the server for a fresh one instead of showing it.
  const recorder = await installFakes(page, {
    savedTranslations: { 'summary:es': SUMMARY_TRANSLATIONS.es },
  });
  await signIn(page);
  await openTranslate(page);
  await page.getByRole('radio', { name: 'Spanish, Español' }).click();

  await expect(page.getByText('Translated by AI')).toBeVisible();
  expect(recorder.functionCalls.filter((c) => c.name === 'translate')).toHaveLength(1);
});

test('the More menu shows which language you are on', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openNote(page);
  await openMore(page);

  await expect(page.getByRole('button', { name: 'Your language: English' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Translate this summary' })).toBeEnabled();
});

test('picking your language saves it, and it is still there after a refresh', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openNote(page);

  await openMore(page);
  await page.getByTestId('note-language').click();
  await expect(page.getByText('Gyan writes your summaries, your to-dos and its chat answers in this language.')).toBeVisible();
  await page.getByRole('radio', { name: 'Spanish, Español' }).click();

  // The menu says the new language at once, and the choice is sent to the profiles table.
  await openMore(page);
  await expect(page.getByRole('button', { name: 'Your language: Spanish' })).toBeVisible();
  await page.getByTestId('note-more-backdrop').click();
  const saved = recorder.updates.filter((u) => u.table === 'profiles');
  expect(saved).toHaveLength(1);
  expect(saved[0].body).toEqual({ preferred_language: 'es' });

  // Now the server remembers it, so a refresh still shows Spanish.
  await installFakes(page, { preferredLanguage: 'es' });
  await page.reload();
  await openMore(page);
  await expect(page.getByRole('button', { name: 'Your language: Spanish' })).toBeVisible();
});

test('the language list shows every language in its own letters', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openNote(page);

  await openMore(page);
  await page.getByTestId('note-language').click();
  for (const name of ['Español', 'हिन्दी', 'العربية', '日本語', 'Français']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
});

test('a translated summary shows the label and the translated words', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openTranslate(page);

  await page.getByRole('radio', { name: 'Spanish, Español' }).click();

  await expect(page.getByText('Translated by AI')).toBeVisible();
  await expect(page.getByText(String(SUMMARY_TRANSLATIONS.es.overview))).toBeVisible();
  await expect(page.getByText('Publicar la pantalla de registro el viernes')).toBeVisible();
  // The to-dos are translated too.
  await expect(page.getByText('Enviar el plan de pruebas')).toBeVisible();
  // The English is gone while the Spanish is on screen.
  await expect(page.getByText('Ship the sign up screen on Friday')).toBeHidden();

  const calls = recorder.functionCalls.filter((c) => c.name === 'translate');
  expect(calls).toHaveLength(1);
  expect(calls[0].body).toEqual({ meeting_id: noteRow().id, kind: 'summary', language: 'es' });
});

test('Show original brings the English back, and you can go back to the translation', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTranslate(page);
  await page.getByRole('radio', { name: 'Spanish, Español' }).click();
  await expect(page.getByText('Translated by AI')).toBeVisible();

  await page.getByRole('button', { name: 'Show original' }).click();
  await expect(page.getByText('Ship the sign up screen on Friday')).toBeVisible();
  await expect(page.getByText('Publicar la pantalla de registro el viernes')).toBeHidden();
  await expect(page.getByText('Your Spanish translation is saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Show translation' }).click();
  await expect(page.getByText('Publicar la pantalla de registro el viernes')).toBeVisible();
  await expect(page.getByText('Translated by AI')).toBeVisible();
});

test('PAID ONCE: a translation that is already saved never calls the server', async ({ page }) => {
  const recorder = await installFakes(page, {
    // Saved by the rules we use today, so it is used as it is.
    savedTranslations: { 'summary:es': { v: PROMPT_VERSION, ...SUMMARY_TRANSLATIONS.es } },
  });
  await signIn(page);
  await openTranslate(page);

  await page.getByRole('radio', { name: 'Spanish, Español' }).click();

  await expect(page.getByText('Translated by AI')).toBeVisible();
  await expect(page.getByText('Publicar la pantalla de registro el viernes')).toBeVisible();
  expect(recorder.functionCalls.filter((c) => c.name === 'translate')).toHaveLength(0);
});

test('ALREADY IN THAT LANGUAGE: picking English says so and costs nothing', async ({ page }) => {
  const recorder = await installFakes(page);
  await signIn(page);
  await openTranslate(page);

  await page.getByRole('radio', { name: 'English, English' }).click();

  await expect(page.getByText('This note is already in that language, so there is nothing to translate.')).toBeVisible();
  await expect(page.getByText(/Translated by AI/)).toBeHidden();
  expect(recorder.functionCalls.filter((c) => c.name === 'translate')).toHaveLength(0);
});

test('a translated transcript keeps every speaker and every time', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTranslate(page, 'transcript');

  await page.getByRole('radio', { name: 'Arabic, العربية' }).click();

  await expect(page.getByText('Translated by AI')).toBeVisible();
  await expect(page.getByText(String((TRANSCRIPT_TRANSLATIONS.ar as { lines: string[] }).lines[0]))).toBeVisible();
  // The speaker names and the times are not words to translate, so they do not change.
  await expect(page.getByText('Speaker 1').first()).toBeVisible();
  await expect(page.getByText('1:05')).toBeVisible();
  await expect(page.getByText('Thanks for joining. Let us start with the sign up screen.')).toBeHidden();
});

test('ARABIC reads right to left on screen', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTranslate(page, 'transcript');
  await page.getByRole('radio', { name: 'Arabic, العربية' }).click();

  const line = page.getByText(String((TRANSCRIPT_TRANSLATIONS.ar as { lines: string[] }).lines[0]));
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute('dir', 'rtl');
  // It also sits on the right-hand side of its panel.
  await expect(line).toHaveCSS('text-align', 'right');
});

test('a Latin language still reads left to right', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTranslate(page, 'transcript');
  await page.getByRole('radio', { name: 'Spanish, Español' }).click();

  const line = page.getByText(String((TRANSCRIPT_TRANSLATIONS.es as { lines: string[] }).lines[0]));
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute('dir', 'ltr');
  await expect(line).toHaveCSS('text-align', 'left');
});

for (const [code, name] of [
  ['es', 'Spanish'],
  ['hi', 'Hindi'],
  ['fr', 'French'],
  ['ar', 'Arabic'],
  ['ja', 'Japanese'],
] as const) {
  test(`the summary translates into ${name} and the words really appear`, async ({ page }) => {
    await installFakes(page);
    await signIn(page);
    await openTranslate(page);

    await page.getByRole('radio', { name: new RegExp(`^${name}, `) }).click();

    await expect(page.getByText('Translated by AI')).toBeVisible();
    await expect(page.getByText(String(SUMMARY_TRANSLATIONS[code].overview))).toBeVisible();
    // Every to-do came back, so nothing lined up against the wrong tick box.
    const items = (SUMMARY_TRANSLATIONS[code].action_items as { text: string }[]) ?? [];
    for (const item of items) await expect(page.getByText(item.text)).toBeVisible();
  });
}

test('a pasted-text note translates paragraph by paragraph', async ({ page }) => {
  await installFakes(page, {
    notes: [textNoteRow()],
    segments: [],
    translations: { 'transcript:es': { lines: ['Primer párrafo.', 'Segundo párrafo.', 'Tercer párrafo.'] } },
  });
  await signIn(page);
  await openNote(page, TEXT_NOTE_ID);
  await page.getByRole('tab', { name: 'Transcript' }).click();
  await openMore(page);
  await page.getByTestId('note-translate').click();
  await page.getByRole('radio', { name: 'Spanish, Español' }).click();

  await expect(page.getByText('Translated by AI')).toBeVisible();
  await expect(page.getByText('Paragraph 1')).toBeVisible();
  await expect(page.getByText('Primer párrafo.')).toBeVisible();
  await expect(page.getByText('Tercer párrafo.')).toBeVisible();
});

test('a problem shows a plain sentence, and the note is still readable', async ({ page }) => {
  await installFakes(page, {
    translateProblem: 'Gyan could not reach its translating service right now. Please try again in a little while.',
  });
  await signIn(page);
  await openTranslate(page);

  await page.getByRole('radio', { name: 'Japanese, 日本語' }).click();

  await expect(page.getByText(/could not reach its translating service/)).toBeVisible();
  await expect(page.getByText('Ship the sign up screen on Friday')).toBeVisible();
  await page.getByRole('button', { name: 'Hide' }).click();
  await expect(page.getByText(/could not reach its translating service/)).toBeHidden();
});

test('a note with no summary cannot be translated yet, and says so', async ({ page }) => {
  await installFakes(page, { notes: [noteRow({ status: 'queued' })], summary: null, segments: [] });
  await signIn(page);
  await openNote(page);
  await openMore(page);

  await expect(page.getByRole('button', { name: 'Translate this summary' })).toBeDisabled();
  await expect(page.getByText('There is nothing to translate yet.')).toBeVisible();
});

test('each tab keeps its own translation', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTranslate(page);
  await page.getByRole('radio', { name: 'Spanish, Español' }).click();
  await expect(page.getByText('Translated by AI')).toBeVisible();

  // The Transcript tab has not been translated, so it has no label and still shows English.
  await page.getByRole('tab', { name: 'Transcript' }).click();
  await expect(page.getByText(/Translated by AI/)).toBeHidden();
  await expect(page.getByText('Thanks for joining. Let us start with the sign up screen.')).toBeVisible();

  // Back on the Summary tab, the Spanish is still there.
  await page.getByRole('tab', { name: 'Summary' }).click();
  await expect(page.getByText('Translated by AI')).toBeVisible();
});

test('ON A PHONE: the language list slides up and still works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakes(page);
  await signIn(page);
  await openTranslate(page);

  await page.getByRole('radio', { name: 'Hindi, हिन्दी' }).click();
  await expect(page.getByText('Translated by AI')).toBeVisible();
  await expect(page.getByText(String(SUMMARY_TRANSLATIONS.hi.overview))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show original' })).toBeVisible();
});

test('the help entry for translation opens from the language list', async ({ page }) => {
  await installFakes(page);
  await signIn(page);
  await openTranslate(page);

  await page.getByRole('button', { name: 'Help' }).last().click();
  await expect(page.getByRole('heading', { name: 'Languages and translating' })).toBeVisible();
  await expect(page.getByText(/Translated by AI/).first()).toBeVisible();
});
