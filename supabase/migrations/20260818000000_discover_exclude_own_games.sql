-- nearby_games showed a caller's own hosted/joined games in Discover — host sees their own
-- game, approved player sees a game they're already in. Neither belongs there; My Games
-- already covers both. security invoker means auth.uid() here is the actual caller.
--
-- p_exclude_mine defaults true for Discover. The week-pulse strip ("18 games this week") is
-- deliberately a scene-wide stat, not filtered by the viewer's own choices — it passes false
-- so hosting/joining a game doesn't shrink the number.
--
-- New param widens the signature vs 20260814000000's version, so this is a fresh overload,
-- not a replace — drop the old 11-arg version first or both stick around and PostgREST can't
-- pick one.
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
    case when sort_by = 'most_spots' then gp.max_players - gp.approved_count end desc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean) to authenticated;
