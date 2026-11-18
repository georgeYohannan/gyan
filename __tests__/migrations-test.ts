import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const sql = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
  .join('\n');

const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

/** Tables that only server functions may write to. */
const serverOnly = [
  'plans', 'usage', 'ai_usage', 'translations', 'summaries', 'mind_maps', 'transcript_segments',
  'accounts', 'account_members', 'meetings',
];

describe('database migration files', () => {
  test('create the 16 tables from the data model (chunks waits for the embedding model)', () => {
    expect(tables.sort()).toEqual([
      'account_members', 'accounts', 'action_items', 'ai_usage', 'chat_messages', 'chat_threads',
      'integrations', 'invites', 'meetings', 'mind_maps', 'plans', 'profiles', 'summaries',
      'transcript_segments', 'translations', 'usage',
    ]);
  });

  test.each(tables)('%s has Row Level Security turned on', (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  test('every table has at least one read rule', () => {
    for (const t of tables) expect(sql).toMatch(new RegExp(`create policy "[^"]+" on public\\.${t}\\s+for select`));
  });

  test.each(serverOnly)('the app cannot write to %s', (table) => {
    expect(sql).not.toMatch(new RegExp(`create policy "[^"]+" on public\\.${table}\\s+for (insert|update|delete|all)`));
    expect(sql).not.toMatch(new RegExp(`grant [^;]*(insert|update|delete)[^;]* on public\\.${table} to`));
  });

  test('the app can never change is_admin', () => {
    expect(sql).toContain('grant update (display_name, preferred_language) on public.profiles');
    expect(sql).not.toMatch(/grant update[^;]*is_admin/);
  });

  test('signed out visitors get no table access', () => {
    expect(sql).toContain('revoke all on all tables in schema public from anon, authenticated');
    expect(sql).not.toMatch(/grant [^;]* to anon/);
    expect(sql).not.toMatch(/create policy[^;]*to anon/);
  });

  test('the Free plan has 5 meetings a month and the sign up trigger looks it up by name', () => {
    expect(sql).toMatch(/values \('Free', 5, 1\)/);
    expect(sql).toContain("where name = 'Free'");
  });

  test('helper functions pin the search path', () => {
    const fns = sql.match(/security definer/g) ?? [];
    const pinned = sql.match(/set search_path = ''/g) ?? [];
    expect(pinned.length).toBeGreaterThanOrEqual(fns.length);
  });

  test('no secret keys are written in the migrations', () => {
    // (The words service_role appear only as the name of the server's permission level, never as a key.)
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sb_secret/);
  });
});

describe('transcription migration', () => {
  const file = fs.readdirSync(dir).find((f) => f.includes('transcription'))!;
  const t = fs.readFileSync(path.join(dir, file), 'utf8');

  test('it only adds things. It deletes no table, column, or row of data', () => {
    expect(t).not.toMatch(/drop (table|column|schema|function)/i);
    expect(t).not.toMatch(/truncate/i);
    // The only delete is clearing old lines of the SAME note before saving new ones (a retry).
    expect(t.match(/delete from/gi)).toHaveLength(1);
    expect(t).toContain('delete from public.transcript_segments s where s.meeting_id = p_meeting_id');
  });

  test.each([
    'claim_transcription(uuid, uuid)',
    'finish_transcription(uuid, text, numeric, numeric, jsonb)',
    'fail_transcription(uuid, text)',
  ])('only the server can run %s', (fn) => {
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon, authenticated`);
    expect(t).toContain(`grant execute on function public.${fn} to service_role`);
    expect(t).not.toMatch(new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to (anon|authenticated)`));
  });

  // This file is history: the summaries migration later replaces finish_transcription so that the
  // note goes to Summarizing and the +1 happens at the very end. See the "summaries migration"
  // tests below for what happens now.
  test('finishing logs the Deepgram cost', () => {
    expect(t).toMatch(/insert into public\.ai_usage[\s\S]*'deepgram'/);
  });

  test('failing never touches usage or ai_usage', () => {
    const fail = t.slice(t.indexOf('create function public.fail_transcription'));
    expect(fail).not.toMatch(/usage/);
    expect(fail).toContain("set status = 'failed'");
  });

  test('starting checks the plan limit from the plans table and moves only Queued or Failed notes', () => {
    expect(t).toContain('private.assert_under_limit');
    expect(t).toContain("m.status in ('queued', 'failed')");
    expect(t).toContain("set status = 'transcribing'");
  });

  test('every new function pins the search path', () => {
    expect(t.match(/security definer/g)).toHaveLength(3);
    expect(t.match(/set search_path = ''/g)).toHaveLength(3);
  });
});

describe('summaries migration', () => {
  const file = fs.readdirSync(dir).find((f) => f.includes('summaries'))!;
  const t = fs.readFileSync(path.join(dir, file), 'utf8');

  test('it only adds things. It deletes no table, column, or row of other data', () => {
    expect(t).not.toMatch(/drop (table|column|schema|function)/i);
    expect(t).not.toMatch(/truncate/i);
    // The only deletes clear the old lines, summary and to-dos of the SAME note before saving new
    // ones (which is what a retry needs).
    expect(t.match(/delete from/gi)).toHaveLength(3);
    expect(t).toContain('delete from public.transcript_segments s where s.meeting_id = p_meeting_id');
    expect(t).toContain('delete from public.summaries s where s.meeting_id = p_meeting_id');
    expect(t).toContain('delete from public.action_items a where a.meeting_id = p_meeting_id');
  });

  test.each([
    'claim_summary(uuid, uuid)',
    'finish_summary(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric)',
    'fail_summary(uuid, text)',
  ])('only the server can run %s', (fn) => {
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon, authenticated`);
    expect(t).toContain(`grant execute on function public.${fn} to service_role`);
    expect(t).not.toMatch(new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to (anon|authenticated)`));
  });

  test('the transcript step now hands the note on to the summary step, and does NOT count it', () => {
    expect(t).toContain('create or replace function public.finish_transcription');
    const finish = t.slice(t.indexOf('create or replace function public.finish_transcription'), t.indexOf('create function public.claim_summary'));
    expect(finish).toContain("set status = 'summarizing'");
    expect(finish).not.toMatch(/insert into public\.usage/);
    // The Deepgram cost row stays here, because that money was already spent.
    expect(finish).toMatch(/insert into public\.ai_usage[\s\S]*'deepgram'/);
  });

  test('the meeting counts only when it becomes Ready, only once, and never for pasted text', () => {
    const finish = t.slice(t.indexOf('create function public.finish_summary'), t.indexOf('create function public.fail_summary'));
    expect(finish).toContain("set status = 'ready'");
    expect(finish).toMatch(/if note\.counted_at is null and note\.source <> 'text' then[\s\S]*insert into public\.usage/);
    expect(finish).toMatch(/insert into public\.usage[\s\S]*meetings_used \+ 1/);
    expect(finish).toMatch(/insert into public\.ai_usage[\s\S]*'anthropic'/);
    expect(t).toContain('add column if not exists counted_at timestamptz');
  });

  test('starting checks the plan limit from the plans table and locks the note', () => {
    const claim = t.slice(t.indexOf('create function public.claim_summary'), t.indexOf('create function public.finish_summary'));
    expect(claim).toContain('private.assert_under_limit');
    expect(claim).toContain("set status = 'summarizing'");
    expect(claim).toContain('summary_started_at = now()');
    // A run that is already going is left alone, so we never pay for two summaries of one note.
    expect(claim).toMatch(/summary_started_at > \(now\(\) - interval '3 minutes'\)/);
    // An upload with no transcript has nothing to summarize.
    expect(claim).toContain("raise exception 'no_transcript'");
  });

  test('failing keeps the transcript and never touches usage', () => {
    const fail = t.slice(t.indexOf('create function public.fail_summary'));
    expect(fail).not.toMatch(/public\.usage/);
    expect(fail).not.toMatch(/transcript_segments/);
    expect(fail).toContain("set status = 'failed'");
  });

  test('the app may tick an action item off, and change nothing else', () => {
    expect(t).toContain('grant update (done) on public.action_items to authenticated');
    expect(t).toMatch(/create policy "[^"]+" on public\.action_items\s+for update/);
    expect(t).toContain('private.can_read_meeting(meeting_id)');
    // No other column, and no insert or delete, is opened up to the app.
    expect(t).not.toMatch(/grant (insert|delete)[^;]* on public\.action_items/);
    expect(t).not.toMatch(/grant update \((?!done\))/);
  });

  test('every new function pins the search path', () => {
    expect(t.match(/security definer/g)).toHaveLength(4);
    expect(t.match(/set search_path = ''/g)).toHaveLength(4);
  });
});
