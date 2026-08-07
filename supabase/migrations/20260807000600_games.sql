-- Slice 2: games. Client insert/update policies are written now even though the create
-- wizard (slice 3) is what will first exercise them.
create table public.games (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id),
  venue_id uuid not null references public.venues(id),
  organizer_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  court_label text,
  skill_tier_id uuid not null references public.skill_tiers(id),
  max_players int not null check (max_players > 0),
  cost_total_cents int not null default 0 check (cost_total_cents >= 0),
  status text not null default 'published' check (status in ('published', 'cancelled', 'completed')),
  verification_status text not null default 'none' check (verification_status in ('none', 'pending', 'verified')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index games_starts_at_idx on public.games (starts_at);
create index games_venue_id_idx on public.games (venue_id);

alter table public.games enable row level security;

-- Discover is public within the app: any signed-in user can browse.
create policy "games readable by authenticated" on public.games
  for select to authenticated using (true);

create policy "games insert own" on public.games
  for insert to authenticated with check (organizer_id = auth.uid());

-- No client-side transition to 'completed' — that's the hourly cron's job (slice 6).
create policy "games update own" on public.games
  for update to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid() and status <> 'completed');

grant select, insert, update on public.games to authenticated;
