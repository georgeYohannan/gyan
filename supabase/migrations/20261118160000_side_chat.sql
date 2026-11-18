-- The side chat: ask questions about one note and get answers from its transcript only.
-- The chat_threads and chat_messages tables already exist (see the first migration). This file
-- adds the daily question limit, tightens the chat rules to "your own chat only", and adds the
-- 4 server-only functions the chat server function calls.
--
-- Nothing here deletes a table, a column, or anybody's data. It does replace 1 read rule and 1
-- helper function on purpose, to make the chat MORE private than before (see step 2).

-- 1. The daily question limit lives on the plan, so an admin can change it per plan with no new
-- code. Never write this number anywhere else.
alter table public.plans
  add column if not exists chat_messages_per_day integer not null default 20
  check (chat_messages_per_day >= 0);

update public.plans set chat_messages_per_day = 20 where name = 'Free';

-- 2. A person sees ONLY THEIR OWN chat, not their teammates'.
-- Before this file, any member of the account could read any thread on that account. A chat is
-- more personal than a note, so this narrows it. Notes themselves are still shared with the team.
create or replace function private.can_read_thread(target_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_threads t
    join public.account_members m on m.account_id = t.account_id
    where t.id = target_thread
      and m.user_id = (select auth.uid())
      and t.user_id = (select auth.uid())
  );
$$;

drop policy if exists "Read chat threads of own accounts" on public.chat_threads;
create policy "Read own chat threads" on public.chat_threads
  for select to authenticated using (user_id = (select auth.uid()));

-- "Read chat messages of own threads" keeps its name and now follows the stricter helper above.

-- A thread is one person's chat about one note, so there is only ever one of them.
create unique index if not exists chat_threads_one_per_person_per_note_idx
  on public.chat_threads (user_id, meeting_id);

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at);

-- 3. How many questions are left today. The number comes from the plans table, never from code.
-- The day starts at midnight UTC, the same way the monthly meeting count does.
create function private.chat_questions_left(target_account uuid, target_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  plan_limit integer;
  used integer;
begin
  select p.chat_messages_per_day into plan_limit
  from public.accounts a
  join public.plans p on p.id = a.plan_id
  where a.id = target_account;

  select count(*) into used
  from public.chat_messages cm
  join public.chat_threads t on t.id = cm.thread_id
  where t.user_id = target_user
    and t.account_id = target_account
    and cm.role = 'user'
    and cm.created_at >= date_trunc('day', now() at time zone 'utc');

  return greatest(coalesce(plan_limit, 0) - coalesce(used, 0), 0);
end;
$$;

revoke execute on function private.chat_questions_left(uuid, uuid) from public, anon;
grant execute on function private.chat_questions_left(uuid, uuid) to authenticated;

-- 4. Ask a question. Done in ONE step, so two fast taps can never slip past the limit.
-- It checks the person may use the note, checks the limit, finds or makes their thread, and saves
-- the question. The answer is saved later by finish_chat_message.
create function public.claim_chat_message(p_meeting_id uuid, p_user_id uuid, p_question text)
returns table (thread_id uuid, message_id uuid, account_id uuid, language text, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.meetings;
  found_thread uuid;
  new_message uuid;
  lang text;
  left_today integer;
begin
  if p_question is null or btrim(p_question) = '' then
    raise exception 'empty_question' using errcode = 'P0001';
  end if;

  select * into note from public.meetings m where m.id = p_meeting_id;
  if not found
     or not exists (
       select 1 from public.account_members am
       where am.account_id = note.account_id and am.user_id = p_user_id
     ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- The daily limit, read from the plans table.
  if private.chat_questions_left(note.account_id, p_user_id) <= 0 then
    raise exception 'limit_reached' using errcode = 'P0001';
  end if;

  -- One thread per person per note. Re-opened every time, so the chat is still there tomorrow.
  select t.id into found_thread
  from public.chat_threads t
  where t.user_id = p_user_id and t.meeting_id = p_meeting_id;
  if found_thread is null then
    insert into public.chat_threads (account_id, user_id, meeting_id)
    values (note.account_id, p_user_id, p_meeting_id)
    returning id into found_thread;
  end if;

  -- The language the person prefers. The answer is written in it.
  select p.preferred_language into lang from public.profiles p where p.id = p_user_id;

  insert into public.chat_messages (thread_id, role, content, language)
  values (found_thread, 'user', btrim(p_question), coalesce(lang, 'en'))
  returning id into new_message;

  left_today := private.chat_questions_left(note.account_id, p_user_id);

  return query select found_thread, new_message, note.account_id, coalesce(lang, 'en'), left_today;
end;
$$;

-- 5. Try the same question again after a problem. It uses the question that is ALREADY saved, so
-- a failure never costs a person a second question out of their day.
create function public.claim_chat_retry(p_message_id uuid, p_user_id uuid)
returns table (thread_id uuid, message_id uuid, account_id uuid, language text, remaining integer, meeting_id uuid, question text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.chat_messages;
  thread public.chat_threads;
begin
  select * into msg from public.chat_messages cm where cm.id = p_message_id and cm.role = 'user';
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into thread from public.chat_threads t where t.id = msg.thread_id;
  if not found or thread.user_id <> p_user_id or thread.meeting_id is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query select
    thread.id,
    msg.id,
    thread.account_id,
    coalesce(msg.language, 'en'),
    private.chat_questions_left(thread.account_id, p_user_id),
    thread.meeting_id,
    msg.content;
end;
$$;

-- 6. Save the answer, with the passage numbers it used, and log what it cost.
create function public.finish_chat_message(
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
begin
  if not exists (select 1 from public.chat_threads t where t.id = p_thread_id) then
    raise exception 'no_thread' using errcode = 'P0001';
  end if;

  insert into public.chat_messages (thread_id, role, content, language, sources)
  values (p_thread_id, 'assistant', p_content, p_language, coalesce(p_sources, '[]'::jsonb))
  returning id into new_message;

  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (p_account_id, p_meeting_id, 'chat', 'anthropic', p_tokens, p_cost);

  return new_message;
end;
$$;

-- Only the server may run these 3. The app can still only READ its own chat.
revoke execute on function public.claim_chat_message(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_chat_retry(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finish_chat_message(uuid, uuid, uuid, text, jsonb, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.claim_chat_message(uuid, uuid, text) to service_role;
grant execute on function public.claim_chat_retry(uuid, uuid) to service_role;
grant execute on function public.finish_chat_message(uuid, uuid, uuid, text, jsonb, text, numeric, numeric) to service_role;
