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

/**
 * The version of the translating rules, copied from
 * supabase/functions/translate/translate.ts. These scripts cannot import app code, because it
 * needs React Native to load. __tests__/translate-claude-test.ts reads this line and fails if it
 * ever drifts from the real one.
 */
export const PROMPT_VERSION = 2;

export const FAKE_USER = { id: '11111111-1111-4111-8111-111111111111', email: 'test.a@example.com' };
export const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
export const NOTE_ID = '33333333-3333-4333-8333-333333333333';
export const FAILED_NOTE_ID = '44444444-4444-4444-8444-444444444444';
export const TEXT_NOTE_ID = '55555555-5555-4555-8555-555555555555';
/** The made up authenticator app, so the two-factor screens have something to show. */
export const FAKE_FACTOR_ID = 'ffffffff-0000-4000-8000-00000000f1f1';
/** A made up teammate, so the Send recap dialog has more than one person in it. */
export const TEAMMATE = { id: '66666666-6666-4666-8666-666666666666', email: 'test.b@example.com' };

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
  /** The chat about this note that is already saved. Empty means nobody has asked anything. */
  chatMessages: Row[];
  /** What the chat server function answers. One per question asked, then the last one repeats. */
  chatAnswers: ChatAnswer[];
  /** true makes the chat function say the day's questions are used up. */
  chatLimitReached?: boolean;
  /** The words inside a pasted-text note, as the private bucket would hand them back. */
  textWords: string;
  /** The person's preferred language, as the profiles table would hand it back. */
  preferredLanguage: string;
  /**
   * Translations that are ALREADY saved, keyed "kind:language" (for example "summary:es").
   * A translation in here appears at once and must never make the app call the server.
   */
  savedTranslations: Record<string, unknown>;
  /** What the translate server function answers, keyed "kind:language". */
  translations: Record<string, unknown>;
  /** A plain message the translate function answers with instead of a translation. */
  translateProblem?: string;

  /** Who the Send recap dialog lists. Everybody here is "on the account". */
  recapPeople: Row[];
  /** The account's saved recap settings, as get_recap_settings would hand them back. */
  recapSettings: { to_owner: boolean; to_members: boolean; auto_send: boolean };
  /** True when the fake person already has an authenticator app set up. */
  twoFactorOn: boolean;
  /** The account's privacy and security settings, as get_account_privacy hands them back. */
  privacy: { retention_days: number | null; email_summaries: boolean; inactivity_minutes: number };
  /** What has happened on the account, as list_audit_log hands it back. Fake people only. */
  auditLog: Row[];
  /** false makes this person a team member rather than the owner, so the settings lock. */
  isOwner: boolean;
  /** A plain message the recap function answers with instead of sending. */
  recapProblem?: string;
  /** The person's own name, as the profiles table would hand it back. */
  displayName: string;
  /** The plan and usage answer, exactly as get_plan_and_usage hands it back. */
  planAndUsage: Row;
  /** The plans the test-only switch may offer. */
  switchablePlans: Row[];
  /** The team, exactly as list_team hands it back. */
  team: Row;
  /** A plain message the team server function answers with instead of inviting. */
  inviteProblem?: string;
  /** What can_delete_account answers. */
  deleteCheck: Row;
  /** A plain message the account server function answers with instead of deleting. */
  deleteProblem?: string;
  /** Make the test-only plan switch be refused, to check the message. */
  switchPlanError?: string;
  /** Make removing or promoting somebody be refused. */
  teamActionError?: string;
  /** Make joining a team be refused, to check each plain reason. */
  acceptInviteError?: string;
  /** Make deleting one note be refused. */
  deleteNoteError?: string;

  /** Make one address fail, to check that one person failing does not stop the others. */
  recapFailsFor?: string[];
  /** An error message save_recap_settings answers with, for example 'not_owner'. */
  saveSettingsError?: string;
};

/** One made up answer from the chat function. `ok: false` is a problem with a Retry. */
export type ChatAnswer =
  | { ok: true; answer: string; sources: Row[]; remaining: number }
  | { ok: false; message: string };

export const noteRow = (over: Row = {}): Row => ({
  id: NOTE_ID,
  title: 'Weekly team call',
  source: 'upload',
  status: 'ready',
  error_message: null,
  created_at: '2026-11-17T10:00:00Z',
  spoken_language: 'en',
  duration_seconds: 184,
  file_path: `${ACCOUNT_ID}/${NOTE_ID}/call.mp3`,
  ...over,
});

/** A note somebody pasted or uploaded as text. It has no transcript, only paragraphs. */
export const textNoteRow = (over: Row = {}): Row => ({
  id: TEXT_NOTE_ID,
  title: 'gyan development',
  source: 'text',
  status: 'ready',
  error_message: null,
  created_at: '2026-11-18T09:00:00Z',
  spoken_language: null,
  duration_seconds: null,
  file_path: `${ACCOUNT_ID}/${TEXT_NOTE_ID}/notes.txt`,
  ...over,
});

/** The words inside that pasted-text note. 3 paragraphs, so passage 2 is the middle one. */
export const TEXT_NOTE_WORDS = [
  'The module ingests financial documents for a family-law matter and keeps a chain of custody.',
  'Audience: forensic accountants, family-law attorneys, paralegals and firm admins.',
  'Frontend stack: React 18, TypeScript, Vite and Tailwind.',
].join('\n\n');

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

/**
 * Made up translations of the summary and the transcript above.
 * Real words in each of the 5 test languages, so the scripts and the screenshots show whether
 * every script draws properly and whether Arabic reads right to left.
 */
export const SUMMARY_TRANSLATIONS: Record<string, Row> = {
  es: {
    overview:
      'El equipo revisó la nueva pantalla de registro. Sigue siendo lenta en los teléfonos, así que se acordó otra ronda de pruebas antes de publicarla.',
    key_points: ['El registro es lento en los teléfonos', 'Dos personas lo probaron esta semana', 'El diseño no cambió'],
    decisions: ['Publicar la pantalla de registro el viernes', 'Mantener la pantalla antigua hasta entonces'],
    open_questions: ['¿Quién escribe la nota de lanzamiento?'],
    action_items: [
      { text: 'Enviar el plan de pruebas', due: 'viernes' },
      { text: 'Probar el registro en un teléfono antiguo', due: null },
      { text: 'Reservar la llamada de revisión', due: 'la próxima semana' },
    ],
  },
  fr: {
    overview:
      "L'équipe a examiné le nouvel écran d'inscription. Il est encore lent sur les téléphones, donc un dernier test a été décidé avant la mise en ligne.",
    key_points: ["L'inscription est lente sur les téléphones", "Deux personnes l'ont testée cette semaine", "Le design n'a pas changé"],
    decisions: ["Publier l'écran d'inscription vendredi", "Garder l'ancien écran jusque-là"],
    open_questions: ['Qui rédige la note de version ?'],
    action_items: [
      { text: 'Envoyer le plan de test', due: 'vendredi' },
      { text: "Tester l'inscription sur un vieux téléphone", due: null },
      { text: "Réserver l'appel de revue", due: 'la semaine prochaine' },
    ],
  },
  hi: {
    overview:
      'टीम ने नई साइन अप स्क्रीन देखी। यह फ़ोन पर अभी भी धीमी है, इसलिए इसे जारी करने से पहले एक और दौर की जाँच तय हुई।',
    key_points: ['फ़ोन पर साइन अप धीमा है', 'इस हफ़्ते दो लोगों ने इसे जाँचा', 'डिज़ाइन में कोई बदलाव नहीं हुआ'],
    decisions: ['साइन अप स्क्रीन शुक्रवार को जारी करें', 'तब तक पुरानी स्क्रीन रखें'],
    open_questions: ['रिलीज़ नोट कौन लिखेगा?'],
    action_items: [
      { text: 'जाँच की योजना भेजें', due: 'शुक्रवार' },
      { text: 'पुराने फ़ोन पर साइन अप जाँचें', due: null },
      { text: 'समीक्षा कॉल तय करें', due: 'अगले हफ़्ते' },
    ],
  },
  ar: {
    overview:
      'راجع الفريق شاشة التسجيل الجديدة. لا تزال بطيئة على الهواتف، لذلك تم الاتفاق على جولة اختبار أخرى قبل نشرها.',
    key_points: ['التسجيل بطيء على الهواتف', 'اختبرها شخصان هذا الأسبوع', 'لم يتغير التصميم نفسه'],
    decisions: ['نشر شاشة التسجيل يوم الجمعة', 'الإبقاء على الشاشة القديمة حتى ذلك الحين'],
    open_questions: ['من يكتب ملاحظة الإصدار؟'],
    action_items: [
      { text: 'إرسال خطة الاختبار', due: 'الجمعة' },
      { text: 'اختبار التسجيل على هاتف قديم', due: null },
      { text: 'تحديد موعد مكالمة المراجعة', due: 'الأسبوع القادم' },
    ],
  },
  ja: {
    overview:
      'チームは新しいサインアップ画面を確認しました。スマートフォンではまだ遅いため、公開前にもう一度テストを行うことで合意しました。',
    key_points: ['スマートフォンでのサインアップが遅い', '今週2人がテストした', 'デザイン自体は変更していない'],
    decisions: ['金曜日にサインアップ画面を公開する', 'それまでは古い画面を残す'],
    open_questions: ['リリースノートは誰が書きますか?'],
    action_items: [
      { text: 'テスト計画を送る', due: '金曜日' },
      { text: '古いスマートフォンでサインアップを確認する', due: null },
      { text: 'レビュー通話を予約する', due: '来週' },
    ],
  },
};

export const TRANSCRIPT_TRANSLATIONS: Record<string, Row> = {
  es: {
    lines: [
      'Gracias por venir. Empecemos con la pantalla de registro.',
      'Todavía me parece lenta en el teléfono cuando toco Registrarse.',
      'Priya enviará el plan de pruebas el viernes, y luego publicamos.',
    ],
  },
  ar: {
    lines: [
      'شكرا لانضمامكم. لنبدأ بشاشة التسجيل.',
      'لا تزال تبدو بطيئة على هاتفي عندما أضغط على التسجيل.',
      'سترسل بريا خطة الاختبار يوم الجمعة، ثم ننشر.',
    ],
  },
  ja: {
    lines: [
      'ご参加ありがとうございます。サインアップ画面から始めましょう。',
      'サインアップを押すと、私の端末ではまだ遅く感じます。',
      'プリヤが金曜日にテスト計画を送り、それから公開します。',
    ],
  },
  hi: {
    lines: [
      'आने के लिए धन्यवाद। साइन अप स्क्रीन से शुरू करें।',
      'जब मैं साइन अप दबाता हूँ तो मेरे फ़ोन पर यह अभी भी धीमा लगता है।',
      'प्रिया शुक्रवार को जाँच की योजना भेजेंगी, फिर हम जारी करेंगे।',
    ],
  },
  fr: {
    lines: [
      "Merci d'être venus. Commençons par l'écran d'inscription.",
      "Je le trouve encore lent sur mon téléphone quand j'appuie sur S'inscrire.",
      'Priya enverra le plan de test vendredi, puis nous publions.',
    ],
  },
};

/** Both kinds together, keyed the way the fake server looks them up. */
export const ALL_TRANSLATIONS: Record<string, unknown> = {
  ...Object.fromEntries(Object.entries(SUMMARY_TRANSLATIONS).map(([code, row]) => [`summary:${code}`, row])),
  ...Object.fromEntries(Object.entries(TRANSCRIPT_TRANSLATIONS).map(([code, row]) => [`transcript:${code}`, row])),
};

/** The passage numbers point at the SEGMENTS above: [3] is the third line, at 1:05. */
export const CHAT_SOURCES: Row[] = [{ n: 3, segment_id: 's3', start_ms: 65000, speaker_label: 'Speaker 1' }];

export const CHAT_ANSWER = 'You agreed to ship the sign up screen on Friday, and Priya will send the test plan first [3].';

export const CHAT_NOT_FOUND =
  'I could not find that in your notes. Try asking what was decided about the sign up screen.';

/** A chat that is already saved, used to check it is still there after a refresh. */
export const CHAT_MESSAGES: Row[] = [
  { id: 'cm1', role: 'user', content: 'What were the decisions?', sources: [], created_at: '2026-11-18T10:00:00Z' },
  { id: 'cm2', role: 'assistant', content: CHAT_ANSWER, sources: CHAT_SOURCES, created_at: '2026-11-18T10:00:06Z' },
];

/** Everybody on the fake account. The owner is the person who logs in. */
export const RECAP_PEOPLE: Row[] = [
  {
    user_id: FAKE_USER.id,
    email: FAKE_USER.email,
    name: 'Test Person A',
    role: 'owner',
    language: 'en',
    default_on: true,
    is_you: true,
  },
  {
    user_id: TEAMMATE.id,
    email: TEAMMATE.email,
    name: 'Test Person B',
    role: 'member',
    language: 'hi',
    default_on: false,
    is_you: false,
  },
];

/**
 * A Free plan the way get_plan_and_usage hands it back. Every number is in the answer, so the
 * scripts prove the screen reads them rather than writing its own.
 */
export const PLAN_FREE: Row = {
  account_id: ACCOUNT_ID,
  is_owner: true,
  plan_name: 'Free',
  plan_description: 'For one person getting started.',
  plan_features: [
    '{meetings_per_month} meetings a month',
    '{chat_messages_per_day} chat questions a day',
    'Transcripts with speakers, summaries and action items',
    '{seats_included} seat',
  ],
  is_test_plan: false,
  meetings_per_month: 5,
  chat_messages_per_day: 20,
  seats_included: 1,
  max_meeting_minutes: null,
  meetings_used: 2,
  chat_messages_used: 4,
  chat_messages_left: 16,
  seats_used: 1,
  members_count: 1,
  invites_pending: 0,
};

/** The stand-in Pro plan, with the bigger numbers the switch is there to show off. */
export const PLAN_PRO: Row = {
  ...PLAN_FREE,
  plan_name: 'Pro',
  plan_description: 'STAND-IN NUMBERS, for trying out the Plan screen. Not a real plan and not for sale.',
  is_test_plan: true,
  meetings_per_month: 50,
  chat_messages_per_day: 200,
  seats_included: 5,
  max_meeting_minutes: 180,
  plan_features: [
    '{meetings_per_month} meetings a month',
    '{chat_messages_per_day} chat questions a day',
    'Up to {seats_included} people on the account',
    'Notes up to {max_meeting_minutes} minutes long',
  ],
};

/** A team of three, all made up. */
export const TEAM: Row = {
  account_id: ACCOUNT_ID,
  is_owner: true,
  seats_included: 5,
  seats_used: 3,
  members: [
    { user_id: FAKE_USER.id, email: FAKE_USER.email, name: 'Sam Carter', role: 'owner', is_you: true },
    { user_id: TEAMMATE.id, email: TEAMMATE.email, name: 'Ada Blake', role: 'member', is_you: false },
  ],
  pending_invites: [
    { id: 'invite-1', email: 'test.c@example.com', created_at: '2026-11-18T09:00:00.000Z' },
  ],
};

export const DELETE_CHECK: Row = {
  account_id: ACCOUNT_ID,
  is_owner: true,
  can_delete: true,
  reason: null,
  what_goes:
    'Everything you made goes: your login, your name, all 1 of your notes, their transcripts, summaries, to-dos, chats, and the files you uploaded. This cannot be undone.',
  note_count: 1,
  other_member_count: 0,
  pending_invite_count: 0,
};

export const DEFAULTS: FakeData = {
  notes: [noteRow()],
  segments: SEGMENTS,
  summary: SUMMARY,
  actionItems: ACTION_ITEMS,
  usage: { used: 2, limit: 5 },
  chatMessages: [],
  chatAnswers: [{ ok: true, answer: CHAT_ANSWER, sources: CHAT_SOURCES, remaining: 19 }],
  textWords: TEXT_NOTE_WORDS,
  preferredLanguage: 'en',
  savedTranslations: {},
  translations: ALL_TRANSLATIONS,
  recapPeople: RECAP_PEOPLE,
  recapSettings: { to_owner: true, to_members: false, auto_send: false },
  twoFactorOn: false,
  // Keep notes for ever, summaries allowed in email, and the 30 minutes the founder chose.
  privacy: { retention_days: null, email_summaries: true, inactivity_minutes: 30 },
  // A believable few days of activity, all made up. Newest first, as the database returns it.
  auditLog: [
    {
      id: 7,
      action: 'sign_in',
      actor_user_id: FAKE_USER.id,
      actor_name: 'Sam Carter',
      target_type: null,
      meeting_id: null,
      meeting_title: null,
      detail: {},
      created_at: '2026-11-20T09:05:00Z',
    },
    {
      id: 6,
      action: 'note_share',
      actor_user_id: FAKE_USER.id,
      actor_name: 'Sam Carter',
      target_type: 'meeting',
      meeting_id: NOTE_ID,
      meeting_title: 'Weekly team call',
      detail: {},
      created_at: '2026-11-20T08:40:00Z',
    },
    {
      id: 5,
      action: 'settings_change',
      actor_user_id: FAKE_USER.id,
      actor_name: 'Sam Carter',
      target_type: 'account_privacy',
      meeting_id: null,
      meeting_title: null,
      detail: { setting: 'retention_days', from: null, to: 365 },
      created_at: '2026-11-19T16:20:00Z',
    },
    {
      id: 4,
      action: 'note_delete',
      actor_user_id: TEAMMATE.id,
      actor_name: 'Priya Raman',
      target_type: 'meeting',
      meeting_id: null,
      meeting_title: 'Pricing workshop',
      detail: {},
      created_at: '2026-11-18T11:02:00Z',
    },
    {
      id: 3,
      action: 'two_factor_on',
      actor_user_id: TEAMMATE.id,
      actor_name: 'Priya Raman',
      target_type: null,
      meeting_id: null,
      meeting_title: null,
      detail: {},
      created_at: '2026-11-17T14:30:00Z',
    },
  ],
  isOwner: true,
  displayName: 'Sam Carter',
  planAndUsage: PLAN_FREE,
  switchablePlans: [
    { name: 'Free', is_test: false, is_active: true, meetings_per_month: 5 },
    { name: 'Pro', is_test: true, is_active: true, meetings_per_month: 50 },
    { name: 'Team', is_test: true, is_active: true, meetings_per_month: 200 },
  ],
  team: TEAM,
  deleteCheck: DELETE_CHECK,
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
    if (url.pathname.endsWith('/user')) {
      // listFactors() reads the factors off the person, so once an authenticator app is
      // set up it has to come back here too, exactly as the real server does it.
      const factors = data.twoFactorOn
        ? [
            {
              id: FAKE_FACTOR_ID,
              friendly_name: 'Authenticator app',
              factor_type: 'totp',
              status: 'verified',
              created_at: '2026-11-21T10:00:00Z',
              updated_at: '2026-11-21T10:00:00Z',
            },
          ]
        : [];
      return json(route, { ...session().user, factors });
    }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    if (url.pathname.endsWith('/signup')) return json(route, session());

    // --- two-factor sign in (prompt 11). Nothing real, and no real secret. ---------------
    if (url.pathname.endsWith('/factors')) {
      // Adding an authenticator app. The picture is a tiny square so a screenshot has
      // something to show; the secret is obviously made up.
      const qr =
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 8 8">' +
        '<rect width="8" height="8" fill="#fff"/>' +
        '<path fill="#000" d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM7 5h1v1H7zM4 6h1v1H4zM6 6h1v1H6z"/>' +
        '</svg>';
      return json(route, {
        id: FAKE_FACTOR_ID,
        type: 'totp',
        friendly_name: 'Authenticator app',
        totp: { qr_code: qr, secret: 'FAKESECRETFORTESTSONLY', uri: 'otpauth://totp/gyan' },
      });
    }
    if (url.pathname.includes('/factors/') && url.pathname.endsWith('/challenge')) {
      return json(route, { id: 'fake-challenge-id', expires_at: 9999999999 });
    }
    if (url.pathname.includes('/factors/') && url.pathname.endsWith('/verify')) {
      const asked = (() => {
        try {
          return route.request().postDataJSON() as { code?: string };
        } catch {
          return {};
        }
      })();
      // Only one code works, so a test can check both a right and a wrong one.
      if (asked.code !== '123456') {
        return json(route, { error: 'invalid_code', msg: 'Invalid TOTP code entered' }, 400);
      }
      data.twoFactorOn = true;
      return json(route, session());
    }
    if (url.pathname.endsWith('/aal')) {
      return json(route, { currentLevel: 'aal1', nextLevel: data.twoFactorOn ? 'aal2' : 'aal1' });
    }
    return json(route, {});
  });

  // The server functions. Nothing is really run, and the real AI is never called.
  let questionsAsked = 0;
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

    // The chat function answers with a made up answer, so the panel has something to show.
    if (name === 'chat') {
      if (status !== 202) return json(route, { error: 'problem' }, status);
      if (data.chatLimitReached) return json(route, { error: 'limit_reached' }, 402);
      const answers = data.chatAnswers;
      const picked = answers[Math.min(questionsAsked, answers.length - 1)] ?? answers[0];
      questionsAsked += 1;
      if (picked.ok) {
        return json(route, {
          ok: true,
          answer: picked.answer,
          sources: picked.sources,
          remaining: picked.remaining,
          message_id: `q${questionsAsked}`,
        });
      }
      return json(route, { ok: false, message: picked.message, message_id: `q${questionsAsked}`, remaining: 18 });
    }

    // The team function sends the invite email. NOTHING IS REALLY SENT: it answers as if it had,
    // so a script can walk the whole invite flow without an email ever leaving the machine.
    if (name === 'team') {
      if (status !== 202) return json(route, { error: 'problem' }, status);
      if (data.inviteProblem) return json(route, { ok: false, message: data.inviteProblem });
      const asked = body as { email?: string } | undefined;
      const email = asked?.email ?? '';
      // Remember the invite, so the Team screen shows it waiting, holding a seat.
      data.team = {
        ...data.team,
        pending_invites: [
          { id: `invite-${(data.team.pending_invites as Row[]).length + 1}`, email, created_at: '2026-11-19T09:00:00.000Z' },
          ...(data.team.pending_invites as Row[]),
        ],
        seats_used: (data.team.seats_used as number) + 1,
      };
      return json(route, {
        ok: true,
        email,
        seats_included: data.team.seats_included,
        seats_used: data.team.seats_used,
      });
    }

    // The account function deletes everything. Again, nothing really happens.
    if (name === 'account') {
      if (status !== 202) return json(route, { error: 'problem' }, status);
      if (data.deleteProblem) return json(route, { ok: false, message: data.deleteProblem });
      return json(route, { ok: true, workspaces_deleted: 1, files_removed: 1 });
    }

    // The translate function answers with a made up translation, so the page has something to show.
    if (name === 'translate') {
      if (status !== 202) return json(route, { error: 'problem' }, status);
      if (data.translateProblem) return json(route, { ok: false, message: data.translateProblem });
      const asked = body as { kind?: string; language?: string } | undefined;
      const content = data.translations[`${asked?.kind}:${asked?.language}`];
      if (!content) {
        return json(route, { ok: false, message: 'Gyan could not translate this note just now. Please try again.' });
      }
      return json(route, { ok: true, kind: asked?.kind, language: asked?.language, content, reused: false });
    }

    // The recap function. NO EMAIL IS EVER SENT: this only answers as if one had been.
    if (name === 'recap') {
      if (status !== 202) return json(route, { error: 'problem' }, status);
      const asked = body as { preview?: boolean; recipient_user_ids?: string[] } | undefined;

      // A preview lists everybody on the account and which of them the settings pick.
      if (asked?.preview === true) {
        return json(route, {
          ok: true,
          recipients: data.recapPeople,
          settings: data.recapSettings,
          noteTitle: 'Team call',
          can_send: true,
        });
      }

      if (data.recapProblem) return json(route, { ok: false, message: data.recapProblem });

      // Only ids that are really on the account count, the same rule the real server follows.
      const picked = (asked?.recipient_user_ids ?? []).filter((id) =>
        data.recapPeople.some((person) => person.user_id === id),
      );
      const failing = data.recapFailsFor ?? [];
      const outcomes = picked.map((id) => {
        const person = data.recapPeople.find((p) => p.user_id === id)!;
        const translated = person.language !== 'en';
        return {
          email: person.email as string,
          name: person.name as string,
          language: translated ? 'Hindi' : 'English',
          translated,
          ok: !failing.includes(person.email as string),
        };
      });
      return json(route, {
        ok: true,
        sent: outcomes.filter((o) => o.ok).length,
        failed: outcomes.filter((o) => !o.ok).length,
        outcomes,
      });
    }

    return json(route, status === 202 ? { status: 'accepted' } : { error: 'problem' }, status);
  });

  // Files. Nothing is really stored, and nothing real is ever downloaded.
  await page.route('**/storage/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    // Reading a pasted-text note's words back out of the bucket.
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: data.textWords });
    }
    recorder.uploads.push(path);
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

    if (table.startsWith('rpc/')) {
      const fn = table.replace('rpc/', '');
      let body: unknown;
      try {
        body = request.postDataJSON();
      } catch {
        body = undefined;
      }

      if (fn === 'get_recap_settings') {
        const row = { account_id: ACCOUNT_ID, is_owner: data.isOwner, settings: data.recapSettings };
        return json(route, wantsOne ? row : [row]);
      }

      if (fn === 'save_recap_settings') {
        recorder.updates.push({ table: fn, body });
        if (data.saveSettingsError) {
          return json(route, { message: data.saveSettingsError, code: 'P0001' }, 400);
        }
        const asked = (body as { p_settings?: Record<string, unknown> } | undefined)?.p_settings ?? {};
        // Remember it, so the page shows what was saved when it is read again.
        data.recapSettings = {
          to_owner: asked.to_owner === true,
          to_members: asked.to_members === true,
          auto_send: asked.auto_send === true,
        };
        return json(route, data.recapSettings);
      }

      // --- the Security page (prompt 11) --------------------------------------
      if (fn === 'get_account_privacy') {
        const row = {
          account_id: ACCOUNT_ID,
          retention_days: data.privacy.retention_days,
          email_summaries: data.privacy.email_summaries,
          inactivity_minutes: data.privacy.inactivity_minutes,
          is_owner: data.isOwner,
        };
        return json(route, wantsOne ? row : [row]);
      }

      if (fn === 'save_account_privacy') {
        recorder.updates.push({ table: fn, body });
        const asked = (body as { p_settings?: Record<string, unknown> } | undefined)?.p_settings ?? {};
        if (!data.isOwner) return json(route, { message: 'not_owner', code: 'P0001' }, 400);
        // A NEW object, never a change to the one already there. The defaults are shared
        // between every script in this file, so changing that object in place would leak
        // one test's settings into the next -- which it did, once.
        data.privacy = {
          retention_days:
            'retention_days' in asked ? (asked.retention_days as number | null) : data.privacy.retention_days,
          email_summaries:
            'email_summaries' in asked ? (asked.email_summaries as boolean) : data.privacy.email_summaries,
          inactivity_minutes:
            'inactivity_minutes' in asked
              ? (asked.inactivity_minutes as number)
              : data.privacy.inactivity_minutes,
        };
        return json(route, wantsOne ? data.privacy : [data.privacy]);
      }

      if (fn === 'list_audit_log') {
        if (!data.isOwner) return json(route, { message: 'not_owner', code: 'P0001' }, 400);
        return json(route, data.auditLog);
      }

      if (fn === 'record_my_action' || fn === 'record_consent') {
        recorder.functionCalls.push({ name: fn, body });
        return json(route, null);
      }

      if (fn === 'get_plan_and_usage') {
        return json(route, wantsOne ? data.planAndUsage : [data.planAndUsage]);
      }

      if (fn === 'set_test_plan') {
        recorder.updates.push({ table: fn, body });
        const asked = (body as { p_plan_name?: string } | undefined)?.p_plan_name ?? 'Free';
        if (data.switchPlanError) {
          return json(route, { message: data.switchPlanError, code: 'P0001' }, 400);
        }
        // Remember it, so the numbers on the screen really follow the plan.
        data.planAndUsage = asked === 'Free' ? PLAN_FREE : { ...PLAN_PRO, plan_name: asked };
        const row = { plan_name: asked, is_test_plan: asked !== 'Free', seats_included: data.planAndUsage.seats_included };
        return json(route, wantsOne ? row : [row]);
      }

      if (fn === 'list_team') {
        return json(route, wantsOne ? data.team : [data.team]);
      }

      if (fn === 'revoke_invite') {
        recorder.updates.push({ table: fn, body });
        const id = (body as { p_invite_id?: string } | undefined)?.p_invite_id;
        const invites = (data.team.pending_invites as Row[]).filter((i) => i.id !== id);
        data.team = { ...data.team, pending_invites: invites, seats_used: (data.team.seats_used as number) - 1 };
        return json(route, null);
      }

      if (fn === 'remove_member') {
        recorder.updates.push({ table: fn, body });
        if (data.teamActionError) return json(route, { message: data.teamActionError, code: 'P0001' }, 400);
        const id = (body as { p_user_id?: string } | undefined)?.p_user_id;
        const members = (data.team.members as Row[]).filter((m) => m.user_id !== id);
        data.team = { ...data.team, members, seats_used: (data.team.seats_used as number) - 1 };
        return json(route, [{ new_account_id: 'new-account' }]);
      }

      if (fn === 'change_member_role') {
        recorder.updates.push({ table: fn, body });
        if (data.teamActionError) return json(route, { message: data.teamActionError, code: 'P0001' }, 400);
        const id = (body as { p_user_id?: string } | undefined)?.p_user_id;
        // Handing over swaps the two roles, exactly as the database does.
        const members = (data.team.members as Row[]).map((m) => ({
          ...m,
          role: m.user_id === id ? 'owner' : 'member',
        }));
        data.team = { ...data.team, members, is_owner: false };
        return json(route, [{ owner_user_id: id }]);
      }

      if (fn === 'accept_invite') {
        recorder.updates.push({ table: fn, body });
        if (data.acceptInviteError) return json(route, { message: data.acceptInviteError, code: 'P0001' }, 400);
        const row = { joined_account: ACCOUNT_ID, owner_name: 'Sam Carter' };
        return json(route, wantsOne ? row : [row]);
      }

      if (fn === 'delete_note') {
        recorder.updates.push({ table: fn, body });
        if (data.deleteNoteError) return json(route, { message: data.deleteNoteError, code: 'P0001' }, 400);
        const id = (body as { p_meeting_id?: string } | undefined)?.p_meeting_id;
        data.notes = data.notes.filter((n) => n.id !== id);
        return json(route, `${ACCOUNT_ID}/${id}/recording.mp3`);
      }

      if (fn === 'can_delete_account') {
        return json(route, wantsOne ? data.deleteCheck : [data.deleteCheck]);
      }

      return json(route, null);
    }

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
        case 'chat_threads':
          // No saved chat means no thread yet, which is how the app knows the chat is empty.
          return data.chatMessages.length > 0 ? [{ id: 'thread-1' }] : [];
        case 'chat_messages':
          return data.chatMessages;
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
          // The Plan screen asks for every active plan, to fill the test-only switch.
          return url.searchParams.has('is_active')
            ? data.switchablePlans
            : [{ name: 'Free', meetings_per_month: data.usage.limit }];
        case 'profiles':
          return [{ preferred_language: data.preferredLanguage, display_name: data.displayName }];
        case 'translations': {
          // Only a translation that is ALREADY saved is handed back here. Anything else is a miss,
          // so the app has to ask the server function for it, exactly as it would for real.
          const kind = url.searchParams.get('kind')?.replace('eq.', '');
          const language = url.searchParams.get('language')?.replace('eq.', '');
          const saved = data.savedTranslations[`${kind}:${language}`];
          return saved ? [{ content: JSON.stringify(saved) }] : [];
        }
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
