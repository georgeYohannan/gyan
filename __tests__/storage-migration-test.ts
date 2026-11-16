import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const file = fs.readdirSync(dir).find((f) => f.includes('notes_storage_and_create_note'));
const sql = fs.readFileSync(path.join(dir, file!), 'utf8');

describe('notes storage migration (static checks)', () => {
  test('the bucket is private with a 50 MB cap', () => {
    expect(sql).toContain("'notes-files'");
    expect(sql).toMatch(/values \(\s*'notes-files',\s*'notes-files',\s*false,\s*52428800/);
  });

  test('every storage rule checks the account id at the start of the path', () => {
    const policies = [...sql.matchAll(/create policy "[^"]+" on storage\.objects[\s\S]*?;\n/g)].map((m) => m[0]);
    expect(policies).toHaveLength(4);
    for (const p of policies) {
      expect(p).toContain('to authenticated');
      expect(p).toContain("bucket_id = 'notes-files'");
      expect(p).toContain('private.can_use_file_path(name)');
    }
    expect(sql).not.toMatch(/on storage\.objects[^;]*to (anon|public)/);
  });

  test('the path check needs an account id and uses membership', () => {
    expect(sql).toContain('private.is_account_member(split_part(file_path');
  });

  test('the limit is read from the plans table and never hard coded', () => {
    expect(sql).toContain('p.meetings_per_month');
    expect(sql).not.toMatch(/(used|limit)\s*(>=|=|>)\s*\d/);
  });

  test('pasted text skips the limit, uploads do not', () => {
    expect(sql).toMatch(/if p_source = 'upload' then\s+perform private\.assert_under_limit/);
  });

  test('only signed in people can use the 4 doors, and every function pins its search path', () => {
    for (const fn of ['create_note(uuid, uuid, text, text, text)', 'mark_note_queued(uuid)', 'mark_note_failed(uuid, text)', 'restart_note_upload(uuid)']) {
      expect(sql).toContain(`revoke execute on function public.${fn} from public, anon`);
      expect(sql).toContain(`grant execute on function public.${fn} to authenticated`);
    }
    expect((sql.match(/security definer/g) ?? []).length).toBe((sql.match(/set search_path = ''/g) ?? []).length);
  });

  test('the app still cannot write to meetings directly', () => {
    expect(sql).not.toMatch(/create policy[^;]*on public\.meetings/);
    expect(sql).not.toMatch(/grant [^;]*(insert|update|delete)[^;]*on public\.meetings/);
  });
});

describe('app code', () => {
  test('the monthly limit is never hard coded in app code', () => {
    const files: string[] = [];
    const walk = (d: string) =>
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
    walk(path.join(__dirname, '..', 'src'));
    for (const f of files.filter((x) => /\.tsx?$/.test(x))) {
      const code = fs.readFileSync(f, 'utf8');
      expect(code).not.toMatch(/meetings_per_month\s*[:=]\s*\d/);
      expect(code).not.toMatch(/limit\s*=\s*5\b/);
    }
  });
});
