/**
 * The login screens and the help panel (what prompts 2 and 3 added).
 * A fake account is used. No real account and no real Supabase project are touched.
 */
import { expect, test } from '@playwright/test';

import { FAKE_USER, gotoApp, installFakes, signIn } from './fixtures/fake-api';

test('the login screen asks for an email and a password', async ({ page }) => {
  await installFakes(page);
  await gotoApp(page, '/log-in');

  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});

test('an email that is not an email is caught before anything is sent', async ({ page }) => {
  await installFakes(page);
  await gotoApp(page, '/log-in');

  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password').fill('fake-password-123');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByText('Enter your email, like name@example.com.')).toBeVisible();
});

test('a wrong password shows a plain message, not a code', async ({ page }) => {
  await installFakes(page, { loginFails: true });
  await gotoApp(page, '/log-in');

  await page.getByLabel('Email').fill(FAKE_USER.email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();

  const message = page.getByRole('alert').first();
  await expect(message).toBeVisible();
  await expect(message).not.toContainText('invalid_grant');
});

test('a good login lands on Home', async ({ page }) => {
  await installFakes(page);
  await signIn(page);

  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New note' })).toBeVisible();
});

test('the help panel opens and closes', async ({ page }) => {
  await installFakes(page);
  await signIn(page);

  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Close' })).toBeHidden();
});

test('a new person can get to the sign up screen', async ({ page }) => {
  await installFakes(page);
  await gotoApp(page, '/log-in');

  await page.getByRole('link', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByText('5 meetings a month')).toBeVisible();
});
