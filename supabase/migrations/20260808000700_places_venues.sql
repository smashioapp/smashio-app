-- Slice 9: host venue search moves from the manual seed list to live Google Places
-- Autocomplete/Details. Client picks a place, this RPC upserts it into venues keyed on
-- google_place_id so repeat searches for the same place don't create duplicate rows.
-- SECURITY DEFINER (same pattern as decide_join_request) — no separate client insert policy
-- needed on venues, which otherwise stays select-only for authenticated users.
alter table public.venues add constraint venues_google_place_id_key unique (google_place_id);

create function public.upsert_places_venue(
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
  on conflict (google_place_id) do update set
    name = excluded.name,
    suburb = excluded.suburb,
    state = excluded.state,
    address = excluded.address,
    location = excluded.location
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.upsert_places_venue(text, text, text, text, double precision, double precision, text) to authenticated;
