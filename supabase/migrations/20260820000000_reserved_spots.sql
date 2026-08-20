-- Reserved spots: host takes N slots off max_players for people joining outside the app (own
-- friends, teammates) without naming anyone — just a count. Distinct from approved_count
-- (in-app joins); "spots left" everywhere is max_players - approved_count - reserved_spots.
alter table public.games
  add column reserved_spots int not null default 0;

alter table public.games
  add constraint games_reserved_spots_check check (reserved_spots >= 0 and reserved_spots <= max_players);

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
  g.duration_hours,
  g.reserved_spots
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id
join public.profiles p on p.id = g.organizer_id;

grant select on public.games_public to authenticated;

-- New param widens the signature vs 20260818000000's version, same reasoning as that migration:
-- a fresh overload, drop the old one first so PostgREST can pick a single candidate.
drop function if exists public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean);

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
  sort_by text default 'soonest',
  p_exclude_mine boolean default true
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
  duration_hours int,
  reserved_spots int
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
    gp.duration_hours,
    gp.reserved_spots
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  join public.profiles p on p.id = gp.organizer_id
  where s.slug = sport_slug
    and gp.status = 'published'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and (not has_spots_only or gp.approved_count + gp.reserved_spots < gp.max_players)
    and (not verified_only or gp.verification_status = 'verified')
    and (max_cost_per_player_cents is null or gp.cost_per_player_cents <= max_cost_per_player_cents)
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
    and (
      not p_exclude_mine
      or (
        gp.organizer_id <> auth.uid()
        and not exists (
          select 1 from public.game_players mygp
          where mygp.game_id = gp.id and mygp.profile_id = auth.uid() and mygp.status = 'approved'
        )
      )
    )
  order by
    case when sort_by = 'closest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc nulls last,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    case when sort_by = 'most_spots' then gp.max_players - gp.approved_count - gp.reserved_spots end desc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean) to authenticated;
