-- Searching and paging the Home list (prompt 12).
--
-- Home used to ask for EVERY note in one go. This file gives the database three new jobs:
--   1. keep a ready-made "words of this note" column, so searching does not have to read
--      the transcript, the summary and the to-dos afresh every time;
--   2. hand back one page of notes at a time, never more than 30, with the number of
--      matches, so the screen can say "14 notes" without asking twice;
--   3. find single transcript LINES, with their time, for the Search screen.
--
-- Nothing here loosens a permission. The app still has SELECT and nothing else on meetings,
-- and find_notes runs as the person asking, so the SAME Row Level Security rule that guards
-- the table guards every search. scripts/db-check/02-behaviour-checks.sql proves it by trying
-- to read another account's notes through it.

-- ---------------------------------------------------------------------------
-- 1. The words of a note, kept ready
-- ---------------------------------------------------------------------------
-- Two plain text columns hold a flattened copy of the summary and the transcript. They exist
-- because the words we search live in three other tables; copying them here turns a search
-- from "join four tables" into "look in one index".
--
-- Added in their own statement because the generated column below reads them, and Postgres
-- will not let one statement add a column and a column that reads it.
alter table public.meetings
  add column if not exists search_summary text,
  add column if not exists search_transcript text,
  add column if not exists open_action_count integer not null default 0;

-- The searchable form of those words.
--
-- Each of the three parts is tokenised TWICE and then weighted:
--   A = the title, B = the summary and to-dos, C = the transcript.
-- The weights are what make a word in the title outrank the same word buried in an hour of
-- talking, and they are also how a result can say WHERE it was found.
--
-- The two tokenisings are the whole language story:
--   'english' knows English word endings, so "meeting" finds "meetings", and it drops little
--     words like "the". This is the first market.
--   'simple' just lower-cases, so a Spanish, French, Arabic or Hindi word finds itself exactly.
-- Both sit in one column, so one index serves both and there is no second code path and no
-- second count. What this still cannot do is Japanese, Chinese and Korean: Postgres has no way
-- to tell where one word ends and the next begins in those scripts. docs/testing/prompt-12.md
-- reports what actually happens there rather than guessing.
--
-- to_tsvector MUST keep its first argument. The one-argument form depends on a database
-- setting, which makes it STABLE rather than IMMUTABLE, and Postgres refuses it here.
--
-- left(..., 200000) is not caution, it is a real limit: a tsvector cannot exceed 1 MB, and
-- pasted text is only bounded by the 50 MB upload cap. Without it, the first very long pasted
-- note would be refused by the database. 200,000 characters is about 30,000 words, or three
-- to four hours of talking.
alter table public.meetings
  add column search_tsv tsvector generated always as (
    setweight(
      to_tsvector('english', coalesce(title, '')) ||
      to_tsvector('simple', coalesce(title, '')), 'A')
    ||
    setweight(
      to_tsvector('english', left(coalesce(search_summary, ''), 200000)) ||
      to_tsvector('simple', left(coalesce(search_summary, ''), 200000)), 'B')
    ||
    setweight(
      to_tsvector('english', left(coalesce(search_transcript, ''), 200000)) ||
      to_tsvector('simple', left(coalesce(search_transcript, ''), 200000)), 'C')
  ) stored;

create index meetings_search_tsv_idx on public.meetings using gin (search_tsv);

-- The Search screen looks for single LINES, so a line needs its own searchable form.
alter table public.transcript_segments
  add column search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(text, '')) ||
    to_tsvector('simple', coalesce(text, ''))
  ) stored;

create index transcript_segments_search_tsv_idx on public.transcript_segments using gin (search_tsv);

-- Filtering on "notes with open to-dos" is a plain number comparison, kept up to date below.
-- It is deliberately NOT a join to action_items: the read rule on meetings is checked per row,
-- and counting the matches pushes EVERY matching row through that check, not just the 30 we
-- hand back. A column costs one integer; the join would cost two checks per note in the account.

-- ---------------------------------------------------------------------------
-- 2. Keeping those words up to date
-- ---------------------------------------------------------------------------
-- A jsonb array of sentences, flattened into one string. The summary keeps its key points,
-- decisions and open questions that way.
create function private.jsonb_words(p_value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(w, ' '), '')
  from jsonb_array_elements_text(
    case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
  ) as w;
$$;

-- Rebuild the ready-made words for these notes. Called by the triggers below, never by the app.
-- It must be security definer: ticking a to-do is something the APP does, with no permission to
-- write to meetings, and the count on the note still has to follow.
create function private.refresh_meeting_search(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  update public.meetings m set
    search_summary = btrim(
      coalesce((
        select string_agg(
                 btrim(concat_ws(' ',
                   coalesce(s.overview, ''),
                   private.jsonb_words(s.key_points),
                   private.jsonb_words(s.decisions),
                   private.jsonb_words(s.open_questions))), ' ')
        from public.summaries s where s.meeting_id = m.id
      ), '')
      || ' ' ||
      coalesce((
        select string_agg(a.text, ' ' order by a.id)
        from public.action_items a where a.meeting_id = m.id
      ), '')
    ),
    search_transcript = coalesce((
      select string_agg(t.text, ' ' order by t.start_ms, t.id)
      from public.transcript_segments t where t.meeting_id = m.id
    ), ''),
    open_action_count = coalesce((
      select count(*) from public.action_items a
      where a.meeting_id = m.id and not a.done
    ), 0)
  where m.id = any (p_ids);
end;
$$;

-- Ticking a to-do changes the count and nothing else, so it gets a cheaper door of its own.
create function private.refresh_open_actions(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  update public.meetings m
  set open_action_count = coalesce((
    select count(*) from public.action_items a
    where a.meeting_id = m.id and not a.done
  ), 0)
  where m.id = any (p_ids);
end;
$$;

-- The triggers. They are STATEMENT-level and read a transition table, so saving an hour-long
-- transcript -- one insert of hundreds of lines -- rebuilds the note's words ONCE, not once per
-- line. Postgres will not accept one transition-table trigger for several events, so each event
-- gets its own small trigger.
--
-- Triggers rather than extra lines inside finish_transcription and save_summary, so that nobody
-- writing the next feature can forget to keep the search up to date.
create function private.search_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_meeting_search(array(select distinct meeting_id from inserted));
  return null;
end;
$$;

create function private.search_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_meeting_search(array(select distinct meeting_id from deleted));
  return null;
end;
$$;

-- An UPDATE on action_items can only ever be the app ticking "done" (it has permission for that
-- column and no other), so only the count can have changed.
create function private.search_after_tick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_open_actions(array(select distinct meeting_id from updated));
  return null;
end;
$$;

create trigger transcript_segments_search_insert
  after insert on public.transcript_segments
  referencing new table as inserted
  for each statement execute function private.search_after_insert();

create trigger transcript_segments_search_delete
  after delete on public.transcript_segments
  referencing old table as deleted
  for each statement execute function private.search_after_delete();

create trigger summaries_search_insert
  after insert on public.summaries
  referencing new table as inserted
  for each statement execute function private.search_after_insert();

create trigger summaries_search_delete
  after delete on public.summaries
  referencing old table as deleted
  for each statement execute function private.search_after_delete();

create trigger action_items_search_insert
  after insert on public.action_items
  referencing new table as inserted
  for each statement execute function private.search_after_insert();

create trigger action_items_search_delete
  after delete on public.action_items
  referencing old table as deleted
  for each statement execute function private.search_after_delete();

create trigger action_items_search_tick
  after update on public.action_items
  referencing new table as updated
  for each statement execute function private.search_after_tick();

-- Every note that already exists gets its words built once, here and now.
do $$ begin perform private.refresh_meeting_search(array(select id from public.meetings)); end $$;

-- ---------------------------------------------------------------------------
-- 3. Which parts of a note matched
-- ---------------------------------------------------------------------------
-- The weights are already in the column, so asking "did the title match?" is one cheap call
-- against a row we have already read. The weight list runs {D, C, B, A}, so A -- the title --
-- is the last slot.
create function private.matched_fields(p_tsv tsvector, p_query tsquery)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_query is null then '{}'::text[]
    else array_remove(array[
      case when ts_rank('{0,0,0,1}'::real[], p_tsv, p_query) > 0 then 'title' end,
      case when ts_rank('{0,0,1,0}'::real[], p_tsv, p_query) > 0 then 'summary' end,
      case when ts_rank('{0,1,0,0}'::real[], p_tsv, p_query) > 0 then 'transcript' end
    ], null)
  end;
$$;

-- The two characters that mark a matched word inside a snippet. They are NOT html: nothing in
-- this app renders html (__tests__/no-html-rendering-test.ts), and Postgres' own manual warns
-- that a snippet is not safe to drop into a web page. These are private-use characters, so they
-- can never appear in anything a person said, and they travel through JSON untouched.
-- src/lib/notes-search.ts holds the same two characters, and a test fails if the two drift apart.
create function private.highlight_options()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'StartSel=' || chr(57344) || ',StopSel=' || chr(57345)
      || ',MaxWords=30,MinWords=12,ShortWord=2,MaxFragments=1,HighlightAll=FALSE';
$$;

-- ---------------------------------------------------------------------------
-- 4. find_notes: one page of the Home list. APP.
-- ---------------------------------------------------------------------------
-- This is the only function in this project that is security INVOKER, and that is the point:
-- it runs as the person asking, so the read rule on meetings -- "is this one of your accounts?"
-- -- is applied by the database itself to every single search. The explicit
-- is_account_member check in the WHERE clause says the same thing out loud, the way every other
-- function here does. Belt and braces, on purpose: the belt cannot be taken off by editing this
-- file, and the braces say what the belt is for.
--
-- NEVER MORE THAN 30 ROWS. The app asks for 10, then 20 at a time, but the clamp lives here as
-- well, because a limit the caller chooses is not a limit.
create function public.find_notes(
  p_query text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_statuses text[] default null,
  p_sources text[] default null,
  p_open_actions boolean default false,
  p_limit int default 10,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_offset int default 0
)
returns table (
  id uuid,
  title text,
  source text,
  status text,
  error_message text,
  created_at timestamptz,
  has_open_actions boolean,
  can_delete boolean,
  matched_in text[],
  snippet text,
  snippet_start_ms integer,
  snippet_segment_id uuid,
  total_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  asked text := nullif(btrim(coalesce(p_query, '')), '');
  q_en tsquery;
  q_simple tsquery;
  q_both tsquery;
  lim int := least(greatest(coalesce(p_limit, 10), 1), 30);
  skip int := greatest(coalesce(p_offset, 0), 0);
  opts text := private.highlight_options();
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  if asked is not null then
    q_en := websearch_to_tsquery('english', asked);
    q_simple := websearch_to_tsquery('simple', asked);
    q_both := q_en || q_simple;
    -- A search for nothing but little words ("the and") leaves an empty question. Treat that
    -- as no search at all rather than as a search nothing can answer.
    if q_both is null or q_both::text = '' then
      q_en := null; q_simple := null; q_both := null;
    end if;
  end if;

  return query
  with page as (
    select
      m.id, m.title, m.source, m.status, m.error_message, m.created_at,
      m.account_id, m.created_by, m.open_action_count, m.search_tsv, m.search_summary,
      case when q_both is null then 0::real
           else ts_rank('{0.1,0.2,0.4,1.0}'::real[], m.search_tsv, q_both) end as rank,
      count(*) over ()::integer as total_count
    from public.meetings m
    where (select private.is_account_member(m.account_id))
      and (q_both is null or m.search_tsv @@ q_both)
      and (p_from is null or m.created_at >= p_from)
      and (p_to is null or m.created_at < p_to)
      and (p_statuses is null or m.status = any (p_statuses))
      and (p_sources is null or m.source = any (p_sources))
      and (not coalesce(p_open_actions, false) or m.open_action_count > 0)
      -- Paging by date walks past the last row we showed, rather than counting from the start,
      -- so notes arriving while you read cannot make a row appear twice or go missing.
      -- Paging by best match counts, because the order does not move while the words stay put.
      and (q_both is not null or p_before is null
           or (m.created_at, m.id)
              < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    order by rank desc, m.created_at desc, m.id desc
    limit lim
    offset case when q_both is null then 0 else skip end
  )
  select
    p.id, p.title, p.source, p.status, p.error_message, p.created_at,
    p.open_action_count > 0,
    -- The same rule delete_note applies: your own note, or any note if you own the account.
    -- The screen uses this to grey out a tick box; the server checks again when you press
    -- Delete, because a check the app made a moment ago is not a check.
    (p.created_by is not distinct from me) or (select private.is_account_owner(p.account_id)),
    private.matched_fields(p.search_tsv, q_both),
    case
      when q_both is null then null
      -- A matching line of the transcript is the best snippet there is: it comes with its time,
      -- so even a Home result can open the note at that moment.
      when seg.line is not null then seg.line
      -- Otherwise the summary, but ONLY if the summary is what matched. Without that guard a
      -- title-only match would hand back the first thirty words of the summary with nothing
      -- marked -- a snippet that looks like a hit and is not.
      when 'summary' = any (private.matched_fields(p.search_tsv, q_both))
        then case
          when to_tsvector('english', left(coalesce(p.search_summary, ''), 20000)) @@ q_en
            then ts_headline('english', left(coalesce(p.search_summary, ''), 20000), q_en, opts)
          else ts_headline('simple', left(coalesce(p.search_summary, ''), 20000), q_simple, opts)
        end
      else null
    end,
    seg.start_ms,
    seg.segment_id,
    p.total_count
  from page p
  -- ts_headline reads the original words, not the index, so Postgres' manual says to use it
  -- with care. This join is the reason it is safe: it can only ever run for the rows on this
  -- page, which is at most thirty.
  left join lateral (
    select
      case
        when to_tsvector('english', s.text) @@ q_en
          then ts_headline('english', s.text, q_en, opts)
        else ts_headline('simple', s.text, q_simple, opts)
      end as line,
      s.start_ms,
      s.id as segment_id
    from public.transcript_segments s
    where q_both is not null
      and s.meeting_id = p.id
      and s.search_tsv @@ q_both
    order by ts_rank(s.search_tsv, q_both) desc, s.start_ms
    limit 1
  ) seg on true
  order by p.rank desc, p.created_at desc, p.id desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. find_passages: one page of matching LINES, for the Search screen. APP.
-- ---------------------------------------------------------------------------
-- docs/product-spec.md asks the Search screen for "the matching line and time", so this hands
-- back lines, not notes. Security invoker again, and the join to meetings repeats the account
-- check out loud.
create function public.find_passages(
  p_query text default null,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  segment_id uuid,
  meeting_id uuid,
  note_title text,
  note_created_at timestamptz,
  speaker_label text,
  start_ms integer,
  line text,
  total_count integer,
  note_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  asked text := nullif(btrim(coalesce(p_query, '')), '');
  q_en tsquery;
  q_simple tsquery;
  q_both tsquery;
  lim int := least(greatest(coalesce(p_limit, 10), 1), 30);
  skip int := greatest(coalesce(p_offset, 0), 0);
  opts text := private.highlight_options();
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if asked is null then
    return;
  end if;

  q_en := websearch_to_tsquery('english', asked);
  q_simple := websearch_to_tsquery('simple', asked);
  q_both := q_en || q_simple;
  if q_both is null or q_both::text = '' then
    return;
  end if;

  return query
  with found as (
    select
      s.id, s.meeting_id, s.speaker_label, s.start_ms, s.text, s.search_tsv,
      m.title as note_title, m.created_at as note_created_at,
      ts_rank(s.search_tsv, q_both) as rank
    from public.transcript_segments s
    join public.meetings m on m.id = s.meeting_id
    where (select private.is_account_member(m.account_id))
      and s.search_tsv @@ q_both
  ),
  counted as (
    select count(*)::integer as lines, count(distinct found.meeting_id)::integer as notes from found
  )
  select
    f.id, f.meeting_id, f.note_title, f.note_created_at, f.speaker_label, f.start_ms,
    case
      when to_tsvector('english', f.text) @@ q_en then ts_headline('english', f.text, q_en, opts)
      else ts_headline('simple', f.text, q_simple, opts)
    end,
    c.lines, c.notes
  from found f cross join counted c
  order by f.rank desc, f.note_created_at desc, f.start_ms
  limit lim
  offset skip;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. delete_notes: throw away several notes at once. APP.
-- ---------------------------------------------------------------------------
-- The same rule as delete_note, applied to each note on its own, and it answers PER NOTE.
--
-- It is deliberately not all-or-nothing. Notes are shared with the team but throwing one away
-- is not: you may delete a note you made, and the account owner may delete any of them. So on
-- a team account a handful of ticked notes will quite normally be a mix of yours and a
-- teammate's. Refusing the whole batch would tell the person "no" without telling them which
-- one, which is worse than the one-note delete it replaces.
--
-- THE MONTH'S MEETING COUNT IS NOT GIVEN BACK, exactly as for one note. The box says so, in
-- the plural, before it asks.
create function public.delete_notes(p_ids uuid[])
returns table (id uuid, file_path text, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  wanted uuid[];
  one uuid;
  note public.meetings;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  wanted := array(select distinct x from unnest(coalesce(p_ids, '{}'::uuid[])) as x where x is not null);
  if cardinality(wanted) = 0 then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  -- A ceiling, like every other list in this project has one.
  if cardinality(wanted) > 100 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;

  foreach one in array wanted loop
    select m.* into note from public.meetings m where m.id = one;

    if note.id is null or not (select private.is_account_member(note.account_id)) then
      return query select one, null::text, 'no_such_note'::text;
    elsif note.created_by is distinct from me
          and not (select private.is_account_owner(note.account_id)) then
      return query select one, null::text, 'not_yours'::text;
    else
      delete from public.meetings where public.meetings.id = one;
      -- The recording itself lives in storage, not here. The app removes it with the permission
      -- it already has, using this path.
      return query select one, note.file_path, null::text;
    end if;

    note := null;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Fake notes, for measuring. BUILDERS ONLY.
-- ---------------------------------------------------------------------------
-- A fast Home list is a claim, and a claim needs measuring, which needs hundreds of notes. This
-- makes them in the database instead of asking the founder to keep the secret service_role key
-- on their own machine (CLAUDE.md, hard rule 1).
--
-- Two locks, the same pair that guards set_test_plan:
--   1. you must own an account, and the notes land on YOUR account and nobody else's;
--   2. you must be a gyan admin. No migration ever sets is_admin, and the app cannot set it,
--      so in a fresh project nobody at all can run this until a person turns it on by hand in
--      the Supabase dashboard.
-- Every title begins with "[test] " so the fake notes are obvious on screen and removable later.
create function public.seed_test_notes(p_count int default 300)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  am_admin boolean;
  wanted int := least(greatest(coalesce(p_count, 300), 1), 500);
  topics text[] := array['pricing','hiring','roadmap','budget','onboarding','security','design','billing'];
  statuses text[] := array['ready','ready','ready','ready','ready','ready','ready','transcribing','summarizing','failed'];
  sources text[] := array['upload','upload','upload','phone','bot','text'];
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

  select coalesce(pr.is_admin, false) into am_admin from public.profiles pr where pr.id = me;
  if not am_admin then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;

  with ins as (
    insert into public.meetings
      (account_id, created_by, title, source, status, spoken_language, duration_seconds,
       error_message, created_at)
    select
      my_account, me,
      '[test] ' || topics[1 + (g % cardinality(topics))] || ' ' || g,
      sources[1 + (g % cardinality(sources))],
      statuses[1 + (g % cardinality(statuses))],
      'en',
      600 + (g % 40) * 60,
      case when statuses[1 + (g % cardinality(statuses))] = 'failed'
        then 'This is a test note. Nothing really went wrong.' end,
      (select now()) - make_interval(days => (g % 120), hours => (g % 7), mins => (g % 53))
    from generate_series(1, wanted) as g
    returning id, title, status
  ),
  words as (
    select
      i.id, i.status,
      split_part(i.title, ' ', 2) as topic,
      (split_part(i.title, ' ', 3))::int as n
    from ins i
  ),
  segs as (
    insert into public.transcript_segments (meeting_id, speaker_label, start_ms, end_ms, text)
    select
      w.id,
      'Speaker ' || (1 + (line % 2)),
      line * 30000, line * 30000 + 26000,
      case line
        when 1 then 'Thanks everyone for joining. Today we are going through ' || w.topic || '.'
        when 4 then 'The thing I keep coming back to on ' || w.topic || ' is whether the numbers hold.'
        when 7 then case when w.n % 10 = 0
                      then 'One more thing before we close: the pelican report is still open.'
                      else 'Let us pick ' || w.topic || ' up again next week.' end
        else 'We talked about ' || w.topic || ' for a while and agreed to look again, line ' || line || '.'
      end
    from words w cross join generate_series(1, 12) as line
    where w.status in ('ready', 'summarizing')
    returning 1
  ),
  sums as (
    insert into public.summaries (meeting_id, language, overview, key_points, decisions, open_questions)
    select
      w.id, 'en',
      'A test note about ' || w.topic || '. '
        || case when w.n % 15 = 0 then 'It also mentions a wombat, which nothing else does. ' else '' end
        || 'It exists so the Home list can be measured with hundreds of notes.',
      to_jsonb(array['We went through ' || w.topic, 'Everyone had a view on ' || w.topic]),
      to_jsonb(array['Keep going with ' || w.topic || ' for now']),
      to_jsonb(array['Who owns ' || w.topic || ' next month?'])
    from words w
    where w.status = 'ready'
    returning 1
  ),
  todos as (
    insert into public.action_items (meeting_id, text, owner_name, due_text, start_ms, done)
    select
      w.id,
      'Write up the ' || w.topic || ' notes',
      'Test Person', 'next week', 120000,
      (w.n % 3 = 0)
    from words w
    where w.status = 'ready'
    returning 1
  )
  select count(*) into wanted from ins;

  return wanted;
end;
$$;

-- Taking them away again. It needs BOTH marks: the "[test] " title AND your own account. A title
-- check on its own would throw away a real note that somebody happened to name that way, and
-- CLAUDE.md says to ask before deleting anything.
create function public.remove_test_notes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  am_admin boolean;
  gone int;
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

  select coalesce(pr.is_admin, false) into am_admin from public.profiles pr where pr.id = me;
  if not am_admin then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;

  with gone_rows as (
    delete from public.meetings m
    where m.account_id = my_account
      and m.title like '[test] %'
      and m.file_path is null
    returning m.id
  )
  select count(*)::int into gone from gone_rows;

  return gone;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Who may run what
-- ---------------------------------------------------------------------------
-- The private helpers, the same way the first Row Level Security file does it. These are not
-- reachable from the app in any case: only the public schema is served as an API.
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Searching and deleting are things the app does. Each one checks who is asking.
revoke execute on function public.find_notes(
  text, timestamptz, timestamptz, text[], text[], boolean, int, timestamptz, uuid, int
) from public, anon;
revoke execute on function public.find_passages(text, int, int) from public, anon;
revoke execute on function public.delete_notes(uuid[]) from public, anon;

grant execute on function public.find_notes(
  text, timestamptz, timestamptz, text[], text[], boolean, int, timestamptz, uuid, int
) to authenticated;
grant execute on function public.find_passages(text, int, int) to authenticated;
grant execute on function public.delete_notes(uuid[]) to authenticated;

-- The fake-note doors are open to signed-in people in the same way the test plan switch is,
-- and refuse anybody who is not a gyan admin from inside.
revoke execute on function public.seed_test_notes(int) from public, anon;
revoke execute on function public.remove_test_notes() from public, anon;
grant execute on function public.seed_test_notes(int) to authenticated;
grant execute on function public.remove_test_notes() to authenticated;
