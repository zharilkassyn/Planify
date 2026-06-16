create table if not exists public.note_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#2563EB',
  created_at timestamptz not null default now()
);
alter table public.note_folders enable row level security;
create policy "own folders" on public.note_folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Без названия',
  content text not null default '',
  folder_id uuid references public.note_folders(id) on delete set null,
  tags text[] not null default '{}',
  is_starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notes enable row level security;
create policy "own notes" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
