-- 2048 progress for the Games tab.
-- Apply with: npm run db:push

create table if not exists public.game_2048_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_game jsonb,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_2048_progress enable row level security;

create policy "read own 2048 progress"
  on public.game_2048_progress for select
  using (auth.uid() = user_id);

create policy "insert own 2048 progress"
  on public.game_2048_progress for insert
  with check (auth.uid() = user_id);

create policy "update own 2048 progress"
  on public.game_2048_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
