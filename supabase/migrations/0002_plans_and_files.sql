-- Multi-file projects and Free/Pro plans.

-- Source files of a game ({ "index.html": "...", "js/game.js": "..." }).
-- `html` keeps the compiled, playable single document.
alter table public.projects add column if not exists files jsonb;
alter table public.project_versions add column if not exists files jsonb;

-- ---------------------------------------------------------------------------
-- Plans. Rows are written only by the server (service role, e.g. the Stripe
-- webhook) or by an admin in the SQL editor; users can only read their own.
--   insert into public.user_plans (user_id, plan) values ('<uuid>', 'pro')
--   on conflict (user_id) do update set plan = 'pro';
-- ---------------------------------------------------------------------------
create table if not exists public.user_plans (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text,
  current_period_end timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.user_plans enable row level security;
drop policy if exists "users read their plan" on public.user_plans;
create policy "users read their plan" on public.user_plans for select using (auth.uid() = user_id);

create or replace function public.current_plan()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select plan from public.user_plans
      where user_id = auth.uid() and (current_period_end is null or current_period_end > now())),
    'free');
$$;
grant execute on function public.current_plan() to authenticated;

-- Daily AI generation limits per plan. Edit the numbers to change them.
create or replace function public.consume_generation(p_kind text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
  v_plan text := public.current_plan();
  v_limit integer;
  v_used integer;
begin
  if v_user is null then
    return json_build_object('ok', false, 'reason', 'unauthenticated');
  end if;
  v_limit := case when v_plan = 'pro' then 300 when v_anonymous then 5 else 25 end;
  select count(*) into v_used from public.generation_events
    where user_id = v_user and created_at > now() - interval '24 hours';
  if v_used >= v_limit then
    return json_build_object('ok', false, 'reason', 'quota', 'limit', v_limit, 'anonymous', v_anonymous, 'plan', v_plan);
  end if;
  insert into public.generation_events (user_id, kind) values (v_user, p_kind);
  return json_build_object('ok', true, 'remaining', v_limit - v_used - 1, 'limit', v_limit, 'plan', v_plan, 'anonymous', v_anonymous);
end;
$$;
grant execute on function public.consume_generation(text) to authenticated;

-- Remaining quota without consuming it (for the UI).
create or replace function public.generation_usage()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_anonymous boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
  v_plan text := public.current_plan();
  v_limit integer := case when v_plan = 'pro' then 300 when v_anonymous then 5 else 25 end;
  v_used integer;
begin
  select count(*) into v_used from public.generation_events
    where user_id = auth.uid() and created_at > now() - interval '24 hours';
  return json_build_object('plan', v_plan, 'limit', v_limit, 'used', v_used, 'anonymous', v_anonymous);
end;
$$;
grant execute on function public.generation_usage() to authenticated;
