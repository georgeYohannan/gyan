-- One sentence, corrected.
--
-- The account deletion panel said "This cannot be undone and gyan keeps no copy." and then,
-- right underneath, listed what gyan keeps: the record of what happened, a line per email
-- sent, and what each AI call cost. Both were on the screen at once.
--
-- The list is the honest part and it stays. The sentence was the problem: somebody told
-- "gyan keeps no copy" who later finds a row with their account id on it has been misled,
-- and that is worse than saying plainly now what is kept and why.
--
-- Nothing about what is actually deleted changes. Only the words.

create or replace function public.can_delete_account()
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
begin
  if me is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select am.account_id, am.role into my_account, my_role
  from public.account_members am
  where am.user_id = me
  order by (am.role = 'owner') desc
  limit 1;

  if my_account is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  select count(*) into notes from public.meetings m where m.account_id = my_account;
  select count(*) - 1 into others from public.account_members am where am.account_id = my_account;
  select count(*) into waiting
  from public.invites i where i.account_id = my_account and i.status = 'pending';

  if my_role <> 'owner' then
    return query select my_account, false, false,
      'Only the person who owns this workspace can delete it. You can leave it instead: ask them to remove you.',
      null::text, notes, others, waiting;
    return;
  end if;

  if others > 0 then
    return query select my_account, true, false,
      'There ' || case when others = 1 then 'is 1 other person' else 'are ' || others || ' other people' end
      || ' on this account. Remove them on the Team screen first.',
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
    'Everything you made goes: your login, your name, '
    || case when notes = 1 then 'your 1 note' else 'all ' || notes || ' of your notes' end
    || ', their transcripts, summaries, to-dos, chats, and the files you uploaded. '
    -- No longer "gyan keeps no copy", because that was not true. A few records stay, and
    -- the screen lists them underneath with the reason for each. None holds a word anybody
    -- said in a meeting.
    || 'This cannot be undone.',
    notes, others, waiting;
end;
$$;

revoke execute on function public.can_delete_account() from public, anon;
grant execute on function public.can_delete_account() to authenticated;
