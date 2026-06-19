-- Add completed column to entries and update RLS policy

alter table public.entries
  add column if not exists completed boolean not null default false;

drop policy if exists "update own entries" on public.entries;

create policy "update own entries"
  on public.entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
