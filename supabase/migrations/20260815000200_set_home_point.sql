-- Profile plan P5: geocode the suburb on save. profiles.home_point has sat unwritten by the
-- app since slice 1 (only seed-test-data.sql ever touched it) — writing a geography(Point)
-- column needs ST_MakePoint, which the client can't send over plain REST, so this mirrors
-- upsert_places_venue's SECURITY DEFINER pattern: own row only, lat/lng in, point out.
create function public.set_home_point(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.profiles
  set home_point = extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)
  where id = auth.uid();
end;
$$;

grant execute on function public.set_home_point(double precision, double precision) to authenticated;
