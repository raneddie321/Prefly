-- Prefly database schema.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by everyone"
  on public.profiles for select using (true);
create policy "users update their own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "users insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Projects (games)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default 'Untitled game',
  description text not null default '',
  emoji text not null default '🎮',
  palette text[] not null default array['#6d5dfc', '#a78bfa'],
  mode text not null default 'auto' check (mode in ('auto', '2d', '3d')),
  multiplayer boolean not null default false,
  plan jsonb,
  html text,
  assets jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  published_at timestamptz,
  author_name text,
  play_count integer not null default 0,
  remixed_from uuid references public.projects on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);
create index if not exists projects_public_published_idx on public.projects (published_at desc) where is_public;
create index if not exists projects_public_plays_idx on public.projects (play_count desc) where is_public;

alter table public.projects enable row level security;

create policy "owners and the public can read projects"
  on public.projects for select using (auth.uid() = user_id or is_public);
create policy "users create their own projects"
  on public.projects for insert with check (auth.uid() = user_id);
create policy "owners update their projects"
  on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owners delete their projects"
  on public.projects for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch
  before update on public.projects
  for each row
  when (old.play_count is not distinct from new.play_count)
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Chat history and versions
-- ---------------------------------------------------------------------------
create table if not exists public.project_messages (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_messages_project_idx on public.project_messages (project_id, id);

create table if not exists public.project_versions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects on delete cascade,
  html text not null,
  assets jsonb not null default '{}'::jsonb,
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists project_versions_project_idx on public.project_versions (project_id, id desc);

alter table public.project_messages enable row level security;
alter table public.project_versions enable row level security;

create policy "owners read messages" on public.project_messages for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "owners write messages" on public.project_messages for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "owners read versions" on public.project_versions for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "owners write versions" on public.project_versions for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Play counter (anyone may bump the counter of a public game)
-- ---------------------------------------------------------------------------
create or replace function public.increment_play_count(p_project_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.projects set play_count = play_count + 1
  where id = p_project_id and is_public;
$$;
grant execute on function public.increment_play_count(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- AI usage quota. Every call to the generation API consumes one unit.
-- Edit the limits below to change how many generations a user gets per day.
-- ---------------------------------------------------------------------------
create table if not exists public.generation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists generation_events_user_idx on public.generation_events (user_id, created_at desc);
alter table public.generation_events enable row level security;
create policy "users read their usage" on public.generation_events for select using (auth.uid() = user_id);

create or replace function public.consume_generation(p_kind text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
  v_limit integer := case when v_anonymous then 20 else 200 end;
  v_used integer;
begin
  if v_user is null then
    return json_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  select count(*) into v_used from public.generation_events
    where user_id = v_user and created_at > now() - interval '24 hours';
  if v_used >= v_limit then
    return json_build_object('ok', false, 'reason', 'quota', 'limit', v_limit, 'anonymous', v_anonymous);
  end if;
  insert into public.generation_events (user_id, kind) values (v_user, p_kind);
  return json_build_object('ok', true, 'remaining', v_limit - v_used - 1);
end;
$$;
grant execute on function public.consume_generation(text) to authenticated;
