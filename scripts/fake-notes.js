// Makes, counts, or removes hundreds of FAKE notes in the Supabase TEST project, so the Home
// list can be measured with a realistic number of them.
//
//   npm run fake:notes            make 300 fake notes
//   npm run fake:notes -- 50      make 50 instead
//   npm run fake:notes:count      say how many fake notes are there
//   npm run fake:notes:remove     take them all away again
//
// Every title starts with "[test] ", so they are obvious on screen and can be found again.
//
// It needs NO secret key. It signs in as a person, the ordinary way, and the database refuses
// the whole thing unless that person owns their account AND is marked as a gyan admin -- which
// no migration ever sets and the app cannot set. See supabase/migrations/..._search_and_paging.sql.
const fs = require('fs');
const path = require('path');

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = { ...readEnvFile(path.join(__dirname, '..', '.env.local')), ...process.env };

function fail(message) {
  console.error(`\nStopped: ${message}\n`);
  process.exitCode = 1;
}

/** Signs in and hands back the headers every later call needs. */
async function signIn(url, key, email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error_description || body.msg || `sign in failed (${response.status})`);
  return { apikey: key, Authorization: `Bearer ${body.access_token}`, 'Content-Type': 'application/json' };
}

async function callFunction(url, headers, name, args) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args ?? {}),
  });
  const text = await response.text();
  if (!response.ok) {
    const plain = (() => {
      try {
        return JSON.parse(text).message || text;
      } catch {
        return text;
      }
    })();
    throw new Error(plain);
  }
  return text === '' ? null : JSON.parse(text);
}

async function countFake(url, headers) {
  const response = await fetch(
    `${url}/rest/v1/meetings?select=id&title=like.%5Btest%5D%20%25`,
    { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } },
  );
  if (!response.ok) throw new Error(`could not count (${response.status})`);
  const range = response.headers.get('content-range') || '';
  return Number(range.split('/')[1] || 0);
}

async function main() {
  const args = process.argv.slice(2);
  const removing = args.includes('--remove');
  const counting = args.includes('--count');
  const howMany = Number(args.find((a) => /^\d+$/.test(a)) || 300);

  const url = (env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.EXPO_PUBLIC_SUPABASE_KEY;
  const email = env.GYAN_FAKE_NOTES_EMAIL || env.TEST_USER_A_EMAIL;
  const password = env.GYAN_FAKE_NOTES_PASSWORD || env.TEST_USER_A_PASSWORD;

  if (!url || !key) return fail('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY must be in .env.local.');
  if (key.includes('service_role')) {
    return fail('That looks like the secret service_role key. This script only ever needs the public one.');
  }
  if (!email || !password) {
    return fail(
      'No login to use. Put TEST_USER_A_EMAIL and TEST_USER_A_PASSWORD in .env.local, or set\n' +
        'GYAN_FAKE_NOTES_EMAIL and GYAN_FAKE_NOTES_PASSWORD when you run this.',
    );
  }

  console.log(`Project: ${url}`);
  console.log(`Signing in as ${email}`);

  let headers;
  try {
    headers = await signIn(url, key, email, password);
  } catch (error) {
    return fail(`could not sign in. ${error.message}`);
  }

  if (counting) {
    const there = await countFake(url, headers);
    console.log(`\nThere are ${there} fake notes on this account right now.\n`);
    return;
  }

  if (removing) {
    const there = await countFake(url, headers);
    if (there === 0) {
      console.log('\nThere are no fake notes to remove.\n');
      return;
    }
    // A warning before anything is deleted, and exactly what will go.
    console.log('');
    console.log(`ABOUT TO DELETE ${there} notes whose titles start with "[test] ".`);
    console.log('Only notes on your own account, and only ones with that mark, can go this way.');
    console.log('Any note you made yourself is safe unless you named it "[test] ..." too.');
    console.log('');
    if (!args.includes('--yes')) {
      console.log('Nothing has been deleted. Run it again with --yes to go ahead:');
      console.log('  npm run fake:notes:remove -- --yes');
      console.log('');
      return;
    }
    try {
      const gone = await callFunction(url, headers, 'remove_test_notes');
      console.log(`Removed ${gone} fake notes.\n`);
    } catch (error) {
      return fail(explain(error.message));
    }
    return;
  }

  console.log(`Making ${howMany} fake notes, each titled "[test] ..."`);
  const started = Date.now();
  try {
    const made = await callFunction(url, headers, 'seed_test_notes', { p_count: howMany });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const there = await countFake(url, headers);
    console.log(`\nMade ${made} notes in ${seconds} seconds. ${there} fake notes in total.`);
    console.log('Open Home to see them. To take them away again:');
    console.log('  npm run fake:notes:remove -- --yes\n');
  } catch (error) {
    return fail(explain(error.message));
  }
}

/** Turns the database's one-word refusals into something worth reading. */
function explain(message) {
  if (message.includes('not_admin')) {
    return (
      'this login is not a gyan admin, so the database refused.\n' +
      '        Open the Supabase dashboard, Table editor, profiles, find this person\'s row\n' +
      '        and set is_admin to true. This is on purpose: no migration ever sets it.'
    );
  }
  if (message.includes('not_owner')) return 'this login does not own an account.';
  if (message.includes('not_signed_in')) return 'the sign in did not stick. Try again.';
  return message;
}

main();
