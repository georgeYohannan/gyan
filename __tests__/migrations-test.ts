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
    expect(sql).not.toMatch(/service_role|eyJ[A-Za-z0-9_-]{20,}|sb_secret/);
  });
});
