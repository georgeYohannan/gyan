/**
 * Test helper: talks to the real Supabase TEST project (never the live one).
 * The Expo test setup swaps the global fetch for one that does no network calls,
 * so this file brings a small fetch built on Node's https. It also sends file bodies.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import https from 'https';
import path from 'path';

export const realFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, name) => (headers[name] = value));

  let payload: Buffer | undefined;
  if (init?.body !== undefined && init.body !== null) {
    // Turning the body into a Response lets Node build form data and files for us.
    const asResponse = new Response(init.body as BodyInit);
    const contentType = asResponse.headers.get('content-type');
    if (contentType && !headers['content-type']) headers['content-type'] = contentType;
    payload = Buffer.from(await asResponse.arrayBuffer());
    headers['content-length'] = String(payload.length);
  }

  return new Promise<Response>((resolve, reject) => {
    const req = https.request(url, { method: init?.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const responseHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) responseHeaders.set(k, String(v));
        const status = res.statusCode ?? 0;
        const noBody = status === 204 || status === 304;
        resolve(new Response(noBody ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

/** Reads process.env plus the private .env.local file. */
export function readEnv(): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = { ...process.env };
  const file = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && values[m[1]] === undefined) values[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return values;
}

export async function loginAs(url: string, key: string, creds: { email: string; password: string }) {
  const client: SupabaseClient = createClient(url, key, {
    global: { fetch: realFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword(creds);
  if (error) throw new Error(`Test user could not log in: ${error.message}`);
  return { client, userId: data.user.id };
}
