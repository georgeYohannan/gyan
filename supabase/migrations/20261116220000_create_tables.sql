-- Gyan tables (from docs/data-model.md). This file only ADDS things. It deletes nothing.
-- The "chunks" table is left for later: it needs a vector size, which depends on the
-- embedding model, and that model is not chosen yet.

-- One row per person. The id is the same as the login id.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  preferred_language text not null default 'en',
  is_admin boolean not null default false
);

-- Limits for each plan. Prices live in RevenueCat and the stores.
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  meetings_per_month integer not null check (meetings_per_month >= 0),
  seats_included integer not null default 1 check (seats_included >= 1),
  max_meeting_minutes integer check (max_meeting_minutes is null or max_meeting_minutes > 0),
  is_active boolean not null default true
);

-- A workspace. It owns notes and seats.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  created_at timestamptz not null default now()
);

-- Who belongs to which account.
create table public.account_members (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  primary key (account_id, user_id)
);

-- Pending seat invites.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  email text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz not null default now()
);

-- Meetings used each month. "month" is the first day of that month.
create table public.usage (
  account_id uuid not null references public.accounts (id) on delete cascade,
  month date not null,
  meetings_used integer not null default 0 check (meetings_used >= 0),
  primary key (account_id, month)
);

-- The notes. 1 meeting = 1 note.
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text,
  source text not null check (source in ('upload', 'phone', 'bot', 'text')),
  status text not null default 'uploading'
    check (status in ('uploading', 'queued', 'transcribing', 'summarizing', 'ready', 'failed')),
  spoken_language text,
  duration_seconds integer,
  file_path text,
  error_message text,
  created_at timestamptz not null default now()
);

-- Transcript lines.
create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  speaker_label text,
  start_ms integer not null,
  end_ms integer not null,
  text text not null
);

-- Overview and key points.
create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  language text not null,
  overview text,
  key_points jsonb,
  decisions jsonb,
  open_questions jsonb
);

-- To-dos.
create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  text text not null,
  owner_name text,
  due_text text,
  start_ms integer,
  done boolean not null default false
);

-- Topic tree.
create table public.mind_maps (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  language text not null,
  tree jsonb not null
);

-- Saved translations. One per note, kind, source, and language.
create table public.translations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  kind text not null check (kind in ('transcript', 'summary', 'action_items', 'chat_message')),
  source_id uuid not null,
  language text not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (kind, source_id, language)
);

-- Side chat conversations. An empty meeting_id means "all notes".
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Messages in a thread.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  language text,
  sources jsonb,
  created_at timestamptz not null default now()
);

-- Slack, Teams, and email settings. Any token kept here must be encrypted.
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null,
  settings jsonb,
  created_at timestamptz not null default now()
);

-- Cost tracking for the admin page.
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete set null,
  kind text not null,
  provider text not null,
  units numeric,
  cost numeric,
  created_at timestamptz not null default now()
);

-- Indexes on the columns the rules and the app look up most.
create index accounts_owner_id_idx on public.accounts (owner_id);
create index account_members_user_id_idx on public.account_members (user_id);
create index invites_account_id_idx on public.invites (account_id);
create index meetings_account_id_created_at_idx on public.meetings (account_id, created_at desc);
create index transcript_segments_meeting_id_idx on public.transcript_segments (meeting_id, start_ms);
create index summaries_meeting_id_idx on public.summaries (meeting_id);
create index action_items_meeting_id_idx on public.action_items (meeting_id);
create index mind_maps_meeting_id_idx on public.mind_maps (meeting_id);
create index translations_meeting_id_idx on public.translations (meeting_id);
create index chat_threads_account_id_idx on public.chat_threads (account_id);
create index chat_threads_user_id_idx on public.chat_threads (user_id);
create index chat_messages_thread_id_idx on public.chat_messages (thread_id);
create index integrations_account_id_idx on public.integrations (account_id);
create index ai_usage_account_id_idx on public.ai_usage (account_id);
