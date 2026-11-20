#!/usr/bin/env node
//
// Puts the secret check in front of every commit.
//
// npm runs this by itself after `npm install` (the "prepare" script), so there is
// nothing for anybody to remember. You can also run it by hand:
//     npm run hooks:install
//
// It writes .git/hooks/pre-commit. Git does not commit its own hooks folder, which is
// why this has to be a script rather than a file in the repository.

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const gitDir = path.join(root, '.git');

// A fresh clone with no .git (or an npm install inside another project) must not fail.
if (!fs.existsSync(gitDir)) {
  console.log('No .git folder here, so there is no commit to check. Nothing to do.');
  process.exit(0);
}

const hookDir = path.join(gitDir, 'hooks');
const hookFile = path.join(hookDir, 'pre-commit');

const MARKER = '# gyan-pre-commit v1';

const hook = `#!/bin/sh
${MARKER}
#
# Stops a commit that carries a key or a password. Written by scripts/install-hooks.js.
# To commit anyway in a real emergency: git commit --no-verify  (and tell George why).

if ! node "$(git rev-parse --show-toplevel)/scripts/scan-secrets.js"; then
  exit 1
fi
`;

if (fs.existsSync(hookFile)) {
  const existing = fs.readFileSync(hookFile, 'utf8');
  if (!existing.includes(MARKER)) {
    // Somebody else's hook is already here. Never throw away work without asking.
    console.error('');
    console.error('There is already a pre-commit hook here that gyan did not write:');
    console.error(`  ${hookFile}`);
    console.error('Leaving it alone. Add this line to it yourself to get the secret check:');
    console.error('  node "$(git rev-parse --show-toplevel)/scripts/scan-secrets.js" || exit 1');
    console.error('');
    process.exit(0);
  }
}

fs.mkdirSync(hookDir, { recursive: true });
fs.writeFileSync(hookFile, hook, { mode: 0o755 });
fs.chmodSync(hookFile, 0o755);
console.log('The secret check will now run before every commit.');
