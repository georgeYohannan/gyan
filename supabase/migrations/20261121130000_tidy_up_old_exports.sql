-- Old copies of people's data do not sit around for ever.
--
-- A finished export is the most concentrated copy of somebody's information there is: every
-- note on the workspace, every transcript and summary, their own chats, and the recordings.
-- It was written and then left alone indefinitely.
--
-- The link to it expires after an hour, so nobody could REACH an old one -- but it still
-- existed, and a copy that exists is a copy that can be lost. There is no reason to keep it:
-- anybody who wants another can ask for one in a few seconds.
--
-- The sweep that deletes old notes now reports old exports as well, so the one job tidies
-- both. Database rules do not reach storage, so it hands back the paths and the server
-- empties the bucket -- exactly as deleting a note and deleting an account already work.

create or replace function public.run_retention(p_dry_run boolean default true)
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
-- Which exports are past their day
-- ---------------------------------------------------------------------------
-- Separate from run_retention on purpose. An export is not a note: it is not governed by
-- the account's keeping time, it is simply rubbish after a day, and its files live in a
-- different bucket. Mixing the two would have made one function that means two things.
--
-- It reports rather than deletes, because the files are in storage and only the server can
-- reach them. The server deletes the objects and tells us which ones went.
create table public.export_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null,
  path text not null,
  bytes bigint,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index export_log_tidy_idx on public.export_log (created_at) where deleted_at is null;

alter table public.export_log enable row level security;

-- Nobody reads this from the app. Knowing that a copy was taken is already in audit_log,
-- which the owner can read; this table exists only so the server knows what to tidy up.
revoke all on public.export_log from anon, authenticated;

/** Writes down that an export was made, so it can be tidied up later. SERVER ONLY. */
create function public.record_export(p_account_id uuid, p_user_id uuid, p_path text, p_bytes bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.export_log (account_id, user_id, path, bytes)
  values (p_account_id, p_user_id, p_path, p_bytes);
end;
$$;

revoke execute on function public.record_export(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.record_export(uuid, uuid, text, bigint) to service_role;

/**
 * Which exports are older than a day and have not been tidied up yet.
 *
 * DRY RUN BY DEFAULT, like run_retention. Called with nothing it changes nothing and only
 * says what it would do.
 */
create function public.old_exports(p_dry_run boolean default true, p_older_than_hours int default 24)
returns table (id uuid, path text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  create temporary table if not exists doomed_exports (id uuid, path text, created_at timestamptz)
    on commit drop;
  delete from doomed_exports;

  insert into doomed_exports
  select e.id, e.path, e.created_at
  from public.export_log e
  where e.deleted_at is null
    and e.created_at < pg_catalog.now() - (greatest(p_older_than_hours, 1) || ' hours')::interval;

  -- Marked as gone only when the server really has emptied the bucket, which is why this
  -- is a second step rather than part of choosing them.
  if not p_dry_run then
    update public.export_log e
    set deleted_at = pg_catalog.now()
    where e.id in (select d.id from doomed_exports d);
  end if;

  return query select d.id, d.path, d.created_at from doomed_exports d;
end;
$$;

revoke execute on function public.old_exports(boolean, int) from public, anon, authenticated;
grant execute on function public.old_exports(boolean, int) to service_role;
