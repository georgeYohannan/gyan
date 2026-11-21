#!/usr/bin/env node
// secret-scanner: allow-patterns
//
// Looks for keys and passwords before they can be committed.
//
// Run it three ways:
//   node scripts/scan-secrets.js            the files you are about to commit (staged)
//   node scripts/scan-secrets.js --tracked  every file git is already looking after
//   node scripts/scan-secrets.js --history  every change ever made, all the way back
//
// It exits 0 when it finds nothing and 1 when it finds something, which is what
// makes the pre-commit hook able to stop a commit.
//
// A file may opt out by putting the words "secret-scanner: allow-patterns" in its
// first 25 lines. Only two files do: this one and the test that checks it, because
// both have to write the patterns down in order to look for them.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// What a leaked key looks like.
// ---------------------------------------------------------------------------

// These shapes are keys and nothing else. No context needed.
const DEFINITE = [
  { name: 'a Supabase or JWT token', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'a Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  { name: 'a Supabase access token', re: /sbp_[0-9a-f]{32,}/g },
  { name: 'a Claude API key', re: /sk-ant-[A-Za-z0-9_-]{24,}/g },
  { name: 'an OpenAI-style API key', re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { name: 'a Google API key', re: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: 'an AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'a GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'a private key file', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
];

// A setting whose NAME says secret, given a real-looking value.
const SECRET_NAME = /\b((?:[A-Z][A-Z0-9]*_)*(?:KEY|SECRET|PASSWORD|PASSWD|TOKEN|CREDENTIAL|CREDENTIALS))\b\s*[:=]\s*(["'`]?)([^\s"'`,;)}\n]{8,})\2/g;

// Values that are plainly not a real secret.
const NOT_A_SECRET =
  /^(?:\$|process\.env|Deno\.env|import\.meta|undefined|null|true|false|\{|\[|<|xxx|your|changeme|placeholder|example|redacted|fake|dummy|test|todo|none|empty|\.\.\.)/i;

// A stand-in written by hand in a document or a checklist, rather than a real key.
// Two giveaways: it trails off with dots (sk-ant-...), or it is ordinary lowercase
// words joined by underscores with no digits at all (the_mailbox_password). Every
// real key from every vendor Gyan uses mixes cases or digits, so this cannot hide one.
function isPlaceholder(value) {
  if (value.includes('...') || value.includes('\u2026')) return true;
  if (/^[a-z]+(?:[_-][a-z]+)+$/.test(value)) return true;
  // Something waiting to be filled in: a printf placeholder, a shell variable, a template
  // slot. A real key never contains one, and a line that does is showing the SHAPE of a
  // key rather than carrying one. (Added after this scanner stopped a commit over a
  // printf line in the testing checklist, which was doing exactly that.)
  if (/%[sdq]|\$\{|\$\(|<[A-Za-z_]+>|\bYOUR_[A-Z_]+\b/.test(value)) return true;
  return false;
}

// Names that are not secrets even though they end in one of those words.
const SAFE_NAMES =
  /^(?:EXPO_PUBLIC_SUPABASE_KEY|SUPABASE_KEY|PUBLIC_KEY|PUBLISHABLE_KEY|ANON_KEY|API_KEY_NAME|KEY|IDEMPOTENCY_KEY|CACHE_KEY|STORAGE_KEY|SORT_KEY|ROW_KEY|HELP_KEY|CONSENT_KEY)$/;

// The rename trap: a server secret one character away from shipping in the app bundle.
// Anything named EXPO_PUBLIC_* is compiled into the web and phone bundles for anyone to read.
const PUBLIC_SECRET = /\bEXPO_PUBLIC_[A-Z0-9_]*(?:KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)\b/g;
const PUBLIC_SECRET_ALLOWED = new Set(['EXPO_PUBLIC_SUPABASE_KEY']);

// Files that must never be committed at all, whatever is inside them.
const FORBIDDEN_PATHS = [/(^|\/)\.env$/, /(^|\/)\.env\.(?!example$)[^/]+$/, /\.pem$/, /\.p12$/, /\.p8$/, /\.jks$/, /\.keystore$/];

// Never scan these — binaries, build output, other people's code.
const SKIP_PATHS =
  /(^|\/)(node_modules|\.git|\.expo|dist|web-build|test-results|playwright-report|\.playwright-mcp|example)\//;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|mp3|mp4|mov|m4a|wav|woff2?|ttf|otf|eot|lock)$/i;

// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function optedOut(text) {
  return text.split('\n', 25).join('\n').includes('secret-scanner: allow-patterns');
}

/** Finds every problem in one piece of text. Returns a list of plain sentences. */
function problemsIn(text, where) {
  const found = [];
  if (optedOut(text)) return found;

  for (const { name, re } of DEFINITE) {
    re.lastIndex = 0;
    let hit;
    while ((hit = re.exec(text)) !== null) {
      found.push({ where, line: lineOf(text, hit.index), what: `what looks like ${name}`, shown: shorten(hit[0]) });
    }
  }

  SECRET_NAME.lastIndex = 0;
  let named;
  while ((named = SECRET_NAME.exec(text)) !== null) {
    const [, settingName, , value] = named;
    if (SAFE_NAMES.test(settingName)) continue;
    if (NOT_A_SECRET.test(value)) continue;
    if (isPlaceholder(value)) continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(value)) continue; // a name, not a value
    found.push({
      where,
      line: lineOf(text, named.index),
      what: `a value given to ${settingName}`,
      shown: shorten(value),
    });
  }

  PUBLIC_SECRET.lastIndex = 0;
  let pub;
  while ((pub = PUBLIC_SECRET.exec(text)) !== null) {
    if (PUBLIC_SECRET_ALLOWED.has(pub[0])) continue;
    found.push({
      where,
      line: lineOf(text, pub.index),
      what: `${pub[0]}, which would be built into the app for anyone to read`,
      shown: pub[0],
    });
  }

  return found;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Never print a whole key, even in an error. */
function shorten(value) {
  if (value.length <= 10) return `${value.slice(0, 3)}...`;
  return `${value.slice(0, 6)}...${value.slice(-2)} (${value.length} characters)`;
}

function scanFiles(files, read) {
  const problems = [];
  for (const file of files) {
    if (!file || SKIP_PATHS.test(file) || BINARY_EXT.test(file)) continue;
    for (const forbidden of FORBIDDEN_PATHS) {
      if (forbidden.test(file)) {
        problems.push({ where: file, line: 0, what: 'a file that holds real settings and must never be committed', shown: file });
      }
    }
    let text;
    try {
      text = read(file);
    } catch {
      continue;
    }
    if (text === null || text.includes('\u0000')) continue;
    problems.push(...problemsIn(text, file));
  }
  return problems;
}

function stagedFiles() {
  return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean);
}

function run() {
  const mode = process.argv.includes('--history') ? 'history' : process.argv.includes('--tracked') ? 'tracked' : 'staged';
  let problems = [];
  let looked = '';

  if (mode === 'history') {
    // Every version of every file that has ever existed in this repository.
    const revs = git(['rev-list', '--all']).split('\n').filter(Boolean);
    looked = `every change in all ${revs.length} commits`;
    const seen = new Set();
    for (const rev of revs) {
      const listing = git(['ls-tree', '-r', '--name-only', rev]).split('\n').filter(Boolean);
      for (const file of listing) {
        if (SKIP_PATHS.test(file) || BINARY_EXT.test(file)) continue;
        const key = `${rev}:${file}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
    }
    // Reading every blob of every commit is slow, so read each unique blob once.
    const blobs = new Map();
    for (const rev of revs) {
      for (const row of git(['ls-tree', '-r', rev]).split('\n').filter(Boolean)) {
        const match = row.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/);
        if (!match) continue;
        const [, sha, file] = match;
        if (SKIP_PATHS.test(file) || BINARY_EXT.test(file)) continue;
        if (!blobs.has(sha)) blobs.set(sha, file);
      }
    }
    for (const [sha, file] of blobs) {
      let text;
      try {
        text = git(['cat-file', '-p', sha]);
      } catch {
        continue;
      }
      if (text.includes('\u0000')) continue;
      problems.push(...problemsIn(text, `${file} (an older version)`));
    }
    for (const forbidden of FORBIDDEN_PATHS) {
      for (const file of new Set([...blobs.values()])) {
        if (forbidden.test(file)) {
          problems.push({ where: file, line: 0, what: 'a settings file that was committed at some point in the past', shown: file });
        }
      }
    }
  } else if (mode === 'tracked') {
    const files = git(['ls-files']).split('\n').filter(Boolean);
    looked = `all ${files.length} files git is looking after`;
    problems = scanFiles(files, (f) => fs.readFileSync(path.join(root, f), 'utf8'));
  } else {
    const files = stagedFiles();
    looked = files.length === 1 ? '1 file you are about to commit' : `${files.length} files you are about to commit`;
    problems = scanFiles(files, (f) => git(['show', `:${f}`]));
  }

  if (problems.length === 0) {
    console.log(`No keys or passwords found in ${looked}.`);
    return 0;
  }

  console.error('');
  console.error('STOPPED: this looks like a key or a password.');
  console.error('');
  const unique = new Map();
  for (const p of problems) unique.set(`${p.where}:${p.line}:${p.shown}`, p);
  for (const p of unique.values()) {
    console.error(`  ${p.where}${p.line ? `, line ${p.line}` : ''}`);
    console.error(`    ${p.what}: ${p.shown}`);
  }
  console.error('');
  console.error('What to do:');
  console.error('  1. Take the key out of the file. Real keys belong in .env.local, which is never committed,');
  console.error('     or in a Supabase server secret (supabase secrets set NAME=value).');
  console.error('  2. If that key has already been shared anywhere, make a new one and throw the old one away.');
  console.error('  3. If this is a false alarm, tell George before working around it.');
  console.error('');
  return 1;
}

// Run from the command line, or be imported by the test that proves this works.
if (require.main === module) {
  process.exit(run());
}

module.exports = { problemsIn, isPlaceholder, FORBIDDEN_PATHS };
