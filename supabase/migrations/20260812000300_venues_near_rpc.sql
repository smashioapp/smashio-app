-- map-plan.md §5.10/§6-P4: Discover map needs venues with zero upcoming games (dimmed pins,
-- "host one here" funnel). venues.location is geography(Point) and untyped by codegen, so this
-- projects lat/lng the same way games_public/nearby_games already do (ST_Y/ST_X on the
-- geometry cast), scoped by radius so the query tracks the map viewport, not the whole table.
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
  lng double precision
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
    extensions.ST_X(v.location::extensions.geometry) as lng
  from public.venues v
  where extensions.ST_DWithin(v.location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m);
$$;

grant execute on function public.venues_near(double precision, double precision, double precision) to authenticated;
