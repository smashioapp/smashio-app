-- Short-a-player UX plan U2 (docs/short-a-player-ux-plan.md §4.1): finding a game from a venue.
--
--   1. venues_directory gains p_lat/p_lng. With both set it orders by distance and returns
--      distance_m; without them it keeps the old order by name. It also returns
--      upcoming_game_count (listed games only), so the directory, the wizard's venue picker and
--      the one search can say "3 games this week" without a second round trip. F3.
--   2. venue_upcoming_games(p_venue_id) — the venue page's "Play here" list (F1). Same row shape
--      as nearby_games so GameCard renders it unchanged, same listing rules: published, public
--      visibility (website-plan §5.2), not started, blocks honoured both ways.
--
-- Both are security invoker and authenticated-only, like every app RPC they sit beside. Guests
-- browsing without a session (G5) get a venue's games by filtering nearby_games_public
-- client-side, which is already anon-safe, so this adds no anonymous surface (website-plan §5).
--
-- Grants: venues_directory's signature changes, so it is dropped and recreated, which resets it
-- to the post-20260914000400 default (callable by no one). Both functions are granted
-- explicitly, with the revoke-from-public pattern kept anyway.

drop function if exists public.venues_directory(text, text, int, boolean, boolean, text[], int, int);

create function public.venues_directory(
  p_state text default null,
  p_search text default null,
  p_min_courts int default null,
  p_dedicated boolean default null,
  p_bookable_now boolean default null,
  p_amenity_slugs text[] default null,
  p_limit int default 50,
  p_offset int default 0,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  id uuid,
  name text,
  suburb text,
  state text,
  lat double precision,
  lng double precision,
  courts_badminton int,
  dedicated boolean,
  surface text,
  bookability text,
  confidence text,
  verified_at timestamptz,
  has_profile boolean,
  photo_path text,
  cheapest_cents int,
  cheapest_unit text,
  distance_m double precision,
  upcoming_game_count int,
  total_count bigint
)
language sql
stable
security invoker
as $$
  with base as (
    select
      v.id,
      v.name,
      v.suburb,
      v.state,
      extensions.ST_Y(v.location::extensions.geometry) as lat,
      extensions.ST_X(v.location::extensions.geometry) as lng,
      vp.courts_badminton,
      vp.dedicated,
      vp.surface,
      coalesce(vp.bookability, 'unknown') as bookability,
      coalesce(vp.confidence, 'low') as confidence,
      vp.verified_at,
      (vp.venue_id is not null) as has_profile,
      (
        select ph.storage_path from public.venue_photos ph
        where ph.venue_id = v.id and ph.status = 'approved'
        order by ph.ordinal limit 1
      ) as photo_path,
      (
        select pb.cents from public.venue_pricing_bands pb
        where pb.venue_id = v.id
        order by pb.cents asc limit 1
      ) as cheapest_cents,
      (
        select pb.unit from public.venue_pricing_bands pb
        where pb.venue_id = v.id
        order by pb.cents asc limit 1
      ) as cheapest_unit,
      case
        when p_lat is not null and p_lng is not null
          then extensions.ST_Distance(v.location, extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography)
      end as distance_m,
      (
        select count(*) from public.games g
        where g.venue_id = v.id
          and g.status = 'published'
          and g.visibility = 'public'
          and g.starts_at >= now()
      )::int as upcoming_game_count
    from public.venues v
    left join public.venue_profiles vp on vp.venue_id = v.id
    where (p_state is null or v.state = p_state)
      and (p_search is null or v.name ilike '%' || p_search || '%' or v.suburb ilike '%' || p_search || '%')
      and (p_min_courts is null or vp.courts_badminton >= p_min_courts)
      and (p_dedicated is null or vp.dedicated = p_dedicated)
      and (p_bookable_now is null or (p_bookable_now and vp.bookability = 'public'))
      and (
        p_amenity_slugs is null or array_length(p_amenity_slugs, 1) is null or not exists (
          select 1 from unnest(p_amenity_slugs) as wanted(slug)
          where not exists (
            select 1 from public.venue_amenities va
            where va.venue_id = v.id and va.amenity_slug = wanted.slug and va.availability in ('yes', 'paid')
          )
        )
      )
  )
  select base.*, count(*) over ()::bigint as total_count
  from base
  order by base.distance_m asc nulls last, base.name asc
  limit p_limit offset p_offset;
$$;

revoke execute on function public.venues_directory(text, text, int, boolean, boolean, text[], int, int, double precision, double precision) from public;
grant execute on function public.venues_directory(text, text, int, boolean, boolean, text[], int, int, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. venue_upcoming_games — nearby_games' projection for one venue. distance_m is null (the
-- caller already knows where the venue is), and the viewer's own games are included: a host
-- opening their venue page should see their game listed there too.
-- ---------------------------------------------------------------------------------------------

create function public.venue_upcoming_games(p_venue_id uuid, p_limit int default 20)
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
  duration_minutes int,
  reserved_spots int,
  reserved_claimed int,
  open_spots int,
  organizer_avatar_key text,
  cover_key text,
  skill_tier_max_label text,
  format_label text,
  notes text
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
    null::double precision as distance_m,
    p.display_name as organizer_display_name,
    p.photo_path as organizer_photo_path,
    p.reliability_score as organizer_reliability_score,
    (select count(*) from public.games hg where hg.organizer_id = gp.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
    gp.courts_booked,
    gp.duration_minutes,
    gp.reserved_spots,
    gp.reserved_claimed,
    gp.open_spots,
    p.avatar_key as organizer_avatar_key,
    gp.cover_key,
    gp.skill_tier_max_label,
    gp.format_label,
    gp.notes
  from public.games_public gp
  join public.profiles p on p.id = gp.organizer_id
  where gp.venue_id = p_venue_id
    and gp.status = 'published'
    and gp.visibility = 'public'
    and gp.starts_at >= now()
    and not public.blocked_between(auth.uid(), gp.organizer_id)
  order by gp.starts_at asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke execute on function public.venue_upcoming_games(uuid, int) from public;
grant execute on function public.venue_upcoming_games(uuid, int) to authenticated;
