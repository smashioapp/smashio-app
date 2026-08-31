-- G5 (gtm-plan.md §3.2): session-less users can now browse Discover in the app before signing
-- up (join/host still wall to login). nearby_games can't be reused as-is: it's security invoker
-- reading games_public (grant select authenticated only) and joins profiles for organizer_*
-- fields, which is PII we don't show a stranger with no account (same rule game_preview already
-- follows for shared links, 20260820000100_game_preview_anon.sql). This is a parallel anon-only
-- RPC with the organizer/exact-address columns dropped, not a variant of nearby_games itself —
-- p_exclude_mine and the blocked_between check both depend on auth.uid(), which is null for
-- anon and meaningless without an account to exclude/block from.

create function public.nearby_games_public(
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
  p_amenity_slugs text[] default null
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_lat double precision,
  venue_lng double precision,
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
  courts_booked int,
  duration_hours int,
  reserved_spots int,
  reserved_claimed int,
  open_spots int,
  cover_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    gp.venue_lat,
    gp.venue_lng,
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
    gp.courts_booked,
    gp.duration_hours,
    gp.reserved_spots,
    gp.reserved_claimed,
    gp.open_spots,
    gp.cover_key
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  where s.slug = sport_slug
    and gp.status = 'published'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and (not has_spots_only or gp.open_spots > 0)
    and (not verified_only or gp.verification_status = 'verified')
    and (max_cost_per_player_cents is null or gp.cost_per_player_cents <= max_cost_per_player_cents)
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
    and (
      p_amenity_slugs is null or array_length(p_amenity_slugs, 1) is null or not exists (
        select 1 from unnest(p_amenity_slugs) as wanted(slug)
        where not exists (
          select 1 from public.venue_amenities va
          where va.venue_id = gp.venue_id and va.amenity_slug = wanted.slug and va.availability in ('yes', 'paid')
        )
      )
    )
  order by
    case when sort_by = 'soonest' then gp.starts_at end asc,
    case when sort_by = 'nearest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games_public(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, text[]) to anon, authenticated;
