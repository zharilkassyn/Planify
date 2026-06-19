-- Sudoku progress for the Games tab.
-- Apply with: npm run db:push

create table if not exists public.sudoku_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_game jsonb,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sudoku_progress enable row level security;

create policy "read own sudoku progress"
  on public.sudoku_progress for select
  using (auth.uid() = user_id);

create policy "insert own sudoku progress"
  on public.sudoku_progress for insert
  with check (auth.uid() = user_id);

create policy "update own sudoku progress"
  on public.sudoku_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
