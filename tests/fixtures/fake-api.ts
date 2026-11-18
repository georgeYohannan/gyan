/**
 * The one place that pretends to be the server for the browser scripts.
 *
 * Nothing here touches the real Supabase project, and no paid service (Deepgram, Claude, email) is
 * ever called. Every answer below is made up, with fake names only. That keeps these scripts free
 * to run, safe, and the same every time.
 *
 * The real end to end check, with the real AI, is the hand checklist in docs/testing/prompt-6.md.
 */
import type { Page, Route } from '@playwright/test';

export const FAKE_USER = { id: '11111111-1111-4111-8111-111111111111', email: 'test.a@example.com' };
export const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
export const NOTE_ID = '33333333-3333-4333-8333-333333333333';
export const FAILED_NOTE_ID = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;

export type FakeData = {
  /** Rows for the notes list and the note page. */
  notes: Row[];
  segments: Row[];
  /** null means "this note has no summary yet". */
  summary: Row | null;
  actionItems: Row[];
  usage: { used: number; limit: number };
  /** Make a server function answer with a problem, for example { summarize: 402 }. */
  functionStatus?: Record<string, number>;
  /** Make the login fail, to check the error message. */
  loginFails?: boolean;
};

export const noteRow = (over: Row = {}): Row => ({
  id: NOTE_ID,
  title: 'Weekly team call',
  source: 'upload',
  status: 'ready',
  error_message: null,
  created_at: '2026-11-17T10:00:00Z',
  spoken_language: 'en',
  duration_seconds: 184,
  ...over,
});

export const SEGMENTS: Row[] = [
  { id: 's1', speaker_label: 'Speaker 1', start_ms: 500, end_ms: 4200, text: 'Thanks for joining. Let us start with the sign up screen.' },
  { id: 's2', speaker_label: 'Speaker 2', start_ms: 4200, end_ms: 9000, text: 'It still feels slow on my phone when I tap Sign up.' },
  { id: 's3', speaker_label: 'Speaker 1', start_ms: 65000, end_ms: 71000, text: 'Priya will send the test plan on Friday, then we ship.' },
];

export const SUMMARY: Row = {
  language: 'en',
  overview:
    'The team looked at the new sign up screen. It is still slow on phones, so one more round of testing was agreed before it goes out.',
  key_points: ['Sign up is slow on phones', 'Two people tested it this week', 'The design itself was not changed'],
  decisions: ['Ship the sign up screen on Friday', 'Keep the old screen until then'],
  open_questions: ['Who writes the release note?'],
};

export const ACTION_ITEMS: Row[] = [
  { id: 'a1', text: 'Send the test plan', owner_name: 'Priya', due_text: 'Friday', start_ms: 65000, done: false },
  { id: 'a2', text: 'Check sign up on an old phone', owner_name: null, due_text: null, start_ms: 4200, done: false },
  { id: 'a3', text: 'Book the review call', owner_name: 'Sam', due_text: 'next week', start_ms: 9000, done: true },
];

export const DEFAULTS: FakeData = {
  notes: [noteRow()],
  segments: SEGMENTS,
  summary: SUMMARY,
  actionItems: ACTION_ITEMS,
  usage: { used: 2, limit: 5 },
};

/** Everything the scripts can ask about after the fact: which calls the app made. */
export type Recorder = {
  functionCalls: { name: string; body: unknown }[];
  updates: { table: string; body: unknown }[];
  uploads: string[];
};

const session = () => ({
  access_token: 'fake-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'fake-refresh-token',
  user: {
    id: FAKE_USER.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: FAKE_USER.email,
    email_confirmed_at: '2026-11-01T10:00:00Z',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    app_metadata: {},
    user_metadata: {},
    identities: [{ id: FAKE_USER.id, user_id: FAKE_USER.id, provider: 'email', identity_data: {} }],
  },
});

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Answers every Supabase call with the fake data above.
 * Returns a recorder, so a script can check what the app asked the server to do.
 */
export async function installFakes(page: Page, overrides: Partial<FakeData> = {}): Promise<Recorder> {
  const data: FakeData = { ...DEFAULTS, ...overrides };
  const recorder: Recorder = { functionCalls: [], updates: [], uploads: [] };

  // Login, logout and "who am I". No real account is used.
  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/token')) {
      if (data.loginFails) {
        return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      }
      return json(route, session());
    }
    if (url.pathname.endsWith('/user')) return json(route, session().user);
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    if (url.pathname.endsWith('/signup')) return json(route, session());
    return json(route, {});
  });

  // The server functions. Nothing is really run: the app only needs to know it was accepted.
  await page.route('**/functions/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    let body: unknown;
    try {
      body = route.request().postDataJSON();
    } catch {
      body = undefined;
    }
    recorder.functionCalls.push({ name, body });
    const status = data.functionStatus?.[name] ?? 202;
    return json(route, status === 202 ? { status: 'accepted' } : { error: 'problem' }, status);
  });

  // Sending a file. Nothing is really stored.
  await page.route('**/storage/v1/**', async (route) => {
    recorder.uploads.push(new URL(route.request().url()).pathname);
    return json(route, { Key: 'notes-files/fake' });
  });

  // Reading and writing rows.
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace(/^.*\/rest\/v1\//, '').split('?')[0];
    const wantsOne = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object+json');
    const method = request.method();

    if (method === 'PATCH') {
      let body: unknown;
      try {
        body = request.postDataJSON();
      } catch {
        body = undefined;
      }
      recorder.updates.push({ table, body });
      return route.fulfill({ status: 204, body: '' });
    }

    if (table.startsWith('rpc/')) return json(route, null);

    const noteId = url.searchParams.get('id')?.replace('eq.', '');
    const rows: Row[] = (() => {
      switch (table) {
        case 'meetings':
          return noteId ? data.notes.filter((n) => n.id === noteId) : data.notes;
        case 'transcript_segments':
          return data.segments;
        case 'summaries':
          return data.summary ? [data.summary] : [];
        case 'action_items':
          return data.actionItems;
        case 'account_members':
          return [
            {
              account_id: ACCOUNT_ID,
              accounts: { plan_id: 'plan-free', plans: { name: 'Free', meetings_per_month: data.usage.limit } },
            },
          ];
        case 'usage':
          return [{ meetings_used: data.usage.used }];
        case 'plans':
          return [{ name: 'Free', meetings_per_month: data.usage.limit }];
        default:
          return [];
      }
    })();

    // A single-row read wants the row itself, or nothing at all.
    return json(route, wantsOne ? (rows[0] ?? null) : rows);
  });

  return recorder;
}

/**
 * Opens a page in the app.
 *
 * While the app is being worked on, its builder sometimes serves a half built copy, or a saved
 * file re-loads a screen at a bad moment. Either way an error box appears instead of the app.
 * Asking for the page again clears it, so that is what this does.
 */
export async function gotoApp(page: Page, path: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(path);
    // The error box has its own Reload button. That button is how we spot it.
    const reload = page.getByRole('button', { name: 'Reload application' });
    if (!(await reload.isVisible({ timeout: 2_000 }).catch(() => false))) return;
    await reload.click().catch(() => {});
    await page.waitForTimeout(3_000);
  }
  throw new Error('The web app would not start. Stop the dev server, then run: npx expo start --web --clear');
}

/** Logs in through the real login screen, with a fake account, and gets past the consent note. */
export async function signIn(page: Page): Promise<void> {
  await gotoApp(page, '/log-in');
  await page.getByLabel('Email').fill(FAKE_USER.email);
  await page.getByLabel('Password').fill('fake-password-123');
  await page.getByRole('button', { name: 'Log in' }).click();

  // The first time anyone uses this browser, Gyan shows a short note about consent. Wait for
  // whichever comes first, that note or Home, so this works either way.
  const understand = page.getByRole('button', { name: 'I understand' });
  const home = page.getByRole('heading', { name: 'Home' });
  await understand.or(home).first().waitFor({ timeout: 60_000 });
  if (await understand.isVisible()) await understand.click();
  await home.waitFor({ timeout: 60_000 });
}

/** Opens one note page straight away (after signIn). */
export async function openNote(page: Page, id: string = NOTE_ID): Promise<void> {
  await gotoApp(page, `/note/${id}`);
}
