-- Slice 2: venues. Seeded manually for MVP — Places/partner sourcing is an open question (mvp-spec.md).
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  suburb text not null,
  state text not null,
  address text,
  location extensions.geography(Point, 4326) not null,
  google_place_id text,
  source text not null default 'user' check (source in ('user', 'places', 'partner')),
  created_at timestamptz not null default now()
);

create index venues_location_idx on public.venues using gist (location);

alter table public.venues enable row level security;

-- Discover needs venue names/locations; no client writes yet — seed/admin only until slice 3's wizard adds venues.
create policy "venues readable by authenticated" on public.venues
  for select to authenticated using (true);

grant select on public.venues to authenticated;
