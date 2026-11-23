/**
 * NOTHING PRIVATE IS EVER WRITTEN TO A LOG.
 *
 * Supabase keeps server function logs, and they are readable by anyone who can open the
 * dashboard. A log line holding a transcript, a summary or somebody's email address is a
 * second copy of the very thing Gyan is protecting -- in a place with none of the rules.
 *
 * The code gets this right today: every logging line records the KIND of error and nothing
 * else. This test is here so it stays right. It is the sort of discipline that rots in one
 * careless debugging session, and the line that breaks it ("just print the body so I can
 * see what is wrong") looks completely harmless in review.
 */
import fs from 'fs';
import path from 'path';

const functionsDir = path.join(__dirname, '..', 'supabase', 'functions');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const serverFiles = walk(functionsDir).filter((f) => f.endsWith('.ts'));

/** Every console.* call in the server code, with the file it is in. */
function everyLogCall(): { file: string; call: string }[] {
  const calls: { file: string; call: string }[] = [];
  for (const file of serverFiles) {
    const source = fs.readFileSync(file, 'utf8');
    // Comments out first: a comment saying "never log the password" must not look like one.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const [call] of code.matchAll(/console\s*\.\s*\w+\s*\([^;]*?\)\s*;/gs)) {
      calls.push({ file: path.relative(functionsDir, file), call: call.replace(/\s+/g, ' ') });
    }
  }
  return calls;
}

describe('the server logs', () => {
  const logs = everyLogCall();

  test('there are logging lines to check (so this cannot pass by finding none)', () => {
    expect(logs.length).toBeGreaterThan(5);
  });

  test('NO LOG LINE CAN CARRY THE WORDS OF A MEETING', () => {
    // These are the names the words actually travel under in this code base.
    // The names the words actually travel under in this code base. A NOTE ID is fine and
    // is the whole point of these lines -- it is how you find which note went wrong -- so
    // body.meeting_id and o.meetingId are deliberately not on this list.
    const privateThings =
      /\b(transcript|segments|overview|key_points|summary|passages|question|answer|recipient|address|password|apiKey|secretKey|publicKey|anthropicKey|deepgramKey|smtpPassword|SERVICE_ROLE)\b/i;
    const emailOrToken = /\b(email|token)\b/i;
    const wholeBody = /\bbody\b(?!\s*\.\s*meeting_id)/;

    // The line's OWN WORDING is fine -- "summary shape problem for" is a label, not data.
    // What matters is what it hands over, so the fixed strings come out first.
    const dataOnly = (call: string) => call.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');

    const offenders = logs.filter((l) => {
      const data = dataOnly(l.call);
      return privateThings.test(data) || emailOrToken.test(data) || wholeBody.test(data);
    });
    expect(offenders).toEqual([]);
  });

  test('a log line records the KIND of problem, not the problem itself', () => {
    for (const { file, call } of logs) {
      // Anything passed in has to be a fixed string, an id, or an error's NAME. Printing an
      // error object itself is what leaks: a vendor's error carries its request body.
      const bad = /\$\{[^}]*\}/.test(call) === false && /,\s*e\s*\)/.test(call);
      if (bad) throw new Error(`${file}: this logs the error itself rather than its kind: ${call}`);
      // e.message is the giveaway: a vendor's message can hold anything it likes.
      if (/\be\s*\.\s*message\b/.test(call)) {
        throw new Error(`${file}: this logs somebody else's wording: ${call}`);
      }
      // Two lines log `lastShapeProblem?.message`, and that is fine: a shape problem is
      // raised by OUR code with OUR wording -- 'not_json', 'overview', or a sentence with
      // a count in it. It never carries a word the model wrote or a person said. Anything
      // else ending in .message would, so it is flagged above.
      if (/\.message\b/.test(call) && !/lastShapeProblem\?\.message/.test(call)) {
        throw new Error(`${file}: something's own wording reaches a log: ${call}`);
      }
    }
  });

  test('every error that is logged is logged by NAME', () => {
    // The shape used everywhere: e instanceof Error ? e.name : 'error'.
    const withAnError = logs.filter((l) => /\be\b/.test(l.call));
    expect(withAnError.length).toBeGreaterThan(5);
    for (const { file, call } of withAnError) {
      const safe = /e instanceof Error \? e\.name : 'error'/.test(call) || /e\.name/.test(call);
      if (!safe) throw new Error(`${file}: an error reaches a log without being reduced to its name: ${call}`);
    }
  });

  test('nothing writes a whole request or response to a log', () => {
    for (const { file, call } of logs) {
      for (const giveaway of ['JSON.stringify', 'await res.text()', 'res.body', 'req.body', 'Object.entries']) {
        if (call.includes(giveaway)) {
          throw new Error(`${file}: this writes a whole message to a log: ${call}`);
        }
      }
    }
  });

  test('THE KEYS ARE NEVER READ INTO A LOG LINE, anywhere', () => {
    for (const file of serverFiles) {
      const code = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Not even a length or a first few characters, which people do while debugging and
      // which is enough to confirm a guess.
      expect(code).not.toMatch(/console[^;]*(?:Deno\.env\.get|pickKey|secretKey|anthropicKey|deepgramKey|smtpPassword|SERVICE_ROLE)/);
    }
  });

  test('an error sent back to a person says nothing about the inside either', () => {
    // Every message a person can see comes from a MESSAGES object written by hand. A vendor's
    // own wording is deliberately thrown away (see messageForSendError, messageForStatus).
    for (const name of ['recap', 'team', 'summarize', 'translate', 'chat', 'transcribe', 'account']) {
      const index = fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8');
      const code = index.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // No stack trace, ever.
      expect(code).not.toMatch(/\bstack\b/);
      expect(code).not.toMatch(/message:\s*String\(e\)/);
      expect(code).not.toMatch(/message:\s*e\?\.message/);

      // `message: e.message` IS allowed, but only for one of our OWN error types, whose
      // message is a sentence we wrote. The guard has to be on the same line, so a vendor's
      // error can never slip through this door.
      for (const line of code.split('\n')) {
        if (!/message:\s*e\.message/.test(line)) continue;
        if (!/e instanceof \w*Error\b/.test(line)) {
          throw new Error(`${name}/index.ts: an unguarded error message is sent to a person: ${line.trim()}`);
        }
        if (/e instanceof Error\b/.test(line)) {
          throw new Error(`${name}/index.ts: ANY error's message is sent to a person: ${line.trim()}`);
        }
      }
    }
  });
});
