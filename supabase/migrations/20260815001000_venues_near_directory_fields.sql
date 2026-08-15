-- A4 (venues-plan.md §5.2): venues_near carries enough facility data for map pins to
-- differentiate a dedicated centre from a club-only hall, and to filter by amenity without an
-- N+1 per-pin fetch. Per the convention noted in 20260814000000_courts_hours_perplayer_price.sql,
-- a return-type change needs drop+create, not create-or-replace. No dependent views/functions.
drop function if exists public.venues_near(double precision, double precision, double precision);

create function public.venues_near(
  lat double precision,
  lng double precision,
  radius_m double precision
)
returns table (
  id uuid,
  name text,
  suburb text,
  state text,
  address text,
  lat double precision,
  lng double precision,
  courts_badminton int,
  dedicated boolean,
  bookability text,
  has_profile boolean,
  amenity_flags text[]
)
language sql
stable
security invoker
as $$
  select
    v.id,
    v.name,
    v.suburb,
    v.state,
    v.address,
    extensions.ST_Y(v.location::extensions.geometry) as lat,
    extensions.ST_X(v.location::extensions.geometry) as lng,
    vp.courts_badminton,
    vp.dedicated,
    coalesce(vp.bookability, 'unknown') as bookability,
    (vp.venue_id is not null) as has_profile,
    coalesce(
      (select array_agg(va.amenity_slug order by va.amenity_slug)
       from public.venue_amenities va
       where va.venue_id = v.id and va.availability in ('yes', 'paid')),
      '{}'
    ) as amenity_flags
  from public.venues v
  left join public.venue_profiles vp on vp.venue_id = v.id
  where extensions.ST_DWithin(v.location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m);
$$;

grant execute on function public.venues_near(double precision, double precision, double precision) to authenticated;
