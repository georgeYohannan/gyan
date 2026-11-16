// Checks that the Supabase test project can be reached with the keys in .env.local.
// Run it with: npm run check:supabase
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

async function main() {
  const env = { ...readEnvFile(path.join(__dirname, '..', '.env.local')), ...process.env };
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_KEY;

  if (!url) return fail('EXPO_PUBLIC_SUPABASE_URL is missing. Add it to .env.local.');
  if (!key) return fail('EXPO_PUBLIC_SUPABASE_KEY is missing. Add the public (publishable) key to .env.local.');
  if (key.includes('service_role')) {
    return fail('That looks like the secret service_role key. Use only the public key in the app.');
  }

  let response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: key },
    });
  } catch (error) {
    return fail(`Could not reach ${url}. Check the URL and your internet. (${error.message})`);
  }

  if (response.status === 401 || response.status === 403) {
    return fail('Supabase answered, but did not accept the key. Check EXPO_PUBLIC_SUPABASE_KEY.');
  }
  if (!response.ok) return fail(`Supabase answered with an error (status ${response.status}).`);

  console.log(`Connected to Supabase at ${url}`);
}

function fail(message) {
  console.error(`Not connected: ${message}`);
  process.exitCode = 1;
}

main();
