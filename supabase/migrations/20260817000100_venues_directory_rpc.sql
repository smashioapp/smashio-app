-- Venue Screen Redesign (design/23bc2cae, panel 6 "Courts near me"): a searchable, filterable
-- facility directory independent of map viewport — venues_near (20260815001000) is radius-bound
-- for map pins, this is state-bound for a scrollable list (venues.region is an unpopulated
-- column — every seeded venue has state='NSW', so filter on that instead). Returns the cheapest
-- pricing band per venue so cards can show "$18/court/hr" without an N+1 fetch.
create function public.venues_directory(
  p_state text default null,
  p_search text default null,
  p_min_courts int default null,
  p_dedicated boolean default null,
  p_bookable_now boolean default null,
  p_amenity_slug text default null,
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
        p_amenity_slug is null or exists (
          select 1 from public.venue_amenities va
          where va.venue_id = v.id and va.amenity_slug = p_amenity_slug and va.availability in ('yes', 'paid')
        )
      )
  )
  select base.*, count(*) over ()::bigint as total_count
  from base
  order by base.name
  limit p_limit offset p_offset;
$$;

grant execute on function public.venues_directory(text, text, int, boolean, boolean, text, int, int) to authenticated;

