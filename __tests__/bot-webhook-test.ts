/**
 * @jest-environment node
 */
/**
 * A FORGED STATUS EVENT CHANGES NOTHING.
 *
 * The webhook that receives meeting-bot status events is the only door in Gyan that is not opened
 * with a Supabase login, because the bot service does not hold one. Its signature is the whole of
 * its identity. So this file does what a browser script cannot: it builds real signatures with a
 * real key and then tries every way of getting past the check.
 *
 * Nothing here touches a network, a database or the real bot service.
 */
import crypto from 'crypto';

import { readEvent, signatureMatches } from '../supabase/functions/_shared/meeting-bot/recall';

/** A secret shaped exactly like the one the service hands out: `whsec_` plus base64. */
const SECRET = `whsec_${Buffer.from('a-test-signing-key-32-bytes-long').toString('base64')}`;
const OTHER = `whsec_${Buffer.from('a-different-signing-key-32-byte').toString('base64')}`;

const NOW = new Date('2026-11-25T12:00:00Z');
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));
const ID = 'msg_2abc';

const BODY = JSON.stringify({
  event: 'bot.in_call_recording',
  data: {
    data: { code: 'in_call_recording', sub_code: null, updated_at: '2026-11-25T12:00:00Z' },
    bot: { id: 'bot-123', metadata: { note_id: '33333333-3333-4333-8333-333333333333' } },
  },
});

/** The signature the service would really send. */
function sign(body: string, secret = SECRET, id = ID, timestamp = TIMESTAMP): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const digest = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${digest}`;
}

const good = () => ({
  id: ID,
  timestamp: TIMESTAMP,
  signature: sign(BODY),
  rawBody: BODY,
  secret: SECRET,
  now: NOW,
});

describe('a real signature', () => {
  test('is accepted', async () => {
    await expect(signatureMatches(good())).resolves.toBe(true);
  });

  test('is accepted when the secret has just been rotated and two are sent', async () => {
    // The service keeps an old secret valid for 24 hours and sends a signature for each. Any
    // match is a match.
    const both = `${sign(BODY, OTHER)} ${sign(BODY)}`;
    await expect(signatureMatches({ ...good(), signature: both })).resolves.toBe(true);
  });

  test('is accepted a couple of minutes late, because clocks are not exact', async () => {
    const twoMinutesOn = new Date(NOW.getTime() + 2 * 60_000);
    await expect(signatureMatches({ ...good(), now: twoMinutesOn })).resolves.toBe(true);
  });
});

describe('ANYTHING ELSE IS REFUSED', () => {
  test.each([
    [
      'the body was changed after it was signed',
      () => ({ ...good(), rawBody: BODY.replace('in_call_recording', 'fatal') }),
    ],
    ['one byte of the signature was changed', () => ({ ...good(), signature: `${sign(BODY).slice(0, -1)}x` })],
    ['the signature is for a different body', () => ({ ...good(), signature: sign('{}') })],
    ['the signature was made with another key', () => ({ ...good(), signature: sign(BODY, OTHER) })],
    ['the message id was changed', () => ({ ...good(), id: 'msg_somebody_else' })],
    ['the timestamp was changed', () => ({ ...good(), timestamp: String(Number(TIMESTAMP) + 1) })],
    ['there is no signature at all', () => ({ ...good(), signature: '' })],
    ['the version is one we do not know', () => ({ ...good(), signature: sign(BODY).replace('v1,', 'v9,') })],
    ['the signature has no version on it', () => ({ ...good(), signature: sign(BODY).replace('v1,', '') })],
    ['our secret is empty', () => ({ ...good(), secret: '' })],
    ['our secret is not in the shape the service uses', () => ({ ...good(), secret: 'not-a-whsec-key' })],
    ['our secret is whsec_ and nothing else', () => ({ ...good(), secret: 'whsec_' })],
  ])('%s', async (_name, build) => {
    await expect(signatureMatches(build())).resolves.toBe(false);
  });

  test('A REPLAY OF A REAL MESSAGE FROM AN HOUR AGO IS REFUSED', async () => {
    // An old message is still a real message, correctly signed. Without an age check, anybody who
    // ever saw one could send it again -- so a note could be told its bot had failed, repeatedly,
    // for as long as they liked. Five minutes is Gyan's own choice; the service documents none.
    const anHourOn = new Date(NOW.getTime() + 60 * 60_000);
    await expect(signatureMatches({ ...good(), now: anHourOn })).resolves.toBe(false);
  });

  test('and a message from an hour in the future is refused too', async () => {
    const anHourBefore = new Date(NOW.getTime() - 60 * 60_000);
    await expect(signatureMatches({ ...good(), now: anHourBefore })).resolves.toBe(false);
  });

  test('a timestamp that is not a number is refused', async () => {
    await expect(signatureMatches({ ...good(), timestamp: 'yesterday' })).resolves.toBe(false);
  });
});

describe('what a verified event says', () => {
  test('a recording event names the bot and the note it was sent for', () => {
    expect(readEvent(BODY)).toEqual({
      kind: 'phase',
      externalId: 'bot-123',
      noteId: '33333333-3333-4333-8333-333333333333',
      phase: 'recording',
      reason: null,
    });
  });

  test('an event with no bot id on it is ignored, not guessed at', () => {
    expect(readEvent(JSON.stringify({ event: 'bot.done', data: { bot: {} } })).kind).toBe('ignore');
  });

  test('a body that is not JSON at all is ignored', () => {
    expect(readEvent('not json').kind).toBe('ignore');
  });

  test('a note id is only ever a hint, so a missing one is not an error', () => {
    const body = JSON.stringify({
      event: 'bot.joining_call',
      data: { data: { code: 'joining_call' }, bot: { id: 'bot-9' } },
    });
    expect(readEvent(body)).toEqual({
      kind: 'phase',
      externalId: 'bot-9',
      noteId: null,
      phase: 'joining',
      reason: null,
    });
  });
});
