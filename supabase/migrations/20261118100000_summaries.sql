-- Summary and action items: the step after the transcript.
-- A note now goes Queued -> Transcribing -> Summarizing -> Ready.
-- The +1 to the monthly count moves to the END (when the note becomes Ready), so a note that
-- never finishes never costs the person a meeting. Pasted text never counts at all.
-- These functions live in "public" so the server function can call them, but ONLY the server
-- (service_role) may run them. The app cannot.

-- 1. Two new columns on meetings.
-- counted_at: stamped the first time the note counts, so Regenerate can never count it twice.
-- summary_started_at: the "someone is already working on this" lock. It also lets a note that got
-- stuck (for example the server stopped halfway) be picked up again after 3 minutes.
alter table public.meetings add column if not exists counted_at timestamptz;
alter table public.meetings add column if not exists summary_started_at timestamptz;

-- 2. The transcript step now hands the note on to the summary step instead of finishing it.
-- Same name and same arguments as before, so nothing else has to change.
-- What changed: status becomes 'summarizing' (not 'ready'), and the +1 to usage has moved out.
-- The Deepgram cost row stays here, because that money was already spent.
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
begin
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
  from jsonb_to_recordset(p_segments) as x(speaker_label text, start_ms integer, end_ms integer, text text);

  -- No usage +1 here any more. It happens in finish_summary, when the note is really done.
  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (acct, p_meeting_id, 'transcription', 'deepgram', p_audio_seconds, p_cost);
end;
$$;

-- 3. Start the summary. Done in one step, so two clicks can never pay for two summaries.
-- Allowed from: queued (pasted text, which has no transcript step), summarizing (straight after
-- the transcript), failed (Retry summary), and ready (Regenerate).
create function public.claim_summary(p_meeting_id uuid, p_user_id uuid)
returns table (account_id uuid, source text, file_path text, language text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.meetings;
  lang text;
begin
  select * into note from public.meetings m where m.id = p_meeting_id;
  if not found
     or not exists (
       select 1 from public.account_members am
       where am.account_id = note.account_id and am.user_id = p_user_id
     ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if note.status not in ('queued', 'summarizing', 'failed', 'ready') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  -- Someone else started one less than 3 minutes ago. Leave it alone.
  if note.summary_started_at is not null
     and note.summary_started_at > (now() - interval '3 minutes') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  -- An upload with no transcript yet has nothing to summarize.
  if note.source <> 'text'
     and not exists (select 1 from public.transcript_segments s where s.meeting_id = p_meeting_id) then
    raise exception 'no_transcript' using errcode = 'P0001';
  end if;

  -- The monthly limit comes from the plans table. Only checked when this note has not been
  -- counted yet, so Regenerate still works for someone who is at their limit.
  if note.counted_at is null and note.source <> 'text' then
    perform private.assert_under_limit(note.account_id);
  end if;

  update public.meetings m
  set status = 'summarizing',
      error_message = null,
      summary_started_at = now()
  where m.id = p_meeting_id
    and m.status in ('queued', 'summarizing', 'failed', 'ready');
  if not found then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  -- The summary is written in the language the person who added the note prefers.
  select p.preferred_language into lang from public.profiles p where p.id = note.created_by;

  return query select note.account_id, note.source, note.file_path, coalesce(lang, 'en');
end;
$$;

-- 4. Done: save the summary and the action items. Summarizing -> Ready.
-- This is the moment the meeting counts (+1 for this month) and the Claude cost is logged.
create function public.finish_summary(
  p_meeting_id uuid,
  p_language text,
  p_title text,
  p_overview text,
  p_key_points jsonb,
  p_decisions jsonb,
  p_open_questions jsonb,
  p_action_items jsonb,
  p_tokens numeric,
  p_cost numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.meetings;
begin
  select * into note from public.meetings m where m.id = p_meeting_id;
  if not found or note.status <> 'summarizing' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  update public.meetings m
  set status = 'ready',
      error_message = null,
      summary_started_at = null,
      -- Only fill in the AI's title when the person did not give the note one.
      title = coalesce(nullif(btrim(coalesce(m.title, '')), ''), nullif(btrim(coalesce(p_title, '')), '')),
      counted_at = case
        when note.counted_at is null and note.source <> 'text' then now()
        else note.counted_at
      end
  where m.id = p_meeting_id and m.status = 'summarizing';
  if not found then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  delete from public.summaries s where s.meeting_id = p_meeting_id;
  insert into public.summaries (meeting_id, language, overview, key_points, decisions, open_questions)
  values (p_meeting_id, p_language, p_overview,
          coalesce(p_key_points, '[]'::jsonb),
          coalesce(p_decisions, '[]'::jsonb),
          coalesce(p_open_questions, '[]'::jsonb));

  delete from public.action_items a where a.meeting_id = p_meeting_id;
  insert into public.action_items (meeting_id, text, owner_name, due_text, start_ms)
  select p_meeting_id, x.text, x.owner, x.due, x.start_ms
  from jsonb_to_recordset(coalesce(p_action_items, '[]'::jsonb))
    as x(text text, owner text, due text, start_ms integer);

  -- Count the meeting only the first time, and never for pasted text.
  if note.counted_at is null and note.source <> 'text' then
    insert into public.usage (account_id, month, meetings_used)
    values (note.account_id, date_trunc('month', now() at time zone 'utc')::date, 1)
    on conflict (account_id, month) do update set meetings_used = public.usage.meetings_used + 1;
  end if;

  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (note.account_id, p_meeting_id, 'summary', 'anthropic', p_tokens, p_cost);
end;
$$;

-- 5. Problem: Failed, with a plain message. The transcript is kept and nothing is counted.
create function public.fail_summary(p_meeting_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meetings m
  set status = 'failed',
      summary_started_at = null,
      error_message = left(coalesce(p_message, 'Something went wrong while writing the summary.'), 300)
  where m.id = p_meeting_id and m.status = 'summarizing';
end;
$$;

-- Only the server may run these.
revoke execute on function public.claim_summary(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finish_summary(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.fail_summary(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_summary(uuid, uuid) to service_role;
grant execute on function public.finish_summary(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric) to service_role;
grant execute on function public.fail_summary(uuid, text) to service_role;

-- 6. The one new thing the app itself may write: ticking an action item off.
-- The column grant means "done" is the only column it can change, and the policy means it must be
-- an action item on one of the person's own notes.
grant update (done) on public.action_items to authenticated;
create policy "Tick action items of own meetings" on public.action_items
  for update to authenticated
  using ((select private.can_read_meeting(meeting_id)))
  with check ((select private.can_read_meeting(meeting_id)));
