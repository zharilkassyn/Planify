-- Добавляем поле completed к задачам
alter table public.entries add column if not exists completed boolean not null default false;

create policy "update own entries"
  on public.entries for update
  using (auth.uid() = user_id);

-- Привычки
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  created_at timestamptz not null default now()
);

alter table public.habits enable row level security;

create policy "read own habits"   on public.habits for select using (auth.uid() = user_id);
create policy "insert own habits" on public.habits for insert with check (auth.uid() = user_id);
create policy "delete own habits" on public.habits for delete using (auth.uid() = user_id);

-- Логи привычек (какие дни отмечены)
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique(habit_id, logged_date)
);

alter table public.habit_logs enable row level security;

create policy "read own logs"   on public.habit_logs for select using (auth.uid() = user_id);
create policy "insert own logs" on public.habit_logs for insert with check (auth.uid() = user_id);
create policy "delete own logs" on public.habit_logs for delete using (auth.uid() = user_id);

-- События в планировщике
create table if not exists public.planner_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text,
  hour int not null,
  end_hour int not null,
  color text not null default '#2563EB',
  event_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.planner_events enable row level security;

create policy "read own events"   on public.planner_events for select using (auth.uid() = user_id);
create policy "insert own events" on public.planner_events for insert with check (auth.uid() = user_id);
create policy "delete own events" on public.planner_events for delete using (auth.uid() = user_id);
