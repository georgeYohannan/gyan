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
  'accounts', 'account_members', 'meetings', 'chat_threads', 'chat_messages', 'email_log',
];

describe('database migration files', () => {
  test('create the 23 tables from the data model (chunks waits for the embedding model)', () => {
    expect(tables.sort()).toEqual([
      'account_members', 'account_privacy', 'accounts', 'action_items', 'ai_usage', 'audit_log',
      'chat_messages', 'chat_threads', 'consent_records', 'email_log', 'export_log',
      'integrations', 'invites', 'meetings', 'mind_maps', 'plans', 'profiles', 'rate_limits',
      'security_settings', 'summaries', 'transcript_segments', 'translations', 'usage',
    ]);
  });

  test.each(tables)('%s has Row Level Security turned on', (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  test('every table either has a read rule, or is shut to the app completely', () => {
    // Most tables are read by the app, and each needs a rule saying who may read what.
    // A few are purely the server's business (the rate limit counters), and those must
    // have NO permission at all rather than a rule nobody can reach. Both are safe; a
    // table with a permission and no rule would not be.
    for (const t of tables) {
      const hasReadRule = new RegExp(`create policy "[^"]+" on public\\.${t}\\s+for select`).test(sql);
      if (hasReadRule) continue;
      // No read rule, so it must be shut completely: nothing granted to the app, and the
      // permissions Supabase hands out by default explicitly taken back.
      expect(new RegExp(`grant [^;]* on public\\.${t} to (anon|authenticated)`).test(sql)).toBe(false);
      expect(sql).toContain(`revoke all on public.${t} from anon, authenticated`);
    }
  });

  test.each(serverOnly)('the app cannot write to %s', (table) => {
    expect(sql).not.toMatch(new RegExp(`create policy "[^"]+" on public\\.${table}\\s+for (insert|update|delete|all)`));
    expect(sql).not.toMatch(new RegExp(`grant [^;]*(insert|update|delete)[^;]* on public\\.${table} to`));
  });

  test('the app can never change is_admin', () => {
    expect(sql).toContain('grant update (display_name, preferred_language) on public.profiles');
    expect(sql).not.toMatch(/grant update[^;]*is_admin/);
  });

  // These two are what a NEW person starts with. They used to be checked against the live test
  // project, which was wrong: the founder is told to switch plans and to make themselves an
  // admin while testing, so doing as instructed broke the test (2026-11-20). Checked here
  // instead, against the SQL, where using the app cannot move them.
  test('a brand new person starts as an ordinary person, not an admin', () => {
    expect(sql).toContain('is_admin boolean not null default false');
  });

  test('a brand new person starts on the Free plan', () => {
    expect(sql).toMatch(/select id into free_plan_id[\s\S]{0,200}where name = 'Free' and is_active/);
    expect(sql).toContain('insert into public.accounts (owner_id, plan_id)');
    expect(sql).toContain('values (new.id, free_plan_id)');
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

describe('side chat migration', () => {
  const file = fs.readdirSync(dir).find((f) => f.includes('side_chat'))!;
  const t = fs.readFileSync(path.join(dir, file), 'utf8');

  test('it deletes no table, column, or row of data', () => {
    expect(t).not.toMatch(/drop (table|column|schema|function)/i);
    expect(t).not.toMatch(/truncate/i);
    expect(t).not.toMatch(/delete from/i);
    // The one thing it does replace is a read rule, named here on purpose, to make the chat
    // MORE private than it was. See the comment at the top of the migration.
    expect(t.match(/drop policy/gi)).toHaveLength(1);
    expect(t).toContain('drop policy if exists "Read chat threads of own accounts" on public.chat_threads');
    expect(t).toContain('create policy "Read own chat threads" on public.chat_threads');
  });

  test('THE DAILY LIMIT COMES FROM THE PLANS TABLE, never from code', () => {
    expect(t).toContain('alter table public.plans');
    expect(t).toContain('add column if not exists chat_messages_per_day integer');
    // The one and only place a number is written is the starting value for a plan row.
    const counter = t.slice(t.indexOf('create function private.chat_questions_left'), t.indexOf('create function public.claim_chat_message'));
    expect(counter).toContain('p.chat_messages_per_day');
    expect(counter).toContain('join public.plans p on p.id = a.plan_id');
    expect(counter).not.toMatch(/\b(10|20|50|100)\b/);
  });

  test('a person can only ever read THEIR OWN chat, not a teammate\'s', () => {
    const helper = t.slice(t.indexOf('create or replace function private.can_read_thread'), t.indexOf('drop policy'));
    expect(helper).toContain('t.user_id = (select auth.uid())');
    expect(t).toContain('create policy "Read own chat threads" on public.chat_threads\n  for select to authenticated using (user_id = (select auth.uid()))');
  });

  test('the day is counted from midnight UTC, like the monthly meeting count', () => {
    expect(t).toContain("date_trunc('day', now() at time zone 'utc')");
    expect(t).toContain("cm.role = 'user'");
  });

  test('asking and checking the limit happen in ONE step, so two taps cannot slip past it', () => {
    const claim = t.slice(t.indexOf('create function public.claim_chat_message'), t.indexOf('create function public.claim_chat_retry'));
    expect(claim).toContain('private.chat_questions_left');
    expect(claim).toContain("raise exception 'limit_reached'");
    expect(claim).toContain("raise exception 'not_allowed'");
    expect(claim).toContain('insert into public.chat_messages');
    // The limit is checked BEFORE the question is saved.
    expect(claim.indexOf('chat_questions_left')).toBeLessThan(claim.indexOf('insert into public.chat_messages'));
  });

  test('a retry never saves a second question, so it costs nobody an extra one', () => {
    const retry = t.slice(t.indexOf('create function public.claim_chat_retry'), t.indexOf('create function public.finish_chat_message'));
    expect(retry).not.toMatch(/insert into/i);
    // It still refuses to re-open somebody else's question.
    expect(retry).toContain('thread.user_id <> p_user_id');
  });

  test('one thread per person per note, so the chat is still there tomorrow', () => {
    expect(t).toContain('create unique index if not exists chat_threads_one_per_person_per_note_idx');
    expect(t).toContain('on public.chat_threads (user_id, meeting_id)');
  });

  test('saving an answer logs what it cost', () => {
    const finish = t.slice(t.indexOf('create function public.finish_chat_message'));
    expect(finish).toContain('insert into public.ai_usage');
    expect(finish).toContain("'chat', 'anthropic'");
  });

  test.each([
    'claim_chat_message(uuid, uuid, text)',
    'claim_chat_retry(uuid, uuid)',
    'finish_chat_message(uuid, uuid, uuid, text, jsonb, text, numeric, numeric)',
  ])('only the server can run %s', (fn) => {
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon, authenticated`);
    expect(t).toContain(`grant execute on function public.${fn} to service_role`);
    expect(t).not.toMatch(new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to (anon|authenticated)`));
  });

  test('every new function pins the search path', () => {
    expect(t.match(/security definer/g)).toHaveLength(5);
    expect(t.match(/set search_path = ''/g)).toHaveLength(5);
  });
});

describe('translation migration', () => {
  const file = fs.readdirSync(dir).find((f) => f.includes('translation'))!;
  const t = fs.readFileSync(path.join(dir, file), 'utf8');

  test('it deletes no table, column, or row of data', () => {
    expect(t).not.toMatch(/drop (table|column|schema|function)/i);
    expect(t).not.toMatch(/truncate/i);
    expect(t).not.toMatch(/delete from/i);
    expect(t).toContain('This file only ADDS things. It deletes nothing');
  });

  test('it changes no existing rule, because the translations table already has its own', () => {
    expect(t).not.toMatch(/create policy/i);
    expect(t).not.toMatch(/drop policy/i);
    expect(t).not.toMatch(/alter table/i);
  });

  test('starting a translation checks the person belongs to the account first', () => {
    const claim = t.slice(
      t.indexOf('create function public.claim_translation'),
      t.indexOf('create function public.save_translation'),
    );
    expect(claim).toContain('public.account_members');
    expect(claim).toContain("raise exception 'not_allowed'");
    // The membership check comes before anything is read or handed back.
    expect(claim.indexOf('account_members')).toBeLessThan(claim.indexOf('public.translations'));
  });

  test('a translation that is already saved is handed straight back, so it is never bought twice', () => {
    const claim = t.slice(
      t.indexOf('create function public.claim_translation'),
      t.indexOf('create function public.save_translation'),
    );
    expect(claim).toContain('select t.content into saved');
    expect(claim).toContain('from public.translations t');
    expect(claim).toContain('t.kind = p_kind and t.source_id = found_source and t.language = btrim(p_language)');
  });

  test('only a summary or a transcript can be translated', () => {
    expect(t).toContain("p_kind not in ('summary', 'transcript')");
    expect(t).toContain("raise exception 'bad_kind'");
  });

  test('saving a translation also logs what it cost, in the same step', () => {
    const save = t.slice(t.indexOf('create function public.save_translation'));
    expect(save).toContain('insert into public.translations');
    expect(save).toContain('on conflict (kind, source_id, language) do update');
    expect(save).toContain('insert into public.ai_usage');
    expect(save).toContain("'translation', 'anthropic'");
    // The cost row is written next to the translation, never before it.
    expect(save.indexOf('insert into public.translations')).toBeLessThan(save.indexOf('insert into public.ai_usage'));
  });

  test.each([
    'claim_translation(uuid, uuid, text, text)',
    'save_translation(uuid, uuid, text, uuid, text, text, numeric, numeric)',
  ])('only the server can run %s', (fn) => {
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon, authenticated`);
    expect(t).toContain(`grant execute on function public.${fn} to service_role`);
    expect(t).not.toMatch(new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to (anon|authenticated)`));
  });

  test('every new function pins the search path', () => {
    expect(t.match(/security definer/g)).toHaveLength(2);
    expect(t.match(/set search_path = ''/g)).toHaveLength(2);
  });
});

describe('recap email migration', () => {
  const file = fs.readdirSync(dir).find((f) => f.includes('recap_email'))!;
  const t = fs.readFileSync(path.join(dir, file), 'utf8');

  test('it deletes no table, column, or row of data', () => {
    expect(t).not.toMatch(/drop (table|column|schema|function)/i);
    expect(t).not.toMatch(/truncate/i);
    expect(t).not.toMatch(/delete from/i);
    expect(t).toContain('This file only ADDS things. It deletes nothing');
  });

  test('it changes no existing rule on any table that already had one', () => {
    expect(t).not.toMatch(/drop policy/i);
    // The only policy it writes is the read rule for its own new table.
    expect(t.match(/create policy/gi)).toHaveLength(1);
    expect(t).toContain('create policy "Read email_log of own accounts" on public.email_log');
  });

  test('every email is written down, and the app can read the log but never write it', () => {
    expect(t).toContain('create table public.email_log');
    for (const col of [
      'account_id', 'meeting_id', 'recipient_user_id', 'recipient_email', 'language',
      'translated', 'result', 'provider_id', 'error_message', 'sent_by', 'auto', 'created_at',
    ]) {
      expect(t).toContain(col);
    }
    expect(t).toContain("result text not null check (result in ('sent', 'failed'))");
    expect(t).toContain('grant select on public.email_log to authenticated');
    expect(t).not.toMatch(/grant [^;]*(insert|update|delete)[^;]* on public\.email_log/);
  });

  test('only people on the same account can read the log', () => {
    expect(t).toContain('private.is_account_member(account_id)');
    expect(t).toContain('revoke all on public.email_log from anon, authenticated');
  });

  test('the settings have ONE row per account, so saving them overwrites cleanly', () => {
    expect(t).toContain('create unique index if not exists integrations_account_kind_idx');
    expect(t).toContain('on public.integrations (account_id, kind)');
  });

  test('the defaults are the owner only, with no automatic sending', () => {
    // Written in 3 places on purpose: the gate, the read door and the save door. All agree.
    expect(t.match(/'to_owner', coalesce\(\(/g)).toHaveLength(2);
    expect(t.match(/coalesce\(\(saved ->> 'to_owner'\)::boolean, true\)/g)).toHaveLength(2);
    expect(t).toContain("coalesce((saved ->> 'to_members')::boolean, false)");
    expect(t).toContain("coalesce((saved ->> 'auto_send')::boolean, false)");
  });

  test('a recap is refused unless the person is on the account and the note is finished', () => {
    const claim = t.slice(t.indexOf('create function public.claim_recap'), t.indexOf('create function public.log_email'));
    expect(claim).toContain('public.account_members');
    expect(claim).toContain("raise exception 'not_allowed'");
    expect(claim).toContain("if note.status <> 'ready' then");
    expect(claim).toContain("raise exception 'not_ready'");
    expect(claim).toContain("raise exception 'no_summary'");
    // The person is checked before anything is read or handed back.
    expect(claim.indexOf('public.account_members am')).toBeLessThan(
      claim.indexOf('select * into the_summary from public.summaries s'),
    );
  });

  test('THE TO-DOS COME BACK IN THE SAME ORDER THE APP AND THE TRANSLATOR USE', () => {
    // A translated to-do is lined up against its original by position. If this order differed
    // from the one in supabase/functions/translate/pipeline.ts, a translated to-do would be
    // shown against the wrong person's name, and nothing would look broken.
    const claim = t.slice(t.indexOf('create function public.claim_recap'), t.indexOf('create function public.log_email'));
    expect(claim).toContain('order by a.start_ms nulls last, a.id');

    const translator = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'functions', 'translate', 'pipeline.ts'),
      'utf8',
    );
    expect(translator).toContain(".order('start_ms', { ascending: true })");
    expect(translator).toContain(".order('id', { ascending: true })");
  });

  test('the automatic send only runs when it is switched on, and only once per note', () => {
    const claim = t.slice(t.indexOf('create function public.claim_recap'), t.indexOf('create function public.log_email'));
    expect(claim).toContain("raise exception 'auto_off'");
    expect(claim).toContain("raise exception 'already_sent'");
    expect(claim).toMatch(/from public\.email_log e[\s\S]*e\.auto and e\.result = 'sent'/);
  });

  test('the only addresses that exist come from the account, never from anything typed in', () => {
    const claim = t.slice(t.indexOf('create function public.claim_recap'), t.indexOf('create function public.log_email'));
    expect(claim).toContain('from public.account_members am');
    expect(claim).toContain('join auth.users u on u.id = am.user_id');
    expect(claim).toContain('where am.account_id = note.account_id');
    // Each person comes back with their own language, so the email can be in it.
    expect(claim).toContain("'language', coalesce(nullif(btrim(coalesce(pr.preferred_language, '')), ''), 'en')");
  });

  test('ONLY THE ACCOUNT OWNER can change the settings, and it says so out loud', () => {
    const save = t.slice(t.indexOf('create function public.save_recap_settings'));
    expect(save).toContain("am.role = 'owner'");
    expect(save).toContain("raise exception 'not_owner'");
    expect(save).toContain('auth.uid()');
    // Only the three switches are ever stored. Anything else sent in is thrown away.
    expect(save).toContain('clean := jsonb_build_object(');
    expect(save).toContain("on conflict (account_id, kind) do update set settings = excluded.settings");
  });

  test('a team member can still SEE the settings, without being able to read a token', () => {
    const read = t.slice(t.indexOf('create function public.get_recap_settings'), t.indexOf('create function public.save_recap_settings'));
    expect(read).toContain('is_owner');
    expect(read).toContain('auth.uid()');
    // It hands back the 3 switches only, never the whole integrations row.
    expect(read).not.toMatch(/select i\.\*/);
    expect(read).toContain('select i.settings into saved');
  });

  test.each([
    'claim_recap(uuid, uuid, boolean)',
    'log_email(uuid, uuid, uuid, text, text, boolean, text, text, text, uuid, boolean)',
  ])('only the server can run %s', (fn) => {
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon, authenticated`);
    expect(t).toContain(`grant execute on function public.${fn} to service_role`);
    expect(t).not.toMatch(new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to (anon|authenticated)`));
  });

  test.each(['get_recap_settings()', 'save_recap_settings(jsonb)'])(
    'the settings screen can run %s, and a signed out visitor cannot',
    (fn) => {
      expect(t).toContain(`grant execute on function public.${fn} to authenticated`);
      expect(t).toContain(`revoke execute on function public.${fn} from public, anon`);
    },
  );

  test('every new function pins the search path', () => {
    expect(t.match(/security definer/g)).toHaveLength(4);
    expect(t.match(/set search_path = ''/g)).toHaveLength(4);
  });
});

describe('settings and team migration', () => {
  const file = fs.readdirSync(dir).find((f) => f.includes('settings_and_team'))!;
  const t = fs.readFileSync(path.join(dir, file), 'utf8');
  /**
   * The same file with the explaining comments taken out.
   * Used where the test is about what the SQL does, not about what it says: a comment naming
   * a token or a limit is the point, a second copy in the code is the problem.
   */
  const code = (text: string) => text.replace(/^\s*--.*$/gm, '');

  test('IT IS HONEST ABOUT THE TWO THINGS IT CHANGES, and changes nothing else', () => {
    expect(t).toContain('THIS FILE BREAKS THE RULE THAT MIGRATIONS ONLY ADD THINGS, IN TWO PLACES');
    expect(t).not.toMatch(/drop (table|schema)/i);
    expect(t).not.toMatch(/truncate/i);
    expect(t).not.toMatch(/drop column/i);
    // The only constraint it touches is the one that made account deletion impossible.
    expect(t.match(/drop constraint/gi)).toHaveLength(1);
    expect(t).toContain('alter table public.meetings drop constraint if exists meetings_created_by_fkey');
  });

  test('A NOTE CAN NOW OUTLIVE THE PERSON WHO MADE IT, which is what lets anybody delete their account', () => {
    expect(t).toContain('alter column created_by drop not null');
    expect(t).toContain('foreign key (created_by) references public.profiles (id) on delete set null');
    // Nothing in this file ever changes who made a note, or hands a note to somebody else.
    expect(code(t)).not.toMatch(/update public\.meetings set/);
    // The one place a note is deleted at all is delete_note, which a person asks for by name.
    expect(code(t).match(/delete from public\.meetings/g)).toHaveLength(1);
    const deleteNote = t.slice(t.indexOf('create function public.delete_note'));
    expect(deleteNote).toContain('delete from public.meetings where id = p_meeting_id');
  });

  test('invites can only be made through the door that counts seats', () => {
    expect(t).toContain('revoke insert, update, delete on public.invites from authenticated');
    for (const name of ['Owner adds invites', 'Owner edits invites', 'Owner deletes invites']) {
      expect(t).toContain(`drop policy if exists "${name}" on public.invites`);
    }
    // Reading is deliberately left alone: a member can still see who has been invited.
    expect(t).not.toMatch(/drop policy if exists "Read invites of own accounts"/);
  });

  test('there is one owner per account, and the database is what keeps it that way', () => {
    expect(t).toContain('create unique index if not exists account_members_one_owner_idx');
    expect(t).toContain("where role = 'owner'");
  });

  test('handing the account over steps the old owner DOWN first, and keeps both records in step', () => {
    const fn = t.slice(
      t.indexOf('create function public.change_member_role'),
      t.indexOf('create function public.remove_member'),
    );
    expect(fn).toContain("raise exception 'not_owner'");
    expect(fn).toContain("raise exception 'bad_role'");
    expect(fn).toContain("raise exception 'last_owner'");
    expect(fn).toContain('update public.accounts set owner_id = p_user_id');
    expect(fn.indexOf("set role = 'member'")).toBeLessThan(fn.indexOf("set role = 'owner'"));
  });

  test('A REMOVED PERSON KEEPS THEIR WAY IN TO GYAN, and leaves their notes behind', () => {
    const fn = t.slice(
      t.indexOf('create function public.remove_member'),
      t.indexOf('create function public.accept_invite'),
    );
    expect(fn).toContain("raise exception 'cannot_remove_owner'");
    expect(fn).toContain("raise exception 'cannot_remove_yourself'");
    // Their notes and their chats are not touched at all.
    expect(fn).not.toMatch(/meetings/);
    expect(fn).not.toMatch(/chat_threads/);
    // And they are never left with no account, which would be an app with no way out.
    expect(fn).toContain('insert into public.accounts (owner_id, plan_id)');
    expect(fn).toContain("where p.name = 'Free' and p.is_active");
  });

  test('AN INVITE BELONGS TO AN ADDRESS, not to whoever is holding the link', () => {
    const fn = t.slice(
      t.indexOf('create function public.accept_invite'),
      t.indexOf('create function public.delete_note'),
    );
    expect(fn).toContain('from auth.users u where u.id = me');
    expect(fn).toContain('lower(btrim(inv.email)) <> my_email');
    expect(fn).toContain("raise exception 'wrong_email'");
    expect(fn).toContain("raise exception 'invite_expired'");
    expect(fn).toContain("interval '14 days'");
    expect(fn).toContain("raise exception 'seats_full'");
    // Four separate reasons a workspace is worth keeping, all checked BEFORE it is removed.
    for (const code of ['own_notes', 'own_team', 'own_invites', 'own_plan']) {
      expect(fn).toContain(`raise exception '${code}'`);
      expect(fn.indexOf(`'${code}'`)).toBeLessThan(fn.indexOf('delete from public.accounts'));
    }
  });

  test('the sign up trigger is NOT changed, so joining always needs the link', () => {
    // Joining on the sign up address alone would let somebody type a colleague's address into
    // the form and walk into their workspace without ever holding the invite.
    expect(t).not.toMatch(/function public\.handle_new_user/);
    expect(t).not.toMatch(/on_auth_user_created/);
    // And nothing here ever trusts what somebody typed into the sign up form.
    expect(code(t)).not.toMatch(/raw_user_meta_data/);
    expect(code(t)).not.toMatch(/new\.email/);
  });

  test('AN INVITE TOKEN IS MADE BY THE SERVER AND NEVER LEAVES IT', () => {
    const fn = t.slice(
      t.indexOf('create function public.claim_invite'),
      t.indexOf('create function public.discard_invite'),
    );
    // Core Postgres, so this works in a brand new project with no extension turned on.
    expect(fn).toContain('pg_catalog.gen_random_uuid()');
    expect(fn).not.toMatch(/gen_random_bytes/);
    for (const code of ['not_owner', 'bad_email', 'already_member', 'already_invited', 'seats_full']) {
      expect(fn).toContain(`raise exception '${code}'`);
    }
    // The seat check happens BEFORE the invite exists.
    expect(fn.indexOf('seats_full')).toBeLessThan(fn.indexOf('insert into public.invites'));

    // And the team list never hands a token back to the app.
    const list = code(
      t.slice(t.indexOf('create function public.list_team'), t.indexOf('create function public.claim_invite')),
    );
    expect(list).not.toMatch(/\btoken\b/);
  });

  test('the team list reads addresses the one way this project reads addresses', () => {
    const list = t.slice(t.indexOf('create function public.list_team'), t.indexOf('create function public.claim_invite'));
    expect(list).toContain('join public.profiles pr on pr.id = am.user_id');
    expect(list).toContain('join auth.users u on u.id = am.user_id');
    expect(list).toContain("'is_you', am.user_id = me");
  });

  test('ONE DOOR ANSWERS THE WHOLE PLAN SCREEN, and no limit is written in it', () => {
    const fn = t.slice(
      t.indexOf('create function public.get_plan_and_usage'),
      t.indexOf('create function public.set_test_plan'),
    );
    for (const col of [
      'p.meetings_per_month', 'p.chat_messages_per_day', 'p.seats_included',
      'p.max_meeting_minutes', 'p.features', 'p.is_test',
    ]) {
      expect(fn).toContain(col);
    }
    expect(fn).toContain('private.chat_questions_left(my_account, me)');
    expect(fn).toContain('private.seats_used(my_account)');
    // Not one limit is written into this function.
    expect(fn).not.toMatch(/\b(5|20|50|100|200|500)\b/);
  });

  test('THE DAY AND THE MONTH ARE COUNTED EXACTLY AS THE GATES COUNT THEM', () => {
    const fn = t.slice(
      t.indexOf('create function public.get_plan_and_usage'),
      t.indexOf('create function public.set_test_plan'),
    );
    expect(fn).toContain("date_trunc('day', now() at time zone 'utc')");
    expect(fn).toContain("date_trunc('month', now() at time zone 'utc')::date");
  });

  test('a waiting invite holds a seat', () => {
    const fn = t.slice(
      t.indexOf('create function private.seats_used'),
      t.indexOf('create function public.get_plan_and_usage'),
    );
    expect(fn).toContain('from public.account_members am');
    expect(fn).toContain("i.status = 'pending'");
  });

  test('THE TEST-ONLY PLAN SWITCH CANNOT REACH A REAL PAID PLAN, by anybody, in any project', () => {
    const fn = t.slice(
      t.indexOf('create function public.set_test_plan'),
      t.indexOf('create function public.list_team'),
    );
    expect(fn).toContain("raise exception 'not_owner'");
    // The lock that does not travel inside this file: no migration ever sets is_admin.
    expect(fn).toContain('pr.is_admin');
    expect(fn).toContain("raise exception 'not_admin'");
    // You may only move TO a stand-in plan...
    expect(fn).toContain('target.is_test');
    expect(fn).toContain("raise exception 'not_a_test_plan'");
    // ...and only FROM one, so a real paid account is out of reach for good.
    expect(fn).toContain("raise exception 'real_plan'");
    expect(fn).toContain("raise exception 'too_many_people'");
    // Every lock is checked BEFORE the plan is changed.
    expect(fn.indexOf("raise exception 'real_plan'")).toBeLessThan(fn.indexOf('update public.accounts'));
    // And nothing in this file ever turns somebody into an admin.
    expect(t).not.toMatch(/update public\.profiles[^;]*is_admin/);
  });

  test('the stand-in plans say in their own words that they are stand-ins', () => {
    expect(t).toContain('add column if not exists is_test boolean not null default false');
    expect(t.match(/STAND-IN NUMBERS/g)).toHaveLength(2);
  });

  test('NO LIMIT IS EVER WRITTEN TWICE: a feature line names its column instead of repeating the number', () => {
    const seed = code(
      t.slice(t.indexOf("set description = 'For one person"), t.indexOf('-- 2. invites:')),
    );
    for (const name of ['{meetings_per_month}', '{chat_messages_per_day}', '{seats_included}', '{max_meeting_minutes}']) {
      expect(seed).toContain(name);
    }
    // Every feature line that mentions a number uses a placeholder, never a digit.
    for (const line of seed.match(/"[^"]+"/g) ?? []) {
      if (/\d/.test(line)) expect(line).toContain('{');
    }
  });

  test('deleting ONE note needs a door, because the app cannot delete a row itself', () => {
    const fn = t.slice(t.indexOf('create function public.delete_note'), t.indexOf('create function public.can_delete_account'));
    expect(fn).toContain('private.is_account_member(note.account_id)');
    expect(fn).toContain('note.created_by is distinct from me');
    expect(fn).toContain('private.is_account_owner(note.account_id)');
    expect(fn).toContain("raise exception 'not_yours'");
    expect(fn).toContain('note.file_path');
    // And no grant was opened up on meetings instead.
    expect(t).not.toMatch(/grant [^;]*delete[^;]* on public\.meetings/);
  });

  test('deleting an account says WHY NOT in plain words, and the server checks again', () => {
    const screenCheck = t.slice(
      t.indexOf('create function public.can_delete_account'),
      t.indexOf('create function public.claim_account_deletion'),
    );
    expect(screenCheck).toContain('Remove them on the Team screen first');
    expect(screenCheck).toContain('The notes you made stay in');
    // NOT "gyan keeps no copy": a few records stay (the audit log, the email log, the cost
    // rows) and the screen lists them with the reason for each. Corrected in
    // 20261121100000_honest_delete_wording.sql -- a sentence that contradicts the list
    // right under it is worse than no sentence.
    expect(screenCheck).toContain('This cannot be undone');
    const latest = fs.readFileSync(path.join(dir, '20261121100000_honest_delete_wording.sql'), 'utf8');
    expect(latest).toContain('This cannot be undone.');
    expect(latest).not.toMatch(/keeps no copy'/);

    const gate = t.slice(
      t.indexOf('create function public.claim_account_deletion'),
      t.indexOf('create function public.delete_account'),
    );
    expect(gate).toContain("raise exception 'team_not_empty'");
    expect(gate).toContain("raise exception 'invites_waiting'");
    // The gate changes nothing; it only says whether this may happen.
    expect(gate).not.toMatch(/delete from/i);
  });

  test.each([
    'claim_invite(uuid, text)',
    'discard_invite(uuid)',
    'log_account_email(uuid, text, text, text, text, uuid)',
    'claim_account_deletion(uuid)',
    'delete_account(uuid)',
  ])('only the server can run %s', (fn) => {
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon, authenticated`);
    expect(t).toContain(`grant execute on function public.${fn} to service_role`);
    const escaped = fn.replace(/[()]/g, '\\$&');
    expect(t).not.toMatch(new RegExp(`grant execute on function public\\.${escaped} to (anon|authenticated)`));
  });

  test.each([
    'get_plan_and_usage()', 'set_test_plan(text)', 'list_team()', 'revoke_invite(uuid)',
    'change_member_role(uuid, text)', 'remove_member(uuid)', 'accept_invite(text)',
    'delete_note(uuid)', 'can_delete_account()',
  ])('the Settings screens can run %s, and a signed out visitor cannot', (fn) => {
    expect(t).toContain(`grant execute on function public.${fn} to authenticated`);
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon`);
  });

  test('every new function pins its search path, so nothing can be swapped under it', () => {
    const definers = t.match(/security definer/g) ?? [];
    const pinned = t.match(/set search_path = ''/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(pinned).toHaveLength(definers.length);
  });
});

describe('the security baseline migration (prompt 11)', () => {
  const t = fs.readFileSync(path.join(dir, '20261120100000_security_baseline.sql'), 'utf8');
  /** The SQL with the comments taken out, for rules about what the code does. */
  const code = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');

  test('it only adds things, apart from two drops it explains', () => {
    expect(code).not.toMatch(/drop table|drop column|drop schema/i);
    expect(code).not.toMatch(/truncate/i);
    // The two deliberate replacements: discard_invite gains an argument (so the old
    // signature has to go, or calling it would be ambiguous), and three integrations
    // write rules go because the app no longer has permission to use them.
    const drops = code.match(/drop (function|policy)[^;]*/gi) ?? [];
    expect(drops).toHaveLength(4);
    expect(code).toContain('drop function if exists public.discard_invite(uuid)');
    expect(code).toContain('drop policy if exists "Owner adds integrations" on public.integrations');
  });

  test('every function pins its search path', () => {
    const definers = t.match(/security definer/g) ?? [];
    const pinned = t.match(/set search_path = ''/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(pinned).toHaveLength(definers.length);
  });

  // -------------------------------------------------------------------------
  // The audit log
  // -------------------------------------------------------------------------

  test('THE AUDIT LOG HOLDS NO WORDS FROM A MEETING, only ids and fixed facts', () => {
    const table = t.slice(t.indexOf('create table public.audit_log'), t.indexOf('create index audit_log_account'));
    // Every column is an id, a timestamp, a small jsonb of facts, or one of a fixed list
    // of action names. A text column would be an invitation to log a transcript line.
    const freeText = table.match(/^\s+(\w+) text/gm) ?? [];
    expect(freeText.map((l) => l.trim())).toEqual(['action text', 'target_type text']);
    // And no column that would obviously hold personal information.
    expect(table).not.toMatch(/email|transcript|summary|content|message|title/i);
  });

  test('THE AUDIT LOG CANNOT BE CHANGED OR DELETED, by anybody, server key included', () => {
    // A rule cannot do this, because the server key skips rules. A trigger can.
    expect(t).toContain('create trigger audit_log_never_changes');
    expect(t).toContain('create trigger audit_log_never_deleted');
    expect(t).toMatch(/before update on public\.audit_log/);
    expect(t).toMatch(/before delete on public\.audit_log/);
    expect(t).toContain('append only and cannot be changed or deleted');
    // Nothing anywhere may grant the app permission to change it.
    expect(t).not.toMatch(/grant [^;]*(insert|update|delete)[^;]* on public\.audit_log to (anon|authenticated)/);
    expect(t).toContain('grant select on public.audit_log to authenticated');
  });

  test('the audit log outlives the things it talks about, so it has no foreign keys', () => {
    const table = t.slice(t.indexOf('create table public.audit_log'), t.indexOf('create index audit_log_account'));
    // "on delete cascade" from accounts would erase the record of an account being
    // deleted, which is the exact opposite of the point.
    expect(table).not.toMatch(/references/);
    const consent = t.slice(t.indexOf('create table public.consent_records'), t.indexOf('create unique index consent_records'));
    expect(consent).not.toMatch(/references/);
  });

  test('only the ACCOUNT OWNER reads the audit log', () => {
    expect(t).toMatch(/create policy "Owner reads audit_log of own accounts" on public\.audit_log\s+for select to authenticated using \(\(select private\.is_account_owner\(account_id\)\)\)/);
    const list = t.slice(t.indexOf('create function public.list_audit_log'), t.indexOf('revoke execute on function public.list_audit_log'));
    expect(list).toContain("raise exception 'not_owner'");
    expect(list).toContain("where am.user_id = me and am.role = 'owner'");
    // A name, never an email address. Comments stripped first: saying "never an email
    // address" in a note to the next person is the point, a column holding one is not.
    const listCode = code.slice(
      code.indexOf('create function public.list_audit_log'),
      code.indexOf('revoke execute on function public.list_audit_log'),
    );
    expect(listCode).not.toMatch(/auth\.users|email/i);
  });

  test('THE APP CAN ONLY LOG SOMETHING ABOUT ITSELF, and only three kinds of thing', () => {
    const mine = t.slice(t.indexOf('create function public.record_my_action'), t.indexOf('revoke execute on function public.record_my_action'));
    // The person always comes from the login, never from the request.
    expect(mine).toContain('me uuid := (select auth.uid())');
    expect(mine).toContain("if p_action not in ('sign_in', 'note_view', 'consent_accept') then");
    expect(mine).toContain("raise exception 'not_allowed'");
    // A note has to be one they can really read before it can be named.
    expect(mine).toContain('private.can_read_meeting(p_meeting_id)');
    // The guard against flooding the log, which would make it useless.
    expect(mine).toContain("interval '1 minute'");
  });

  // -------------------------------------------------------------------------
  // Limits
  // -------------------------------------------------------------------------

  test('EVERY LIMIT COMES FROM THE SETTINGS TABLE, never from the code', () => {
    const check = t.slice(t.indexOf('create function private.check_rate_limit'), t.indexOf('revoke execute on function private.check_rate_limit'));
    expect(check).toContain('from public.security_settings where kind = p_kind');
    expect(check).toContain('rule.per_person_per_hour');
    expect(check).toContain('rule.per_account_per_hour');
    // No number written into the checking code itself.
    expect(check).not.toMatch(/per_person_per_hour\s*(>|<|>=|<=)\s*\d/);
  });

  test('a refused go is not counted, so the limit is exact', () => {
    const check = t.slice(t.indexOf('create function private.check_rate_limit'), t.indexOf('revoke execute on function private.check_rate_limit'));
    // The raise undoes the counting with it, which is what keeps the count exact.
    expect(check).toContain("raise exception 'rate_limited'");
    expect(check).toMatch(/do update set used = public\.rate_limits\.used \+ 1/);
  });

  test('the limit check is the SERVER’s to make, not the app’s', () => {
    for (const fn of ['private.check_rate_limit(text, uuid, uuid)', 'public.check_rate_limit(text, uuid, uuid)']) {
      expect(t).toContain(`revoke execute on function ${fn} from public, anon, authenticated`);
      expect(t).toContain(`grant execute on function ${fn} to service_role`);
    }
    // Only functions in the public schema can be reached over the API, which is why
    // there is a public door at all.
    expect(t).toContain('create function public.check_rate_limit');
  });

  test('every limit in the settings table has a plain description', () => {
    const rows = [...t.matchAll(/\n\s+\('(\w+)',\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*'([^']+)'\)/g)];
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const [, kind, , , , description] of rows) {
      expect(description.length).toBeGreaterThan(20);
      expect(kind).toMatch(/^[a-z_]+$/);
    }
    // The one the app needs in order to sign somebody out.
    expect(t).toMatch(/\('inactivity',\s*null,\s*null,\s*30,/);
  });

  // -------------------------------------------------------------------------
  // Keeping, and throwing away
  // -------------------------------------------------------------------------

  test('AN ACCOUNT THAT ALREADY EXISTS KEEPS ITS NOTES FOR EVER', () => {
    // The founder chose 90 days for new accounts. Applying that to accounts that already
    // exist would delete somebody's work because of a default they never saw.
    const backfill = t.slice(t.indexOf('insert into public.account_privacy (account_id, retention_days)\nselect'), t.indexOf('create function private.start_account_privacy'));
    expect(backfill).toContain('select a.id, null from public.accounts a');
    // And the 90 days arrives only for accounts made after this.
    const starter = t.slice(t.indexOf('create function private.start_account_privacy'), t.indexOf('revoke execute on function private.start_account_privacy'));
    expect(starter).toContain('values (new.id, 90)');
    // The backfill has to run BEFORE the trigger exists, or new rows would get 90 too.
    expect(t.indexOf('select a.id, null from public.accounts a')).toBeLessThan(t.indexOf('create trigger accounts_start_privacy'));
  });

  test('every way of making an account gets a privacy row, through a trigger', () => {
    // Accounts are made in three places (signing up, being removed from a team, tidying
    // up). A trigger covers all three, and whatever is added next.
    expect(t).toContain('create trigger accounts_start_privacy');
    expect(t).toMatch(/after insert on public\.accounts/);
  });

  test('RETENTION IS A DRY RUN UNLESS SOMEBODY ASKS OUT LOUD', () => {
    expect(t).toContain('create function public.run_retention(p_dry_run boolean default true)');
    const run = t.slice(t.indexOf('create function public.run_retention'), t.indexOf('revoke execute on function public.run_retention'));
    expect(run).toContain('if not p_dry_run then');
    // Every delete sits inside that check.
    const deletes = [...run.matchAll(/delete from public\.meetings/g)];
    expect(deletes).toHaveLength(1);
    expect(run.indexOf('if not p_dry_run then')).toBeLessThan(run.indexOf('delete from public.meetings'));
    // A record is written BEFORE the note goes, so it survives it.
    expect(run.indexOf("'retention_delete'")).toBeLessThan(run.indexOf('delete from public.meetings'));
    // And it hands back the file paths, because database rules do not reach storage.
    expect(run).toContain('file_path');
  });

  test('only the server can run retention, never the app', () => {
    expect(t).toContain('revoke execute on function public.run_retention(boolean) from public, anon, authenticated');
    expect(t).toContain('grant execute on function public.run_retention(boolean) to service_role');
  });

  // -------------------------------------------------------------------------
  // Consent
  // -------------------------------------------------------------------------

  test('CONSENT IS WRITTEN DOWN WITH ITS VERSION, and cannot be edited afterwards', () => {
    expect(t).toContain('create trigger consent_records_never_changes');
    expect(t).toContain('create trigger consent_records_never_deleted');
    const record = t.slice(t.indexOf('create function public.record_consent'), t.indexOf('revoke execute on function public.record_consent'));
    // The person comes from the login, never from the request.
    expect(record).toContain('me uuid := (select auth.uid())');
    expect(record).toContain('on conflict (user_id, consent_version) do nothing');
    // Lengths are capped, so a huge string cannot be posted into the table.
    expect(record).toContain('length(p_version) > 40');
  });

  test('a person can read only their own consent record', () => {
    expect(t).toMatch(/create policy "Read own consent records" on public\.consent_records\s+for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/);
  });

  // -------------------------------------------------------------------------
  // The hardening fixes
  // -------------------------------------------------------------------------

  test('A TABLE ADDED IN FUTURE CANNOT LAND WIDE OPEN', () => {
    // The revoke back in migration 2 only covered the tables existing at the time.
    expect(t).toContain('alter default privileges in schema public revoke all on tables from anon, authenticated');
    expect(t).toContain('alter default privileges in schema public revoke all on sequences from anon, authenticated');
  });

  test('the app can no longer write straight into integrations', () => {
    expect(t).toContain('revoke insert, update, delete on public.integrations from authenticated');
    // The three rules that permission existed for go with it.
    for (const name of ['Owner adds integrations', 'Owner edits integrations', 'Owner deletes integrations']) {
      expect(t).toContain(`drop policy if exists "${name}" on public.integrations`);
    }
  });

  test('a cost row cannot be billed to an account the chat does not belong to', () => {
    const fn = t.slice(t.indexOf('create or replace function public.finish_chat_message'), t.indexOf('revoke execute on function public.finish_chat_message'));
    expect(fn).toContain('select t.account_id into thread_account');
    expect(fn).toContain('if thread_account <> p_account_id then');
    expect(fn).toContain("raise exception 'wrong_account'");
    // The check happens before anything is written.
    expect(fn.indexOf('wrong_account')).toBeLessThan(fn.indexOf('insert into public.chat_messages'));
  });

  test('taking an invite back now has to name the account', () => {
    expect(t).toContain('create function public.discard_invite(p_invite_id uuid, p_account_id uuid)');
    const fn = t.slice(t.indexOf('create function public.discard_invite'), t.indexOf('revoke execute on function public.discard_invite'));
    expect(fn).toContain('where id = p_invite_id and account_id = p_account_id');
    expect(t).toContain('grant execute on function public.discard_invite(uuid, uuid) to service_role');
    expect(t).not.toMatch(/grant execute on function public\.discard_invite\(uuid, uuid\) to (anon|authenticated)/);
  });

  test.each([
    'record_audit(uuid, uuid, text, text, uuid, uuid, jsonb)',
    'run_retention(boolean)',
    'discard_invite(uuid, uuid)',
    'check_rate_limit(text, uuid, uuid)',
  ])('only the server can run %s', (fn) => {
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon, authenticated`);
    expect(t).toContain(`grant execute on function public.${fn} to service_role`);
  });

  test.each([
    'record_my_action(text, uuid)',
    'record_consent(text, text, text)',
    'get_account_privacy()',
    'save_account_privacy(jsonb)',
    'list_audit_log(int, timestamptz)',
  ])('the app can run %s, and a signed out visitor cannot', (fn) => {
    expect(t).toContain(`revoke execute on function public.${fn} from public, anon`);
    expect(t).toContain(`grant execute on function public.${fn} to authenticated`);
  });

  test('it never claims Gyan is compliant with anything', () => {
    // Only a lawyer may change this sentence.
    expect(t).toMatch(/BUILT TO SUPPORT HIPAA\s*\n?--\s*AND GDPR REQUIREMENTS, PENDING LEGAL REVIEW|built to support HIPAA/i);
    expect(t).not.toMatch(/is HIPAA compliant|is GDPR compliant|fully compliant/i);
  });
});
