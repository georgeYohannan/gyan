// Supabase server function: deletes somebody's gyan account, for good.
//
// It runs on Supabase's servers because only the server may delete a login, and only the server
// may reach into the private files bucket for a whole workspace at once.
//
// NOTHING HERE IS REVERSIBLE. Every guard that decides whether this may happen lives in the
// database (claim_account_deletion), not in this file and not in the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { RATE_LIMIT_MESSAGE, RateLimited, corsFor, pickKey, underRateLimit } from '../_shared/guard.ts';
import { AccountError, MESSAGES, runDeleteAccount, type Db, type Files } from './pipeline.ts';
import { LIST_PAGE_SIZE, REMOVE_BATCH, STORAGE_BUCKET } from './settings.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

/**
 * Every file in one workspace.
 *
 * Storage does not list folders inside folders by itself, and a file's path is
 * <workspace>/<note>/<file name>. So this looks twice: once for the note folders, then inside
 * each one. Both levels are asked for a page at a time, because a busy workspace has more
 * than one page of them.
 */
function makeFiles(client: ReturnType<typeof createClient>): Files {
  const bucket = client.storage.from(STORAGE_BUCKET);

  async function page(prefix: string): Promise<{ name: string; isFolder: boolean }[]> {
    const found: { name: string; isFolder: boolean }[] = [];
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await bucket.list(prefix, { limit: LIST_PAGE_SIZE, offset });
      if (error) throw error;
      const rows = data ?? [];
      // Storage marks a real file with an id. A row with no id is a folder.
      for (const row of rows) found.push({ name: row.name, isFolder: row.id === null });
      if (rows.length < LIST_PAGE_SIZE) return found;
    }
  }

  return {
    async list(accountId: string): Promise<string[]> {
      const paths: string[] = [];
      for (const entry of await page(accountId)) {
        if (!entry.isFolder) {
          paths.push(`${accountId}/${entry.name}`);
          continue;
        }
        for (const file of await page(`${accountId}/${entry.name}`)) {
          if (!file.isFolder) paths.push(`${accountId}/${entry.name}/${file.name}`);
        }
      }
      return paths;
    },

    async remove(paths: string[]): Promise<void> {
      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const { error } = await bucket.remove(paths.slice(i, i + REMOVE_BATCH));
        if (error) throw error;
      }
    },
  };
}

Deno.serve(async (req) => {
  // Which websites may read the answer is decided per request now, not handed out to
  // everybody with a star. A phone sends no Origin and is answered as before.
  const cors = corsFor(req);
  const reply = (body: Record<string, unknown>, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = pickKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');
  const secretKey = pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const authHeader = req.headers.get('Authorization');
  if (!url || !publicKey || !secretKey) return reply({ error: 'server_not_set_up' }, 500);
  if (!authHeader) return reply({ error: 'not_signed_in' }, 401);

  let body: { confirm?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* handled below */
  }
  // Deleting everything must never be one stray request away. The app says so out loud.
  if (body.confirm !== true) return reply({ error: 'not_confirmed' }, 400);

  // WHO IS ASKING comes from their login. A person can only ever delete themselves: there is
  // no id in the request, so there is nothing to point at somebody else.
  const asPerson = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await asPerson.auth.getUser();
  if (!who?.user) return reply({ error: 'not_signed_in' }, 401);

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // Deleting an account is slow and cannot be undone. Counted low on purpose: nobody does
  // this repeatedly, so a flood of attempts is somebody probing rather than a customer.
  try {
    await underRateLimit(admin, 'account_delete', who.user.id, null);
  } catch (e) {
    if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
    throw e;
  }

  try {
    const result = await runDeleteAccount({
      db: admin as unknown as Db,
      files: makeFiles(admin),
      deleteLogin: async (userId: string) => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
      },
      userId: who.user.id,
    });
    return reply({ ok: true, workspaces_deleted: result.workspacesDeleted, files_removed: result.filesRemoved });
  } catch (e) {
    if (e instanceof AccountError) return reply({ ok: false, message: e.message }, 200);
    console.error('account delete failed', e instanceof Error ? e.name : 'error');
    return reply({ ok: false, message: MESSAGES.problem }, 200);
  }
});
