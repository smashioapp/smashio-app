-- Slice 1: a user has one skill tier per sport.
create table public.profile_sports (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete cascade,
  skill_tier_id uuid not null references public.skill_tiers(id),
  primary key (profile_id, sport_id)
);

alter table public.profile_sports enable row level security;

create policy "profile_sports readable by authenticated" on public.profile_sports
  for select to authenticated using (true);

create policy "profile_sports insert own row" on public.profile_sports
  for insert to authenticated with check (auth.uid() = profile_id);

create policy "profile_sports update own row" on public.profile_sports
  for update to authenticated using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

grant select, insert, update on public.profile_sports to authenticated;
