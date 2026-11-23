// Supabase server function: deletes notes that are past their keeping time, and tidies up
// old copies of people's data.
//
// IT IS A DRY RUN UNLESS ASKED OUT LOUD. Called with nothing it changes NOTHING and reports
// what it would do. Deleting has to be asked for: { "confirm": true }.
//
// WHY THIS IS A SERVER FUNCTION AND NOT JUST SQL. Database rules do not reach storage. A
// scheduled job written in SQL alone would delete the rows and leave every recording sitting
// in the bucket for ever, with nothing left pointing at them -- which is worse than not
// deleting at all, because the screen would say the note was gone. This empties the files
// FIRST, then the rows, the same order deleting an account already uses.
//
// NOBODY CAN CALL THIS BUT OUR OWN SERVER. It is opened with the project's secret key, which
// only our own scheduled job holds.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsFor, isOurOwnServer, pickKey } from '../_shared/guard.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const NOTES_BUCKET = 'notes-files';
const EXPORTS_BUCKET = 'account-exports';
/** How old a copy of somebody's data has to be before it is tidied away. */
const EXPORT_HOURS = 24;

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const reply = (body: Record<string, unknown>, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const secretKey = pickKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
  const authHeader = req.headers.get('Authorization');
  if (!url || !secretKey) return reply({ error: 'server_not_set_up' }, 500);
  if (!authHeader) return reply({ error: 'not_allowed' }, 401);

  // There is no person here, so there is nothing to check a person against. Only our own
  // server may run this, and the key is how it says so.
  if (!(await isOurOwnServer(authHeader, secretKey))) return reply({ error: 'not_allowed' }, 403);

  let body: { confirm?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    /* an empty body means a dry run, which is the safe default */
  }
  const reallyDelete = body.confirm === true;

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  try {
    // --- notes past their keeping time ---------------------------------------------------
    // The dry run is asked first either way, so the answer says what WOULD go even when
    // nothing is being deleted.
    const { data: due, error: dueError } = await admin.rpc('run_retention', { p_dry_run: true });
    if (dueError) throw new Error('run_retention_failed');
    const notes = (due ?? []) as { meeting_id: string; file_path: string | null }[];

    let filesRemoved = 0;
    if (reallyDelete && notes.length > 0) {
      // FILES FIRST. Once the rows are gone nothing knows the paths any more, and the
      // recordings would sit in a private bucket nobody could ever see or empty.
      const paths = notes.map((n) => n.file_path).filter((p): p is string => !!p);
      if (paths.length > 0) {
        const { error } = await admin.storage.from(NOTES_BUCKET).remove(paths);
        // If the files will not go, nothing is deleted. The sweep runs again tomorrow.
        if (error) throw new Error('files_would_not_go');
        filesRemoved = paths.length;
      }
      const { error } = await admin.rpc('run_retention', { p_dry_run: false });
      if (error) throw new Error('run_retention_failed');
    }

    // --- old copies of people's data ------------------------------------------------------
    const { data: oldExports } = await admin.rpc('old_exports', {
      p_dry_run: !reallyDelete,
      p_older_than_hours: EXPORT_HOURS,
    });
    const exports = (oldExports ?? []) as { path: string }[];
    if (reallyDelete && exports.length > 0) {
      await admin.storage.from(EXPORTS_BUCKET).remove(exports.map((e) => e.path));
    }

    return reply({
      ok: true,
      dry_run: !reallyDelete,
      notes_due: notes.length,
      notes_deleted: reallyDelete ? notes.length : 0,
      files_removed: filesRemoved,
      exports_due: exports.length,
      exports_deleted: reallyDelete ? exports.length : 0,
    });
  } catch (e) {
    // The KIND of problem only. Never a path, a note or anybody's words.
    console.error('retention sweep failed', e instanceof Error ? e.name : 'error');
    return reply({ ok: false, message: 'The tidy-up could not finish. Nothing was deleted.' });
  }
});
