/**
 * Inviting somebody: the order things happen in.
 *
 * The thing worth proving is that AN INVITE ONLY EXISTS IF ITS EMAIL WENT OUT. A seat held by
 * an invite nobody ever received would be invisible: the owner would see a seat gone and have
 * no idea why. Nothing here sends a real email or touches a real database.
 */
import {
  inviteProblem,
  runInvite,
  type Db,
} from '../supabase/functions/team/pipeline';
import { MESSAGES, TeamError, joinUrlFor, renderInvite, subjectFor } from '../supabase/functions/team/invite-email';

import { answer } from '../__mocks__/supabase-answer';

const CLAIMED = {
  invite_id: 'i1',
  invite_account_id: 'a1',
  invite_email: 'newbie@example.test',
  invite_token: 'tok_abcdef',
  owner_name: 'Sam Carter',
  seats_included: 5,
  seats_used: 3,
};

/** A stand-in database that writes down every call, in order. */
function fakeDb(overrides: Record<string, { data?: unknown; error?: { message?: string } | null }> = {}) {
  const calls: string[] = [];
  const db: Db = {
    rpc(name, args) {
      calls.push(name);
      const override = overrides[name];
      if (override) return answer({ data: override.data ?? null, error: override.error ?? null });
      if (name === 'claim_invite') return answer({ data: [CLAIMED], error: null });
      return answer({ data: null, error: null });
    },
  };
  return { db, calls };
}

describe('inviting somebody', () => {
  test('the database decides first, then the email goes out, then it is written down', async () => {
    const { db, calls } = fakeDb();
    const sent: { to: string; subject: string }[] = [];

    const result = await runInvite({
      db,
      send: async (m) => {
        sent.push({ to: m.to, subject: m.subject });
      },
      userId: 'u1',
      email: 'newbie@example.test',
      appUrl: 'https://app.example.test',
    });

    expect(calls).toEqual(['claim_invite', 'log_account_email']);
    expect(sent).toEqual([{ to: 'newbie@example.test', subject: 'Sam Carter invited you to gyan' }]);
    expect(result).toEqual({
      email: 'newbie@example.test',
      ownerName: 'Sam Carter',
      seatsIncluded: 5,
      seatsUsed: 3,
    });
  });

  test('THE INVITE IS TAKEN BACK WHEN THE EMAIL WILL NOT SEND, so no seat is held for nothing', async () => {
    const { db, calls } = fakeDb();

    await expect(
      runInvite({
        db,
        send: async () => {
          throw new Error('connection timed out');
        },
        userId: 'u1',
        email: 'newbie@example.test',
        appUrl: 'https://app.example.test',
      }),
    ).rejects.toThrow(/could not reach the mail server/i);

    expect(calls).toEqual(['claim_invite', 'discard_invite', 'log_account_email']);
  });

  test('TAKING AN INVITE BACK NAMES THE ACCOUNT, so the database can check it belongs there', async () => {
    // discard_invite used to take only an invite id, so it had no idea which account the
    // invite belonged to. Asserting the arguments, not just the call, because a test that
    // checks only the name would have passed either way.
    const args: Record<string, unknown>[] = [];
    const db: Db = {
      rpc(name, callArgs) {
        if (name === 'claim_invite') return answer({ data: [CLAIMED], error: null });
        if (name === 'discard_invite') args.push(callArgs as Record<string, unknown>);
        return answer({ data: null, error: null });
      },
    };

    await expect(
      runInvite({
        db,
        send: async () => {
          throw new Error('connection timed out');
        },
        userId: 'u1',
        email: 'newbie@example.test',
        appUrl: 'https://app.example.test',
      }),
    ).rejects.toThrow(/could not reach the mail server/i);

    expect(args).toEqual([{ p_invite_id: 'i1', p_account_id: 'a1' }]);
  });

  test('a failed send is written down too, as failed', async () => {
    const written: Record<string, unknown>[] = [];
    const db: Db = {
      rpc(name, args) {
        if (name === 'claim_invite') return answer({ data: [CLAIMED], error: null });
        if (name === 'log_account_email') written.push(args);
        return answer({ data: null, error: null });
      },
    };

    await expect(
      runInvite({
        db,
        send: async () => {
          throw new Error('nope');
        },
        userId: 'u1',
        email: 'newbie@example.test',
        appUrl: 'https://app.example.test',
      }),
    ).rejects.toThrow(TeamError);

    expect(written).toHaveLength(1);
    expect(written[0].p_result).toBe('failed');
    expect(written[0].p_kind).toBe('invite');
    expect(written[0].p_recipient_email).toBe('newbie@example.test');
  });

  test('nothing is sent when the database says no, and the reason is in plain words', async () => {
    const { db, calls } = fakeDb({ claim_invite: { error: { message: 'seats_full' } } });
    let sends = 0;

    await expect(
      runInvite({
        db,
        send: async () => {
          sends += 1;
        },
        userId: 'u1',
        email: 'newbie@example.test',
        appUrl: 'https://app.example.test',
      }),
    ).rejects.toThrow(MESSAGES.seatsFull);

    expect(sends).toBe(0);
    expect(calls).toEqual(['claim_invite']);
  });

  test.each([
    ['not_owner', MESSAGES.notOwner],
    ['bad_email', MESSAGES.badEmail],
    ['already_member', MESSAGES.alreadyMember],
    ['already_invited', MESSAGES.alreadyInvited],
    ['seats_full', MESSAGES.seatsFull],
    ['no_account', MESSAGES.noAccount],
    ['something nobody planned for', MESSAGES.problem],
  ])('the database saying %s becomes one plain sentence', (code, words) => {
    expect(inviteProblem({ message: code })).toBe(words);
  });
});

describe('the invite email itself', () => {
  const words = { ownerName: 'Sam Carter', joinUrl: 'https://app.example.test/join?token=tok_abcdef' };

  test('the link carries the token, and the token is escaped for a web address', () => {
    expect(joinUrlFor('https://app.example.test', 'tok abc')).toBe(
      'https://app.example.test/join?token=tok%20abc',
    );
    // A trailing slash on the app address must not make a double slash.
    expect(joinUrlFor('https://app.example.test/', 't')).toBe('https://app.example.test/join?token=t');
  });

  test('BOTH VERSIONS CARRY THE SAME FACTS, because some mail apps show only the plain one', () => {
    const { text, html, subject } = renderInvite(words);
    expect(subject).toBe(subjectFor('Sam Carter'));
    for (const fact of ['Sam Carter', words.joinUrl, '14 days']) {
      expect(text).toContain(fact);
      expect(html).toContain(fact);
    }
  });

  test('it says the link is for one address only, and that ignoring it is safe', () => {
    const { text, html } = renderInvite(words);
    for (const version of [text, html]) {
      expect(version).toContain('only for this email address');
      expect(version).toContain('you can ignore it');
    }
  });

  test('the sender address is never written into the layout', () => {
    const { text, html } = renderInvite(words);
    expect(text).not.toContain('@gyantechai.com');
    expect(html).not.toContain('@gyantechai.com');
  });

  test('brand blue is a fill only, and link text uses the lighter blue', () => {
    const html = renderInvite(words).html;
    // #0066FF only ever appears as a background.
    for (const hit of html.match(/#0066FF/g) ?? []) expect(hit).toBeTruthy();
    expect(html).toContain('background:#0066FF');
    expect(html).not.toMatch(/color:#0066FF/);
  });

  test('a name with angle brackets in it cannot break out into the page', () => {
    const html = renderInvite({ ...words, ownerName: '<script>bad()</script>' }).html;
    expect(html).not.toContain('<script>bad()');
    expect(html).toContain('&lt;script&gt;');
  });
});

/**
 * The bug of 2026-11-20, pinned down.
 *
 * A Supabase call is not a promise. It has `then` and nothing else, so anything that reaches
 * for `.catch(...)` or `.finally(...)` on one blows up at run time. It blew up AFTER the email
 * had gone, which is the cruellest possible place: the invite arrived in the inbox and the
 * owner was told it had not.
 */
describe('a database that behaves like the real one, not like a promise', () => {
  /** Exactly what Supabase hands back: `then`, and nothing else. */
  function builderOnlyDb(): Db {
    return {
      rpc(name) {
        const value =
          name === 'claim_invite'
            ? { data: [CLAIMED], error: null }
            : { data: null, error: null };
        return {
          then(resolve, reject) {
            return Promise.resolve(value).then(resolve, reject);
          },
        };
      },
    };
  }

  test('an invite whose email went out is reported as sent, not as a failure', async () => {
    const sent: string[] = [];

    const result = await runInvite({
      db: builderOnlyDb(),
      send: async (m) => {
        sent.push(m.to);
      },
      userId: 'u1',
      email: 'newbie@example.test',
      appUrl: 'https://app.example.test',
    });

    expect(sent).toEqual(['newbie@example.test']);
    expect(result.email).toBe('newbie@example.test');
  });

  test('a send that really failed still says so, and still takes the invite back', async () => {
    const db = builderOnlyDb();
    const calls: string[] = [];
    const watched: Db = {
      rpc(name, args) {
        calls.push(name);
        return db.rpc(name, args);
      },
    };

    await expect(
      runInvite({
        db: watched,
        send: async () => {
          throw new TeamError('the mail server said no');
        },
        userId: 'u1',
        email: 'newbie@example.test',
        appUrl: 'https://app.example.test',
      }),
    ).rejects.toBeInstanceOf(TeamError);

    expect(calls).toEqual(['claim_invite', 'discard_invite', 'log_account_email']);
  });

  test('the owner is never told "please try again" about an email that arrived', async () => {
    let told: string | undefined;
    try {
      await runInvite({
        db: builderOnlyDb(),
        send: async () => undefined,
        userId: 'u1',
        email: 'newbie@example.test',
        appUrl: 'https://app.example.test',
      });
    } catch (e) {
      told = e instanceof Error ? e.message : String(e);
    }
    expect(told).toBeUndefined();
    expect(told).not.toBe(MESSAGES.problem);
  });
});
