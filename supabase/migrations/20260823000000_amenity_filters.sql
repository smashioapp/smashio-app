-- Amenity filters (item 1, 2026-08-23): "Court amenities" section under Discover's Filters
-- sheet and the venue directory. venues_directory already took a single p_amenity_slug —
-- widened to an array (AND match, must have every selected amenity) so multi-select works the
-- same way tier_slugs already does. nearby_games gains the same array param, joined through
-- games_public.venue_id, so Discover's game list can filter by the amenities of each game's venue.

drop function if exists public.venues_directory(text, text, int, boolean, boolean, text, int, int);

create function public.venues_directory(
  p_state text default null,
  p_search text default null,
  p_min_courts int default null,
  p_dedicated boolean default null,
  p_bookable_now boolean default null,
  p_amenity_slugs text[] default null,
  p_limit int default 50,
  p_offset int default 0
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
      ) as cheapest_unit
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
  order by base.name
  limit p_limit offset p_offset;
$$;

grant execute on function public.venues_directory(text, text, int, boolean, boolean, text[], int, int) to authenticated;

-- nearby_games: add the same array amenity filter, joined on games_public.venue_id.
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
  p_exclude_mine boolean default true,
  p_amenity_slugs text[] default null
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
    and not public.blocked_between(auth.uid(), gp.organizer_id)
    and (
      p_amenity_slugs is null or array_length(p_amenity_slugs, 1) is null or not exists (
        select 1 from unnest(p_amenity_slugs) as wanted(slug)
        where not exists (
          select 1 from public.venue_amenities va
          where va.venue_id = gp.venue_id and va.amenity_slug = wanted.slug and va.availability in ('yes', 'paid')
        )
      )
    )
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

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean, text[]) to authenticated;

-- venue_detail: add google_place_id so the venue screen's "Book" action can fall back to a
-- Google Maps place link when a venue has neither booking_url nor website_url (item 2, 2026-08-23).
create or replace function public.venue_detail(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'id', v.id,
    'name', v.name,
    'suburb', v.suburb,
    'state', v.state,
    'address', v.address,
    'lat', extensions.ST_Y(v.location::extensions.geometry),
    'lng', extensions.ST_X(v.location::extensions.geometry),
    'region', v.region,
    'slug', v.slug,
    'google_place_id', v.google_place_id,
    'profile', (
      select jsonb_build_object(
        'courts_badminton', vp.courts_badminton,
        'courts_total', vp.courts_total,
        'dedicated', vp.dedicated,
        'surface', vp.surface,
        'bookability', vp.bookability,
        'club_contact', vp.club_contact,
        'booking_platform', vp.booking_platform,
        'booking_url', vp.booking_url,
        'website_url', vp.website_url,
        'phone', vp.phone,
        'opening_hours', vp.opening_hours,
        'access_notes', vp.access_notes,
        'summary', vp.summary,
        'confidence', vp.confidence,
        'verified_at', vp.verified_at
      )
      from public.venue_profiles vp
      where vp.venue_id = v.id
    ),
    'amenities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', at.slug,
        'label', at.label,
        'icon', at.icon,
        'category', at.category,
        'availability', va.availability,
        'note', va.note
      ) order by at.category, at.ordinal), '[]'::jsonb)
      from public.venue_amenities va
      join public.amenity_types at on at.slug = va.amenity_slug
      where va.venue_id = v.id
    ),
    'pricing_bands', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pb.id,
        'label', pb.label,
        'days', pb.days,
        'starts_time', pb.starts_time,
        'ends_time', pb.ends_time,
        'cents', pb.cents,
        'unit', pb.unit,
        'notes', pb.notes
      ) order by pb.label), '[]'::jsonb)
      from public.venue_pricing_bands pb
      where pb.venue_id = v.id
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'storage_path', ph.storage_path,
        'credit', ph.credit
      ) order by ph.ordinal), '[]'::jsonb)
      from public.venue_photos ph
      where ph.venue_id = v.id and ph.status = 'approved'
    ),
    'upcoming_game_count', (
      select count(*)::int from public.games g
      where g.venue_id = v.id and g.status = 'published' and g.starts_at >= now()
    ),
    'next_game_at', (
      select min(g.starts_at) from public.games g
      where g.venue_id = v.id and g.status = 'published' and g.starts_at >= now()
    )
  )
  from public.venues v
  where v.id = p_venue_id;
$$;
