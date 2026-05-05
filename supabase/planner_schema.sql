create table if not exists public.planner_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  planner_state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.planner_states enable row level security;

create policy "planner_states_select_own"
on public.planner_states
for select
using ((select auth.uid()) = user_id);

create policy "planner_states_insert_own"
on public.planner_states
for insert
with check ((select auth.uid()) = user_id);

create policy "planner_states_update_own"
on public.planner_states
for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
