import os from 'os';
import path from 'path';

import { defineConfig, devices } from '@playwright/test';

/**
 * Browser scripts that click through the web app like a person does.
 *
 * They never touch the real Supabase project and never call a paid service: tests/fixtures/fake-api.ts
 * answers every call with fake data. So these scripts cost nothing and are safe to run any time.
 * Run them with:  npm run e2e
 * The real end to end check (with real AI) is the hand checklist in docs/testing/prompt-6.md.
 */
/**
 * The port the scripts run the web app on.
 * 8081 is Expo's usual one. Set GYAN_E2E_PORT to something else to run the scripts while your
 * own `npx expo start` is already using 8081.
 */
const PORT = Number(process.env.GYAN_E2E_PORT ?? 8081);

export default defineConfig({
  testDir: './tests',
  // Metro builds the web app on the first page load, which is slow the first time.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Keep traces and screenshots OUTSIDE the project. The app's builder (Metro) watches this
  // folder, and files appearing in it mid-run make it rebuild, which breaks the open pages.
  outputDir: path.join(os.tmpdir(), 'gyan-playwright'),
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    colorScheme: 'dark',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // --clear wipes Metro's cache first. Without it, a bundle left over from before new files
    // were added gives a "Requiring unknown module" error (see docs/testing/prompt-4.md).
    // The settings are written into the command itself rather than passed alongside it,
    // because that is the one way there is no doubt they reached the bundler: Metro writes
    // every EXPO_PUBLIC_ value into the bundle as it builds, from its own environment.
    command:
      `EXPO_NO_DOTENV=1 ` +
      `EXPO_PUBLIC_SUPABASE_URL=https://fake.supabase.co ` +
      `EXPO_PUBLIC_SUPABASE_KEY=fake-key-for-the-browser-scripts ` +
      `EXPO_PUBLIC_GYAN_TEST_TOOLS=0 ` +
      `npx expo start --web --port ${PORT} --clear`,
    url: `http://localhost:${PORT}`,
    // NOT reused. A server that is already running was started with somebody's own
    // settings and possibly an older bundle, and these scripts are supposed to be testing a
    // normal build with known settings. Set GYAN_E2E_PORT to run while a dev server is up.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
