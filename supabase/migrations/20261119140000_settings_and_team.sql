-- The Settings area: profile, plan and usage, team seats, and deleting things.
--
-- THIS FILE BREAKS THE RULE THAT MIGRATIONS ONLY ADD THINGS, IN TWO PLACES, BOTH ON PURPOSE.
--
-- 1. meetings.created_by. Right now a note must always have a maker, and the database has no
--    rule for what to do if that person leaves. The effect is a bug: somebody who has made even
--    one note CANNOT DELETE THEIR GYAN ACCOUNT AT ALL, because the note still points at them.
--    The founder's decision is that a removed person's notes stay with the account, so a note
--    has to be able to outlive the person who made it. From here on, deleting a person empties
--    that one column and the note stays exactly where it is; the app shows "A removed person".
--    NO NOTE, TRANSCRIPT, SUMMARY, TO-DO OR FILE IS DELETED BY THIS.
--
-- 2. The app's direct write access to the invites table. The first migration gave the app
--    insert, update and delete on invites. Nothing in the app has ever used it. This file takes
--    it back, so invites can only be made through the door that counts seats and sends the
--    email. Two ways in would make the seat check decoration. No invite row is deleted.
--
-- Everything else here is an addition: 3 columns on plans, 2 plan rows, 2 indexes, 2 private
-- helpers and 15 functions. No table is created or dropped. The sign up trigger is NOT touched.

-- ---------------------------------------------------------------------------
-- 1. plans: what a plan costs, what it includes, and whether its numbers are stand-ins.
-- ---------------------------------------------------------------------------
alter table public.plans add column if not exists is_test boolean not null default false;
alter table public.plans add column if not exists description text;
alter table public.plans add column if not exists features jsonb not null default '[]'::jsonb;

-- A feature line that needs a number NAMES THE COLUMN the number comes from, in braces, and the
-- app puts the real value in. Writing "5 meetings a month" here would be a second copy of the
-- limit, which is the thing hard rule 3 forbids: it could quietly disagree with the column.
-- The placeholder names are exactly the column names, so there is no list to keep in step.
update public.plans
set description = 'For one person getting started.',
    features = '[
      "{meetings_per_month} meetings a month",
      "{chat_messages_per_day} chat questions a day",
      "Transcripts with speakers, summaries and action items",
      "Translate any note into another language",
      "{seats_included} seat"
    ]'::jsonb
where name = 'Free' and features = '[]'::jsonb;

-- TWO STAND-IN PLANS, so the plan switch has somewhere to switch to. Every number below is a
-- placeholder for the founder to change before launch. They are marked is_test, which is what
-- lets set_test_plan touch them and nothing else. When real billing arrives the whole change is
-- to set is_test = false and put the real numbers in, and this switch stops reaching them.
insert into public.plans
  (name, meetings_per_month, chat_messages_per_day, seats_included, max_meeting_minutes,
   is_active, is_test, description, features)
values
  ('Pro', 50, 200, 5, 180, true, true,
   'STAND-IN NUMBERS, for trying out the Plan screen. Not a real plan and not for sale.',
   '[
     "{meetings_per_month} meetings a month",
     "{chat_messages_per_day} chat questions a day",
     "Up to {seats_included} people on the account",
     "Notes up to {max_meeting_minutes} minutes long",
     "Everything in Free"
   ]'::jsonb),
  ('Team', 200, 500, 20, 240, true, true,
   'STAND-IN NUMBERS, for trying out the Team screen. Not a real plan and not for sale.',
   '[
     "{meetings_per_month} meetings a month for the whole team",
     "{chat_messages_per_day} chat questions a day each",
     "Up to {seats_included} people on the account",
     "Notes up to {max_meeting_minutes} minutes long",
     "Everything in Pro"
   ]'::jsonb)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. invites: who sent it, and when it stops working.
-- ---------------------------------------------------------------------------
alter table public.invites add column if not exists invited_by uuid references public.profiles (id) on delete set null;
alter table public.invites add column if not exists accepted_at timestamptz;

create index if not exists invites_account_status_idx on public.invites (account_id, status);
create index if not exists invites_email_idx on public.invites (lower(email));

-- Taking back a permission the app has never used (checked: nothing in src/ writes invites).
-- Invites are now made by claim_invite, which counts seats and is the server's alone, and taken
-- back by revoke_invite. Reading is untouched: a member can still see who has been invited.
revoke insert, update, delete on public.invites from authenticated;
drop policy if exists "Owner adds invites" on public.invites;
drop policy if exists "Owner edits invites" on public.invites;
drop policy if exists "Owner deletes invites" on public.invites;

-- ---------------------------------------------------------------------------
-- 3. One owner per account, always.
-- ---------------------------------------------------------------------------
-- "Who owns this account" is written in two places: accounts.owner_id and this role. They must
-- never disagree, or the permission checks and the billing would point at different people.
-- This makes a second owner impossible rather than something every function has to remember.
-- It cannot fail on what is already there: handle_new_user has only ever made one owner each.
create unique index if not exists account_members_one_owner_idx
  on public.account_members (account_id)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- 4. THE ONE CHANGE TO AN EXISTING RULE. See the note at the top of this file.
-- ---------------------------------------------------------------------------
alter table public.meetings drop constraint if exists meetings_created_by_fkey;
alter table public.meetings alter column created_by drop not null;
alter table public.meetings
  add constraint meetings_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. Two small helpers.
-- ---------------------------------------------------------------------------
-- How many of an account's seats are taken: people on it, plus invites still waiting. A waiting
-- invite holds a seat, so an owner cannot send five invites for one seat and have them all land.
create function private.seats_used(target_account uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.account_members am where am.account_id = target_account)::integer
       + (select count(*) from public.invites i
          where i.account_id = target_account and i.status = 'pending')::integer;
$$;

revoke execute on function private.seats_used(uuid) from public, anon;
grant execute on function private.seats_used(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. get_plan_and_usage: everything the Plan and usage screen shows, in one ask.
-- ---------------------------------------------------------------------------
-- Every number comes out of the plans and usage tables. None of them is written in the app.
-- Any member may read it, so a team member can see what the account is allowed.
--
-- Note which numbers are whose: meetings are counted FOR THE WHOLE ACCOUNT, chat questions are
-- counted PER PERSON PER DAY. The screen has to say so, or a member will think a teammate's
-- chatting is eating their questions.
create function public.get_plan_and_usage()
returns table (
  account_id uuid,
  is_owner boolean,
  plan_name text,
  plan_description text,
  plan_features jsonb,
  is_test_plan boolean,
  meetings_per_month integer,
  chat_messages_per_day integer,
  seats_included integer,
  max_meeting_minutes integer,
  meetings_used integer,
  chat_messages_used integer,
  chat_messages_left integer,
  seats_used integer,
  members_count integer,
  invites_pending integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  my_role text;
  this_month date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select am.account_id, am.role into my_account, my_role
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;

  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  return query
  select my_account,
         my_role = 'owner',
         p.name,
         p.description,
         p.features,
         p.is_test,
         p.meetings_per_month,
         p.chat_messages_per_day,
         p.seats_included,
         p.max_meeting_minutes,
         -- The same month boundary private.assert_under_limit uses, so the number on the screen
         -- and the number that blocks an upload can never differ.
         (select coalesce(sum(u.meetings_used), 0)::integer
          from public.usage u
          where u.account_id = my_account and u.month = this_month),
         -- The same day boundary private.chat_questions_left uses: midnight, UTC.
         (select count(*)::integer
          from public.chat_messages cm
          join public.chat_threads t on t.id = cm.thread_id
          where t.user_id = me
            and t.account_id = my_account
            and cm.role = 'user'
            and cm.created_at >= date_trunc('day', now() at time zone 'utc')),
         -- How many are left comes from the one function that decides the daily limit, never
         -- from subtracting here. If the screen did its own sum it could disagree with the gate.
         private.chat_questions_left(my_account, me),
         private.seats_used(my_account),
         (select count(*)::integer from public.account_members am where am.account_id = my_account),
         (select count(*)::integer from public.invites i
          where i.account_id = my_account and i.status = 'pending')
  from public.accounts a
  join public.plans p on p.id = a.plan_id
  where a.id = my_account;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. set_test_plan: THE TEST-ONLY PLAN SWITCH. Four locks.
-- ---------------------------------------------------------------------------
-- This exists so the founder can watch the limits change without real payments being built.
-- It must be impossible to misuse, including in a brand new paid project built from these very
-- same files. So it does not rely on anything this file can set, which rules out "is this the
-- test project?" on its own: a new project runs this migration too, and would answer yes.
create function public.set_test_plan(p_plan_name text)
returns table (plan_name text, is_test_plan boolean, seats_included integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  am_admin boolean;
  now_is_test boolean;
  now_is_free boolean;
  target public.plans;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- LOCK 1: only the owner of an account may change what that account is on.
  select am.account_id into my_account
  from public.account_members am
  where am.user_id = me and am.role = 'owner'
  limit 1;
  if my_account is null then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;

  -- LOCK 2, the one that does not travel inside this file: you must be a gyan admin. No
  -- migration ever sets is_admin to true, and the app cannot set it at all, so in a brand new
  -- project NOBODY can run this until a person turns it on by hand in the Supabase dashboard.
  select coalesce(pr.is_admin, false) into am_admin from public.profiles pr where pr.id = me;
  if not am_admin then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;

  select p.* into target from public.plans p where p.name = btrim(p_plan_name) and p.is_active;
  if target.id is null then
    raise exception 'no_such_plan' using errcode = 'P0001';
  end if;

  -- LOCK 3: you may only move TO a stand-in plan, or back to Free.
  if not (target.is_test or target.name = 'Free') then
    raise exception 'not_a_test_plan' using errcode = 'P0001';
  end if;

  -- LOCK 4: and only FROM a stand-in plan, or from Free. Once Pro and Team hold real numbers
  -- and real money, every account on them is out of this function's reach, admin or not. This
  -- is what stops a paid plan and the payment behind it ever drifting apart.
  select p.is_test, p.name = 'Free' into now_is_test, now_is_free
  from public.accounts a join public.plans p on p.id = a.plan_id
  where a.id = my_account;
  if not (coalesce(now_is_test, false) or coalesce(now_is_free, false)) then
    raise exception 'real_plan' using errcode = 'P0001';
  end if;

  -- Moving down must not leave more people on the account than the plan has seats for.
  if private.seats_used(my_account) > target.seats_included then
    raise exception 'too_many_people' using errcode = 'P0001';
  end if;

  update public.accounts set plan_id = target.id where id = my_account;

  return query select target.name, target.is_test, target.seats_included;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. list_team: who is on the account, and who has been invited.
-- ---------------------------------------------------------------------------
-- The address comes from the login table, which only a function like this one may read. It is
-- the same join claim_recap uses. A TOKEN IS NEVER HANDED BACK HERE: a token is a key to the
-- account, and the only thing that ever holds one is the server function that emails it.
create function public.list_team()
returns table (
  account_id uuid,
  is_owner boolean,
  seats_included integer,
  seats_used integer,
  members jsonb,
  pending_invites jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  my_role text;
  seats integer;
  people jsonb;
  waiting jsonb;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select am.account_id, am.role into my_account, my_role
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;

  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  select p.seats_included into seats
  from public.accounts a join public.plans p on p.id = a.plan_id
  where a.id = my_account;

  -- THE SERVER says which row is you, so the screen never has to work it out from an address.
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', am.user_id,
           'email', u.email,
           'name', coalesce(nullif(btrim(coalesce(pr.display_name, '')), ''), split_part(u.email, '@', 1)),
           'role', am.role,
           'is_you', am.user_id = me
         ) order by (am.role = 'owner') desc, u.email), '[]'::jsonb)
  into people
  from public.account_members am
  join public.profiles pr on pr.id = am.user_id
  join auth.users u on u.id = am.user_id
  where am.account_id = my_account and u.email is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'email', i.email,
           'created_at', i.created_at
         ) order by i.created_at desc), '[]'::jsonb)
  into waiting
  from public.invites i
  where i.account_id = my_account and i.status = 'pending';

  return query select my_account, my_role = 'owner', seats, private.seats_used(my_account), people, waiting;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. claim_invite: make one invite. SERVER ONLY.
-- ---------------------------------------------------------------------------
-- The app never calls this and never sees the token. The team server function does: it checks
-- who is signed in, calls this, gets the token back, and puts it in an email. So a token only
-- ever travels to the invited person's inbox, the way a password reset link does.
--
-- Every reason an invite can be refused lives here, in one place.
create function public.claim_invite(p_user_id uuid, p_email text)
returns table (
  invite_id uuid,
  invite_account_id uuid,
  invite_email text,
  invite_token text,
  owner_name text,
  seats_included integer,
  seats_used integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_account uuid;
  clean_email text := lower(btrim(coalesce(p_email, '')));
  seats integer;
  new_token text;
  new_id uuid;
  who text;
begin
  if p_user_id is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- The owner check is the first thing that happens, before anything is read or written.
  select am.account_id into my_account
  from public.account_members am
  where am.user_id = p_user_id and am.role = 'owner'
  limit 1;
  if my_account is null then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;

  if clean_email = '' or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_email' using errcode = 'P0001';
  end if;

  -- Comparing the LOGIN address, and case does not matter.
  if exists (
    select 1 from public.account_members am
    join auth.users u on u.id = am.user_id
    where am.account_id = my_account and lower(btrim(u.email)) = clean_email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.invites i
    where i.account_id = my_account and lower(btrim(i.email)) = clean_email and i.status = 'pending'
  ) then
    raise exception 'already_invited' using errcode = 'P0001';
  end if;

  select p.seats_included into seats
  from public.accounts a join public.plans p on p.id = a.plan_id
  where a.id = my_account;

  -- Checked BEFORE the invite exists, because a waiting invite itself holds a seat.
  if private.seats_used(my_account) >= coalesce(seats, 1) then
    raise exception 'seats_full' using errcode = 'P0001';
  end if;

  -- 64 characters of randomness, from two random ids with their dashes taken out. Built with a
  -- function Postgres has itself, so this needs no extra extension and works in a new project.
  new_token := replace(pg_catalog.gen_random_uuid()::text, '-', '')
            || replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into public.invites (account_id, email, token, status, invited_by)
  values (my_account, clean_email, new_token, 'pending', p_user_id)
  returning id into new_id;

  select coalesce(nullif(btrim(coalesce(pr.display_name, '')), ''), 'your workspace')
  into who
  from public.accounts a join public.profiles pr on pr.id = a.owner_id
  where a.id = my_account;

  return query select new_id, my_account, clean_email, new_token, who,
                      coalesce(seats, 1), private.seats_used(my_account);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. discard_invite: take back an invite whose email would not send. SERVER ONLY.
-- ---------------------------------------------------------------------------
-- So a seat is never held by an invite that nobody ever got. The Revoke button on the Team
-- screen is revoke_invite below; this one is only for cleaning up after a failed send.
create function public.discard_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites set status = 'revoked'
  where id = p_invite_id and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- 10b. log_account_email: write down an email that is not about a note. SERVER ONLY.
-- ---------------------------------------------------------------------------
-- log_email (added with recaps) always writes kind = 'recap' and wants a note. An invite has no
-- note and no gyan account on the other end yet, so it needs its own door into the same book.
-- Every email gyan sends is written down, whether it worked or not.
create function public.log_account_email(
  p_account_id uuid,
  p_kind text,
  p_recipient_email text,
  p_result text,
  p_error_message text,
  p_sent_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_row uuid;
begin
  if p_result not in ('sent', 'failed') then
    raise exception 'bad_result' using errcode = 'P0001';
  end if;

  insert into public.email_log (
    account_id, meeting_id, kind, recipient_user_id, recipient_email,
    language, translated, result, error_message, sent_by, auto
  )
  values (
    p_account_id, null, coalesce(nullif(btrim(p_kind), ''), 'invite'), null, btrim(p_recipient_email),
    null, false, p_result, p_error_message, p_sent_by, false
  )
  returning id into new_row;

  return new_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. revoke_invite: the owner takes back an invite. APP.
-- ---------------------------------------------------------------------------
create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
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

  update public.invites set status = 'revoked'
  where id = p_invite_id and account_id = my_account and status = 'pending';

  -- Say no out loud, rather than silently changing nothing, so the screen can explain.
  if not found then
    raise exception 'no_invite' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. change_member_role: hand the account over, or take it back. OWNER ONLY.
-- ---------------------------------------------------------------------------
-- There is one owner per account (section 3), so making somebody the owner is a HAND-OVER: the
-- person who presses it stops being the owner in the same step. The screen must say that.
-- Both places the owner is written down are changed together, or they would drift apart.
create function public.change_member_role(p_user_id uuid, p_role text)
returns table (owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if p_role not in ('owner', 'member') then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;

  select am.account_id into my_account
  from public.account_members am
  where am.user_id = me and am.role = 'owner'
  limit 1;
  if my_account is null then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.account_members am
    where am.account_id = my_account and am.user_id = p_user_id
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  -- You are the only owner there is, so you cannot step down with nobody stepping up.
  if p_user_id = me then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  -- Making somebody a member when they already are one: nothing to do.
  if p_role = 'member' then
    return query select a.owner_id from public.accounts a where a.id = my_account;
    return;
  end if;

  -- Step the old owner DOWN first. One owner per account is a rule the database itself keeps,
  -- so two owners cannot exist even for the length of one statement.
  update public.account_members set role = 'member'
  where account_id = my_account and user_id = me;

  update public.account_members set role = 'owner'
  where account_id = my_account and user_id = p_user_id;

  -- The other place the owner is written down. These two must never disagree.
  update public.accounts set owner_id = p_user_id where id = my_account;

  return query select p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. remove_member: take somebody off the account. OWNER ONLY.
-- ---------------------------------------------------------------------------
-- THEIR NOTES STAY. The notes were made on this account, so the account keeps them (the
-- founder's decision). Nothing here touches the meetings table. Their own chats stay too: a
-- chat is only ever readable by the person who asked, so if they are invited back it is there.
create function public.remove_member(p_user_id uuid)
returns table (new_account_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  their_role text;
  free_plan_id uuid;
  fresh_account uuid;
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

  if p_user_id = me then
    raise exception 'cannot_remove_yourself' using errcode = 'P0001';
  end if;

  select am.role into their_role
  from public.account_members am
  where am.account_id = my_account and am.user_id = p_user_id;

  if their_role is null then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if their_role = 'owner' then
    raise exception 'cannot_remove_owner' using errcode = 'P0001';
  end if;

  delete from public.account_members
  where account_id = my_account and user_id = p_user_id;

  -- A person with no account at all would open gyan to a dead screen with no way out. So if
  -- this was their only one, they get a fresh Free workspace, exactly like a new sign up.
  if not exists (select 1 from public.account_members am where am.user_id = p_user_id) then
    select p.id into free_plan_id from public.plans p where p.name = 'Free' and p.is_active limit 1;
    if free_plan_id is null then
      raise exception 'no_free_plan' using errcode = 'P0001';
    end if;
    insert into public.accounts (owner_id, plan_id)
    values (p_user_id, free_plan_id)
    returning id into fresh_account;
    insert into public.account_members (account_id, user_id, role)
    values (fresh_account, p_user_id, 'owner');
  end if;

  return query select fresh_account;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. accept_invite: join the team that invited you.
-- ---------------------------------------------------------------------------
-- The sign up trigger is deliberately NOT changed. Every new person still gets their own Free
-- workspace, and this is what moves them off it. That matters: joining on the sign up address
-- alone would let somebody type a colleague's address into the form and walk into their
-- workspace without ever holding the link. Here the link is always required.
create function public.accept_invite(p_token text)
returns table (joined_account uuid, owner_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_email text;
  inv public.invites;
  seats integer;
  who text;
  solo uuid;
  solo_notes integer;
  solo_others integer;
  solo_invites integer;
  solo_plan_ok boolean;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- The address on the login, read here and nowhere else. An address is never an input.
  select lower(btrim(u.email)) into my_email from auth.users u where u.id = me;
  if my_email is null or my_email = '' then
    raise exception 'no_email' using errcode = 'P0001';
  end if;

  select i.* into inv from public.invites i
  where i.token = btrim(coalesce(p_token, '')) and i.status = 'pending';
  if inv.id is null then
    raise exception 'bad_invite' using errcode = 'P0001';
  end if;

  -- A key that never goes stale is a permanent way into somebody's workspace.
  if inv.created_at < now() - interval '14 days' then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  -- THE INVITE BELONGS TO AN ADDRESS, not to whoever is holding the link. A forwarded link is
  -- useless to anybody but the person it was sent to.
  if lower(btrim(inv.email)) <> my_email then
    raise exception 'wrong_email' using errcode = 'P0001';
  end if;

  select p.seats_included into seats
  from public.accounts a join public.plans p on p.id = a.plan_id
  where a.id = inv.account_id;

  select coalesce(nullif(btrim(coalesce(pr.display_name, '')), ''), 'your workspace')
  into who
  from public.accounts a join public.profiles pr on pr.id = a.owner_id
  where a.id = inv.account_id;

  -- Already on it. Tidy the invite away and say yes, rather than failing on a second tap.
  if exists (
    select 1 from public.account_members am
    where am.account_id = inv.account_id and am.user_id = me
  ) then
    update public.invites set status = 'accepted', accepted_at = now() where id = inv.id;
    return query select inv.account_id, who;
    return;
  end if;

  -- Checked AGAIN at the moment of joining, because seats can change after an invite goes out.
  if private.seats_used(inv.account_id) > coalesce(seats, 1) then
    raise exception 'seats_full' using errcode = 'P0001';
  end if;

  -- THEIR OWN WORKSPACE HAS TO GO, and this is why: every function that asks "which account am
  -- I on?" takes the one they OWN first. Leaving it behind would show them their own empty
  -- workspace for ever instead of the team's notes, and nothing would look broken.
  select a.id into solo from public.accounts a where a.owner_id = me limit 1;

  if solo is not null then
    select count(*) into solo_notes from public.meetings m where m.account_id = solo;
    select count(*) into solo_others from public.account_members am
      where am.account_id = solo and am.user_id <> me;
    select count(*) into solo_invites from public.invites i
      where i.account_id = solo and i.status = 'pending';
    select (p.name = 'Free' or p.is_test) into solo_plan_ok
      from public.accounts a join public.plans p on p.id = a.plan_id where a.id = solo;

    -- Four things make a workspace worth keeping. Any one of them and joining is refused,
    -- rather than quietly throwing somebody's work, team or subscription away.
    if solo_notes > 0 then raise exception 'own_notes' using errcode = 'P0001'; end if;
    if solo_others > 0 then raise exception 'own_team' using errcode = 'P0001'; end if;
    if solo_invites > 0 then raise exception 'own_invites' using errcode = 'P0001'; end if;
    if not coalesce(solo_plan_ok, true) then raise exception 'own_plan' using errcode = 'P0001'; end if;
  end if;

  insert into public.account_members (account_id, user_id, role)
  values (inv.account_id, me, 'member');

  update public.invites set status = 'accepted', accepted_at = now() where id = inv.id;

  -- The one delete of data in this file: an empty workspace, with nothing in it, that this
  -- person has just chosen to leave. The four checks above prove it is empty.
  if solo is not null then
    delete from public.accounts where id = solo;
  end if;

  return query select inv.account_id, who;
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. delete_note: remove one note and everything made from it. APP.
-- ---------------------------------------------------------------------------
-- The app cannot simply delete the row: it has SELECT on meetings and nothing else, on purpose.
-- So deleting goes through a door, like every other write in this project.
--
-- Notes are SHARED with the team, but throwing one away is not: the person who made it may
-- delete it, and so may the account owner. Nobody else can throw away a teammate's work.
create function public.delete_note(p_meeting_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  note public.meetings;
  path text;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select m.* into note from public.meetings m where m.id = p_meeting_id;
  if note.id is null or not (select private.is_account_member(note.account_id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if note.created_by is distinct from me and not (select private.is_account_owner(note.account_id)) then
    raise exception 'not_yours' using errcode = 'P0001';
  end if;

  -- Everything that hangs off the note goes with it: the transcript, the summary, the to-dos,
  -- the mind map, the translations and the chats about it. Two things deliberately SURVIVE,
  -- with the note taken off them: what the AI cost (ai_usage) and the record of any recap email
  -- that went out (email_log). The money really was spent and the email really was sent.
  --
  -- THE MONTH'S MEETING COUNT IS NOT GIVEN BACK. The transcript and summary were already paid
  -- for, so deleting a note is not a way around the limit. The screen says so before it asks.
  path := note.file_path;
  delete from public.meetings where id = p_meeting_id;

  -- The recording itself lives in storage, not here. The app removes it with the permission it
  -- already has ("Delete files of own accounts"), using this path.
  return path;
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. can_delete_account: may this person delete their account, and if not, why not? APP.
-- ---------------------------------------------------------------------------
-- This is for the screen. The real check happens AGAIN on the server, in
-- claim_account_deletion, because a check the app made a moment ago is not a check.
create function public.can_delete_account()
returns table (
  account_id uuid,
  is_owner boolean,
  can_delete boolean,
  reason text,
  what_goes text,
  note_count integer,
  other_member_count integer,
  pending_invite_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  my_role text;
  notes integer;
  others integer;
  waiting integer;
  owner_label text;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select am.account_id, am.role into my_account, my_role
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;
  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  select count(*)::integer into notes from public.meetings m where m.account_id = my_account;
  select count(*)::integer into others from public.account_members am
    where am.account_id = my_account and am.user_id <> me;
  select count(*)::integer into waiting from public.invites i
    where i.account_id = my_account and i.status = 'pending';
  select coalesce(nullif(btrim(coalesce(pr.display_name, '')), ''), 'the account owner')
    into owner_label
    from public.accounts a join public.profiles pr on pr.id = a.owner_id where a.id = my_account;

  -- A MEMBER leaving: they go, and the notes they made stay with the workspace.
  if my_role <> 'owner' then
    return query select my_account, false, true, null::text,
      'Your login, your name and your own chats are deleted. The notes you made stay in '
      || owner_label || '''s workspace, with your name taken off them.',
      notes, others, waiting;
    return;
  end if;

  -- AN OWNER WITH OTHER PEOPLE ON THE ACCOUNT IS STOPPED. The founder's decision, and it is
  -- also what prevents a quiet disaster: deleting the owner's login takes the whole workspace
  -- with it, including every note every member of the team has ever made.
  if others > 0 then
    return query select my_account, true, false,
      'There ' || case when others = 1 then 'is 1 other person' else 'are ' || others || ' other people' end
      || ' on your account. Remove them on the Team screen first, then you can delete your account.',
      null::text, notes, others, waiting;
    return;
  end if;

  if waiting > 0 then
    return query select my_account, true, false,
      'You have ' || waiting || ' invite' || case when waiting = 1 then '' else 's' end
      || ' still waiting to be accepted. Take ' || case when waiting = 1 then 'it' else 'them' end
      || ' back on the Team screen first.',
      null::text, notes, others, waiting;
    return;
  end if;

  return query select my_account, true, true, null::text,
    'Everything goes: your login, your name, '
    || case when notes = 1 then 'your 1 note' else 'all ' || notes || ' of your notes' end
    || ', their transcripts, summaries, to-dos, chats, and the files you uploaded. '
    || 'This cannot be undone and gyan keeps no copy.',
    notes, others, waiting;
end;
$$;

-- ---------------------------------------------------------------------------
-- 17. claim_account_deletion: the one gate a deletion has to pass. SERVER ONLY.
-- ---------------------------------------------------------------------------
-- IT CHANGES NOTHING. It only says whether this may happen, and hands back what the server
-- function needs to do it: which workspaces to sweep files out of, and the person's address.
create function public.claim_account_deletion(p_user_id uuid)
returns table (owned_accounts jsonb, note_count integer, person_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned jsonb;
  others integer;
  waiting integer;
  notes integer;
  who text;
begin
  if p_user_id is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(a.id), '[]'::jsonb) into owned
  from public.accounts a where a.owner_id = p_user_id;

  -- The same two blocks the screen showed, checked again here where they cannot be skipped.
  select count(*)::integer into others
  from public.account_members am
  join public.accounts a on a.id = am.account_id
  where a.owner_id = p_user_id and am.user_id <> p_user_id;
  if others > 0 then
    raise exception 'team_not_empty' using errcode = 'P0001';
  end if;

  select count(*)::integer into waiting
  from public.invites i
  join public.accounts a on a.id = i.account_id
  where a.owner_id = p_user_id and i.status = 'pending';
  if waiting > 0 then
    raise exception 'invites_waiting' using errcode = 'P0001';
  end if;

  select count(*)::integer into notes
  from public.meetings m
  join public.accounts a on a.id = m.account_id
  where a.owner_id = p_user_id;

  select u.email into who from auth.users u where u.id = p_user_id;

  return query select owned, notes, who;
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. delete_account: remove the workspaces this person owns. SERVER ONLY.
-- ---------------------------------------------------------------------------
-- One delete. Everything else follows from the rules already on the tables: notes, transcripts,
-- summaries, to-dos, mind maps, translations, chats, invites, usage, integrations and the email
-- log all go with the workspace.
--
-- The person's LOGIN is deleted afterwards, by the server function, not here. That step takes
-- their profile with it, which takes them off any team they were a member of and empties their
-- name off the notes they made there. Those notes stay with that team, as the founder decided.
create function public.delete_account(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  if p_user_id is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.account_members am
    join public.accounts a on a.id = am.account_id
    where a.owner_id = p_user_id and am.user_id <> p_user_id
  ) then
    raise exception 'team_not_empty' using errcode = 'P0001';
  end if;

  delete from public.accounts where owner_id = p_user_id;
  get diagnostics gone = row_count;
  return gone;
end;
$$;

-- ---------------------------------------------------------------------------
-- 19. Who may run what.
-- ---------------------------------------------------------------------------
-- The ones that hold an invite token, or delete a workspace, are the server's alone.
revoke execute on function public.claim_invite(uuid, text) from public, anon, authenticated;
revoke execute on function public.discard_invite(uuid) from public, anon, authenticated;
revoke execute on function public.log_account_email(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.claim_account_deletion(uuid) from public, anon, authenticated;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.claim_invite(uuid, text) to service_role;
grant execute on function public.discard_invite(uuid) to service_role;
grant execute on function public.log_account_email(uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.claim_account_deletion(uuid) to service_role;
grant execute on function public.delete_account(uuid) to service_role;

-- The ones the Settings screens need are open to signed-in people. Each checks who is asking.
revoke execute on function public.get_plan_and_usage() from public, anon;
revoke execute on function public.set_test_plan(text) from public, anon;
revoke execute on function public.list_team() from public, anon;
revoke execute on function public.revoke_invite(uuid) from public, anon;
revoke execute on function public.change_member_role(uuid, text) from public, anon;
revoke execute on function public.remove_member(uuid) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.delete_note(uuid) from public, anon;
revoke execute on function public.can_delete_account() from public, anon;

grant execute on function public.get_plan_and_usage() to authenticated;
grant execute on function public.set_test_plan(text) to authenticated;
grant execute on function public.list_team() to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.change_member_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.delete_note(uuid) to authenticated;
grant execute on function public.can_delete_account() to authenticated;
