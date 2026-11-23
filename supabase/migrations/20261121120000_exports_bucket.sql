-- A separate, private place for the copies people download of their own data.
--
-- TWO REASONS IT IS NOT IN notes-files.
--
-- 1. WHO CAN READ IT. The rule on notes-files lets any member of an account read any file
--    whose first part is that account's id. That is right for recordings, because notes are
--    shared with the whole account. An export is not: it also holds the person's own profile
--    row and their own entries in the record of what happened, and that record is
--    OWNER-ONLY by rule. A teammate could have opened the owner's export and read the
--    owner's history out of it. (Found by the security review of this round's own work.)
--
-- 2. WHAT IT IS. notes-files only accepts audio, video and text. An export is a zip, so the
--    upload would have been refused outright -- the feature would simply not have worked.
--
-- This bucket has NO rules at all, on purpose. That means nobody can read it through the
-- app, by any path. The server writes with the service key, which skips rules, and hands
-- back a link that works for an hour. That link is the only way in, and it is given only to
-- the person who asked for it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-exports',
  'account-exports',
  false,
  -- Room for the zip, which the export function caps well below this.
  104857600,
  array['application/zip']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- No policy is created for this bucket. That is the point: with none, the rules match
-- nothing and the app can neither list, read nor write here. Only the service key can,
-- and only our own export function holds that.
