-- Transcription: 3 server-only functions that move a note through Transcribing -> Ready (or Failed).
-- This file only ADDS things. It deletes nothing.
-- They live in "public" so the server function can call them, but ONLY the server (service_role)
-- may run them. The app (signed-in or signed-out) cannot.

-- 1. Start: Queued (or Failed, for a retry) -> Transcribing. Done in one step, so two clicks
-- can never start two transcriptions (and never pay Deepgram twice).
create function public.claim_transcription(p_meeting_id uuid, p_user_id uuid)
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
  if note.source <> 'upload' or note.file_path is null then
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

-- 2. Done: save the lines, the language, and the length. Transcribing -> Ready.
-- This is also the moment the meeting counts (+1 for this month) and the Deepgram cost is logged.
-- Later steps insert "Summarizing" before "Ready" right here.
create function public.finish_transcription(
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
begin
  update public.meetings m
  set status = 'ready',
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
  from jsonb_to_recordset(p_segments) as x(speaker_label text, start_ms integer, end_ms integer, text text);

  insert into public.usage (account_id, month, meetings_used)
  values (acct, date_trunc('month', now() at time zone 'utc')::date, 1)
  on conflict (account_id, month) do update set meetings_used = public.usage.meetings_used + 1;

  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (acct, p_meeting_id, 'transcription', 'deepgram', p_audio_seconds, p_cost);
end;
$$;

-- 3. Problem: Failed, with a plain message. Nothing is counted.
create function public.fail_transcription(p_meeting_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meetings m
  set status = 'failed',
      error_message = left(coalesce(p_message, 'Something went wrong while making the transcript.'), 300)
  where m.id = p_meeting_id and m.status in ('queued', 'transcribing');
end;
$$;

-- Only the server may run these.
revoke execute on function public.claim_transcription(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finish_transcription(uuid, text, numeric, numeric, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_transcription(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_transcription(uuid, uuid) to service_role;
grant execute on function public.finish_transcription(uuid, text, numeric, numeric, jsonb) to service_role;
grant execute on function public.fail_transcription(uuid, text) to service_role;
