-- Stopping a note from pointing at somebody else's file.
--
-- THE HOLE. create_note lets the app choose where a file is kept, and checked only that the
-- path STARTED with the right account and note:
--
--     p_file_path like (account || '/' || meeting || '/%')
--
-- That passes this:
--
--     <my account>/<my note>/../../<your account>/<your note>/recording.m4a
--
-- and the "../.." is taken out later, by the thing that turns a path into a web address. The
-- parser every browser and server uses collapses those segments before the request goes out,
-- so the storage service never sees them. It is handed an ordinary key belonging to somebody
-- else -- and three server functions read files with the service key, which skips every rule.
--
-- Found by the security review of this round's own work (docs/security/audit-1.md). The
-- server functions now check the path themselves as well; this is the root cause, and the
-- database is the right place for it because meetings.file_path is trusted by all of them.
--
-- Nothing legitimate is affected: every path Gyan writes is
-- <account>/<note>/<random name>, which has no such segment in it.

create or replace function public.create_note(
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

  -- NEW: the path must not be able to climb out of that folder, or mean something other
  -- than it appears to. A single dot, two dots, an empty step, a backslash or a leading
  -- slash can all change what the path points at once it becomes a web address.
  --
  -- There is deliberately no check for a null byte: a Postgres text value cannot hold one
  -- at all, and chr(0) raises an error rather than returning anything, so a check for it
  -- would refuse EVERY note. (It did, until npm run check:db tried a real one.)
  if p_file_path ~ '(^|/)\.{1,2}(/|$)'
     or p_file_path like '%//%'
     or p_file_path like '%\\%'
     or p_file_path like '/%' then
    raise exception 'bad_file_path' using errcode = 'P0001';
  end if;

  -- An upload counts against the monthly limit. Pasted text and text files never do.
  if p_source = 'upload' then
    perform private.assert_under_limit(p_account_id);
  end if;

  insert into public.meetings (id, account_id, created_by, title, source, status, file_path)
  values (p_meeting_id, p_account_id, (select auth.uid()), nullif(btrim(p_title), ''), p_source, 'uploading', p_file_path);

  return p_meeting_id;
end;
$$;

revoke execute on function public.create_note(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_note(uuid, uuid, text, text, text) to authenticated;
