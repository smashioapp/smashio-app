-- P3 (discover-map-ux-plan.md §4.3, "open now"): court cards need opening_hours to compute
-- open-now without an N+1 per-pin venue_detail fetch. Same drop+create convention as
-- 20260815001000 — return-type change, no dependent views/functions.
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
  amenity_flags text[],
  opening_hours jsonb
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
    ) as amenity_flags,
    vp.opening_hours
  from public.venues v
  left join public.venue_profiles vp on vp.venue_id = v.id
  where extensions.ST_DWithin(v.location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m);
$$;

grant execute on function public.venues_near(double precision, double precision, double precision) to authenticated;
