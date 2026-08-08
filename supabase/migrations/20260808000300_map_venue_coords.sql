-- Slice 7: map needs venue coordinates + address for pins and the Directions deep-link.
create or replace view public.games_public
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
  g.cost_total_cents,
  g.status,
  g.verification_status,
  g.created_at,
  public.approved_player_count(g.id) as approved_count,
  -- Appended, not inserted inline: CREATE OR REPLACE VIEW only allows new columns at the end.
  v.address as venue_address,
  extensions.ST_Y(v.location::extensions.geometry) as venue_lat,
  extensions.ST_X(v.location::extensions.geometry) as venue_lng
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id;

grant select on public.games_public to authenticated;

drop function if exists public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[]);

create function public.nearby_games(
  lat double precision,
  lng double precision,
  radius_m double precision,
  sport_slug text,
  from_ts timestamptz default now(),
  to_ts timestamptz default null,
  tier_slugs text[] default null
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
  max_players int,
  cost_total_cents int,
  status text,
  verification_status text,
  approved_count int,
  distance_m double precision
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
    gp.max_players,
    gp.cost_total_cents,
    gp.status,
    gp.verification_status,
    gp.approved_count,
    extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) as distance_m
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  where s.slug = sport_slug
    and gp.status = 'published'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
  order by gp.starts_at asc;
$$;

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[]) to authenticated;
