/**
 * Sending a recap, with a fake database and a fake email service.
 *
 * NOTHING HERE SENDS A REAL EMAIL. `send` is handed in, and the fake below only writes down what
 * it was asked to send. No key, no network, no cost. Every address is made up.
 */
import { MESSAGES, type Sender } from '../supabase/functions/recap/email';
import {
  chooseRecipients,
  claimRecap,
  originalBody,
  previewRecap,
  PROMPT_VERSION,
  RecapNotAllowedError,
  RecapSkippedError,
  runRecap,
  translatedBody,
  type AdminLike,
  type Claim,
  type OutgoingEmail,
  type Recipient,
} from '../supabase/functions/recap/pipeline';

const FAKE_SENDER: Sender = { name: 'gyan', email: 'recaps@example.test', replyTo: 'hello@example.test' };

const OWNER: Recipient = {
  user_id: '11111111-1111-1111-1111-111111111111',
  email: 'owner@example.test',
  name: 'Sam Carter',
  role: 'owner',
  language: 'en',
  default_on: true,
};
const MEMBER: Recipient = {
  user_id: '22222222-2222-2222-2222-222222222222',
  email: 'priya@example.test',
  name: 'Priya Shah',
  role: 'member',
  language: 'hi',
  default_on: false,
};
const OUTSIDER_ID = '99999999-9999-9999-9999-999999999999';

const CLAIM: Claim = {
  account_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  owner_id: OWNER.user_id,
  owner_name: 'Sam Carter',
  note_title: 'Monday planning call',
  note_date: '2026-11-19T09:30:00Z',
  summary_id: 'ssssssss-ssss-ssss-ssss-ssssssssssss',
  summary_language: 'en',
  overview: 'The team agreed to ship the new sign up screen on Friday.',
  key_points: ['Sign up is slow on phones'],
  decisions: ['Ship on Friday'],
  open_questions: ['Who writes the release note?'],
  action_items: [{ text: 'Send the test plan', owner: 'Priya Shah', due: 'Friday' }],
  settings: { to_owner: true, to_members: false, auto_send: false },
  recipients: [OWNER, MEMBER],
};

const HINDI_WORDS = {
  overview: 'टीम शुक्रवार को नई साइन अप स्क्रीन भेजने पर सहमत हुई।',
  key_points: ['फ़ोन पर साइन अप धीमा है'],
  decisions: ['शुक्रवार को भेजें'],
  open_questions: ['रिलीज़ नोट कौन लिखेगा?'],
  action_items: [{ text: 'परीक्षण योजना भेजें', due: 'शुक्रवार' }],
};

/**
 * The two shapes the SAME translation comes in, which is not a detail: getting them mixed up
 * threw away every translation the moment it was bought.
 *
 * In the database, words are stamped with the version of the translating rules that made them.
 * Handed straight back by the translate function, they carry no stamp at all.
 */
const HINDI_SAVED = { v: PROMPT_VERSION, ...HINDI_WORDS };
const HINDI_FRESH = { ...HINDI_WORDS };

type Rig = {
  admin: AdminLike;
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  sentTo: OutgoingEmail[];
  translationsAsked: { language: string; asUserId: string }[];
};

/**
 * A fake database and a fake email service.
 * `saved` is what is already in the translations table. `claim` is what claim_recap answers.
 */
function rig(options: {
  claim?: Partial<Claim>;
  claimError?: string;
  saved?: Record<string, unknown>;
  sendFails?: string[];
  translation?: unknown;
} = {}): Rig {
  const claim = { ...CLAIM, ...options.claim };
  const saved = options.saved ?? {};
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const sentTo: OutgoingEmail[] = [];
  const translationsAsked: { language: string; asUserId: string }[] = [];

  const admin: AdminLike = {
    rpc(name, args) {
      rpcCalls.push({ name, args });
      const result = { data: null, error: null as { message: string } | null };
      if (name === 'claim_recap' && options.claimError) {
        result.error = { message: options.claimError };
      }
      return {
        then: (resolve: (v: unknown) => void) => resolve(result),
        single: <T,>() =>
          ({
            then: (resolve: (v: { data: T | null; error: { message: string } | null }) => void) =>
              resolve(
                options.claimError
                  ? { data: null, error: { message: options.claimError } }
                  : { data: claim as unknown as T, error: null },
              ),
          }) as PromiseLike<{ data: T | null; error: { message: string } | null }>,
      } as ReturnType<AdminLike['rpc']>;
    },
    from() {
      const filters: string[] = [];
      const chain = {
        eq(_column: string, value: string) {
          filters.push(value);
          return chain;
        },
        maybeSingle: () => {
          const language = filters[filters.length - 1];
          const content = saved[language];
          return Promise.resolve({ data: content ? { content } : null, error: null });
        },
      };
      return { select: () => chain } as unknown as ReturnType<AdminLike['from']>;
    },
  };

  return { admin, rpcCalls, sentTo, translationsAsked };
}

function send(r: Rig, failFor: string[] = []) {
  return async function (message: OutgoingEmail): Promise<string> {
    if (failFor.includes(message.to)) throw new Error('that address bounced');
    r.sentTo.push(message);
    return `fake-id-${r.sentTo.length}`;
  };
}

function translate(r: Rig, content: unknown) {
  return async function (language: string, asUserId: string): Promise<unknown | null> {
    r.translationsAsked.push({ language, asUserId });
    return content;
  };
}

function run(r: Rig, over: Record<string, unknown> = {}) {
  return runRecap({
    admin: r.admin,
    meetingId: 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm',
    userId: OWNER.user_id,
    auto: false,
    appUrl: 'https://app.example.test',
    sender: FAKE_SENDER,
    maxRecipients: 50,
    maxTranslations: 5,
    send: send(r),
    ...over,
  });
}

const logs = (r: Rig) => r.rpcCalls.filter((c) => c.name === 'log_email');

describe('who may send a recap at all', () => {
  test('somebody who is not on the account is refused', async () => {
    const r = rig({ claimError: 'not_allowed' });
    await expect(claimRecap({ admin: r.admin, meetingId: 'm', userId: 'x', auto: false })).rejects.toThrow(
      RecapNotAllowedError,
    );
  });

  test('a note that is not finished has nothing to send', async () => {
    const r = rig({ claimError: 'not_ready' });
    await expect(run(r)).rejects.toThrow(MESSAGES.notReady);
    expect(r.sentTo).toHaveLength(0);
  });

  test('a note with no summary has nothing to send', async () => {
    const r = rig({ claimError: 'no_summary' });
    await expect(run(r)).rejects.toThrow(MESSAGES.noSummary);
    expect(r.sentTo).toHaveLength(0);
  });

  test('the automatic send is skipped quietly when the owner has it switched off', async () => {
    const r = rig({ claimError: 'auto_off' });
    await expect(run(r, { auto: true, userId: null })).rejects.toThrow(RecapSkippedError);
    expect(r.sentTo).toHaveLength(0);
  });

  test('a note never sends itself twice, so Regenerate does not email everybody again', async () => {
    const r = rig({ claimError: 'already_sent' });
    await expect(run(r, { auto: true, userId: null })).rejects.toThrow(RecapSkippedError);
    expect(r.sentTo).toHaveLength(0);
  });
});

describe('NOBODY OUTSIDE THE ACCOUNT, EVER', () => {
  test('an id that is not on the account is dropped, and nothing is sent to it', async () => {
    const r = rig();
    await run(r, { recipientUserIds: [OWNER.user_id, OUTSIDER_ID] });
    expect(r.sentTo.map((m) => m.to)).toEqual([OWNER.email]);
  });

  test('an id that is on NO account at all leaves nobody to send to', async () => {
    const r = rig();
    await expect(run(r, { recipientUserIds: [OUTSIDER_ID] })).rejects.toThrow(MESSAGES.nobody);
    expect(r.sentTo).toHaveLength(0);
    expect(logs(r)).toHaveLength(0);
  });

  test('the only addresses that can ever be used are the ones the database handed back', () => {
    const picked = chooseRecipients([OWNER, MEMBER], [OUTSIDER_ID, MEMBER.user_id], 50);
    expect(picked.map((p) => p.email)).toEqual([MEMBER.email]);
  });

  test('an address is never an input: choosing is done by id only', () => {
    // There is no way to ask for an address. chooseRecipients only ever reads ids.
    expect(chooseRecipients([OWNER], ['someone@elsewhere.test'], 50)).toEqual([]);
  });

  test('the same person asked for twice only gets one email', async () => {
    const r = rig();
    await run(r, { recipientUserIds: [OWNER.user_id, OWNER.user_id] });
    expect(r.sentTo).toHaveLength(1);
  });

  test('a runaway send is capped', () => {
    expect(chooseRecipients([OWNER, MEMBER], undefined, 0)).toHaveLength(0);
    expect(chooseRecipients([OWNER, MEMBER], [OWNER.user_id, MEMBER.user_id], 1)).toHaveLength(1);
  });
});

describe('the settings decide who gets it', () => {
  test('owner only is the default, so a send with no choices reaches the owner alone', async () => {
    const r = rig();
    await run(r);
    expect(r.sentTo.map((m) => m.to)).toEqual([OWNER.email]);
  });

  test('switching the team on sends to the team as well', async () => {
    const r = rig({
      claim: {
        settings: { to_owner: true, to_members: true, auto_send: false },
        recipients: [OWNER, { ...MEMBER, default_on: true }],
      },
      saved: { hi: HINDI_SAVED },
    });
    await run(r);
    expect(r.sentTo.map((m) => m.to).sort()).toEqual([OWNER.email, MEMBER.email].sort());
  });

  test('the team only means the owner is left out', async () => {
    const r = rig({
      claim: {
        settings: { to_owner: false, to_members: true, auto_send: false },
        recipients: [{ ...OWNER, default_on: false }, { ...MEMBER, default_on: true }],
      },
      saved: { hi: HINDI_SAVED },
    });
    await run(r);
    expect(r.sentTo.map((m) => m.to)).toEqual([MEMBER.email]);
  });

  test('with nobody switched on, an automatic send has nobody to go to', async () => {
    const r = rig({
      claim: {
        settings: { to_owner: false, to_members: false, auto_send: true },
        recipients: [{ ...OWNER, default_on: false }, { ...MEMBER, default_on: false }],
      },
    });
    await expect(run(r, { auto: true, userId: null })).rejects.toThrow(MESSAGES.nobody);
  });

  test('ticking somebody by hand overrides the settings for that one email', async () => {
    const r = rig({ saved: { hi: HINDI_SAVED } });
    await run(r, { recipientUserIds: [MEMBER.user_id] });
    expect(r.sentTo.map((m) => m.to)).toEqual([MEMBER.email]);
  });
});

describe('everybody reads it in their own language', () => {
  test('a translation that is already saved is used, and nothing is bought', async () => {
    const r = rig({ saved: { hi: HINDI_SAVED } });
    await run(r, { recipientUserIds: [MEMBER.user_id], translate: translate(r, null) });
    expect(r.translationsAsked).toHaveLength(0);
    expect(r.sentTo[0].text).toContain('टीम शुक्रवार');
    expect(r.sentTo[0].text).toContain('Translated by AI');
  });

  test('a language nobody has translated into yet is bought once, then used', async () => {
    const r = rig();
    await run(r, { recipientUserIds: [MEMBER.user_id], translate: translate(r, HINDI_FRESH) });
    expect(r.translationsAsked).toEqual([{ language: 'hi', asUserId: OWNER.user_id }]);
    expect(r.sentTo[0].text).toContain('टीम शुक्रवार');
  });

  test('the automatic send buys a translation as the account owner, since no person asked', async () => {
    const r = rig({
      claim: { settings: { to_owner: false, to_members: true, auto_send: true }, recipients: [{ ...MEMBER, default_on: true }] },
    });
    await run(r, { auto: true, userId: null, translate: translate(r, HINDI_FRESH) });
    expect(r.translationsAsked).toEqual([{ language: 'hi', asUserId: OWNER.user_id }]);
  });

  test('two people who read the same language share ONE translation', async () => {
    const second = { ...MEMBER, user_id: '33333333-3333-3333-3333-333333333333', email: 'raj@example.test' };
    const r = rig({ claim: { recipients: [MEMBER, second] } });
    await run(r, {
      recipientUserIds: [MEMBER.user_id, second.user_id],
      translate: translate(r, HINDI_FRESH),
    });
    expect(r.translationsAsked).toHaveLength(1);
    expect(r.sentTo).toHaveLength(2);
  });

  test('somebody who reads the language the note is in gets the original, untouched', async () => {
    const r = rig();
    await run(r, { recipientUserIds: [OWNER.user_id], translate: translate(r, HINDI_FRESH) });
    expect(r.translationsAsked).toHaveLength(0);
    expect(r.sentTo[0].text).toContain('The team agreed to ship');
    expect(r.sentTo[0].text).not.toContain('Translated by AI');
  });

  test('a ceiling stops one send buying an endless number of translations', async () => {
    const people = ['es', 'fr', 'de'].map((language, i) => ({
      ...MEMBER,
      user_id: `4444444${i}-4444-4444-4444-444444444444`,
      email: `person${i}@example.test`,
      language,
    }));
    const r = rig({ claim: { recipients: people } });
    await run(r, {
      recipientUserIds: people.map((p) => p.user_id),
      maxTranslations: 1,
      translate: translate(r, HINDI_FRESH),
    });
    expect(r.translationsAsked).toHaveLength(1);
    // Everybody still got an email. The two past the ceiling got the original words.
    expect(r.sentTo).toHaveLength(3);
    expect(r.sentTo.filter((m) => m.text.includes('Translated by AI'))).toHaveLength(1);
  });

  test('A TRANSLATION GOING WRONG STILL SENDS THE EMAIL, in the original language', async () => {
    const r = rig();
    await run(r, {
      recipientUserIds: [MEMBER.user_id],
      translate: async () => {
        throw new Error('the AI was busy');
      },
    });
    expect(r.sentTo).toHaveLength(1);
    expect(r.sentTo[0].text).toContain('The team agreed to ship');
    expect(r.sentTo[0].text).not.toContain('Translated by AI');
    expect(logs(r)[0].args.p_translated).toBe(false);
  });

  test('A JUST-BOUGHT TRANSLATION IS USED, even though it carries no version stamp', async () => {
    // The translate function SAVES the words stamped with the rules that made them, but hands
    // them back bare. Demanding a stamp here threw every fresh translation away and quietly
    // sent English instead: it looked like translation simply not working.
    const r = rig();
    await run(r, { recipientUserIds: [MEMBER.user_id], translate: translate(r, HINDI_FRESH) });
    expect(r.sentTo).toHaveLength(1);
    expect(r.sentTo[0].text).toContain('टीम शुक्रवार');
    expect(r.sentTo[0].text).toContain('Translated by AI');
    expect(logs(r)[0].args.p_translated).toBe(true);
    expect(logs(r)[0].args.p_language).toBe('hi');
  });

  test('but words OUT OF THE DATABASE with no stamp at all are not trusted', async () => {
    // Nothing writes these today. If something ever did, they would be of unknown age.
    const r = rig({ saved: { hi: HINDI_FRESH } });
    await run(r, { recipientUserIds: [MEMBER.user_id], translate: translate(r, null) });
    expect(r.translationsAsked).toHaveLength(1);
  });

  test('words saved by OLD translating rules are ignored, not shown', async () => {
    const r = rig({ saved: { hi: { ...HINDI_WORDS, v: PROMPT_VERSION - 1 } } });
    await run(r, { recipientUserIds: [MEMBER.user_id], translate: translate(r, null) });
    // It tried to buy a fresh one rather than sending out-of-date words.
    expect(r.translationsAsked).toHaveLength(1);
    expect(r.sentTo[0].text).not.toContain('टीम शुक्रवार');
  });
});

describe('laying a translation over the original', () => {
  test("a person's name is never translated, and the to-dos keep their owners", () => {
    const laid = translatedBody(CLAIM, HINDI_SAVED, true);
    expect(laid?.actionItems[0]).toEqual({
      text: 'परीक्षण योजना भेजें',
      owner: 'Priya Shah',
      due: 'शुक्रवार',
    });
  });

  test('the title is left in the language it was written in', () => {
    expect(translatedBody(CLAIM, HINDI_SAVED, true)?.title).toBe('Monday planning call');
  });

  test('a list that comes back the wrong length is refused, never lined up wrongly', () => {
    expect(translatedBody(CLAIM, { ...HINDI_SAVED, action_items: [] }, true)).toBeNull();
  });

  test('junk is refused', () => {
    expect(translatedBody(CLAIM, null, true)).toBeNull();
    expect(translatedBody(CLAIM, 'not json', true)).toBeNull();
    expect(translatedBody(CLAIM, { v: PROMPT_VERSION }, true)).toBeNull();
    expect(translatedBody(CLAIM, [1, 2, 3], true)).toBeNull();
  });

  test('words stored as text, the way the database holds them, are read back fine', () => {
    expect(translatedBody(CLAIM, JSON.stringify(HINDI_SAVED), true)?.overview).toBe(
      HINDI_WORDS.overview,
    );
  });

  test('the original words are read out of the claim as they are', () => {
    expect(originalBody(CLAIM)).toEqual({
      title: 'Monday planning call',
      overview: 'The team agreed to ship the new sign up screen on Friday.',
      keyPoints: ['Sign up is slow on phones'],
      decisions: ['Ship on Friday'],
      actionItems: [{ text: 'Send the test plan', owner: 'Priya Shah', due: 'Friday' }],
    });
  });
});

describe('EVERY EMAIL IS WRITTEN DOWN', () => {
  test('one row per person, with who, when, which language, and the result', async () => {
    const r = rig({ saved: { hi: HINDI_SAVED }, claim: { recipients: [OWNER, { ...MEMBER, default_on: true }] } });
    await run(r, { recipientUserIds: [OWNER.user_id, MEMBER.user_id] });
    const rows = logs(r);
    expect(rows).toHaveLength(2);
    expect(rows[0].args).toMatchObject({
      p_account_id: CLAIM.account_id,
      p_recipient_user_id: OWNER.user_id,
      p_recipient_email: OWNER.email,
      p_language: 'en',
      p_translated: false,
      p_result: 'sent',
      p_sent_by: OWNER.user_id,
      p_auto: false,
    });
    expect(rows[0].args.p_provider_id).toBe('fake-id-1');
    expect(rows[1].args).toMatchObject({
      p_recipient_email: MEMBER.email,
      p_language: 'hi',
      p_translated: true,
      p_result: 'sent',
    });
  });

  test('a way of sending that gives back no id writes down nothing, not an empty word', async () => {
    const r = rig();
    await run(r, { send: async () => '' });
    expect(logs(r)[0].args.p_result).toBe('sent');
    expect(logs(r)[0].args.p_provider_id).toBeNull();
  });

  test('a send that FAILS is written down too, with why', async () => {
    const r = rig();
    await run(r, { send: send(r, [OWNER.email]) });
    const rows = logs(r);
    expect(rows).toHaveLength(1);
    expect(rows[0].args.p_result).toBe('failed');
    expect(rows[0].args.p_error_message).toBe('that address bounced');
    expect(rows[0].args.p_provider_id).toBeNull();
  });

  test('ONE PERSON FAILING NEVER STOPS THE OTHERS', async () => {
    const r = rig({ saved: { hi: HINDI_SAVED }, claim: { recipients: [OWNER, { ...MEMBER, default_on: true }] } });
    const result = await run(r, {
      recipientUserIds: [OWNER.user_id, MEMBER.user_id],
      send: send(r, [OWNER.email]),
    });
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(r.sentTo.map((m) => m.to)).toEqual([MEMBER.email]);
    expect(logs(r)).toHaveLength(2);
  });

  test('the automatic send is written down as automatic, with nobody as the sender', async () => {
    const r = rig({ claim: { settings: { to_owner: true, to_members: false, auto_send: true } } });
    await run(r, { auto: true, userId: null });
    expect(logs(r)[0].args).toMatchObject({ p_auto: true, p_sent_by: null });
  });
});

describe('what the sender is told afterwards', () => {
  test('it says how many went, and names each person and their language', async () => {
    const r = rig({ saved: { hi: HINDI_SAVED }, claim: { recipients: [OWNER, { ...MEMBER, default_on: true }] } });
    const result = await run(r, { recipientUserIds: [OWNER.user_id, MEMBER.user_id] });
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.outcomes).toEqual([
      { email: OWNER.email, name: 'Sam Carter', language: 'English', translated: false, ok: true },
      { email: MEMBER.email, name: 'Priya Shah', language: 'Hindi', translated: true, ok: true },
    ]);
  });

  test('every email carries the footer and the link to the note', async () => {
    const r = rig();
    await run(r);
    expect(r.sentTo[0].html).toContain('Turn off recaps');
    expect(r.sentTo[0].html).toContain('https://app.example.test/recap-emails');
    expect(r.sentTo[0].html).toContain('https://app.example.test/note/mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm');
    expect(r.sentTo[0].subject).toBe('Recap: Monday planning call');
  });
});

describe('showing who would get it, without sending', () => {
  test('it lists everybody on the account and which of them the settings pick', async () => {
    const r = rig();
    const seen = await previewRecap({ admin: r.admin, meetingId: 'm', userId: OWNER.user_id, auto: false });
    expect(seen.recipients.map((p) => p.email)).toEqual([OWNER.email, MEMBER.email]);
    expect(seen.recipients.map((p) => p.default_on)).toEqual([true, false]);
    // The server, not the screen, says which row is the person asking.
    expect(seen.recipients.map((p) => p.is_you)).toEqual([true, false]);
    expect(seen.settings).toEqual({ to_owner: true, to_members: false, auto_send: false });
    expect(seen.noteTitle).toBe('Monday planning call');
  });

  test('the automatic send has no person asking, so no row is "you"', async () => {
    const r = rig();
    const seen = await previewRecap({ admin: r.admin, meetingId: 'm', userId: null, auto: false });
    expect(seen.recipients.every((p) => p.is_you === false)).toBe(true);
  });

  test('a preview sends nothing and writes nothing down', async () => {
    const r = rig();
    await previewRecap({ admin: r.admin, meetingId: 'm', userId: OWNER.user_id, auto: false });
    expect(r.sentTo).toHaveLength(0);
    expect(logs(r)).toHaveLength(0);
  });
});
