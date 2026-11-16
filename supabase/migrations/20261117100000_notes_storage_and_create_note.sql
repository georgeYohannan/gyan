-- Adding notes: a private file bucket, rules for who can reach files,
-- and 3 safe "doors" the app uses to make and update a note.
-- The app still cannot write to the meetings table directly (see docs/decisions.md).

-- 1. The private bucket. 50 MB is the Free plan cap per file (Supabase docs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notes-files',
  'notes-files',
  false,
  52428800,
  array['audio/*', 'video/*', 'text/plain', 'text/markdown']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 2. Does this file path start with an account the signed-in person belongs to?
-- Paths look like: <account id>/<note id>/<file name>
create function private.can_use_file_path(file_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select file_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    and (select private.is_account_member(split_part(file_path, '/', 1)::uuid));
$$;

revoke execute on function private.can_use_file_path(text) from public, anon;
grant execute on function private.can_use_file_path(text) to authenticated;

-- 3. Storage rules: a person reaches only their own account's files.
create policy "Read files of own accounts" on storage.objects
  for select to authenticated
  using (bucket_id = 'notes-files' and (select private.can_use_file_path(name)));

create policy "Add files to own accounts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notes-files' and (select private.can_use_file_path(name)));

-- Needed so Retry can send the same file again.
create policy "Replace files of own accounts" on storage.objects
  for update to authenticated
  using (bucket_id = 'notes-files' and (select private.can_use_file_path(name)))
  with check (bucket_id = 'notes-files' and (select private.can_use_file_path(name)));

create policy "Delete files of own accounts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'notes-files' and (select private.can_use_file_path(name)));

-- 4. Has this account used up its meetings this month?
-- The limit comes from the plans table. Nothing is hard coded.
create function private.assert_under_limit(target_account uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  plan_limit integer;
  used integer;
begin
  select p.meetings_per_month into plan_limit
  from public.accounts a
  join public.plans p on p.id = a.plan_id
  where a.id = target_account;

  select coalesce(sum(u.meetings_used), 0) into used
  from public.usage u
  where u.account_id = target_account
    and u.month = date_trunc('month', now() at time zone 'utc')::date;

  if used >= plan_limit then
    raise exception 'limit_reached' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function private.assert_under_limit(uuid) from public, anon;
grant execute on function private.assert_under_limit(uuid) to authenticated;

-- 5. Door 1: make a note. Status starts as Uploading.
-- Pasted text (source "text") never counts as a meeting, so it skips the limit.
create function public.create_note(
  p_meeting_id uuid,
  p_account_id uuid,
  p_source text,
  p_title text,
  p_file_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_account_member(p_account_id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_source not in ('upload', 'text') then
    raise exception 'bad_source' using errcode = 'P0001';
  end if;
  if p_file_path is null
     or p_file_path not like (p_account_id::text || '/' || p_meeting_id::text || '/%') then
    raise exception 'bad_file_path' using errcode = 'P0001';
  end if;
  if p_source = 'upload' then
    perform private.assert_under_limit(p_account_id);
  end if;

  insert into public.meetings (id, account_id, created_by, title, source, status, file_path)
  values (p_meeting_id, p_account_id, (select auth.uid()), nullif(trim(p_title), ''), p_source, 'uploading', p_file_path);

  return p_meeting_id;
end;
$$;

-- 6. Door 2: the file arrived. Uploading -> Queued. The file must really be in the bucket.
create function public.mark_note_queued(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.meetings;
begin
  select * into note from public.meetings
  where id = p_meeting_id and created_by = (select auth.uid()) and status = 'uploading';
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'notes-files' and o.name = note.file_path
  ) then
    raise exception 'file_missing' using errcode = 'P0001';
  end if;
  update public.meetings set status = 'queued', error_message = null where id = p_meeting_id;
end;
$$;

-- 7. Door 3: the upload failed. Uploading -> Failed, with a plain message.
create function public.mark_note_failed(p_meeting_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meetings
  set status = 'failed', error_message = left(coalesce(p_message, 'The upload did not finish.'), 300)
  where id = p_meeting_id and created_by = (select auth.uid()) and status = 'uploading';
end;
$$;

-- 8. Door 4: Retry. Failed -> Uploading, only for notes that have a file to send again.
create function public.restart_note_upload(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.meetings;
begin
  select * into note from public.meetings
  where id = p_meeting_id and created_by = (select auth.uid()) and status = 'failed';
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if note.source = 'upload' then
    perform private.assert_under_limit(note.account_id);
  end if;
  update public.meetings set status = 'uploading', error_message = null where id = p_meeting_id;
end;
$$;

-- Only signed-in people may use the doors.
revoke execute on function public.create_note(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.mark_note_queued(uuid) from public, anon;
revoke execute on function public.mark_note_failed(uuid, text) from public, anon;
revoke execute on function public.restart_note_upload(uuid) from public, anon;
grant execute on function public.create_note(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.mark_note_queued(uuid) to authenticated;
grant execute on function public.mark_note_failed(uuid, text) to authenticated;
grant execute on function public.restart_note_upload(uuid) to authenticated;
