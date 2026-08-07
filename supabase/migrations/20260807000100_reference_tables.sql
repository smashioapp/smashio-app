-- Slice 1: reference data. Sport stays data, not code (AGENTS.md rule).
create table public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_active boolean not null default true
);

create table public.skill_tiers (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete cascade,
  slug text not null,
  label text not null,
  ordinal int not null,
  unique (sport_id, slug)
);

alter table public.sports enable row level security;
alter table public.skill_tiers enable row level security;

-- Reference data: readable by anyone, including pre-auth (onboarding needs it), no writes from clients.
create policy "sports readable by all" on public.sports for select using (true);
create policy "skill_tiers readable by all" on public.skill_tiers for select using (true);

grant select on public.sports to anon, authenticated;
grant select on public.skill_tiers to anon, authenticated;
