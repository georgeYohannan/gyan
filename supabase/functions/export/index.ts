// Supabase server function: hands somebody a copy of everything gyan holds about them.
//
// It runs on the server because it reads across many tables and reaches into the private
// files bucket. Every row it gathers is one the person could already read; what this adds is
// putting it all in one place, in one file, in a form they can keep.
//
// Nothing new to set up: no key, no outside service.
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  RATE_LIMIT_MESSAGE,
  RateLimited,
  corsFor,
  pickKey,
  underRateLimit,
} from '../_shared/guard.ts';
import { ExportError, MESSAGES, runExport, type Db, type Files } from './pipeline.ts';
import {
  EXPORT_FOLDER,
  EXPORT_BUCKET,
  EXPORT_LINK_SECONDS,
  FILE_LINK_SECONDS,
  MAX_ZIPPED_BYTES,
  STORAGE_BUCKET,
} from './settings.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

Deno.serve(async (req) => {
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

  // WHO IS ASKING comes from their login. There is no id in the request, so there is nothing
  // to point at somebody else -- the same shape as deleting an account.
  const asPerson = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await asPerson.auth.getUser();
  if (!who?.user) return reply({ error: 'not_signed_in' }, 401);

  // Which account are they on? Read under THEIR login, so the database rules decide.
  const { data: membership } = await asPerson
    .from('account_members')
    .select('account_id')
    .eq('user_id', who.user.id)
    .limit(1)
    .maybeSingle<{ account_id: string }>();
  if (!membership?.account_id) return reply({ ok: false, message: MESSAGES.noAccount });

  const admin = createClient(url, secretKey, { auth: { persistSession: false } });

  // An export is slow and large, so it is counted low. The number is in security_settings.
  try {
    await underRateLimit(admin, 'data_export', who.user.id, membership.account_id);
  } catch (e) {
    if (e instanceof RateLimited) return reply({ ok: false, message: RATE_LIMIT_MESSAGE }, 429);
    throw e;
  }

  const files: Files = {
    download: async (path) => {
      const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    signedUrl: async (path, seconds) => {
      const { data, error } = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(path, seconds);
      return error || !data?.signedUrl ? null : data.signedUrl;
    },
    // The finished copy goes in its own bucket, which has no rules at all, so nobody can
    // reach it through the app. Recordings are READ from notes-files above; only the
    // export itself is written here.
    upload: async (path, bytes, contentType) => {
      const { error } = await admin.storage
        .from(EXPORT_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (error) throw new ExportError(MESSAGES.problem);
    },
    signedExportUrl: async (path, seconds) => {
      const { data, error } = await admin.storage.from(EXPORT_BUCKET).createSignedUrl(path, seconds);
      return error || !data?.signedUrl ? null : data.signedUrl;
    },
  };

  try {
    const result = await runExport({
      db: admin as unknown as Db,
      files,
      userId: who.user.id,
      accountId: membership.account_id,
      email: who.user.email ?? '',
      bucket: STORAGE_BUCKET,
      maxZippedBytes: MAX_ZIPPED_BYTES,
      exportLinkSeconds: EXPORT_LINK_SECONDS,
      fileLinkSeconds: FILE_LINK_SECONDS,
      exportFolder: EXPORT_FOLDER,
    });

    // Remember the file itself, so it can be tidied up. An export is the most
    // concentrated copy of somebody's information there is, and there is no reason to keep
    // one once its link has expired: another takes seconds to make.
    await admin.rpc('record_export', {
      p_account_id: membership.account_id,
      p_user_id: who.user.id,
      p_path: result.path,
      p_bytes: result.bytes,
    });

    // Tidy up anything older than a day, now, while we are here. Doing it on the way out of
    // an export means it needs nothing scheduled and no extra moving part -- and the person
    // most likely to make one is the person most likely to have made the last one.
    try {
      const { data: old } = await admin.rpc('old_exports', { p_dry_run: false, p_older_than_hours: 24 });
      for (const row of (old ?? []) as { path: string }[]) {
        await admin.storage.from(EXPORT_BUCKET).remove([row.path]);
      }
    } catch (e) {
      // Tidying up must never stop somebody getting their own data.
      console.error('tidying up old exports failed', e instanceof Error ? e.name : 'error');
    }

    // Write down that a copy was taken. This is one of the things an account owner most
    // needs to be able to see afterwards.
    await admin.rpc('record_audit', {
      p_account_id: membership.account_id,
      p_actor_user_id: who.user.id,
      p_action: 'data_export',
      p_target_type: 'account',
      p_detail: { files_included: result.filesIncluded, files_linked: result.filesLinked },
    });

    return reply({ ok: true, ...result });
  } catch (e) {
    // The KIND of problem only. Never the person, their notes, or where the file went.
    console.error('export failed', e instanceof Error ? e.name : 'error');
    const message = e instanceof ExportError ? e.message : MESSAGES.problem;
    return reply({ ok: false, message });
  }
});
