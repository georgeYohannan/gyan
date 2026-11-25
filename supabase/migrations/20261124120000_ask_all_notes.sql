-- Ask: one chat about EVERY note, not one note (prompt 13, phase 10).
--
-- docs/product-spec.md feature 5 promises asking "about this note or all notes". The per-note
-- half shipped in prompt 7. This file is the other half.
--
-- NO NEW TABLE. An all-notes chat is an ordinary row in chat_threads with meeting_id left
-- NULL -- the column has allowed that since the first migration -- so every rule, index and
-- permission already written for the side chat guards this one too. In particular a person
-- still reads only THEIR OWN thread (see "Read own chat threads" in the side chat migration),
-- so an Ask conversation is as private as a note chat.
--
-- NO EMBEDDINGS AND NO chunks TABLE. Which notes a question is about is decided by the same
-- keyword search Home and the Search screen use (prompt 12). That has a real limit, said out
-- loud in the help text: it finds notes where somebody SAID a word, not notes about a topic
-- worded differently. The chunks table and the embedding model stay open decisions.
--
-- The daily question limit is NOT duplicated. Asking across all notes spends the same
-- plans.chat_messages_per_day allowance as asking about one note, counted by the one function
-- that already decides it.
--
-- Nothing here drops a table, a column, a policy or a permission.

-- ---------------------------------------------------------------------------
-- 1. One all-notes thread per person, per account
-- ---------------------------------------------------------------------------
-- The side chat's unique index is on (user_id, meeting_id), and in Postgres two NULLs are
-- NOT equal, so that index would happily allow a person a hundred all-notes threads. This
-- partial index covers exactly the rows it cannot: the ones with no note.
create unique index if not exists chat_threads_one_ask_per_person_idx
  on public.chat_threads (user_id, account_id)
  where meeting_id is null;

-- ---------------------------------------------------------------------------
-- 2. A question turned into something the search index can answer
-- ---------------------------------------------------------------------------
-- websearch_to_tsquery joins every word with AND, which is right for a search box and wrong
-- for a question: "What did we decide about pricing?" would only find a note containing both
-- "decide" and "pricing". A question is a bag of hints, so its words are joined with OR and
-- the ranking decides which notes come first.
--
-- The words come out of to_tsvector rather than being split by hand, so they are stemmed and
-- de-stopworded by exactly the same code that built meetings.search_tsv. 'english' is the
-- first market; the 'simple' half of search_tsv still matches those lexemes where they are
-- unchanged, which is what makes a Spanish or French word find itself.
--
-- quote_literal is what makes this safe to cast: every lexeme goes in as a quoted string, so
-- a word like "don't" or a stray & or ! cannot become tsquery syntax.
create function private.ask_query(p_question text)
returns tsquery
language sql
stable
set search_path = ''
as $$
  select nullif(string_agg(distinct quote_literal(lexeme), ' | '), '')::tsquery
  from unnest(to_tsvector('english', coalesce(p_question, '')));
$$;

-- ---------------------------------------------------------------------------
-- 3. find_ask_notes: the handful of notes a question is about. APP (through the server).
-- ---------------------------------------------------------------------------
-- security invoker, like find_notes and find_passages: it runs as the person asking, so the
-- SAME Row Level Security rule that guards the meetings table guards this, and the account
-- check is repeated out loud on top of it. The ask server function calls it with the
-- person's own login for that reason -- never with the service key.
--
-- The weights are find_notes' weights, unchanged: a word in the title outranks the same word
-- buried in an hour of talking.
--
-- A note only appears if the question's words are really in it, so a note with no words yet
-- cannot be picked. A failed note is left out: its words, if it has any, are half a note.
create function public.find_ask_notes(p_question text, p_limit int default 4)
returns table (
  id uuid,
  title text,
  source text,
  created_at timestamptz,
  file_path text,
  rank real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  q tsquery := private.ask_query(p_question);
  lim int := least(greatest(coalesce(p_limit, 4), 1), 10);
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- A question of nothing but little words ("what about it") leaves no words to look for.
  -- No rows is the honest answer, and the server turns it into "I could not find that".
  if q is null then
    return;
  end if;

  -- Every column is renamed inside the CTE, and the result is ordered by those names.
  -- `returns table` makes `rank`, `id` and the rest VARIABLES in here as well as column
  -- names, and Postgres refuses an unqualified reference that could mean either. find_notes
  -- sidesteps the same trap the same way.
  return query
  with ranked as (
    select
      m.id as note_id,
      m.title as note_title,
      m.source as note_source,
      m.created_at as note_created_at,
      m.file_path as note_file_path,
      ts_rank('{0.1,0.2,0.4,1.0}'::real[], m.search_tsv, q) as note_rank
    from public.meetings m
    where (select private.is_account_member(m.account_id))
      and m.search_tsv @@ q
      and m.status <> 'failed'
  )
  select r.note_id, r.note_title, r.note_source, r.note_created_at, r.note_file_path, r.note_rank
  from ranked r
  order by r.note_rank desc, r.note_created_at desc, r.note_id desc
  limit lim;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ask a question across every note. SERVER ONLY.
-- ---------------------------------------------------------------------------
-- One step, like claim_chat_message, so two fast taps cannot slip past the daily limit.
create function public.claim_ask_message(p_user_id uuid, p_question text)
returns table (thread_id uuid, message_id uuid, account_id uuid, language text, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct uuid;
  found_thread uuid;
  new_message uuid;
  lang text;
  left_today integer;
begin
  if p_question is null or btrim(p_question) = '' then
    raise exception 'empty_question' using errcode = 'P0001';
  end if;

  -- A note chat gets its account from the note. There is no note here, so this is the
  -- person's own account: the one they own if they own one, else the first they are on.
  -- The SAME choice getUsage() in src/lib/notes.ts makes, so the questions counted on
  -- Settings -> Plan and usage and the questions spent here are the same ones.
  select am.account_id into acct
  from public.account_members am
  where am.user_id = p_user_id
  order by am.role desc, am.account_id
  limit 1;
  if acct is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- The daily limit, read from the plans table by the one function that decides it.
  if private.chat_questions_left(acct, p_user_id) <= 0 then
    raise exception 'limit_reached' using errcode = 'P0001';
  end if;

  -- meeting_id stays null. That is what makes this the thread about everything.
  select t.id into found_thread
  from public.chat_threads t
  where t.user_id = p_user_id and t.account_id = acct and t.meeting_id is null;
  if found_thread is null then
    insert into public.chat_threads (account_id, user_id, meeting_id)
    values (acct, p_user_id, null)
    returning id into found_thread;
  end if;

  select p.preferred_language into lang from public.profiles p where p.id = p_user_id;

  insert into public.chat_messages (thread_id, role, content, language)
  values (found_thread, 'user', btrim(p_question), coalesce(lang, 'en'))
  returning id into new_message;

  left_today := private.chat_questions_left(acct, p_user_id);

  return query select found_thread, new_message, acct, coalesce(lang, 'en'), left_today;
end;
$$;

-- 5. Try the same all-notes question again. It uses the question that is ALREADY saved, so a
-- problem never costs somebody a second question out of their day.
create function public.claim_ask_retry(p_message_id uuid, p_user_id uuid)
returns table (thread_id uuid, message_id uuid, account_id uuid, language text, remaining integer, question text)
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

  -- It must be the caller's own thread, and it must be an ALL-NOTES thread. A note chat's
  -- message cannot be retried through this door, and this one cannot be retried through
  -- claim_chat_retry, which refuses a thread with no note.
  select * into thread from public.chat_threads t where t.id = msg.thread_id;
  if not found or thread.user_id <> p_user_id or thread.meeting_id is not null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  return query select
    thread.id,
    msg.id,
    thread.account_id,
    coalesce(msg.language, 'en'),
    private.chat_questions_left(thread.account_id, p_user_id),
    msg.content;
end;
$$;

-- 6. Save the answer and log what it cost. Separate from finish_chat_message for two reasons:
-- there is no one meeting to attach the cost to, and 'ask' is its own kind of spend, so the
-- admin page can tell the two apart instead of seeing one blurred 'chat' number.
create function public.finish_ask_message(
  p_thread_id uuid,
  p_account_id uuid,
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
  if not exists (select 1 from public.chat_threads t where t.id = p_thread_id and t.meeting_id is null) then
    raise exception 'no_thread' using errcode = 'P0001';
  end if;

  insert into public.chat_messages (thread_id, role, content, language, sources)
  values (p_thread_id, 'assistant', p_content, p_language, coalesce(p_sources, '[]'::jsonb))
  returning id into new_message;

  insert into public.ai_usage (account_id, meeting_id, kind, provider, units, cost)
  values (p_account_id, null, 'ask', 'anthropic', p_tokens, p_cost);

  return new_message;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Who may run what
-- ---------------------------------------------------------------------------
-- The private helper follows the rule set in the search migration: never anon.
revoke execute on function private.ask_query(text) from public, anon;
grant execute on function private.ask_query(text) to authenticated;

-- Picking the notes runs as the PERSON, so the app's role may run it. It can only ever see
-- notes that person is already allowed to read.
revoke execute on function public.find_ask_notes(text, int) from public, anon;
grant execute on function public.find_ask_notes(text, int) to authenticated;

-- Taking a question, retrying one and saving an answer are the server's business only.
revoke execute on function public.claim_ask_message(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_ask_retry(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finish_ask_message(uuid, uuid, text, jsonb, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.claim_ask_message(uuid, text) to service_role;
grant execute on function public.claim_ask_retry(uuid, uuid) to service_role;
grant execute on function public.finish_ask_message(uuid, uuid, text, jsonb, text, numeric, numeric) to service_role;
