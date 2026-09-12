-- Security audit 2026-09-11, H6: upsert_places_venue() is security definer, granted to
-- `authenticated`, and takes name/suburb/state/address/lat/lng/google_place_id entirely from the
-- caller with nothing checked against Google. Its `on conflict (google_place_id) do update` clause
-- meant anyone who could read a venue's google_place_id (every authenticated user, `venues` is
-- select-true) could rewrite that venue's directory data in place with arbitrary values.
--
-- Fix: a repeat search for a known place resolves to the existing row instead of rewriting it.
-- venues-plan.md's own schema comment already treats these columns as "Places-owned" and expected
-- upserts to refresh them from a trustworthy source; this migration doesn't reopen that path with
-- server-side Google validation (finding's fix #3), it just stops it being an open write.
create or replace function public.upsert_places_venue(
  p_name text,
  p_suburb text,
  p_state text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_google_place_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  insert into public.venues (name, suburb, state, address, location, google_place_id, source)
  values (
    p_name, p_suburb, p_state, p_address,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326),
    p_google_place_id, 'places'
  )
  on conflict (google_place_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.venues where google_place_id = p_google_place_id;
  end if;

  return v_id;
end;
$$;
