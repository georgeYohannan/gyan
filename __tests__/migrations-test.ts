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
  test('create the 17 tables from the data model (chunks waits for the embedding model)', () => {
    expect(tables.sort()).toEqual([
      'account_members', 'accounts', 'action_items', 'ai_usage', 'chat_messages', 'chat_threads',
      'email_log', 'integrations', 'invites', 'meetings', 'mind_maps', 'plans', 'profiles',
      'summaries', 'transcript_segments', 'translations', 'usage',
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
