create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#2563EB',
  created_at timestamptz not null default now()
);
alter table public.flashcard_decks enable row level security;
create policy "own decks" on public.flashcard_decks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
alter table public.flashcards enable row level security;
create policy "own cards" on public.flashcards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.flashcards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rating int not null,
  reviewed_at timestamptz not null default now()
);
alter table public.flashcard_reviews enable row level security;
create policy "own reviews" on public.flashcard_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
