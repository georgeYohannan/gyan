// Times what Home actually asks the database for, against the Supabase TEST project.
//
//   npm run measure:home
//
// It asks the same questions the screen asks, five times each, and reports the middle one. The
// middle (median) rather than the average, because one slow answer on a bad bit of wifi should
// not decide the number you quote.
//
// It only ever READS. It needs no secret key.
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
const RUNS = 5;

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

/** Runs one question five times and reports the middle time and how many notes came back. */
async function time(url, headers, label, args) {
  const times = [];
  let rows = 0;
  let total = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const started = Date.now();
    const response = await fetch(`${url}/rest/v1/rpc/find_notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    });
    const text = await response.text();
    times.push(Date.now() - started);
    if (!response.ok) throw new Error(`${label}: ${text}`);
    const body = JSON.parse(text || '[]');
    rows = body.length;
    total = body[0] ? body[0].total_count : 0;
  }
  const middle = [...times].sort((a, b) => a - b)[Math.floor(RUNS / 2)];
  return { label, middle, rows, total, times };
}

async function main() {
  const url = (env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.EXPO_PUBLIC_SUPABASE_KEY;
  const email = env.GYAN_FAKE_NOTES_EMAIL || env.TEST_USER_A_EMAIL;
  const password = env.GYAN_FAKE_NOTES_PASSWORD || env.TEST_USER_A_PASSWORD;

  if (!url || !key) return fail('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY must be in .env.local.');
  if (!email || !password) return fail('TEST_USER_A_EMAIL and TEST_USER_A_PASSWORD must be in .env.local.');

  const headers = await signIn(url, key, email, password);
  const month = new Date();
  month.setDate(month.getDate() - 29);

  const questions = [
    ['The first ten notes, as Home opens', { p_limit: 10 }],
    ['Twenty more, after Show more', { p_limit: 20, p_before: new Date().toISOString(), p_before_id: '00000000-0000-0000-0000-000000000000' }],
    ['Searching one word', { p_query: 'pricing', p_limit: 10 }],
    ['Searching a word only said once', { p_query: 'pelican', p_limit: 10 }],
    ['Searching two words', { p_query: 'budget numbers', p_limit: 10 }],
    ['Last 30 days', { p_limit: 10, p_from: month.toISOString() }],
    ['Ready notes only', { p_limit: 10, p_statuses: ['ready'] }],
    ['A word, a date range and a status together', { p_query: 'pricing', p_limit: 10, p_from: month.toISOString(), p_statuses: ['ready'] }],
    ['Notes with something still to do', { p_limit: 10, p_open_actions: true }],
  ];

  console.log(`\nProject: ${url}`);
  console.log(`Each question asked ${RUNS} times. The number shown is the middle one.\n`);

  const results = [];
  for (const [label, args] of questions) {
    try {
      const result = await time(url, headers, label, args);
      results.push(result);
      console.log(
        `${String(result.middle).padStart(5)} ms   ${label}` +
          `  (${result.rows} notes back, ${result.total} match in all)`,
      );
    } catch (error) {
      console.log(`   --     ${label}  -- failed: ${error.message}`);
    }
  }

  const worst = results.reduce((a, b) => (b.middle > a.middle ? b : a), results[0]);
  if (worst) {
    console.log(`\nSlowest question: ${worst.label}, at ${worst.middle} ms.`);
    console.log('These times include the trip over the internet to Supabase and back.\n');
  }
}

function fail(message) {
  console.error(`\nStopped: ${message}\n`);
  process.exitCode = 1;
}

main();
