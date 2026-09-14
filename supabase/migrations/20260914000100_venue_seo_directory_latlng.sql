-- home-redesign-plan.md H6 (Map moment, §3.3): the static Sydney map needs venue coordinates to
-- plot pins. venue_seo_directory (20260831020000) never returned lat/lng because nothing anon-safe
-- needed it yet. Coordinates are the venue's own public location (already exposed via the
-- authenticated venues_near/venue_detail RPCs, and venue_seo_detail already exposes the street
-- address), not player data, so this is inside website-plan.md §5's line, not across it.
drop function public.venue_seo_directory();

create function public.venue_seo_directory()
returns table (
  slug text,
  name text,
  suburb text,
  region text,
  courts_total int,
  dedicated boolean,
  lat double precision,
  lng double precision
)
language sql
stable
security definer set search_path = public
as $$
  select
    v.slug, v.name, v.suburb, v.region, vp.courts_total, vp.dedicated,
    extensions.ST_Y(v.location::extensions.geometry) as lat,
    extensions.ST_X(v.location::extensions.geometry) as lng
  from public.venues v
  join public.venue_profiles vp on vp.venue_id = v.id
  where v.slug is not null
  order by v.suburb, v.name;
$$;

grant execute on function public.venue_seo_directory() to anon, authenticated;
revoke execute on function public.venue_seo_directory() from public;
