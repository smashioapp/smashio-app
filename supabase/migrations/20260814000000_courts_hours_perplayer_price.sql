-- Host controls (2026-08-14): number of courts booked, booking duration in hours, and a
-- directly host-set per-player price. The old cost_total_cents/max_players even-split baked in
-- an assumption ("$40 court, split 8 ways") that breaks the moment a host only has a couple of
-- spare slots to sell at a price of their choosing.
alter table public.games
  rename column cost_total_cents to cost_per_player_cents;

alter table public.games
  add column courts_booked int not null default 1,
  add column duration_hours int not null default 2;

alter table public.games
  add constraint games_courts_booked_check check (courts_booked > 0),
  add constraint games_duration_hours_check check (duration_hours > 0 and duration_hours <= 12);

-- Min join threshold 4 -> 2, and the previously-uncapped stepper now caps at 16.
alter table public.games
  drop constraint games_max_players_check,
  add constraint games_max_players_check check (max_players >= 2 and max_players <= 16);

-- Per-player price is host-set directly (not booking cost / players); capped at $20/hour/player.
alter table public.games
  drop constraint games_cost_total_cents_check,
  add constraint games_cost_per_player_cents_check check (cost_per_player_cents >= 0 and cost_per_player_cents <= duration_hours * 2000);

-- View + RPC both baked in the old total-cost columns; recreate with the renamed/new columns.
-- CREATE OR REPLACE can't rename an existing output column (the position held
-- "cost_total_cents" before the ALTER above), so this drops and recreates instead of the usual
-- "CREATE OR REPLACE VIEW only appends" convention — no other view depends on games_public, only
-- SQL-language functions (nearby_games and friends), which aren't hard-dependency-tracked and
-- get dropped/recreated further down this same file anyway.
drop view if exists public.games_public;

create view public.games_public
with (security_invoker = true) as
select
  g.id,
  g.sport_id,
  g.venue_id,
  v.name as venue_name,
  v.suburb as venue_suburb,
  v.location as venue_location,
  g.organizer_id,
  g.starts_at,
  g.ends_at,
  g.court_label,
  g.skill_tier_id,
  st.slug as skill_tier_slug,
  st.label as skill_tier_label,
  g.max_players,
  g.cost_per_player_cents,
  g.status,
  g.verification_status,
  g.created_at,
  public.approved_player_count(g.id) as approved_count,
  v.address as venue_address,
  extensions.ST_Y(v.location::extensions.geometry) as venue_lat,
  extensions.ST_X(v.location::extensions.geometry) as venue_lng,
  st.ordinal as skill_tier_ordinal,
  p.display_name as organizer_display_name,
  p.photo_path as organizer_photo_path,
  p.reliability_score as organizer_reliability_score,
  (select count(*) from public.games hg where hg.organizer_id = g.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
  g.courts_booked,
  g.duration_hours
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id
join public.profiles p on p.id = g.organizer_id;

grant select on public.games_public to authenticated;

drop function if exists public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text);

create function public.nearby_games(
  lat double precision,
  lng double precision,
  radius_m double precision,
  sport_slug text,
  from_ts timestamptz default now(),
  to_ts timestamptz default null,
  tier_slugs text[] default null,
  has_spots_only boolean default false,
  verified_only boolean default false,
  max_cost_per_player_cents int default null,
  sort_by text default 'soonest'
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_address text,
  venue_lat double precision,
  venue_lng double precision,
  organizer_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  court_label text,
  skill_tier_slug text,
  skill_tier_label text,
  skill_tier_ordinal int,
  max_players int,
  cost_per_player_cents int,
  status text,
  verification_status text,
  approved_count int,
  distance_m double precision,
  organizer_display_name text,
  organizer_photo_path text,
  organizer_reliability_score numeric,
  organizer_hosted_count int,
  courts_booked int,
  duration_hours int
)
language sql
stable
security invoker
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    gp.venue_address,
    gp.venue_lat,
    gp.venue_lng,
    gp.organizer_id,
    gp.starts_at,
    gp.ends_at,
    gp.court_label,
    gp.skill_tier_slug,
    gp.skill_tier_label,
    gp.skill_tier_ordinal,
    gp.max_players,
    gp.cost_per_player_cents,
    gp.status,
    gp.verification_status,
    gp.approved_count,
    extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) as distance_m,
    p.display_name as organizer_display_name,
    p.photo_path as organizer_photo_path,
    p.reliability_score as organizer_reliability_score,
    (select count(*) from public.games hg where hg.organizer_id = gp.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
    gp.courts_booked,
    gp.duration_hours
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  join public.profiles p on p.id = gp.organizer_id
  where s.slug = sport_slug
    and gp.status = 'published'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and (not has_spots_only or gp.approved_count < gp.max_players)
    and (not verified_only or gp.verification_status = 'verified')
    and (max_cost_per_player_cents is null or gp.cost_per_player_cents <= max_cost_per_player_cents)
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
  -- Only the selected sort's case branch produces a non-null value, so it's the only one that
  -- actually orders the rows; starts_at is both the 'soonest' sort and the tie-breaker for the rest.
  order by
    case when sort_by = 'closest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc nulls last,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    case when sort_by = 'most_spots' then gp.max_players - gp.approved_count end desc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text) to authenticated;
