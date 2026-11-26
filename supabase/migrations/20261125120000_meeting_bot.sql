-- The meeting bot (prompt 14): paste a Zoom, Meet or Teams link and a bot joins the call.
--
-- NOBODY CAN SEND A BOT UNTIL THE SWITCH IS TURNED ON, BY HAND, FOR ONE ACCOUNT AT A TIME.
-- The switch lives in the integrations table as kind = 'meeting_bot'. A missing row means OFF,
-- so forgetting to set it keeps the feature shut. There is deliberately NO app-callable way to
-- turn it on: save_meeting_bot_settings cannot write `enabled` whatever it is handed. It is
-- changed in the Supabase dashboard and nowhere else, because the consent wording has not been
-- through a lawyer (docs/decisions.md, 2026-11-18).
--
-- THIS FILE BREAKS THE RULE THAT MIGRATIONS ONLY ADD THINGS, IN THREE PLACES, ALL ON PURPOSE:
--
--   1. public.claim_transcription refused anything where source <> 'upload' and raised
--      'no_audio'. It now accepts source in ('upload', 'bot'). A bot recording is an audio file
--      in the same bucket under the same path rules; there was no other reason for the test.
--      Nothing else about that function changes.
--
--   2. public.meetings.status gains three values -- 'joining', 'waiting', 'recording' -- so a
--      note can say where its bot is. After the audio arrives a bot note joins the ordinary path
--      at 'queued' and is indistinguishable from an upload from then on.
--
--   3. The Free plan gets max_meeting_minutes = 60. THIS HAS A REAL EFFECT: a Free account can no
--      longer upload a recording longer than an hour. The column has existed since the first
--      migration and nothing has ever read it to refuse anything; this round makes it bite.
--
-- Everything else here only adds. Nothing is deleted and no data is touched.
--
-- WHY THERE IS A SEPARATE TABLE. meeting_bots holds about fifteen things that are meaningless for
-- an upload, a phone recording or pasted text: which provider, its id for the bot, the platform,
-- which phase the bot is in, and the consent that was given before it was sent. Fifteen columns
-- on `meetings` that are null for three sources out of four is a worse shape than one side table.

-- ---------------------------------------------------------------------------
-- 1. The switch, and the bot's name.
-- ---------------------------------------------------------------------------
-- integrations is already the per-account per-feature settings bag: recap settings live on it as
-- kind = 'recap_email'. It is already owner-only to READ directly, because it may one day hold
-- Slack and Teams tokens, which is why narrow doors like get_recap_settings exist. Same shape
-- here.
--
--   settings = { "enabled": false, "bot_name": null }
--
-- A null bot_name means the default: "gyan Notetaker (Owner Name)" (docs/decisions.md 2026-11-21).

-- The name the bot joins a call under. The default is built from the account owner, so anybody in
-- the call can see at a glance what it is and whose it is -- which is the whole point. A bot with
-- a vague name is the thing people object to afterwards.
create function private.effective_bot_name(p_account uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  saved text;
  owner_name text;
begin
  select nullif(pg_catalog.btrim(i.settings ->> 'bot_name'), '') into saved
  from public.integrations i
  where i.account_id = p_account and i.kind = 'meeting_bot';

  if saved is not null then
    -- A person typed this, so it is cut to something a meeting platform will accept. Recall's
    -- own limit is 100 characters; newlines are taken out because a name is one line.
    return pg_catalog.left(pg_catalog.regexp_replace(saved, '[\r\n\t]+', ' ', 'g'), 100);
  end if;

  select nullif(pg_catalog.btrim(pr.display_name), '') into owner_name
  from public.accounts a
  join public.profiles pr on pr.id = a.owner_id
  where a.id = p_account;

  if owner_name is null then
    return 'gyan Notetaker';
  end if;
  return pg_catalog.left('gyan Notetaker (' || pg_catalog.regexp_replace(owner_name, '[\r\n\t]+', ' ', 'g') || ')', 100);
end;
$$;

revoke execute on function private.effective_bot_name(uuid) from public, anon, authenticated;

-- Is the switch on for this account? Missing row means no.
create function private.meeting_bot_enabled(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (i.settings ->> 'enabled')::boolean
     from public.integrations i
     where i.account_id = p_account and i.kind = 'meeting_bot'),
    false);
$$;

revoke execute on function private.meeting_bot_enabled(uuid) from public, anon, authenticated;

-- What the Meeting link screen reads. ANY MEMBER may read it: the integrations table itself stays
-- owner-only, and this door hands back only the switch and the name, never a token.
create function public.get_meeting_bot_settings()
returns table (account_id uuid, is_owner boolean, enabled boolean, bot_name text, effective_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  my_role text;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- Owner first, the same order every other function here uses.
  select am.account_id, am.role into my_account, my_role
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;

  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  return query
  select my_account,
         my_role = 'owner',
         (select private.meeting_bot_enabled(my_account)),
         (select nullif(pg_catalog.btrim(i.settings ->> 'bot_name'), '')
          from public.integrations i
          where i.account_id = my_account and i.kind = 'meeting_bot'),
         (select private.effective_bot_name(my_account));
end;
$$;

-- Only the account owner may change the bot's name. It CANNOT turn the feature on.
--
-- This is the important line in this whole file: `enabled` is read from the row that is already
-- there and written back unchanged. Whatever is passed in for it is thrown away. So "only the
-- founder can turn this on, in the dashboard" is a rule the database keeps, not a habit the app
-- happens to follow.
create function public.save_meeting_bot_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  already boolean;
  clean jsonb;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select am.account_id into my_account
  from public.account_members am
  where am.user_id = me and am.role = 'owner'
  limit 1;

  if my_account is null then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;

  already := (select private.meeting_bot_enabled(my_account));

  clean := pg_catalog.jsonb_build_object(
    -- NOT from p_settings. Ever.
    'enabled', already,
    'bot_name', nullif(pg_catalog.btrim(pg_catalog.left(coalesce(p_settings ->> 'bot_name', ''), 100)), '')
  );

  insert into public.integrations (account_id, kind, settings)
  values (my_account, 'meeting_bot', clean)
  on conflict (account_id, kind) do update set settings = excluded.settings;

  return clean;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The caps: two new numbers in the ONE table every limit lives in.
-- ---------------------------------------------------------------------------
-- security_settings is keyed by `kind` and its own header says it is the one place a limit lives.
-- Bot hours are a limit, so they go here rather than in a new table. Null means "no cap on this",
-- the same meaning the existing columns give null.
alter table public.security_settings
  add column if not exists bot_hours_per_day_account numeric
    check (bot_hours_per_day_account is null or bot_hours_per_day_account >= 0),
  add column if not exists bot_hours_per_day_service numeric
    check (bot_hours_per_day_service is null or bot_hours_per_day_service >= 0);

-- The founder's chosen numbers (2026-11-25). At Recall's $0.50 an hour the whole-service cap is
-- about $3 a day, which is what a runaway bug can cost before it stops itself. Raise them in the
-- dashboard once the feature has been trusted for a while.
insert into public.security_settings
  (kind, per_person_per_hour, per_account_per_hour, bot_hours_per_day_account,
   bot_hours_per_day_service, description)
values
  ('meeting_bot', 10, 20, 2, 6,
   'Sending a bot to a call. Costs money for every minute the bot is in the meeting.')
on conflict (kind) do nothing;

-- ---------------------------------------------------------------------------
-- 3. The plan allowance.
-- ---------------------------------------------------------------------------
alter table public.plans
  add column if not exists bot_hours_per_month numeric not null default 0
    check (bot_hours_per_month >= 0);

-- Free gets none. A bot costs real money for every minute it sits in a call, so the free plan has
-- to have a floor somewhere, and zero is the honest place for it.
update public.plans set bot_hours_per_month = 0 where name = 'Free';

-- The two stand-in plans get stand-in hours, like every other number on them.
update public.plans set bot_hours_per_month = 10 where name = 'Pro' and is_test;
update public.plans set bot_hours_per_month = 40 where name = 'Team' and is_test;

-- The longest one meeting may be, on the Free plan. The column has existed since the first
-- migration and has never been read to refuse anything. From this round it is enforced for every
-- source. 60 minutes is the founder's choice, and it answers the open question in
-- docs/product-spec.md.
update public.plans set max_meeting_minutes = 60 where name = 'Free' and max_meeting_minutes is null;

-- A feature line that needs a number NAMES THE COLUMN in braces and the app fills it in, so the
-- words can never disagree with the limit. Free gets no line at all: "0 hours of meeting bot"
-- is noise, and featureLines drops a line whose number is missing rather than printing a gap.
update public.plans
set features = features || '["{bot_hours_per_month} hours of meeting bot a month"]'::jsonb
where is_test
  and name in ('Pro', 'Team')
  and not (features @> '["{bot_hours_per_month} hours of meeting bot a month"]'::jsonb);

-- ---------------------------------------------------------------------------
-- 4. Three new note statuses.
-- ---------------------------------------------------------------------------
-- 'joining' -> 'waiting' -> 'recording' are the bot's own part. Then the audio arrives and the
-- note becomes 'queued', which is exactly where an upload starts, so every function written for
-- an upload carries on working unchanged from that moment.
alter table public.meetings drop constraint if exists meetings_status_check;
alter table public.meetings add constraint meetings_status_check
  check (status in ('uploading', 'joining', 'waiting', 'recording',
                    'queued', 'transcribing', 'summarizing', 'ready', 'failed'));

-- ---------------------------------------------------------------------------
-- 5. meeting_bots: one row per bot note.
-- ---------------------------------------------------------------------------
create table public.meeting_bots (
  meeting_id uuid primary key references public.meetings (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Nullable, with the same delete rule meetings.created_by was given on 2026-11-19: a note has
  -- to be able to outlive the person who made it, or deleting somebody becomes impossible.
  requested_by uuid references public.profiles (id) on delete set null,
  -- Which service sent the bot. Free text on purpose: swapping provider must not need a migration.
  provider text not null,
  -- The provider's own id for this bot. Null until the provider answers.
  external_id text,
  platform text not null check (platform in ('zoom', 'meet', 'teams')),
  -- EMPTIED THE MOMENT RECORDING STARTS. A meeting link lets anybody join the call, so Gyan does
  -- not keep one it no longer needs. Until then it is kept so a failed join can say which link.
  meeting_url text,
  bot_name text not null,
  phase text not null
    check (phase in ('joining', 'waiting', 'recording', 'processing', 'ready', 'failed')),
  -- How far along that list the note has got. A status event that arrives late and out of order
  -- can then be ignored rather than believed: a bot cannot go back to "joining" once it is
  -- recording. Webhooks arrive out of order in the real world and this is the whole defence.
  phase_rank smallint not null default 0 check (phase_rank between 0 and 5),
  -- Plain words, worked out from the provider's own failure code before it is stored here.
  failure_reason text,
  -- The consent that was given BEFORE this bot was sent, and the exact words it was given to.
  -- On the bot's row rather than in consent_records, because this is an attestation about ONE
  -- meeting, and consent_records is a once-per-person notice (unique on user and version).
  consent_version text not null,
  consent_text_hash text not null,
  consented_at timestamptz not null default now(),
  -- What the plan allowed when the bot was sent. Kept so a later change to the plan cannot
  -- rewrite history, and so a cap can reserve what a bot in a call might still spend.
  max_minutes integer check (max_minutes is null or max_minutes > 0),
  joined_at timestamptz,
  recording_started_at timestamptz,
  ended_at timestamptz,
  recording_seconds integer check (recording_seconds is null or recording_seconds >= 0),
  -- When our copy at the provider was deleted. Null means it is still there.
  media_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One bot id per provider. Also the index the webhook looks a bot up by, which is the busiest
-- read in the whole feature.
create unique index meeting_bots_external_idx
  on public.meeting_bots (provider, external_id)
  where external_id is not null;

-- For the daily caps, which ask "which bots are in a call right now".
create index meeting_bots_live_idx
  on public.meeting_bots (account_id, created_at)
  where phase in ('joining', 'waiting', 'recording');

alter table public.meeting_bots enable row level security;

-- Everybody on the account may read it, the same rule the notes themselves follow.
create policy "Read meeting bots of own accounts" on public.meeting_bots
  for select to authenticated using ((select private.is_account_member(account_id)));

revoke all on public.meeting_bots from anon, authenticated;
grant select on public.meeting_bots to authenticated;

-- ---------------------------------------------------------------------------
-- 6. How many bot hours an account has spent.
-- ---------------------------------------------------------------------------
-- Two parts, and the second one matters more than it looks:
--
--   finished hours -- from ai_usage, where every cost row already lives. units are MINUTES.
--   reserved hours -- for every bot still in a call, the minutes it is ALLOWED to run for.
--
-- Without the reservation, four bots started in the same minute would each look at a cap nobody
-- had spent anything against yet, and all four would pass. The reservation is what makes a cap a
-- cap rather than a suggestion. It is deliberately pessimistic: a bot that leaves early gives its
-- unused reservation back the moment its real cost row is written.
--
-- p_account null means the whole of Gyan, which is how the service-wide cap is counted.
create function private.bot_hours_used(p_account uuid, p_since timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(au.units) / 60.0
      from public.ai_usage au
      where au.kind = 'bot'
        and au.created_at >= p_since
        and (p_account is null or au.account_id = p_account)
    ), 0)
    +
    coalesce((
      select sum(coalesce(mb.max_minutes, 60)) / 60.0
      from public.meeting_bots mb
      where mb.phase in ('joining', 'waiting', 'recording')
        and mb.created_at >= p_since
        and (p_account is null or mb.account_id = p_account)
    ), 0);
$$;

revoke execute on function private.bot_hours_used(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. May this account send a bot at all?
-- ---------------------------------------------------------------------------
-- Four separate refusals, each with its own code, so the screen can say WHICH one it was instead
-- of a single unhelpful "no". Every number comes out of a table. There is not one in this file.
create function private.assert_bot_allowed(p_account uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_hours numeric;
  used_month numeric;
  rule public.security_settings;
  day_start timestamptz := pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'utc')
                           at time zone 'utc';
  month_start timestamptz := pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'utc')
                             at time zone 'utc';
begin
  -- 1. The switch. This is first, so a refusal is never about money when the feature is simply off.
  if not (select private.meeting_bot_enabled(p_account)) then
    raise exception 'bot_not_enabled' using errcode = 'P0001';
  end if;

  -- 2. The plan's hours for the month.
  select p.bot_hours_per_month into month_hours
  from public.accounts a
  join public.plans p on p.id = a.plan_id
  where a.id = p_account;

  if month_hours is null or month_hours <= 0 then
    raise exception 'bot_no_hours' using errcode = 'P0001';
  end if;

  used_month := (select private.bot_hours_used(p_account, month_start));
  if used_month >= month_hours then
    raise exception 'bot_hours_used' using errcode = 'P0001';
  end if;

  -- 3 and 4. The two safety caps, so a mistake cannot run up a large bill in one day.
  select * into rule from public.security_settings where kind = 'meeting_bot';
  if not found then
    -- No row means no caps, which is the same meaning the rate-limit columns already give a
    -- missing row. The monthly allowance above has already bitten, so this is not open-ended.
    return;
  end if;

  if rule.bot_hours_per_day_account is not null
     and (select private.bot_hours_used(p_account, day_start)) >= rule.bot_hours_per_day_account then
    raise exception 'bot_day_cap_account' using errcode = 'P0001';
  end if;

  if rule.bot_hours_per_day_service is not null
     and (select private.bot_hours_used(null, day_start)) >= rule.bot_hours_per_day_service then
    raise exception 'bot_day_cap_service' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function private.assert_bot_allowed(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. start_bot_note: everything that has to be true, in ONE step.
-- ---------------------------------------------------------------------------
-- The switch, the monthly meeting limit, the bot-hour allowance and both daily caps are all
-- checked in the same transaction that writes the rows. One step, so two fast taps cannot both
-- pass a cap neither of them has spent against yet -- the same reasoning claim_chat_message uses
-- for the daily question limit.
--
-- A bot CANNOT exist without consent: both consent arguments are required and are stored on the
-- row. The server has already checked they match the words currently on screen.
create function public.start_bot_note(
  p_meeting_id uuid,
  p_account_id uuid,
  p_user_id uuid,
  p_provider text,
  p_platform text,
  p_meeting_url text,
  p_consent_version text,
  p_consent_hash text
)
returns table (bot_name text, max_minutes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_name text;
  the_minutes integer;
begin
  -- The person must be on the account. Checked here, in SQL, not taken on trust from the caller.
  if p_user_id is null or not exists (
    select 1 from public.account_members am
    where am.account_id = p_account_id and am.user_id = p_user_id
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if p_platform not in ('zoom', 'meet', 'teams') then
    raise exception 'bad_platform' using errcode = 'P0001';
  end if;
  if p_meeting_url is null or pg_catalog.btrim(p_meeting_url) = ''
     or pg_catalog.length(p_meeting_url) > 2000 then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;
  if p_consent_version is null or pg_catalog.btrim(p_consent_version) = ''
     or p_consent_hash is null or pg_catalog.btrim(p_consent_hash) = '' then
    raise exception 'no_consent' using errcode = 'P0001';
  end if;
  if p_provider is null or pg_catalog.btrim(p_provider) = '' then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;

  -- The switch and the money, in that order.
  perform private.assert_bot_allowed(p_account_id);
  -- A bot meeting counts as one meeting, exactly like an upload, so it is held to the same
  -- monthly limit by the same function.
  perform private.assert_under_limit(p_account_id);

  the_name := (select private.effective_bot_name(p_account_id));
  select p.max_meeting_minutes into the_minutes
  from public.accounts a
  join public.plans p on p.id = a.plan_id
  where a.id = p_account_id;

  insert into public.meetings (id, account_id, created_by, title, source, status)
  values (p_meeting_id, p_account_id, p_user_id, null, 'bot', 'joining');

  insert into public.meeting_bots
    (meeting_id, account_id, requested_by, provider, platform, meeting_url, bot_name,
     phase, phase_rank, consent_version, consent_text_hash, max_minutes)
  values
    (p_meeting_id, p_account_id, p_user_id, p_provider, p_platform, p_meeting_url, the_name,
     'joining', 0, p_consent_version, p_consent_hash, the_minutes);

  return query select the_name, the_minutes;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. attach_bot: write down the provider's id for this bot.
-- ---------------------------------------------------------------------------
-- Separate from start_bot_note because the id does not exist until the provider has answered, and
-- the rows have to exist first so that a status event arriving a second later has something to
-- find. Until this runs, an event is matched by the note id the provider echoes back.
create function public.attach_bot(p_meeting_id uuid, p_external_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_external_id is null or pg_catalog.btrim(p_external_id) = ''
     or pg_catalog.length(p_external_id) > 200 then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;
  update public.meeting_bots mb
  set external_id = p_external_id, updated_at = pg_catalog.now()
  where mb.meeting_id = p_meeting_id and mb.external_id is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. record_bot_phase: move the bot and the note together, and never backwards.
-- ---------------------------------------------------------------------------
-- Returns the note id it changed, or nothing when the event was ignored, so the server can say
-- which it was in its log without reading the row again.
create function public.record_bot_phase(
  p_meeting_id uuid,
  p_phase text,
  p_reason text default null
)
returns table (meeting_id uuid, account_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bot public.meeting_bots;
  new_rank smallint;
  note_status text;
begin
  new_rank := case p_phase
    when 'joining' then 0 when 'waiting' then 1 when 'recording' then 2
    when 'processing' then 3 when 'ready' then 4 when 'failed' then 5 else null end;
  if new_rank is null then
    raise exception 'bad_phase' using errcode = 'P0001';
  end if;

  select * into bot from public.meeting_bots mb where mb.meeting_id = p_meeting_id;
  if not found then
    return;
  end if;

  -- Already finished, or an event that would move it backwards. Both are ignored rather than
  -- believed: status events really do arrive out of order, and 'failed' must stick.
  if bot.phase in ('ready', 'failed') then
    return;
  end if;
  if new_rank <= bot.phase_rank and p_phase <> 'failed' then
    return;
  end if;

  note_status := case p_phase
    when 'joining' then 'joining'
    when 'waiting' then 'waiting'
    when 'recording' then 'recording'
    -- The call has ended and the provider is putting the recording together. The note stays on
    -- 'recording' until the audio is really in our own bucket, because 'queued' is a promise that
    -- there is a file to transcribe.
    when 'processing' then 'recording'
    when 'failed' then 'failed'
    else null end;

  update public.meeting_bots mb
  set phase = p_phase,
      phase_rank = new_rank,
      failure_reason = case when p_phase = 'failed' then pg_catalog.left(p_reason, 300) else mb.failure_reason end,
      joined_at = case when p_phase in ('waiting', 'recording') and mb.joined_at is null
                       then pg_catalog.now() else mb.joined_at end,
      recording_started_at = case when p_phase = 'recording' and mb.recording_started_at is null
                                  then pg_catalog.now() else mb.recording_started_at end,
      ended_at = case when p_phase in ('processing', 'failed') and mb.ended_at is null
                      then pg_catalog.now() else mb.ended_at end,
      -- The link lets anybody join the call. Once the bot is in, Gyan never needs it again.
      meeting_url = case when p_phase in ('recording', 'processing', 'failed') then null
                         else mb.meeting_url end,
      updated_at = pg_catalog.now()
  where mb.meeting_id = p_meeting_id;

  if note_status is not null then
    update public.meetings m
    set status = note_status,
        error_message = case when p_phase = 'failed' then pg_catalog.left(p_reason, 300) else null end
    where m.id = p_meeting_id
      and m.status in ('joining', 'waiting', 'recording');
  end if;

  return query select bot.meeting_id, bot.account_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. bot_recording_ready: the audio is in our bucket. Hand the note to the normal pipeline.
-- ---------------------------------------------------------------------------
-- The cost row is written in the SAME transaction as the work it paid for, which is what all
-- seven existing ai_usage rows do. units are MINUTES, matching the transcription row, so one
-- division works for both.
create function public.bot_recording_ready(
  p_meeting_id uuid,
  p_file_path text,
  p_recording_seconds integer,
  p_cost numeric,
  p_provider text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bot public.meeting_bots;
  minutes numeric;
begin
  select * into bot from public.meeting_bots mb where mb.meeting_id = p_meeting_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if bot.phase in ('ready', 'failed') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  -- The same path rule create_note enforces, and for the same reason: three server functions
  -- read this path with the service key, which skips every storage rule.
  if p_file_path is null
     or p_file_path not like (bot.account_id::text || '/' || p_meeting_id::text || '/%')
     or p_file_path ~ '(^|/)\.{1,2}(/|$)'
     or p_file_path like '%//%'
     or p_file_path like '%\\%'
     or p_file_path like '/%' then
    raise exception 'bad_file_path' using errcode = 'P0001';
  end if;

  minutes := round(coalesce(p_recording_seconds, 0)::numeric / 60.0, 4);

  update public.meeting_bots mb
  set phase = 'ready', phase_rank = 4,
      recording_seconds = p_recording_seconds,
      ended_at = coalesce(mb.ended_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where mb.meeting_id = p_meeting_id;

  -- 'queued' is where an upload starts. From here the note is an ordinary note.
  update public.meetings m
  set status = 'queued', error_message = null, file_path = p_file_path
  where m.id = p_meeting_id and m.status in ('joining', 'waiting', 'recording');

  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (bot.account_id, p_meeting_id, 'bot', p_provider, minutes, p_cost);
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. mark_bot_media_deleted: our copy at the provider is gone.
-- ---------------------------------------------------------------------------
create function public.mark_bot_media_deleted(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meeting_bots mb
  set media_deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where mb.meeting_id = p_meeting_id and mb.media_deleted_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. bot_for_stop: what Stop recording needs, after checking who is asking.
-- ---------------------------------------------------------------------------
-- Anybody on the account may stop a bot. Stopping a recording is not a destructive act and
-- waiting for the owner while a bot sits in a call you did not mean to record would be worse.
create function public.bot_for_stop(p_meeting_id uuid, p_user_id uuid)
returns table (external_id text, provider text, phase text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bot public.meeting_bots;
begin
  select * into bot from public.meeting_bots mb where mb.meeting_id = p_meeting_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_user_id is null or not exists (
    select 1 from public.account_members am
    where am.account_id = bot.account_id and am.user_id = p_user_id
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if bot.phase not in ('joining', 'waiting', 'recording') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if bot.external_id is null then
    raise exception 'not_started' using errcode = 'P0001';
  end if;

  return query select bot.external_id, bot.provider, bot.phase;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. fail_bot: a plain reason, and the meeting never counts.
-- ---------------------------------------------------------------------------
create function public.fail_bot(p_meeting_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_bot_phase(p_meeting_id, 'failed', p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Finding the bot a status event belongs to.
-- ---------------------------------------------------------------------------
-- Two ways, in this order: the provider's own id, or the note id the provider echoes back in the
-- metadata it was given. The second only works before attach_bot has run, which is exactly the
-- window it exists for -- a bot's first event can arrive before its id has been written down.
--
-- The note id is only accepted when that row has no id yet, so a verified-but-stale event can
-- never be pointed at somebody else's bot.
create function public.bot_note_for_event(
  p_provider text,
  p_external_id text,
  p_note_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_id uuid;
begin
  select mb.meeting_id into found_id
  from public.meeting_bots mb
  where mb.provider = p_provider and mb.external_id = p_external_id;
  if found_id is not null then
    return found_id;
  end if;

  if p_note_id is null then
    return null;
  end if;

  select mb.meeting_id into found_id
  from public.meeting_bots mb
  where mb.meeting_id = p_note_id and mb.provider = p_provider and mb.external_id is null;
  return found_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. claim_transcription now accepts a bot note. THIS CHANGES AN EXISTING RULE.
-- ---------------------------------------------------------------------------
-- The only change is `source <> 'upload'` becoming `source not in ('upload', 'bot')`. A bot
-- recording is an audio file in the same bucket under the same path rules; there was never any
-- other reason for the test. Everything else below is the function exactly as it was.
create or replace function public.claim_transcription(p_meeting_id uuid, p_user_id uuid)
returns table (account_id uuid, file_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.meetings;
begin
  select * into note from public.meetings m where m.id = p_meeting_id;
  if not found
     or not exists (
       select 1 from public.account_members am
       where am.account_id = note.account_id and am.user_id = p_user_id
     ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  -- CHANGED (prompt 14): a bot note has audio too.
  if note.source not in ('upload', 'bot') or note.file_path is null then
    raise exception 'no_audio' using errcode = 'P0001';
  end if;
  if note.status not in ('queued', 'failed') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  -- The monthly limit comes from the plans table (checked again, like on upload).
  perform private.assert_under_limit(note.account_id);

  update public.meetings m
  set status = 'transcribing', error_message = null
  where m.id = p_meeting_id and m.status in ('queued', 'failed');
  if not found then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  return query select note.account_id, note.file_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- 17. The longest a meeting may be, enforced at last.
-- ---------------------------------------------------------------------------
-- plans.max_meeting_minutes has existed since the first migration and nothing has ever read it to
-- refuse anything. It was a label on a pricing page.
--
-- WHY THE CHECK IS HERE AND NOT EARLIER. A server cannot know how long a recording is without
-- reading it. For a bot the provider is told to make the bot leave at the limit, so it never
-- costs more. For an upload the app checks the duration where it can (the web can read it; a
-- phone cannot), and this is the backstop that cannot be got round: by the time Deepgram answers,
-- the real length is known. The honest cost is that one transcription has already been paid for.
-- The note fails, says why, and does not count.
create function private.over_meeting_limit(p_account uuid, p_seconds numeric)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  allowed integer;
begin
  select p.max_meeting_minutes into allowed
  from public.accounts a
  join public.plans p on p.id = a.plan_id
  where a.id = p_account;

  -- No limit on this plan.
  if allowed is null then
    return null;
  end if;
  -- A little slack, so a 60 minute limit is not failed by a recording that measures 60:00.4.
  if coalesce(p_seconds, 0) > (allowed::numeric * 60) + 30 then
    return allowed;
  end if;
  return null;
end;
$$;

revoke execute on function private.over_meeting_limit(uuid, numeric) from public, anon, authenticated;

-- What the app asks before it uploads, so an over-long file is refused before anything is spent.
-- Any member may ask. It tells them the limit rather than just saying no.
create function public.meeting_minutes_allowed()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  allowed integer;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select am.account_id into my_account
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;
  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  select p.max_meeting_minutes into allowed
  from public.accounts a
  join public.plans p on p.id = a.plan_id
  where a.id = my_account;
  return allowed;
end;
$$;

-- finish_transcription now refuses a recording longer than the plan allows. THIS CHANGES AN
-- EXISTING RULE. Everything else below is the function exactly as it was.
create or replace function public.finish_transcription(
  p_meeting_id uuid,
  p_language text,
  p_audio_seconds numeric,
  p_cost numeric,
  p_segments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid;
  over integer;
begin
  select m.account_id into acct from public.meetings m where m.id = p_meeting_id;
  if acct is null then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  -- NEW (prompt 14). The transcription is already paid for, so it is still logged below before
  -- the note fails: the money was spent and the record of it must be true.
  over := (select private.over_meeting_limit(acct, p_audio_seconds));
  if over is not null then
    insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
    values (acct, p_meeting_id, 'transcription', 'deepgram', p_audio_seconds, p_cost);

    update public.meetings m
    set status = 'failed',
        duration_seconds = round(p_audio_seconds)::integer,
        error_message = 'This is longer than the ' || over
          || ' minutes your plan allows for one note. A bigger plan allows longer notes.'
    where m.id = p_meeting_id;
    return;
  end if;

  update public.meetings m
  set status = 'summarizing',
      error_message = null,
      spoken_language = p_language,
      duration_seconds = round(p_audio_seconds)::integer
  where m.id = p_meeting_id and m.status = 'transcribing'
  returning m.account_id into acct;
  if not found then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  delete from public.transcript_segments s where s.meeting_id = p_meeting_id;
  insert into public.transcript_segments (meeting_id, speaker_label, start_ms, end_ms, text)
  select p_meeting_id, x.speaker_label, x.start_ms, x.end_ms, x.text
  from jsonb_to_recordset(p_segments)
    as x(speaker_label text, start_ms integer, end_ms integer, text text);

  -- No usage +1 here. It happens in finish_summary, when the note is really done.
  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (acct, p_meeting_id, 'transcription', 'deepgram', p_audio_seconds, p_cost);
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. get_plan_and_usage gains the bot numbers. THIS CHANGES AN EXISTING FUNCTION.
-- ---------------------------------------------------------------------------
-- Two columns added at the end. Nothing else changes. The screen reads the hours from here, so
-- the number it shows and the number that blocks a bot come from one place.
drop function if exists public.get_plan_and_usage();
create function public.get_plan_and_usage()
returns table (
  account_id uuid,
  is_owner boolean,
  plan_name text,
  plan_description text,
  plan_features jsonb,
  is_test_plan boolean,
  meetings_per_month integer,
  chat_messages_per_day integer,
  seats_included integer,
  max_meeting_minutes integer,
  meetings_used integer,
  chat_messages_used integer,
  chat_messages_left integer,
  seats_used integer,
  members_count integer,
  invites_pending integer,
  bot_hours_per_month numeric,
  bot_hours_used numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  my_role text;
  this_month date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select am.account_id, am.role into my_account, my_role
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;

  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  return query
  select my_account,
         my_role = 'owner',
         p.name,
         p.description,
         p.features,
         p.is_test,
         p.meetings_per_month,
         p.chat_messages_per_day,
         p.seats_included,
         p.max_meeting_minutes,
         -- The same month boundary private.assert_under_limit uses, so the number on the screen
         -- and the number that blocks an upload can never differ.
         (select coalesce(sum(u.meetings_used), 0)::integer
          from public.usage u
          where u.account_id = my_account and u.month = this_month),
         -- The same day boundary private.chat_questions_left uses: midnight, UTC.
         (select count(*)::integer
          from public.chat_messages cm
          join public.chat_threads t on t.id = cm.thread_id
          where t.user_id = me
            and t.account_id = my_account
            and cm.role = 'user'
            and cm.created_at >= date_trunc('day', now() at time zone 'utc')),
         -- How many are left comes from the one function that decides the daily limit, never
         -- from subtracting here. If the screen did its own sum it could disagree with the gate.
         private.chat_questions_left(my_account, me),
         private.seats_used(my_account),
         (select count(*)::integer from public.account_members am where am.account_id = my_account),
         (select count(*)::integer from public.invites i
          where i.account_id = my_account and i.status = 'pending'),
         p.bot_hours_per_month,
         -- Again from the one function the gate uses, including the reservation for any bot that
         -- is in a call right now. So the meter on the screen is what the cap really sees.
         round(private.bot_hours_used(
                 my_account,
                 date_trunc('month', now() at time zone 'utc') at time zone 'utc'), 2)
  from public.accounts a
  join public.plans p on p.id = a.plan_id
  where a.id = my_account;
end;
$$;

-- ---------------------------------------------------------------------------
-- 19. Who may run what.
-- ---------------------------------------------------------------------------
-- The doors that decide whether a bot may be sent, or move one along, are the server's alone.
-- The app can never reach them, whatever it asks.
revoke execute on function public.start_bot_note(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.attach_bot(uuid, text) from public, anon, authenticated;
revoke execute on function public.record_bot_phase(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.bot_recording_ready(uuid, text, integer, numeric, text)
  from public, anon, authenticated;
revoke execute on function public.mark_bot_media_deleted(uuid) from public, anon, authenticated;
revoke execute on function public.bot_for_stop(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fail_bot(uuid, text) from public, anon, authenticated;
revoke execute on function public.bot_note_for_event(text, text, uuid) from public, anon, authenticated;

grant execute on function public.start_bot_note(uuid, uuid, uuid, text, text, text, text, text)
  to service_role;
grant execute on function public.attach_bot(uuid, text) to service_role;
grant execute on function public.record_bot_phase(uuid, text, text) to service_role;
grant execute on function public.bot_recording_ready(uuid, text, integer, numeric, text) to service_role;
grant execute on function public.mark_bot_media_deleted(uuid) to service_role;
grant execute on function public.bot_for_stop(uuid, uuid) to service_role;
grant execute on function public.fail_bot(uuid, text) to service_role;
grant execute on function public.bot_note_for_event(text, text, uuid) to service_role;

-- The two the app reads, and the one the owner may write.
revoke execute on function public.get_meeting_bot_settings() from public, anon;
grant execute on function public.get_meeting_bot_settings() to authenticated;
revoke execute on function public.save_meeting_bot_settings(jsonb) from public, anon;
grant execute on function public.save_meeting_bot_settings(jsonb) to authenticated;
revoke execute on function public.meeting_minutes_allowed() from public, anon;
grant execute on function public.meeting_minutes_allowed() to authenticated;

-- Replaced above, so their permissions are set again from nothing.
revoke execute on function public.claim_transcription(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_transcription(uuid, uuid) to service_role;
revoke execute on function public.finish_transcription(uuid, text, numeric, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.finish_transcription(uuid, text, numeric, numeric, jsonb)
  to service_role;
revoke execute on function public.get_plan_and_usage() from public, anon;
grant execute on function public.get_plan_and_usage() to authenticated;
