-- Row Level Security: who can see and change what (docs/data-model.md).
-- Server functions use the secret key, which skips these rules, so they can write
-- to the server-only tables. The app can never do that.

-- Helper functions live in a private schema that the app cannot call directly as an API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Is the signed-in person a member of this account?
create function private.is_account_member(target_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = target_account and m.user_id = (select auth.uid())
  );
$$;

-- Is the signed-in person the owner of this account?
create function private.is_account_owner(target_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = target_account and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Can the signed-in person read this meeting? (Is its account one of theirs?)
create function private.can_read_meeting(target_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meetings mt
    join public.account_members m on m.account_id = mt.account_id
    where mt.id = target_meeting and m.user_id = (select auth.uid())
  );
$$;

-- Can the signed-in person read this chat thread?
create function private.can_read_thread(target_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_threads t
    join public.account_members m on m.account_id = t.account_id
    where t.id = target_thread and m.user_id = (select auth.uid())
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Turn on Row Level Security for every table.
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.invites enable row level security;
alter table public.usage enable row level security;
alter table public.meetings enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.summaries enable row level security;
alter table public.action_items enable row level security;
alter table public.mind_maps enable row level security;
alter table public.translations enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.integrations enable row level security;
alter table public.ai_usage enable row level security;

-- Start from nothing, then grant only what the app needs.
-- Signed-out visitors (anon) get no access to any table.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
-- Writes the app may make:
grant update (display_name, preferred_language) on public.profiles to authenticated; -- never is_admin
grant insert, update, delete on public.invites to authenticated;
grant insert, update, delete on public.integrations to authenticated;
-- Integrations may hold tokens, so only the owner may read them (see the policy below).

-- profiles: you see and edit only your own row. is_admin cannot be changed by the app.
create policy "Read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Edit own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- plans: everyone signed in can read the limits. Nobody can write from the app.
create policy "Read plans" on public.plans
  for select to authenticated using (true);

-- accounts and members: you see only your own accounts.
create policy "Read own accounts" on public.accounts
  for select to authenticated using ((select private.is_account_member(id)));
create policy "Read members of own accounts" on public.account_members
  for select to authenticated using ((select private.is_account_member(account_id)));

-- invites: members can read, only the owner can manage.
create policy "Read invites of own accounts" on public.invites
  for select to authenticated using ((select private.is_account_member(account_id)));
create policy "Owner adds invites" on public.invites
  for insert to authenticated with check ((select private.is_account_owner(account_id)));
create policy "Owner edits invites" on public.invites
  for update to authenticated
  using ((select private.is_account_owner(account_id)))
  with check ((select private.is_account_owner(account_id)));
create policy "Owner deletes invites" on public.invites
  for delete to authenticated using ((select private.is_account_owner(account_id)));

-- integrations: owner only, for reading and writing.
create policy "Owner reads integrations" on public.integrations
  for select to authenticated using ((select private.is_account_owner(account_id)));
create policy "Owner adds integrations" on public.integrations
  for insert to authenticated with check ((select private.is_account_owner(account_id)));
create policy "Owner edits integrations" on public.integrations
  for update to authenticated
  using ((select private.is_account_owner(account_id)))
  with check ((select private.is_account_owner(account_id)));
create policy "Owner deletes integrations" on public.integrations
  for delete to authenticated using ((select private.is_account_owner(account_id)));

-- Read only for members. Only server functions write to these tables.
create policy "Read usage of own accounts" on public.usage
  for select to authenticated using ((select private.is_account_member(account_id)));
create policy "Read ai_usage of own accounts" on public.ai_usage
  for select to authenticated using ((select private.is_account_member(account_id)));
create policy "Read meetings of own accounts" on public.meetings
  for select to authenticated using ((select private.is_account_member(account_id)));
create policy "Read chat threads of own accounts" on public.chat_threads
  for select to authenticated using ((select private.is_account_member(account_id)));

create policy "Read transcript lines of own meetings" on public.transcript_segments
  for select to authenticated using ((select private.can_read_meeting(meeting_id)));
create policy "Read summaries of own meetings" on public.summaries
  for select to authenticated using ((select private.can_read_meeting(meeting_id)));
create policy "Read action items of own meetings" on public.action_items
  for select to authenticated using ((select private.can_read_meeting(meeting_id)));
create policy "Read mind maps of own meetings" on public.mind_maps
  for select to authenticated using ((select private.can_read_meeting(meeting_id)));
create policy "Read translations of own meetings" on public.translations
  for select to authenticated using ((select private.can_read_meeting(meeting_id)));
create policy "Read chat messages of own threads" on public.chat_messages
  for select to authenticated using ((select private.can_read_thread(thread_id)));

-- The Free plan. An admin can change these numbers later. Never hard code them in the app.
insert into public.plans (name, meetings_per_month, seats_included)
values ('Free', 5, 1)
on conflict (name) do nothing;
