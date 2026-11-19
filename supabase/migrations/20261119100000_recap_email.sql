-- Recap emails: send a note's summary and action items to people on the same account.
--
-- Three things in this file:
--   1. One row per account in the EXISTING integrations table holds the recap settings.
--      Its rules are already owner-only (see 20261116220100_row_level_security.sql), so no new
--      policy is needed there. Only a unique key, so saving the settings can overwrite cleanly.
--   2. A new email_log table: one row per person per email, so there is always a record of what
--      was sent, to whom, and whether it worked.
--   3. Four database functions. Two are server-only (the recap server function calls them).
--      Two are for the app, so the settings screen can read and save.
--
-- This file only ADDS things. It deletes nothing and changes no existing rule.

-- ---------------------------------------------------------------------------
-- 1. Recap settings live on integrations, as kind = 'recap_email'.
-- ---------------------------------------------------------------------------
-- settings looks like: { "to_owner": true, "to_members": false, "auto_send": false }
-- When there is no row at all, the defaults below apply: the account owner only, and no
-- automatic sending. So nobody is ever emailed until the owner chooses it.
create unique index if not exists integrations_account_kind_idx
  on public.integrations (account_id, kind);

-- ---------------------------------------------------------------------------
-- 2. email_log: one row per email we tried to send.
-- ---------------------------------------------------------------------------
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete set null,
  kind text not null default 'recap',
  recipient_user_id uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  language text,
  translated boolean not null default false,
  result text not null check (result in ('sent', 'failed')),
  -- The id the email service gave this message, so one send can be looked up later.
  provider_id text,
  error_message text,
  -- Who pressed Send. Empty when the note sent itself (the automatic send).
  sent_by uuid references public.profiles (id) on delete set null,
  auto boolean not null default false,
  created_at timestamptz not null default now()
);

create index email_log_account_created_idx on public.email_log (account_id, created_at desc);
create index email_log_meeting_idx on public.email_log (meeting_id);

alter table public.email_log enable row level security;

-- Anyone on the account may READ the log, so the app can say when a recap last went out.
-- Nobody may write it from the app. Every row is written by the server, through log_email below.
create policy "Read email_log of own accounts" on public.email_log
  for select to authenticated using ((select private.is_account_member(account_id)));

revoke all on public.email_log from anon, authenticated;
grant select on public.email_log to authenticated;

-- ---------------------------------------------------------------------------
-- 3. claim_recap: the one gate a recap has to pass through. SERVER ONLY.
-- ---------------------------------------------------------------------------
-- Done in one step so there is a single place that decides who may be emailed. It checks the
-- person, checks the note is really finished, and hands back everything the email needs,
-- including the full list of people on the account.
--
-- `recipients` is EVERY member of the account, each with `default_on` saying whether the saved
-- settings would include them. The server function may only ever send to somebody in this list,
-- which is what makes "never send to an address typed in by hand" true: an address is never an
-- input, only an id, and an id that is not in this list is dropped.
--
-- p_auto is true only for the automatic send, which no person started. It is set by one of our
-- own server functions (this function is service_role only, so the app can never reach it).
-- With p_auto there is no person to check, so p_user_id is empty and the settings decide alone.
create function public.claim_recap(p_meeting_id uuid, p_user_id uuid, p_auto boolean)
returns table (
  account_id uuid,
  owner_id uuid,
  owner_name text,
  note_title text,
  note_date timestamptz,
  summary_id uuid,
  summary_language text,
  overview text,
  key_points jsonb,
  decisions jsonb,
  open_questions jsonb,
  action_items jsonb,
  settings jsonb,
  recipients jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  note public.meetings;
  saved jsonb;
  send_owner boolean;
  send_members boolean;
  send_auto boolean;
  the_summary public.summaries;
  the_owner_id uuid;
  owner_label text;
  items jsonb;
  people jsonb;
begin
  select * into note from public.meetings m where m.id = p_meeting_id;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- A person asking has to be on the account. The automatic send has no person behind it.
  if not p_auto then
    if p_user_id is null
       or not exists (
         select 1 from public.account_members am
         where am.account_id = note.account_id and am.user_id = p_user_id
       ) then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;

  -- Only a finished note has something worth emailing.
  if note.status <> 'ready' then
    raise exception 'not_ready' using errcode = 'P0001';
  end if;

  select * into the_summary from public.summaries s where s.meeting_id = p_meeting_id;
  if not found then
    raise exception 'no_summary' using errcode = 'P0001';
  end if;

  -- The saved settings, or the safe defaults when the owner has never chosen.
  select i.settings into saved
  from public.integrations i
  where i.account_id = note.account_id and i.kind = 'recap_email';

  send_owner := coalesce((saved ->> 'to_owner')::boolean, true);
  send_members := coalesce((saved ->> 'to_members')::boolean, false);
  send_auto := coalesce((saved ->> 'auto_send')::boolean, false);

  -- The automatic send only happens when the owner turned it on, and only once per note.
  -- Regenerating a summary makes the note Ready again, and must not email everybody twice.
  if p_auto then
    if not send_auto then
      raise exception 'auto_off' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.email_log e
      where e.meeting_id = p_meeting_id and e.kind = 'recap' and e.auto and e.result = 'sent'
    ) then
      raise exception 'already_sent' using errcode = 'P0001';
    end if;
  end if;

  -- The owner's name for the footer, and their id, which the automatic send uses when it needs
  -- a translation: there is no person behind an automatic send, so the owner stands in.
  select a.owner_id, coalesce(nullif(btrim(coalesce(p.display_name, '')), ''), 'your workspace')
  into the_owner_id, owner_label
  from public.accounts a
  join public.profiles p on p.id = a.owner_id
  where a.id = note.account_id;

  -- EXACTLY the order the app and the translate function use: earliest moment first, then by id
  -- so two to-dos from the same moment never swap places. This matters more than it looks:
  -- a translated to-do is lined up against its original BY POSITION, so a different order here
  -- would put a translated to-do against the wrong person's name.
  select coalesce(jsonb_agg(jsonb_build_object('text', a.text, 'owner', a.owner_name, 'due', a.due_text)
                            order by a.start_ms nulls last, a.id), '[]'::jsonb)
  into items
  from public.action_items a
  where a.meeting_id = p_meeting_id;

  -- Everybody on the account, owner first. The email address comes from the login table, which
  -- only a function like this one may read. The app never sees another person's address except
  -- through the recap preview, and only for people on its own account.
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', am.user_id,
           'email', u.email,
           'name', coalesce(nullif(btrim(coalesce(pr.display_name, '')), ''), split_part(u.email, '@', 1)),
           'role', am.role,
           'language', coalesce(nullif(btrim(coalesce(pr.preferred_language, '')), ''), 'en'),
           'default_on', (am.role = 'owner' and send_owner) or (am.role = 'member' and send_members)
         ) order by (am.role = 'owner') desc, u.email), '[]'::jsonb)
  into people
  from public.account_members am
  join public.profiles pr on pr.id = am.user_id
  join auth.users u on u.id = am.user_id
  where am.account_id = note.account_id and u.email is not null;

  return query
  select note.account_id,
         the_owner_id,
         owner_label,
         note.title,
         note.created_at,
         the_summary.id,
         the_summary.language,
         the_summary.overview,
         coalesce(the_summary.key_points, '[]'::jsonb),
         coalesce(the_summary.decisions, '[]'::jsonb),
         coalesce(the_summary.open_questions, '[]'::jsonb),
         items,
         jsonb_build_object('to_owner', send_owner, 'to_members', send_members, 'auto_send', send_auto),
         people;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. log_email: write down one email we tried to send. SERVER ONLY.
-- ---------------------------------------------------------------------------
create function public.log_email(
  p_account_id uuid,
  p_meeting_id uuid,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_language text,
  p_translated boolean,
  p_result text,
  p_provider_id text,
  p_error_message text,
  p_sent_by uuid,
  p_auto boolean
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
  if p_recipient_email is null or btrim(p_recipient_email) = '' then
    raise exception 'bad_recipient' using errcode = 'P0001';
  end if;

  insert into public.email_log (
    account_id, meeting_id, kind, recipient_user_id, recipient_email, language,
    translated, result, provider_id, error_message, sent_by, auto
  )
  values (
    p_account_id, p_meeting_id, 'recap', p_recipient_user_id, btrim(p_recipient_email), p_language,
    coalesce(p_translated, false), p_result, p_provider_id, p_error_message, p_sent_by,
    coalesce(p_auto, false)
  )
  returning id into new_row;

  return new_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. get_recap_settings: for the app's settings screen. ANY MEMBER may read.
-- ---------------------------------------------------------------------------
-- The integrations table itself stays owner-only to read, because it may one day hold Slack and
-- Teams tokens. This door hands back ONLY the three recap switches, so a team member can see
-- what the account is set to without ever being able to read a token.
create function public.get_recap_settings()
returns table (account_id uuid, is_owner boolean, settings jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  my_role text;
  saved jsonb;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- The account this person belongs to. Owner first, the same order the app uses elsewhere.
  select am.account_id, am.role into my_account, my_role
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;

  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  select i.settings into saved
  from public.integrations i
  where i.account_id = my_account and i.kind = 'recap_email';

  return query
  select my_account,
         my_role = 'owner',
         jsonb_build_object(
           'to_owner', coalesce((saved ->> 'to_owner')::boolean, true),
           'to_members', coalesce((saved ->> 'to_members')::boolean, false),
           'auto_send', coalesce((saved ->> 'auto_send')::boolean, false)
         );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. save_recap_settings: ONLY THE ACCOUNT OWNER may change them.
-- ---------------------------------------------------------------------------
-- The table rules already refuse a member's write, but silently (no rows change). This door
-- says no out loud, so the screen can tell the person why nothing happened.
create function public.save_recap_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_account uuid;
  clean jsonb;
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

  -- Keep exactly the three switches. Anything else sent in is thrown away.
  clean := jsonb_build_object(
    'to_owner', coalesce((p_settings ->> 'to_owner')::boolean, true),
    'to_members', coalesce((p_settings ->> 'to_members')::boolean, false),
    'auto_send', coalesce((p_settings ->> 'auto_send')::boolean, false)
  );

  insert into public.integrations (account_id, kind, settings)
  values (my_account, 'recap_email', clean)
  on conflict (account_id, kind) do update set settings = excluded.settings;

  return clean;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Who may run what.
-- ---------------------------------------------------------------------------
-- The two that decide who gets emailed are the server's alone.
revoke execute on function public.claim_recap(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.log_email(uuid, uuid, uuid, text, text, boolean, text, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_recap(uuid, uuid, boolean) to service_role;
grant execute on function public.log_email(uuid, uuid, uuid, text, text, boolean, text, text, text, uuid, boolean) to service_role;

-- The two the settings screen needs are open to signed-in people. Each checks who is asking.
revoke execute on function public.get_recap_settings() from public, anon;
revoke execute on function public.save_recap_settings(jsonb) from public, anon;
grant execute on function public.get_recap_settings() to authenticated;
grant execute on function public.save_recap_settings(jsonb) to authenticated;
