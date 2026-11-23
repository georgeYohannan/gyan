-- Security and privacy baseline (prompt 11).
--
-- Adds the things a buyer asking HIPAA or GDPR questions looks for, and closes the
-- gaps the first security audit found (docs/security/audit-1.md):
--
--   1. security_settings  -- the ONE table every rate limit lives in
--   2. rate_limits        -- the counters, and the check that uses them
--   3. audit_log          -- who did what, when. Cannot be edited or deleted, by anybody
--   4. account_privacy    -- how long notes are kept, and whether emails carry the summary
--   5. consent_records    -- which consent wording each person agreed to, and when
--   6. run_retention      -- deletes notes past their keeping time. DRY RUN by default
--   7. a handful of hardening fixes from the audit
--
-- Nothing here is HIPAA compliance or GDPR compliance. Gyan is BUILT TO SUPPORT HIPAA
-- AND GDPR REQUIREMENTS, PENDING LEGAL REVIEW. That is a different sentence and only a
-- lawyer may change it.

-- ---------------------------------------------------------------------------
-- 1. security_settings: every limit, in one table, so an admin changes a number
--    in the dashboard instead of asking for new code.
-- ---------------------------------------------------------------------------
create table public.security_settings (
  -- What this row is about: a server function's name, or a setting like 'inactivity'.
  kind text primary key,
  -- For a rate limit: how many times in one hour. Null means "no limit on this".
  per_person_per_hour int check (per_person_per_hour is null or per_person_per_hour >= 0),
  per_account_per_hour int check (per_account_per_hour is null or per_account_per_hour >= 0),
  -- For a setting that is simply a number of minutes, like how long somebody may sit
  -- still before Gyan signs them out.
  minutes int check (minutes is null or minutes > 0),
  description text not null,
  updated_at timestamptz not null default now()
);

alter table public.security_settings enable row level security;

-- Everybody signed in may READ these, because the app has to know how long before it
-- signs somebody out. There is nothing secret in a limit. Nobody may write from the app:
-- these are changed by hand in the Supabase dashboard, which is why there is no function
-- for it and no write permission below.
create policy "Read security settings" on public.security_settings
  for select to authenticated using (true);

revoke all on public.security_settings from anon, authenticated;
grant select on public.security_settings to authenticated;

-- The starting numbers. They are deliberately generous: a limit is here to stop somebody
-- running up a bill or hammering the service, not to get in the way of real work.
insert into public.security_settings (kind, per_person_per_hour, per_account_per_hour, minutes, description) values
  ('transcribe',     30,  120,  null, 'Turning a recording into a transcript. Costs money per minute of audio.'),
  ('summarize',      30,  120,  null, 'Writing the summary and action items. Costs money per note.'),
  ('chat',           60,  300,  null, 'Asking a question about a note. The plans table also sets a daily limit per person.'),
  ('translate',      40,  200,  null, 'Translating a note. Costs money every time a new language is asked for.'),
  ('recap_send',     10,   40,  null, 'Emailing a recap. Protects the mailbox from being treated as a spammer.'),
  ('invite',         20,   60,  null, 'Inviting somebody to the team.'),
  ('account_delete',  3,    5,  null, 'Deleting an account. Low on purpose: nobody does this repeatedly.'),
  ('data_export',     3,   10,  null, 'Downloading a copy of everything. Each one is slow and large.'),
  ('inactivity',   null, null,    30, 'Minutes of sitting still before Gyan signs somebody out. Founder chose 30 on 2026-11-20.');

-- ---------------------------------------------------------------------------
-- 2. rate_limits: the counters behind those numbers.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  -- 'person' or 'account'.
  scope text not null check (scope in ('person', 'account')),
  scope_id uuid not null,
  kind text not null,
  -- The hour this count belongs to.
  window_start timestamptz not null,
  used int not null default 0,
  primary key (scope, scope_id, kind, window_start)
);

alter table public.rate_limits enable row level security;

-- No policy and no permission at all: the app never reads or writes these. Only the
-- server does, through private.check_rate_limit below.
revoke all on public.rate_limits from anon, authenticated;

-- Counts one more go, and refuses when either the person or the whole account has had
-- enough this hour. Raises 'rate_limited' so the server function can say so plainly.
--
-- When it raises, the counting above is undone with it, so a refused attempt is never
-- itself counted. That means the limit is exact rather than drifting upward.
create function private.check_rate_limit(p_kind text, p_user_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.security_settings;
  window_at timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  count_now int;
begin
  select * into rule from public.security_settings where kind = p_kind;

  -- A kind nobody has written a limit for is not limited. Fail open here on purpose:
  -- a missing row must not break a feature, and the audit log still records what happened.
  if not found then
    return;
  end if;

  if rule.per_person_per_hour is not null and p_user_id is not null then
    insert into public.rate_limits (scope, scope_id, kind, window_start, used)
    values ('person', p_user_id, p_kind, window_at, 1)
    on conflict (scope, scope_id, kind, window_start)
      do update set used = public.rate_limits.used + 1
    returning used into count_now;

    if count_now > rule.per_person_per_hour then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  if rule.per_account_per_hour is not null and p_account_id is not null then
    insert into public.rate_limits (scope, scope_id, kind, window_start, used)
    values ('account', p_account_id, p_kind, window_at, 1)
    on conflict (scope, scope_id, kind, window_start)
      do update set used = public.rate_limits.used + 1
    returning used into count_now;

    if count_now > rule.per_account_per_hour then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

revoke execute on function private.check_rate_limit(text, uuid, uuid) from public, anon, authenticated;
grant execute on function private.check_rate_limit(text, uuid, uuid) to service_role;

-- A door in the public schema, because only public functions can be called over the API,
-- and the server functions need to ask before they spend money. The real work stays in
-- the private one above so other database functions can use it from the inside too.
-- SERVER ONLY: the app can never call this, or it could spend somebody else's allowance.
create function public.check_rate_limit(p_kind text, p_user_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_rate_limit(p_kind, p_user_id, p_account_id);
end;
$$;

revoke execute on function public.check_rate_limit(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. audit_log: who did what, to which note, and when.
-- ---------------------------------------------------------------------------
-- Three things about this table are deliberate and should not be "tidied up" later:
--
-- a) IT HAS NO FOREIGN KEYS. An audit log has to outlive the things it talks about. If
--    account_id pointed at accounts with "on delete cascade", deleting an account would
--    erase the record of it being deleted, which is the opposite of the point.
-- b) IT HOLDS NO WORDS FROM A MEETING. No transcript, no summary, no email address. Only
--    ids, a fixed list of actions, and small facts like which setting changed. A log of
--    private conversations would be a second copy of the thing we are protecting.
-- c) IT CANNOT BE CHANGED OR DELETED BY ANYBODY, including the server key. A rule cannot
--    do that, because the server key skips rules, so a trigger does it instead.
create table public.audit_log (
  id bigint generated always as identity primary key,
  account_id uuid,
  actor_user_id uuid,
  action text not null check (action in (
    'sign_in',
    'note_view',
    'note_export',
    'note_share',
    'note_delete',
    'settings_change',
    'team_change',
    'account_delete',
    'retention_delete',
    'consent_accept',
    'two_factor_on',
    'two_factor_off',
    'data_export'
  )),
  target_type text,
  target_id uuid,
  meeting_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_account_created_idx on public.audit_log (account_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, created_at desc);

alter table public.audit_log enable row level security;

-- Only the account OWNER reads it, under Settings, Security. A member seeing every move
-- their colleagues made is a privacy problem of its own.
create policy "Owner reads audit_log of own accounts" on public.audit_log
  for select to authenticated using ((select private.is_account_owner(account_id)));

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- The thing that makes it append-only, for everybody, server key included.
create function private.refuse_to_change_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'this table is append only and cannot be changed or deleted'
    using errcode = 'P0001';
end;
$$;

revoke execute on function private.refuse_to_change_history() from public, anon, authenticated;

create trigger audit_log_never_changes
  before update on public.audit_log
  for each row execute function private.refuse_to_change_history();

create trigger audit_log_never_deleted
  before delete on public.audit_log
  for each row execute function private.refuse_to_change_history();

-- Write a row. SERVER ONLY, for the things only the server knows about.
create function public.record_audit(
  p_account_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_meeting_id uuid default null,
  p_detail jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_row bigint;
begin
  insert into public.audit_log (account_id, actor_user_id, action, target_type, target_id, meeting_id, detail)
  values (p_account_id, p_actor_user_id, p_action, p_target_type, p_target_id, p_meeting_id,
          coalesce(p_detail, '{}'::jsonb))
  returning id into new_row;
  return new_row;
end;
$$;

revoke execute on function public.record_audit(uuid, uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_audit(uuid, uuid, text, text, uuid, uuid, jsonb) to service_role;

-- Write a row ABOUT YOURSELF. This one the app may call, which is why it is careful:
-- the person is always taken from the login and never from the request, and only three
-- actions are allowed, so the app can never forge a record of somebody else deleting
-- something.
--
-- It also refuses to write the same thing twice inside a minute. Opening a note scrolls
-- the log quickly otherwise, and a log nobody can read is no use to anybody.
create function public.record_my_action(p_action text, p_meeting_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
begin
  if me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if p_action not in ('sign_in', 'note_view', 'consent_accept') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select am.account_id into my_account
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;

  -- A note has to be one this person can really read before it is named in the log.
  if p_meeting_id is not null and not (select private.can_read_meeting(p_meeting_id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.audit_log l
    where l.actor_user_id = me
      and l.action = p_action
      and l.meeting_id is not distinct from p_meeting_id
      and l.created_at > pg_catalog.now() - interval '1 minute'
  ) then
    return;
  end if;

  insert into public.audit_log (account_id, actor_user_id, action, target_type, target_id, meeting_id)
  values (my_account, me, p_action,
          case when p_meeting_id is null then null else 'meeting' end,
          p_meeting_id, p_meeting_id);
end;
$$;

revoke execute on function public.record_my_action(text, uuid) from public, anon;
grant execute on function public.record_my_action(text, uuid) to authenticated;

-- What the owner sees under Settings, Security. Newest first, a page at a time.
create function public.list_audit_log(p_limit int default 50, p_before timestamptz default null)
returns table (
  id bigint,
  action text,
  actor_user_id uuid,
  actor_name text,
  target_type text,
  meeting_id uuid,
  meeting_title text,
  detail jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
begin
  if me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select am.account_id into my_account
  from public.account_members am
  where am.user_id = me and am.role = 'owner'
  limit 1;

  if my_account is null then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;

  return query
  select
    l.id,
    l.action,
    l.actor_user_id,
    -- A name, never an email address. "A removed person" when they are gone.
    coalesce(p.display_name, 'A removed person') as actor_name,
    l.target_type,
    l.meeting_id,
    m.title as meeting_title,
    l.detail,
    l.created_at
  from public.audit_log l
  left join public.profiles p on p.id = l.actor_user_id
  left join public.meetings m on m.id = l.meeting_id
  where l.account_id = my_account
    and (p_before is null or l.created_at < p_before)
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.list_audit_log(int, timestamptz) from public, anon;
grant execute on function public.list_audit_log(int, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. account_privacy: how long notes are kept, and what emails may carry.
-- ---------------------------------------------------------------------------
create table public.account_privacy (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  -- Null means keep notes for ever. Otherwise notes older than this are deleted, with
  -- their recordings.
  retention_days int check (retention_days is null or retention_days in (30, 90, 365)),
  -- When this is off, a recap email carries only the title, the date and a button to
  -- open the note. The summary itself never leaves Gyan.
  email_summaries boolean not null default true,
  -- Null means use the number in security_settings (30 minutes).
  inactivity_minutes int check (inactivity_minutes is null or inactivity_minutes between 5 and 480),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.account_privacy enable row level security;

create policy "Read own account privacy" on public.account_privacy
  for select to authenticated using ((select private.is_account_member(account_id)));

revoke all on public.account_privacy from anon, authenticated;
grant select on public.account_privacy to authenticated;

-- Every account that already exists keeps its notes FOR EVER. Deleting somebody's work
-- because of a default they never chose would be indefensible, so the 90 days the founder
-- picked applies only to accounts made from now on.
insert into public.account_privacy (account_id, retention_days)
select a.id, null from public.accounts a
on conflict (account_id) do nothing;

-- From here on, a new account starts at 90 days. This is a trigger rather than a line
-- inside handle_new_user because accounts are made in three places (signing up, being
-- removed from a team, and tidying up), and all three must get a row.
create function private.start_account_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_privacy (account_id, retention_days)
  values (new.id, 90)
  on conflict (account_id) do nothing;
  return new;
end;
$$;

revoke execute on function private.start_account_privacy() from public, anon, authenticated;

create trigger accounts_start_privacy
  after insert on public.accounts
  for each row execute function private.start_account_privacy();

-- What the Data and privacy screen reads. Hands back the numbers actually in force,
-- so the screen never has to work out which default applies.
create function public.get_account_privacy()
returns table (
  account_id uuid,
  retention_days int,
  email_summaries boolean,
  inactivity_minutes int,
  is_owner boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  my_role text;
  default_minutes int;
begin
  if me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select am.account_id, am.role into my_account, my_role
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;

  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  select s.minutes into default_minutes
  from public.security_settings s where s.kind = 'inactivity';

  return query
  select
    p.account_id,
    p.retention_days,
    p.email_summaries,
    coalesce(p.inactivity_minutes, default_minutes, 30) as inactivity_minutes,
    (my_role = 'owner') as is_owner
  from public.account_privacy p
  where p.account_id = my_account;
end;
$$;

revoke execute on function public.get_account_privacy() from public, anon;
grant execute on function public.get_account_privacy() to authenticated;

-- Change them. OWNER ONLY, and it says so out loud rather than quietly doing nothing,
-- so the screen can explain why. Only the three keys below are ever read out of the
-- settings handed in; anything else is ignored. A key that is absent is left alone, which
-- is how "keep for ever" (null) can be told apart from "do not change this".
create function public.save_account_privacy(p_settings jsonb)
returns table (
  retention_days int,
  email_summaries boolean,
  inactivity_minutes int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  was public.account_privacy;
  new_retention int;
  new_emails boolean;
  new_minutes int;
begin
  if me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select am.account_id into my_account
  from public.account_members am
  where am.user_id = me and am.role = 'owner'
  limit 1;

  if my_account is null then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;

  select * into was from public.account_privacy where account_id = my_account;

  new_retention := case when p_settings ? 'retention_days'
    then nullif(p_settings ->> 'retention_days', '')::int
    else was.retention_days end;
  new_emails := case when p_settings ? 'email_summaries'
    then (p_settings ->> 'email_summaries')::boolean
    else was.email_summaries end;
  new_minutes := case when p_settings ? 'inactivity_minutes'
    then nullif(p_settings ->> 'inactivity_minutes', '')::int
    else was.inactivity_minutes end;

  if new_retention is not null and new_retention not in (30, 90, 365) then
    raise exception 'bad_retention' using errcode = 'P0001';
  end if;
  if new_minutes is not null and (new_minutes < 5 or new_minutes > 480) then
    raise exception 'bad_minutes' using errcode = 'P0001';
  end if;

  update public.account_privacy p
  set retention_days = new_retention,
      email_summaries = new_emails,
      inactivity_minutes = new_minutes,
      updated_at = pg_catalog.now(),
      updated_by = me
  where p.account_id = my_account;

  -- Write down what changed. Numbers and switches only, never anybody's words.
  if was.retention_days is distinct from new_retention then
    insert into public.audit_log (account_id, actor_user_id, action, target_type, detail)
    values (my_account, me, 'settings_change', 'account_privacy',
            pg_catalog.jsonb_build_object('setting', 'retention_days',
              'from', was.retention_days, 'to', new_retention));
  end if;
  if was.email_summaries is distinct from new_emails then
    insert into public.audit_log (account_id, actor_user_id, action, target_type, detail)
    values (my_account, me, 'settings_change', 'account_privacy',
            pg_catalog.jsonb_build_object('setting', 'email_summaries',
              'from', was.email_summaries, 'to', new_emails));
  end if;
  if was.inactivity_minutes is distinct from new_minutes then
    insert into public.audit_log (account_id, actor_user_id, action, target_type, detail)
    values (my_account, me, 'settings_change', 'account_privacy',
            pg_catalog.jsonb_build_object('setting', 'inactivity_minutes',
              'from', was.inactivity_minutes, 'to', new_minutes));
  end if;

  return query
  select p.retention_days, p.email_summaries, p.inactivity_minutes
  from public.account_privacy p where p.account_id = my_account;
end;
$$;

revoke execute on function public.save_account_privacy(jsonb) from public, anon;
grant execute on function public.save_account_privacy(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. consent_records: which wording each person agreed to, and when.
-- ---------------------------------------------------------------------------
-- Until now this lived only in the browser's own storage, so clearing site data erased
-- the only evidence it had ever been given. The hash is of the exact words shown, so if
-- the wording is ever changed we can still tell who agreed to which version.
create table public.consent_records (
  id bigint generated always as identity primary key,
  -- No foreign key on purpose: the record has to outlive the person, the same reason
  -- audit_log has none.
  user_id uuid not null,
  consent_version text not null,
  consent_text_hash text not null,
  platform text,
  accepted_at timestamptz not null default now()
);

create unique index consent_records_person_version_idx
  on public.consent_records (user_id, consent_version);

alter table public.consent_records enable row level security;

create policy "Read own consent records" on public.consent_records
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.consent_records from anon, authenticated;
grant select on public.consent_records to authenticated;

create trigger consent_records_never_changes
  before update on public.consent_records
  for each row execute function private.refuse_to_change_history();

create trigger consent_records_never_deleted
  before delete on public.consent_records
  for each row execute function private.refuse_to_change_history();

-- The app writes this one, so again: the person comes from the login, never from the
-- request. Agreeing twice is not an error, it just changes nothing.
create function public.record_consent(p_version text, p_hash text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_version is null or p_version = '' or p_hash is null or p_hash = '' then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;
  if pg_catalog.length(p_version) > 40 or pg_catalog.length(p_hash) > 128
     or pg_catalog.length(coalesce(p_platform, '')) > 20 then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;

  insert into public.consent_records (user_id, consent_version, consent_text_hash, platform)
  values (me, p_version, p_hash, p_platform)
  on conflict (user_id, consent_version) do nothing;
end;
$$;

revoke execute on function public.record_consent(text, text, text) from public, anon;
grant execute on function public.record_consent(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. run_retention: delete notes that are past their keeping time.
-- ---------------------------------------------------------------------------
-- DRY RUN BY DEFAULT. Called with nothing, it changes NOTHING and only reports what it
-- would delete. Deleting has to be asked for out loud, with run_retention(false).
--
-- It hands back the file paths, because database rules do not reach storage: the server
-- has to empty the bucket itself, exactly as deleting an account already does.
create function public.run_retention(p_dry_run boolean default true)
returns table (
  meeting_id uuid,
  account_id uuid,
  file_path text,
  created_at timestamptz,
  retention_days int
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  create temporary table if not exists doomed_notes (
    meeting_id uuid, account_id uuid, file_path text, created_at timestamptz, retention_days int
  ) on commit drop;
  delete from doomed_notes;

  insert into doomed_notes
  select m.id, m.account_id, m.file_path, m.created_at, p.retention_days
  from public.meetings m
  join public.account_privacy p on p.account_id = m.account_id
  where p.retention_days is not null
    and m.created_at < pg_catalog.now() - (p.retention_days || ' days')::interval;

  if not p_dry_run then
    -- One line in the log per note, before it goes, so the record survives the note.
    insert into public.audit_log (account_id, actor_user_id, action, target_type, target_id, meeting_id, detail)
    select d.account_id, null, 'retention_delete', 'meeting', d.meeting_id, d.meeting_id,
           pg_catalog.jsonb_build_object('retention_days', d.retention_days, 'note_age_days',
             pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now() - d.created_at) / 86400)::int)
    from doomed_notes d;

    -- Everything hanging off a note goes with it, through the rules already in place.
    delete from public.meetings m where m.id in (select d.meeting_id from doomed_notes d);
  end if;

  -- Old counters are no use to anybody once their hour has passed.
  delete from public.rate_limits r where r.window_start < pg_catalog.now() - interval '2 days';

  return query select d.meeting_id, d.account_id, d.file_path, d.created_at, d.retention_days from doomed_notes d;
end;
$$;

revoke execute on function public.run_retention(boolean) from public, anon, authenticated;
grant execute on function public.run_retention(boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Hardening fixes the audit asked for.
-- ---------------------------------------------------------------------------

-- 7a. A table added in a FUTURE migration used to land with the "not signed in" role
-- holding full write permission, because the command that took that away back in
-- migration 2 only applied to the tables that existed at the time. This makes it the
-- standing default, so the next table is safe even if somebody forgets.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- 7b. The app could write anything it liked into integrations, the one table the notes
-- say will hold Slack and Teams tokens one day. Nothing has used that permission since
-- save_recap_settings arrived, and that function allows only three known switches. So
-- the direct door closes. Reading is untouched.
drop policy if exists "Owner adds integrations" on public.integrations;
drop policy if exists "Owner edits integrations" on public.integrations;
drop policy if exists "Owner deletes integrations" on public.integrations;
revoke insert, update, delete on public.integrations from authenticated;

-- 7c. finish_chat_message was handed the thread and the account separately and never
-- checked they belonged together, so a cost row could be billed to a different account
-- than the chat it came from. Same arguments, same behaviour, one more check.
create or replace function public.finish_chat_message(
  p_thread_id uuid,
  p_account_id uuid,
  p_meeting_id uuid,
  p_content text,
  p_sources jsonb,
  p_language text,
  p_tokens numeric,
  p_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_message uuid;
  thread_account uuid;
begin
  select t.account_id into thread_account
  from public.chat_threads t where t.id = p_thread_id;

  if thread_account is null then
    raise exception 'no_thread' using errcode = 'P0001';
  end if;

  -- The account being billed must be the account the chat actually belongs to.
  if thread_account <> p_account_id then
    raise exception 'wrong_account' using errcode = 'P0001';
  end if;

  insert into public.chat_messages (thread_id, role, content, language, sources)
  values (p_thread_id, 'assistant', p_content, p_language, p_sources)
  returning id into new_message;

  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (p_account_id, p_meeting_id, 'chat', 'anthropic', p_tokens, p_cost);

  return new_message;
end;
$$;

revoke execute on function public.finish_chat_message(uuid, uuid, uuid, text, jsonb, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.finish_chat_message(uuid, uuid, uuid, text, jsonb, text, numeric, numeric) to service_role;

-- 7d. discard_invite took an invite id and nothing else, so it had no idea who was
-- asking or which account the invite belonged to. It is server-only, so this was never
-- reachable from the app, but one lock is not enough on something that changes a row.
-- The account has to be named now, and it has to match.
--
-- This is a replacement rather than an addition because the arguments change, and two
-- versions of the same name would be ambiguous to call. supabase/functions/team/
-- pipeline.ts is updated in the same commit.
drop function if exists public.discard_invite(uuid);

create function public.discard_invite(p_invite_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites set status = 'revoked'
  where id = p_invite_id and account_id = p_account_id and status = 'pending';
end;
$$;

revoke execute on function public.discard_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.discard_invite(uuid, uuid) to service_role;
