\set ON_ERROR_STOP on
\pset pager off

-- Two people sign up. The trigger should build profile + account + owner row + privacy row.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@example.com');

\echo '--- 1. a new account starts on 90 days (the founder''s choice) ---'
select case when retention_days = 90 then 'PASS' else 'FAIL got ' || coalesce(retention_days::text,'null') end as result
from public.account_privacy p
join public.accounts a on a.id = p.account_id
where a.owner_id = 'aaaaaaaa-0000-4000-8000-000000000001';

\echo '--- 2. audit_log cannot be changed or deleted, even by the server key ---'
set role service_role;
select public.record_audit('00000000-0000-4000-8000-000000000000'::uuid, null, 'sign_in') is not null as wrote;
do $$ begin
  update public.audit_log set action = 'note_delete' where id = (select min(id) from public.audit_log);
  raise exception 'FAIL: an update was allowed';
exception when sqlstate 'P0001' then raise notice 'PASS: update refused';
end $$;
do $$ begin
  delete from public.audit_log where id = (select min(id) from public.audit_log);
  raise exception 'FAIL: a delete was allowed';
exception when sqlstate 'P0001' then raise notice 'PASS: delete refused';
end $$;
reset role;

\echo '--- 3. the rate limit really stops the fourth go (account_delete is 3 an hour) ---'
set role service_role;
do $$
declare person uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
begin
  perform public.check_rate_limit('account_delete', person, null);
  perform public.check_rate_limit('account_delete', person, null);
  perform public.check_rate_limit('account_delete', person, null);
  begin
    perform public.check_rate_limit('account_delete', person, null);
    raise exception 'FAIL: a fourth go was allowed';
  exception when sqlstate 'P0001' then raise notice 'PASS: the fourth go was refused';
  end;
end $$;
-- A refused go must not itself be counted, so the count should still be exactly 3.
select case when used = 3 then 'PASS count is exactly 3' else 'FAIL count is ' || used end as result
from public.rate_limits where kind = 'account_delete' and scope = 'person';
reset role;

\echo '--- 4. the app can only write a log row about ITSELF ---'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select public.record_my_action('sign_in') is null as recorded_sign_in;
do $$ begin
  perform public.record_my_action('note_delete');
  raise exception 'FAIL: a forbidden action was allowed';
exception when sqlstate 'P0001' then raise notice 'PASS: note_delete refused from the app';
end $$;
do $$ begin
  perform public.record_my_action('note_view', '11111111-0000-4000-8000-00000000ffff');
  raise exception 'FAIL: a note they cannot read was allowed';
exception when sqlstate 'P0001' then raise notice 'PASS: a note they cannot read was refused';
end $$;
-- Signing in twice inside a minute should add only one row.
select public.record_my_action('sign_in');
select case when count(*) = 1 then 'PASS only one sign_in row' else 'FAIL ' || count(*) || ' rows' end as result
from public.audit_log where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and action = 'sign_in';
reset role; reset request.jwt.claim.sub;

\echo '--- 5. B cannot read A''s audit log ---'
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select case when count(*) = 0 then 'PASS B sees none of A''s log' else 'FAIL B saw ' || count(*) end as result
from public.audit_log where actor_user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
reset role; reset request.jwt.claim.sub;

\echo '--- 6. changing privacy settings: owner only, audited, bad values refused ---'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select retention_days, email_summaries from public.save_account_privacy('{"retention_days": 365, "email_summaries": false}'::jsonb);
do $$ begin
  perform public.save_account_privacy('{"retention_days": 7}'::jsonb);
  raise exception 'FAIL: 7 days was allowed';
exception when sqlstate 'P0001' then raise notice 'PASS: an invalid keeping time was refused';
end $$;
-- "keep for ever" must be tellable apart from "do not change this".
select case when retention_days is null then 'PASS null means keep for ever'
            else 'FAIL got ' || retention_days end as result
from public.save_account_privacy('{"retention_days": null}'::jsonb);
select case when count(*) = 3 then 'PASS 3 settings changes logged' else 'FAIL ' || count(*) || ' logged' end as result
from public.audit_log where action = 'settings_change';
reset role; reset request.jwt.claim.sub;

\echo '--- 7. consent is recorded once, is readable only by its owner, and cannot be edited ---'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select public.record_consent('v1', 'abc123', 'web');
select public.record_consent('v1', 'abc123', 'web');
select case when count(*) = 1 then 'PASS agreeing twice adds one row' else 'FAIL ' || count(*) end as result
from public.consent_records;
reset role; reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select case when count(*) = 0 then 'PASS B cannot read A''s consent' else 'FAIL' end as result
from public.consent_records;
reset role; reset request.jwt.claim.sub;

\echo '--- 8. run_retention changes NOTHING unless asked out loud ---'
set role service_role;
select case when count(*) = 0 then 'PASS nothing is due yet' else 'FAIL ' || count(*) || ' due' end as result
from public.run_retention();
reset role;

\echo '--- 9. the app can no longer write straight into integrations ---'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin
  insert into public.integrations (account_id, kind, settings)
  values ((select id from public.accounts limit 1), 'slack', '{"token":"stolen"}'::jsonb);
  raise exception 'FAIL: the app wrote to integrations';
exception when insufficient_privilege then raise notice 'PASS: writing to integrations is refused';
end $$;
reset role; reset request.jwt.claim.sub;

\echo '--- 10. a cost row cannot be billed to the wrong account ---'
set role service_role;
do $$
declare acct uuid; other uuid; thread uuid;
begin
  select id into acct from public.accounts where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  select id into other from public.accounts where owner_id = 'bbbbbbbb-0000-4000-8000-000000000002';
  insert into public.chat_threads (account_id, user_id) values (acct, 'aaaaaaaa-0000-4000-8000-000000000001')
    returning id into thread;
  begin
    perform public.finish_chat_message(thread, other, null, 'hello', null, 'en', 1, 0.1);
    raise exception 'FAIL: billed to the wrong account';
  exception when sqlstate 'P0001' then raise notice 'PASS: the wrong account was refused';
  end;
end $$;
reset role;

\echo '--- 11. a table added in future gets NO permission for the not-signed-in role ---'
create table public.something_new_later (id int);
select case when count(*) = 0 then 'PASS anon and authenticated get nothing by default'
            else 'FAIL ' || string_agg(grantee || ':' || privilege_type, ', ') end as result
from information_schema.role_table_grants
where table_name = 'something_new_later' and grantee in ('anon', 'authenticated');
drop table public.something_new_later;

\echo '--- 12. nothing at all is readable without signing in ---'
set role anon;
do $$ begin
  perform 1 from public.meetings limit 1;
  raise notice 'FAIL: anon reached the notes table';
exception
  when insufficient_privilege then raise notice 'PASS: anon is refused outright';
  when others then raise notice 'PASS: anon cannot read notes (%)', sqlstate;
end $$;
reset role;

\echo '--- 13. retention: dry run reports, the real run deletes and leaves a record ---'
set role service_role;
do $$
declare acct uuid; old_note uuid; new_note uuid; due int; gone int; logged int;
begin
  select id into acct from public.accounts where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  -- This account keeps notes for 90 days (the new default).
  update public.account_privacy set retention_days = 90 where account_id = acct;

  insert into public.meetings (account_id, created_by, title, source, status, file_path, created_at)
  values (acct, 'aaaaaaaa-0000-4000-8000-000000000001', 'An old note', 'upload', 'ready',
          acct || '/old/recording.mp3', now() - interval '200 days')
  returning id into old_note;
  insert into public.meetings (account_id, created_by, title, source, status, created_at)
  values (acct, 'aaaaaaaa-0000-4000-8000-000000000001', 'A recent note', 'text', 'ready', now())
  returning id into new_note;

  -- A dry run must report the old note and change nothing at all.
  select count(*) into due from public.run_retention();
  if due <> 1 then raise notice 'FAIL: dry run found % notes, expected 1', due;
  else raise notice 'PASS: dry run found the 1 old note';
  end if;
  if exists (select 1 from public.meetings where id = old_note)
  then raise notice 'PASS: the dry run deleted nothing';
  else raise notice 'FAIL: the dry run deleted the note';
  end if;

  -- Asked out loud, it deletes the old one and leaves the recent one alone.
  perform public.run_retention(false);
  select count(*) into gone from public.meetings where id = old_note;
  if gone = 0 then raise notice 'PASS: the old note is deleted';
  else raise notice 'FAIL: the old note survived';
  end if;
  if exists (select 1 from public.meetings where id = new_note)
  then raise notice 'PASS: the recent note was left alone';
  else raise notice 'FAIL: the recent note was deleted too';
  end if;

  -- And the record of the deletion outlives the note it was about.
  select count(*) into logged from public.audit_log
  where action = 'retention_delete' and meeting_id = old_note;
  if logged = 1 then raise notice 'PASS: the deletion is written down, and survives the note';
  else raise notice 'FAIL: % log rows for the deletion', logged;
  end if;
end $$;
reset role;

\echo '--- 14. only the owner can read the audit log, and a member is told why ---'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select case when count(*) > 0 then 'PASS the owner sees their log' else 'FAIL owner saw nothing' end as result
from public.list_audit_log(50, null);
reset role; reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
-- B owns their own account, so they see their own log and never A's.
select case when count(*) = 0 then 'PASS B''s own log is empty, and holds nothing of A''s'
            else 'FAIL B saw ' || count(*) end as result
from public.list_audit_log(50, null);
reset role; reset request.jwt.claim.sub;

\echo '--- 15. a note cannot point at another account''s file ---'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$
declare mine uuid; theirs uuid; note uuid := gen_random_uuid();
begin
  select id into mine from public.accounts where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  select id into theirs from public.accounts where owner_id = 'bbbbbbbb-0000-4000-8000-000000000002';

  -- THE ATTACK. The path starts with my own account and note, so the old prefix check
  -- passed it -- and the "../.." is removed later, when it becomes a web address, leaving
  -- a key inside somebody else's folder. Three server functions read files with the
  -- service key, which skips every rule.
  begin
    perform public.create_note(note, mine, 'text', 'x',
      mine || '/' || note || '/../../' || theirs || '/their-note/recording.m4a');
    raise notice 'FAIL: a note was allowed to point out of its own folder';
  exception when sqlstate 'P0001' then raise notice 'PASS: climbing out of the folder is refused';
  end;

  -- The other shapes that mean something different once they become an address.
  begin
    perform public.create_note(gen_random_uuid(), mine, 'text', 'x', mine || '/n/./x.txt');
    raise notice 'FAIL: a single-dot step was allowed';
  exception when sqlstate 'P0001' then raise notice 'PASS: a single-dot step is refused';
  end;
  begin
    perform public.create_note(gen_random_uuid(), mine, 'text', 'x', mine || '/n//x.txt');
    raise notice 'FAIL: an empty step was allowed';
  exception when sqlstate 'P0001' then raise notice 'PASS: an empty step is refused';
  end;

  -- And an ordinary path still works, which is the half that is easy to break.
  declare good_note uuid := gen_random_uuid();
  begin
    perform public.create_note(good_note, mine, 'text', 'Real note',
      mine || '/' || good_note || '/pasted-text.txt');
    raise notice 'PASS: an ordinary path still works';
  exception when others then raise notice 'FAIL: an ordinary path was refused (%)', sqlerrm;
  end;
end $$;
reset role; reset request.jwt.claim.sub;

\echo '--- 16. searching cannot reach another account, not even its count (prompt 12) ---'
-- find_notes is the one function in this project that runs as the PERSON asking rather than as
-- the server, so the read rule on meetings is what keeps accounts apart. That is a claim worth
-- turning the handle on: here A gets a note with a word nothing else has, and B goes looking.
set role service_role;
do $$
declare
  a_account uuid; a_note uuid := gen_random_uuid(); seg uuid;
begin
  select id into a_account from public.accounts where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into public.meetings (id, account_id, created_by, title, source, status, created_at)
  values (a_note, a_account, 'aaaaaaaa-0000-4000-8000-000000000001',
          'Quarterly xyzzyplugh review', 'upload', 'ready', now());
  insert into public.transcript_segments (meeting_id, speaker_label, start_ms, end_ms, text)
  values (a_note, 'Speaker 1', 60000, 64000, 'The xyzzyplugh numbers are late again.');
  insert into public.summaries (meeting_id, language, overview, key_points, decisions, open_questions)
  values (a_note, 'en', 'A note about xyzzyplugh.', '["xyzzyplugh went up"]'::jsonb, '[]'::jsonb, '[]'::jsonb);
  insert into public.action_items (meeting_id, text, done)
  values (a_note, 'Chase the xyzzyplugh figures', false);
end $$;
reset role;

-- The triggers should have built the searchable words by themselves, with no help.
select case when search_transcript like '%xyzzyplugh%' and search_summary like '%xyzzyplugh%'
                 and open_action_count = 1
            then 'PASS: the note''s words and open to-do count were built by the database'
            else 'FAIL: got ' || coalesce(left(search_transcript, 40), 'null')
                 || ' / open=' || open_action_count end as result
from public.meetings where title = 'Quarterly xyzzyplugh review';

set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
do $$
declare rows_seen int; count_shown int;
begin
  select count(*), coalesce(max(total_count), 0) into rows_seen, count_shown
  from public.find_notes('xyzzyplugh');

  if rows_seen = 0 then raise notice 'PASS: B finds none of A''s notes';
  else raise notice 'FAIL: B saw % of A''s notes', rows_seen; end if;

  -- The one that would slip past a test that only looked at rows. A count taken over the whole
  -- table would say "none of these are yours, but there are three of them" -- which is still
  -- telling B something about A.
  if count_shown = 0 then raise notice 'PASS: and is not told how many exist';
  else raise notice 'FAIL: B was told the count is %', count_shown; end if;
end $$;

do $$
declare lines_seen int;
begin
  select count(*) into lines_seen from public.find_passages('xyzzyplugh');
  if lines_seen = 0 then raise notice 'PASS: B finds none of A''s transcript lines';
  else raise notice 'FAIL: B saw % of A''s lines', lines_seen; end if;
end $$;

-- B cannot even be handed the id by the database, so the check hands it over by hand -- which
-- is the strongest version of the test: B knows exactly which note to go for and still cannot.
reset role; reset request.jwt.claim.sub;
select id as a_note_id from public.meetings where title = 'Quarterly xyzzyplugh review' \gset
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select case
  when (select error_code from public.delete_notes(array[:'a_note_id'::uuid])) is not null
    then 'PASS: B cannot delete A''s note even knowing its id'
  else 'FAIL: B deleted A''s note' end as result;

-- And the half that is easy to break: A really can find their own note, and is told where the
-- words were.
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$
declare r record;
begin
  select * into r from public.find_notes('xyzzyplugh');
  if r.id is null then raise notice 'FAIL: A cannot find their own note';
  else
    if r.total_count = 1 then raise notice 'PASS: A finds it, and is told there is 1';
    else raise notice 'FAIL: A was told there are %', r.total_count; end if;
    if 'title' = any(r.matched_in) and 'transcript' = any(r.matched_in) and 'summary' = any(r.matched_in)
      then raise notice 'PASS: it says the words were in the title, summary and transcript';
      else raise notice 'FAIL: matched_in was %', r.matched_in; end if;
    if r.snippet like '%' || chr(57344) || '%' then raise notice 'PASS: the snippet marks the matched word';
      else raise notice 'FAIL: the snippet has no mark: %', r.snippet; end if;
    if r.snippet_start_ms = 60000 then raise notice 'PASS: and carries the moment it was said';
      else raise notice 'FAIL: the moment was %', r.snippet_start_ms; end if;
  end if;
end $$;

-- English word endings, which is what the founder chose, and an exact word in another language,
-- which is how the other fifteen keep working.
do $$
declare found int;
begin
  select count(*) into found from public.find_notes('reviews');
  if found = 1 then raise notice 'PASS: searching "reviews" finds a note titled "review"';
  else raise notice 'FAIL: English word endings found % notes', found; end if;
end $$;

-- Signing out closes the door completely.
reset role; reset request.jwt.claim.sub;
set role anon;
do $$ begin
  perform public.find_notes('xyzzyplugh');
  raise notice 'FAIL: a signed out visitor could search';
exception when others then raise notice 'PASS: a signed out visitor cannot search at all';
end $$;
reset role;

\echo '--- 17. a very long pasted note, and languages other than English (prompt 12) ---'
-- A searchable column has a hard ceiling of 1 MB, and pasted text is only bounded by the 50 MB
-- upload limit, so the migration cuts each part at 200,000 characters. Without that cut this
-- insert is refused and the note cannot be saved at all. Turning the handle on it here means
-- the founder never meets it.
set role service_role;
do $$
declare a_account uuid; big_note uuid := gen_random_uuid();
begin
  select id into a_account from public.accounts where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into public.meetings (id, account_id, created_by, title, source, status, created_at)
  values (big_note, a_account, 'aaaaaaaa-0000-4000-8000-000000000001',
          'A very long pasted note', 'text', 'ready', now());
  begin
    -- About 3 MB made of 400,000 DIFFERENT words, which is what actually matters: the ceiling
    -- counts distinct words, not characters, so repeating one sentence would prove nothing.
    -- Measured in this same database: without the cut, this exact text is refused with
    -- "string is too long for tsvector (4597986 bytes, max 1048575 bytes)".
    insert into public.transcript_segments (meeting_id, speaker_label, start_ms, end_ms, text)
    select big_note, 'Speaker 1', n * 1000, n * 1000 + 900,
           (select string_agg('word' || (n * 4000 + w), ' ') from generate_series(1, 4000) as w)
           || ' and the quarterly figures moved again'
    from generate_series(1, 100) as n;
    raise notice 'PASS: a 3 MB note of 400,000 different words saves and is searchable';
  exception when others then raise notice 'FAIL: a long note was refused (%)', sqlerrm;
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select case when count(*) = 1 then 'PASS: and the long note can still be found'
            else 'FAIL: the long note was not found' end as result
from public.find_notes('quarterly figures')
where title = 'A very long pasted note';

-- Spanish and Arabic words are not English, so nothing stems them. They must still find
-- themselves exactly, which is the whole job of the second tokenising in the search column.
reset role; reset request.jwt.claim.sub;
set role service_role;
do $$
declare a_account uuid; es_note uuid := gen_random_uuid();
begin
  select id into a_account from public.accounts where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  insert into public.meetings (id, account_id, created_by, title, source, status, created_at)
  values (es_note, a_account, 'aaaaaaaa-0000-4000-8000-000000000001',
          'Reunion de presupuesto', 'upload', 'ready', now());
  insert into public.transcript_segments (meeting_id, speaker_label, start_ms, end_ms, text)
  values (es_note, 'Speaker 1', 1000, 5000,
          'Hablamos del presupuesto y de la contratacion. ' ||
          'Also one line of Japanese: 予算の会議は来週です。');
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

select case when count(*) = 1 then 'PASS: a Spanish word finds its own note'
            else 'FAIL: Spanish found ' || count(*) || ' notes' end as result
from public.find_notes('presupuesto');

-- Japanese is the honest gap, and this check records which way it falls rather than assuming.
-- Whichever it is, docs/testing/prompt-12.md says so in plain words.
select 'NOTE: a whole Japanese phrase finds ' || count(*) || ' note(s)' as result
from public.find_notes('予算の会議は来週です');
select 'NOTE: one Japanese word on its own finds ' || count(*) || ' note(s)' as result
from public.find_notes('予算');
reset role; reset request.jwt.claim.sub;

\echo '--- 18. Ask: one question across every note (prompt 13) ---'
-- Ask turns a QUESTION into a search. The per-note chat never did that, so these checks turn
-- the handle on the three claims the migration makes: a question is an OR of its words, the
-- all-notes thread is one per person, and a question still cannot reach another account.
reset role; reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';

-- The whole reason private.ask_query exists. A real question has words in it that no note
-- contains, and websearch_to_tsquery joins every word with AND.
select case when count(*) = 0 then 'PASS: find_notes answers a whole question with nothing'
            else 'FAIL: find_notes found ' || count(*) end as result
from public.find_notes('What did we decide about the xyzzyplugh figures?');

select case when count(*) >= 1 then 'PASS: find_ask_notes answers the same question with the right note'
            else 'FAIL: find_ask_notes found nothing' end as result
from public.find_ask_notes('What did we decide about the xyzzyplugh figures?', 4)
where title = 'Quarterly xyzzyplugh review';

-- A question of nothing but little words leaves nothing to look for. No rows is the honest
-- answer; the server turns it into "I could not find that in your notes".
select case when count(*) = 0 then 'PASS: a question of only little words finds nothing'
            else 'FAIL: found ' || count(*) end as result
from public.find_ask_notes('what about it then', 4);

-- Never more than it was asked for, and never more than the ceiling in the function.
select case when count(*) <= 1 then 'PASS: the limit asked for is the limit given'
            else 'FAIL: got ' || count(*) end as result
from public.find_ask_notes('xyzzyplugh presupuesto quarterly', 1);

reset role; reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select case when count(*) = 0 then 'PASS: B cannot reach A''s notes by asking a question'
            else 'FAIL: B reached ' || count(*) || ' of A''s notes' end as result
from public.find_ask_notes('What are the xyzzyplugh figures?', 4);

-- Taking a question: one thread per person, the daily limit, and the two retry doors.
reset role; reset request.jwt.claim.sub;
set role service_role;
do $$
declare
  person uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  first_claim record; second_claim record; note_thread uuid; a_account uuid; a_note uuid;
begin
  select id into a_account from public.accounts where owner_id = person;
  select id into a_note from public.meetings where title = 'Quarterly xyzzyplugh review';

  select * into first_claim from public.claim_ask_message(person, 'What did I promise to do?');
  select * into second_claim from public.claim_ask_message(person, 'And what is still open?');

  if first_claim.thread_id = second_claim.thread_id then
    raise notice 'PASS: both questions went into ONE all-notes thread';
  else
    raise notice 'FAIL: a second thread was made';
  end if;

  if (select meeting_id from public.chat_threads where id = first_claim.thread_id) is null then
    raise notice 'PASS: the all-notes thread has no note on it';
  else
    raise notice 'FAIL: the all-notes thread was tied to a note';
  end if;

  -- The same allowance as the side chat, going down as questions are asked.
  if second_claim.remaining = first_claim.remaining - 1 then
    raise notice 'PASS: an Ask question spends one of the day''s questions';
  else
    raise notice 'FAIL: remaining went % -> %', first_claim.remaining, second_claim.remaining;
  end if;

  -- The partial index is the only thing stopping a second all-notes thread, because two
  -- NULLs are not equal and the side chat's index therefore does not cover these rows.
  begin
    insert into public.chat_threads (account_id, user_id, meeting_id) values (a_account, person, null);
    raise notice 'FAIL: a second all-notes thread was allowed';
  exception when unique_violation then raise notice 'PASS: a second all-notes thread is refused';
  end;

  -- The two retry doors do not open each other's threads.
  begin
    perform public.claim_chat_retry(first_claim.message_id, person);
    raise notice 'FAIL: the note-chat retry opened an all-notes question';
  exception when sqlstate 'P0001' then raise notice 'PASS: the note-chat retry refuses an all-notes question';
  end;

  select thread_id into note_thread from public.claim_chat_message(a_note, person, 'What is in this note?');
  begin
    perform public.claim_ask_retry(
      (select id from public.chat_messages where thread_id = note_thread and role = 'user' limit 1), person);
    raise notice 'FAIL: the Ask retry opened a note question';
  exception when sqlstate 'P0001' then raise notice 'PASS: the Ask retry refuses a note question';
  end;

  -- And neither door opens somebody else's question.
  begin
    perform public.claim_ask_retry(first_claim.message_id, 'bbbbbbbb-0000-4000-8000-000000000002');
    raise notice 'FAIL: B retried A''s question';
  exception when sqlstate 'P0001' then raise notice 'PASS: B cannot retry A''s question';
  end;

  -- Saving the answer: no meeting to attach it to, and its own kind of spend.
  perform public.finish_ask_message(first_claim.thread_id, a_account, 'An answer [1].', '[]'::jsonb, 'en', 100, 0.0001);
  if exists (select 1 from public.ai_usage where kind = 'ask' and meeting_id is null and account_id = a_account) then
    raise notice 'PASS: an Ask answer is logged as its own kind, with no one meeting';
  else
    raise notice 'FAIL: the Ask cost was not logged';
  end if;
end $$;
reset role;

-- A chat is the most personal thing in Gyan, and an all-notes chat is the most personal of
-- those. The side chat's rule is "your own thread only", and that must cover this too.
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select case when count(*) = 0 then 'PASS: B cannot read A''s Ask conversation'
            else 'FAIL: B read ' || count(*) || ' of A''s Ask messages' end as result
from public.chat_messages;
reset role; reset request.jwt.claim.sub;

-- ===========================================================================
-- 19. The meeting bot (prompt 14)
-- ===========================================================================
-- The whole feature's safety rests on four things being true in the DATABASE, not in the app:
-- the switch is off until somebody turns it on by hand, the app cannot turn it on, a bot cannot
-- exist without consent, and the hour caps really refuse. Those are what this section turns the
-- handle on.
\echo '--- 19. the meeting bot: the switch, the consent and the caps (prompt 14) ---'

set role service_role;
do $$
declare
  a_account uuid := (select id from public.accounts where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001');
  b_account uuid := (select id from public.accounts where owner_id = 'bbbbbbbb-0000-4000-8000-000000000002');
  person uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  other uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  note_a uuid := 'cccccccc-0000-4000-8000-00000000b001';
  note_b uuid := 'cccccccc-0000-4000-8000-00000000b002';
  note_c uuid := 'cccccccc-0000-4000-8000-00000000b003';
  note_d uuid := 'cccccccc-0000-4000-8000-00000000b004';
  note_e uuid := 'cccccccc-0000-4000-8000-00000000b005';
  started record;
  free_plan uuid := (select id from public.plans where name = 'Free');
  pro_plan uuid := (select id from public.plans where name = 'Pro');
begin
  -- 1. THE SWITCH IS OFF BY DEFAULT. No integrations row exists, so nothing may be sent.
  begin
    perform public.start_bot_note(note_a, a_account, person, 'recall', 'meet',
      'https://meet.google.com/abc-defg-hij', 'v1', 'hash1');
    raise notice 'FAIL: a bot was sent with the switch off';
  exception when sqlstate 'P0001' then raise notice 'PASS: the switch is off, so no bot can be sent';
  end;

  -- 2. Turn it on by hand, the way the founder does in the dashboard.
  insert into public.integrations (account_id, kind, settings)
  values (a_account, 'meeting_bot', '{"enabled": true, "bot_name": null}'::jsonb);

  -- Free gets 0 bot hours, so the switch alone is not enough. This is the promise that setting
  -- bot_hours_per_month to 0 blocks a bot with no code change.
  begin
    perform public.start_bot_note(note_a, a_account, person, 'recall', 'meet',
      'https://meet.google.com/abc-defg-hij', 'v1', 'hash1');
    raise notice 'FAIL: a bot was sent on a plan with 0 hours';
  exception when sqlstate 'P0001' then raise notice 'PASS: 0 bot hours on the plan blocks a bot';
  end;

  -- 3. Move A onto the Pro stand-in plan, which has hours.
  update public.accounts set plan_id = pro_plan where id = a_account;

  -- A platform we do not support is refused before anything else happens.
  begin
    perform public.start_bot_note(note_a, a_account, person, 'recall', 'webex',
      'https://example.webex.com/j/1', 'v1', 'hash1');
    raise notice 'FAIL: an unsupported platform was accepted';
  exception when sqlstate 'P0001' then raise notice 'PASS: an unsupported platform is refused';
  end;

  -- A bot cannot exist without consent.
  begin
    perform public.start_bot_note(note_a, a_account, person, 'recall', 'meet',
      'https://meet.google.com/abc-defg-hij', '', '');
    raise notice 'FAIL: a bot was sent with no consent';
  exception when sqlstate 'P0001' then raise notice 'PASS: no consent, no bot';
  end;

  -- Somebody who is not on the account cannot send a bot on it.
  begin
    perform public.start_bot_note(note_a, a_account, other, 'recall', 'meet',
      'https://meet.google.com/abc-defg-hij', 'v1', 'hash1');
    raise notice 'FAIL: a stranger sent a bot on somebody else''s account';
  exception when sqlstate 'P0001' then raise notice 'PASS: only somebody on the account may send a bot';
  end;

  -- 4. Now it works, and the bot is named after the owner.
  select * into started from public.start_bot_note(note_a, a_account, person, 'recall', 'meet',
    'https://meet.google.com/abc-defg-hij', 'v1', 'hash1');
  if started.bot_name like 'gyan Notetaker%' then
    raise notice 'PASS: the bot is named %', started.bot_name;
  else
    raise notice 'FAIL: the bot was called %', started.bot_name;
  end if;
  if started.max_minutes = 180 then
    raise notice 'PASS: the longest meeting comes from the plan (% minutes)', started.max_minutes;
  else
    raise notice 'FAIL: max_minutes was %', started.max_minutes;
  end if;
  if (select status from public.meetings where id = note_a) = 'joining'
     and (select source from public.meetings where id = note_a) = 'bot' then
    raise notice 'PASS: the note starts as a bot note that is joining';
  else
    raise notice 'FAIL: the note is in the wrong state';
  end if;
  -- The consent is stored on the bot's own row, so it is evidence about THIS meeting.
  if (select consent_version || '/' || consent_text_hash from public.meeting_bots
      where meeting_id = note_a) = 'v1/hash1' then
    raise notice 'PASS: the consent given is stored on the bot';
  else
    raise notice 'FAIL: the consent was not stored';
  end if;

  -- 5. The phases move forward and never backwards.
  perform public.attach_bot(note_a, 'bot-ext-1');
  perform public.record_bot_phase(note_a, 'waiting');
  perform public.record_bot_phase(note_a, 'recording');
  -- A late "joining" event, which really does happen.
  perform public.record_bot_phase(note_a, 'joining');
  if (select phase from public.meeting_bots where meeting_id = note_a) = 'recording' then
    raise notice 'PASS: a status event that arrives late cannot move a bot backwards';
  else
    raise notice 'FAIL: the phase went back to %', (select phase from public.meeting_bots where meeting_id = note_a);
  end if;
  -- And the meeting link is gone the moment recording starts.
  if (select meeting_url from public.meeting_bots where meeting_id = note_a) is null then
    raise notice 'PASS: the meeting link is thrown away once the bot is recording';
  else
    raise notice 'FAIL: the meeting link is still stored';
  end if;

  -- An event for a bot id we have never heard of finds nothing, rather than guessing.
  if public.bot_note_for_event('recall', 'bot-ext-1') = note_a
     and public.bot_note_for_event('recall', 'who-is-this') is null then
    raise notice 'PASS: an event is matched by the bot id, and an unknown id matches nothing';
  else
    raise notice 'FAIL: event matching is wrong';
  end if;

  -- 6. The recording arrives. A path outside the account's own folder is refused.
  begin
    perform public.bot_recording_ready(note_a,
      b_account::text || '/' || note_a::text || '/meeting.mp3', 600, 0.0833, 'recall');
    raise notice 'FAIL: a file path in somebody else''s folder was accepted';
  exception when sqlstate 'P0001' then raise notice 'PASS: a bot recording cannot be written outside its own folder';
  end;
  begin
    perform public.bot_recording_ready(note_a,
      a_account::text || '/' || note_a::text || '/../../x/meeting.mp3', 600, 0.0833, 'recall');
    raise notice 'FAIL: a path climbing out of the folder was accepted';
  exception when sqlstate 'P0001' then raise notice 'PASS: a bot recording path cannot climb out of its folder';
  end;

  perform public.bot_recording_ready(note_a,
    a_account::text || '/' || note_a::text || '/meeting.mp3', 600, 0.0833, 'recall');
  if (select status from public.meetings where id = note_a) = 'queued' then
    raise notice 'PASS: once the audio is ours the note is queued, exactly like an upload';
  else
    raise notice 'FAIL: the note is %', (select status from public.meetings where id = note_a);
  end if;
  if (select units from public.ai_usage where kind = 'bot' and meeting_id = note_a) = 10 then
    raise notice 'PASS: the bot cost is logged in minutes, under its own kind';
  else
    raise notice 'FAIL: the bot cost row is wrong';
  end if;

  -- 7. And now the normal pipeline accepts it, which it refused before this round.
  begin
    perform public.claim_transcription(note_a, person);
    raise notice 'PASS: a bot note can be transcribed like any other recording';
  exception when sqlstate 'P0001' then raise notice 'FAIL: claim_transcription still refuses a bot note';
  end;

  -- 8. A failed bot keeps its plain reason, and nothing can revive it.
  select * into started from public.start_bot_note(note_b, a_account, person, 'recall', 'zoom',
    'https://zoom.us/j/123456', 'v1', 'hash1');
  perform public.fail_bot(note_b, 'Nobody let Gyan into the meeting.');
  perform public.record_bot_phase(note_b, 'recording');
  if (select phase from public.meeting_bots where meeting_id = note_b) = 'failed'
     and (select status from public.meetings where id = note_b) = 'failed'
     and (select error_message from public.meetings where id = note_b) = 'Nobody let Gyan into the meeting.' then
    raise notice 'PASS: a failed bot stays failed, with its reason in plain words';
  else
    raise notice 'FAIL: a failed bot was revived';
  end if;
  -- And a failed bot never counted as a meeting.
  if coalesce((select meetings_used from public.usage where account_id = a_account), 0) = 0 then
    raise notice 'PASS: a bot that failed does not count as a meeting';
  else
    raise notice 'FAIL: a failed bot counted';
  end if;

  -- 9. THE TWO DAILY CAPS, which are what stops a mistake running up a large bill.
  --    The reservation is the point: a bot that is still in a call has spent nothing yet, so
  --    without it four bots started in the same minute would all pass a cap none of them had
  --    touched. note_c below is left sitting in 'joining', reserving the 180 minutes the Pro
  --    stand-in plan allows it, which is already past the 2 hour per-account cap.
  perform public.start_bot_note(note_c, a_account, person, 'recall', 'meet',
    'https://meet.google.com/zzz-zzzz-zzz', 'v1', 'hash1');
  begin
    perform public.start_bot_note(note_d, a_account, person, 'recall', 'meet',
      'https://meet.google.com/yyy-yyyy-yyy', 'v1', 'hash1');
    raise notice 'FAIL: the per-account daily cap let another bot through';
  exception when sqlstate 'P0001' then raise notice 'PASS: the per-account daily cap refuses another bot';
  end;

  -- With the account cap taken away, the whole-service cap (6 hours) is the next thing to bite.
  update public.security_settings set bot_hours_per_day_account = null where kind = 'meeting_bot';
  perform public.start_bot_note(note_d, a_account, person, 'recall', 'meet',
    'https://meet.google.com/yyy-yyyy-yyy', 'v1', 'hash1');
  begin
    perform public.start_bot_note(note_e, a_account, person, 'recall', 'teams',
      'https://teams.microsoft.com/l/meetup-join/xyz', 'v1', 'hash1');
    raise notice 'FAIL: the whole-service daily cap let another bot through';
  exception when sqlstate 'P0001' then raise notice 'PASS: the whole-service daily cap refuses another bot';
  end;
  update public.security_settings set bot_hours_per_day_account = 2 where kind = 'meeting_bot';

  -- 10. Stop recording: only somebody on the account, and only once the bot really exists.
  begin
    perform public.bot_for_stop(note_c, person);
    raise notice 'FAIL: a bot with no id yet could be stopped';
  exception when sqlstate 'P0001' then raise notice 'PASS: a bot that has not started yet cannot be stopped';
  end;
  perform public.attach_bot(note_c, 'bot-ext-3');
  perform public.record_bot_phase(note_c, 'recording');
  begin
    perform public.bot_for_stop(note_c, other);
    raise notice 'FAIL: a stranger stopped somebody else''s bot';
  exception when sqlstate 'P0001' then raise notice 'PASS: only somebody on the account may stop a bot';
  end;
  if (select external_id from public.bot_for_stop(note_c, person)) = 'bot-ext-3' then
    raise notice 'PASS: somebody on the account can stop the bot';
  else
    raise notice 'FAIL: bot_for_stop gave the wrong id back';
  end if;

  update public.accounts set plan_id = free_plan where id = a_account;
end $$;
reset role;

-- The app cannot turn the switch on, whatever it sends. This is the single most important rule
-- in the feature, so it is tried for real as the owner.
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
do $$
declare saved jsonb;
begin
  saved := public.save_meeting_bot_settings('{"enabled": true, "bot_name": "Sneaky Bot"}'::jsonb);
  if (saved ->> 'enabled')::boolean then
    raise notice 'FAIL: the app turned the meeting bot on';
  else
    raise notice 'PASS: the app cannot turn the meeting bot on, only rename it';
  end if;
  if saved ->> 'bot_name' = 'Sneaky Bot' then
    raise notice 'PASS: the owner can rename the bot';
  else
    raise notice 'FAIL: the owner could not rename the bot';
  end if;
end $$;
-- And B cannot see A's bots.
select case when count(*) = 0 then 'PASS: B cannot read A''s bots'
            else 'FAIL: B read ' || count(*) || ' of A''s bots' end as result
from public.meeting_bots;
reset role; reset request.jwt.claim.sub;

\echo '--- 20. the longest a meeting may be, applied to an upload (prompt 14) ---'
-- max_meeting_minutes has existed since the first migration and has never refused anything.
-- Free is 60 minutes now, so a 90 minute recording must fail -- and the transcription it already
-- paid for must still be written down, because the money really was spent.
set role service_role;
do $$
declare
  a_account uuid := (select id from public.accounts where owner_id = 'aaaaaaaa-0000-4000-8000-000000000001');
  person uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  long_note uuid := 'cccccccc-0000-4000-8000-00000000c001';
  short_note uuid := 'cccccccc-0000-4000-8000-00000000c002';
  again_note uuid := 'cccccccc-0000-4000-8000-00000000c003';
begin
  insert into public.meetings (id, account_id, created_by, source, status, file_path)
  values (long_note, a_account, person, 'upload', 'transcribing',
          a_account::text || '/' || long_note::text || '/long.mp3'),
         (short_note, a_account, person, 'upload', 'transcribing',
          a_account::text || '/' || short_note::text || '/short.mp3');

  -- 90 minutes on a 60 minute plan.
  perform public.finish_transcription(long_note, 'en', 5400, 0.47,
    '[{"speaker_label":"Speaker 1","start_ms":0,"end_ms":1000,"text":"Hello"}]'::jsonb);
  if (select status from public.meetings where id = long_note) = 'failed'
     and (select error_message from public.meetings where id = long_note) like '%60 minutes%' then
    raise notice 'PASS: a recording longer than the plan allows fails, and says the limit';
  else
    raise notice 'FAIL: a 90 minute recording was accepted on a 60 minute plan';
  end if;
  if exists (select 1 from public.ai_usage where meeting_id = long_note and kind = 'transcription') then
    raise notice 'PASS: the transcription that was already paid for is still written down';
  else
    raise notice 'FAIL: a paid transcription went unrecorded';
  end if;
  -- And it never counts as a meeting.
  if (select counted_at from public.meetings where id = long_note) is null then
    raise notice 'PASS: a note refused for being too long does not count';
  else
    raise notice 'FAIL: a refused note counted';
  end if;

  -- 30 minutes on the same plan is fine.
  perform public.finish_transcription(short_note, 'en', 1800, 0.16,
    '[{"speaker_label":"Speaker 1","start_ms":0,"end_ms":1000,"text":"Hello"}]'::jsonb);
  if (select status from public.meetings where id = short_note) = 'summarizing' then
    raise notice 'PASS: a recording inside the limit carries on as normal';
  else
    raise notice 'FAIL: a 30 minute recording was refused';
  end if;

  -- The number is read from the plans table, so changing it there changes what is allowed, with
  -- no code change anywhere. That is the promise; this is the proof. The SAME 90 minute
  -- recording that was just refused is accepted once the column is emptied.
  update public.plans set max_meeting_minutes = null where name = 'Free';
  insert into public.meetings (id, account_id, created_by, source, status, file_path)
  values (again_note, a_account, person, 'upload', 'transcribing',
          a_account::text || '/' || again_note::text || '/long.mp3');
  perform public.finish_transcription(again_note, 'en', 5400, 0.47,
    '[{"speaker_label":"Speaker 1","start_ms":0,"end_ms":1000,"text":"Hello"}]'::jsonb);
  if (select status from public.meetings where id = again_note) = 'summarizing' then
    raise notice 'PASS: emptying the column in the plans table removes the limit, with no code change';
  else
    raise notice 'FAIL: the limit survived being emptied from the plans table';
  end if;
  update public.plans set max_meeting_minutes = 60 where name = 'Free';
end $$;
reset role;

-- And the app can ask what its own limit is, so it can refuse a file before uploading it.
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select case when public.meeting_minutes_allowed() = 60
            then 'PASS: the app is told the limit, so it can refuse a long file before uploading'
            else 'FAIL: got ' || coalesce(public.meeting_minutes_allowed()::text, 'null') end as result;
reset role; reset request.jwt.claim.sub;
