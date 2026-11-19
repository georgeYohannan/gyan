-- Translation on request: turn a note's summary or transcript into another language, and save it
-- so the same translation is never paid for twice.
--
-- The translations table, its read rule, and profiles.preferred_language ALL already exist (see
-- the first two migrations). The only thing missing was a server-only way to WRITE a translation.
-- This file adds the 2 functions the translate server function calls.
--
-- This file only ADDS things. It deletes nothing, and it changes no existing rule.

-- 1. Start a translation.
-- Done in one step: it checks the person may use the note, works out what is being translated,
-- and hands back a translation that is already saved, if there is one. When `existing` comes back
-- filled in, the server function stops there: Claude is never asked, and nothing is charged.
create function public.claim_translation(
  p_meeting_id uuid,
  p_user_id uuid,
  p_kind text,
  p_language text
)
returns table (
  account_id uuid,
  source_id uuid,
  existing text,
  note_source text,
  file_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.meetings;
  found_source uuid;
  saved text;
begin
  if p_kind is null or p_kind not in ('summary', 'transcript') then
    raise exception 'bad_kind' using errcode = 'P0001';
  end if;

  if p_language is null or btrim(p_language) = '' then
    raise exception 'bad_language' using errcode = 'P0001';
  end if;

  select * into note from public.meetings m where m.id = p_meeting_id;
  if not found
     or not exists (
       select 1 from public.account_members am
       where am.account_id = note.account_id and am.user_id = p_user_id
     ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- What exactly is being translated. A summary has its own row; a transcript is the note itself.
  if p_kind = 'summary' then
    select s.id into found_source from public.summaries s where s.meeting_id = p_meeting_id;
    if found_source is null then
      raise exception 'no_summary' using errcode = 'P0001';
    end if;
  else
    found_source := p_meeting_id;
  end if;

  -- Already translated into this language? Then it is free and instant.
  select t.content into saved
  from public.translations t
  where t.kind = p_kind and t.source_id = found_source and t.language = btrim(p_language);

  return query select note.account_id, found_source, saved, note.source, note.file_path;
end;
$$;

-- 2. Save the translation and log what it cost, in one step.
-- The unique key on (kind, source_id, language) is what makes a translation a one-off purchase.
-- If two people asked at the same moment, the second write updates the first instead of failing.
create function public.save_translation(
  p_meeting_id uuid,
  p_account_id uuid,
  p_kind text,
  p_source_id uuid,
  p_language text,
  p_content text,
  p_tokens numeric,
  p_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_translation uuid;
begin
  if p_kind not in ('summary', 'transcript') then
    raise exception 'bad_kind' using errcode = 'P0001';
  end if;

  if p_content is null or btrim(p_content) = '' then
    raise exception 'empty_translation' using errcode = 'P0001';
  end if;

  insert into public.translations (meeting_id, kind, source_id, language, content)
  values (p_meeting_id, p_kind, p_source_id, btrim(p_language), p_content)
  on conflict (kind, source_id, language) do update set content = excluded.content
  returning id into new_translation;

  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (p_account_id, p_meeting_id, 'translation', 'anthropic', p_tokens, p_cost);

  return new_translation;
end;
$$;

-- Only the server may run these 2. The app can still only READ translations, as before.
revoke execute on function public.claim_translation(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.save_translation(uuid, uuid, text, uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.claim_translation(uuid, uuid, text, text) to service_role;
grant execute on function public.save_translation(uuid, uuid, text, uuid, text, text, numeric, numeric) to service_role;
