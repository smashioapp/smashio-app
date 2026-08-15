-- A1 (venues-plan.md): curated facility directory schema. Nothing here modifies venues.name/
-- suburb/state/address/location/google_place_id — those stay Places-owned and get overwritten on
-- every upsert_places_venue conflict (places_venues.sql). Curated data lives in sibling tables
-- keyed on venue_id so a host re-searching a venue never clobbers our facility data.

alter table public.venues
  add column slug text unique,
  add column region text;

-- 1:1 curated detail. bookability defaults to 'unknown', not 'public' — school/community halls
-- from the club-directory axis (SWEEP-FINDINGS.md) are club-hired, and defaulting open would send
-- users to a locked door.
create table public.venue_profiles (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  courts_badminton int,
  courts_total int,
  dedicated boolean not null default false,
  surface text check (surface in ('mat', 'synthetic', 'timber', 'other')),
  bookability text not null default 'unknown' check (bookability in ('public', 'club_only', 'members_only', 'unknown')),
  club_contact text,
  booking_platform text,
  booking_url text,
  website_url text,
  phone text,
  opening_hours jsonb,
  access_notes text,
  summary text,
  data_source text not null check (data_source in ('csv', 'operator', 'partner', 'user', 'places')),
  source_url text,
  confidence text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.amenity_types (
  slug text primary key,
  label text not null,
  icon text not null,
  ordinal int not null,
  category text not null check (category in ('essentials', 'gear', 'comfort', 'access'))
);

create table public.venue_amenities (
  venue_id uuid references public.venues(id) on delete cascade,
  amenity_slug text references public.amenity_types(slug),
  availability text not null check (availability in ('yes', 'no', 'paid', 'nearby', 'unknown')),
  note text,
  primary key (venue_id, amenity_slug)
);

create table public.venue_pricing_bands (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  label text not null,
  days smallint[] not null,
  starts_time time,
  ends_time time,
  cents int not null,
  unit text not null check (unit in ('court_hour', 'person_hour', 'person_session')),
  notes text
);

create index venue_pricing_bands_venue_id_idx on public.venue_pricing_bands (venue_id);

-- Seed amenity set (venues-plan.md §4.3). Ordinal groups by category for the app's amenity grid.
insert into public.amenity_types (slug, label, icon, ordinal, category) values
  ('toilets', 'Toilets', 'body', 1, 'essentials'),
  ('parking', 'Parking', 'car', 2, 'essentials'),
  ('drinking_water', 'Drinking water', 'water', 3, 'essentials'),
  ('change_rooms', 'Change rooms', 'shirt', 4, 'essentials'),
  ('showers', 'Showers', 'shower', 5, 'essentials'),
  ('lockers', 'Lockers', 'lock-closed', 6, 'essentials'),
  ('racquet_hire', 'Racquet hire', 'tennisball', 7, 'gear'),
  ('shuttle_hire', 'Shuttle hire', 'disc', 8, 'gear'),
  ('racquet_retail', 'Racquet retail', 'storefront', 9, 'gear'),
  ('shuttle_retail', 'Shuttle retail', 'storefront', 10, 'gear'),
  ('stringing', 'Stringing', 'construct', 11, 'gear'),
  ('pro_shop', 'Pro shop', 'storefront', 12, 'gear'),
  ('air_conditioning', 'Air conditioning', 'snow', 13, 'comfort'),
  ('spectator_seating', 'Spectator seating', 'people', 14, 'comfort'),
  ('cafe', 'Cafe', 'cafe', 15, 'comfort'),
  ('vending', 'Vending machines', 'fast-food', 16, 'comfort'),
  ('wifi', 'Wi-Fi', 'wifi', 17, 'comfort'),
  ('step_free_access', 'Step-free access', 'accessibility', 18, 'access'),
  ('accessible_toilet', 'Accessible toilet', 'accessibility', 19, 'access'),
  ('public_transport_nearby', 'Public transport nearby', 'bus', 20, 'access'),
  ('after_hours_access', 'After-hours access', 'time', 21, 'access'),
  ('coaching', 'Coaching available', 'school', 22, 'access'),
  ('casual_social_sessions', 'Casual social sessions', 'people-circle', 23, 'access');

-- RLS per venues-plan.md §4.6: all four tables are read-only to clients. Curation is
-- seed/admin (service role) only, which bypasses RLS the same way venues/sports/skill_tiers do.
alter table public.venue_profiles enable row level security;
alter table public.amenity_types enable row level security;
alter table public.venue_amenities enable row level security;
alter table public.venue_pricing_bands enable row level security;

create policy "venue_profiles readable by authenticated" on public.venue_profiles for select to authenticated using (true);
create policy "amenity_types readable by authenticated" on public.amenity_types for select to authenticated using (true);
create policy "venue_amenities readable by authenticated" on public.venue_amenities for select to authenticated using (true);
create policy "venue_pricing_bands readable by authenticated" on public.venue_pricing_bands for select to authenticated using (true);

grant select on public.venue_profiles to authenticated;
grant select on public.amenity_types to authenticated;
grant select on public.venue_amenities to authenticated;
grant select on public.venue_pricing_bands to authenticated;
