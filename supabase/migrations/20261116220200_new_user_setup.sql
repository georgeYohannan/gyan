-- When a new person signs up, set them up automatically:
-- 1. a profile, 2. an account on the Free plan, 3. a row that makes them the owner.
-- All 3 happen together. If any fails, the sign up fails and nothing is half made.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  free_plan_id uuid;
  new_account_id uuid;
begin
  select id into free_plan_id
  from public.plans
  where name = 'Free' and is_active
  limit 1;

  if free_plan_id is null then
    raise exception 'The Free plan is missing from the plans table';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''));

  insert into public.accounts (owner_id, plan_id)
  values (new.id, free_plan_id)
  returning id into new_account_id;

  insert into public.account_members (account_id, user_id, role)
  values (new_account_id, new.id, 'owner');

  return new;
end;
$$;

-- Only the database itself may run this. The app cannot call it.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
