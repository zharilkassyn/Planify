-- Chess progress for the Games tab.
-- Apply with: npm run db:push

create table if not exists public.chess_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_game jsonb,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.chess_progress enable row level security;

create policy "read own chess progress"
  on public.chess_progress for select
  using (auth.uid() = user_id);

create policy "insert own chess progress"
  on public.chess_progress for insert
  with check (auth.uid() = user_id);

create policy "update own chess progress"
  on public.chess_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
