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
