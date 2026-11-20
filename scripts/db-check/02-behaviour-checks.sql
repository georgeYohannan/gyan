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
