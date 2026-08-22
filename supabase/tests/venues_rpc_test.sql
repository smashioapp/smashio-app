-- Venues RPC coverage: upsert_places_venue, venues_near, venue_detail, venues_directory,
-- report_venue_correction (supabase/migrations/20260808000700_places_venues.sql,
-- 20260820000500_venues_near_opening_hours.sql, 20260815001100_venue_detail_rpc.sql,
-- 20260817000100_venues_directory_rpc.sql, 20260815000900_venue_photos_corrections.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(16);

set local role postgres;

insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111', 'reporter@test.dev');

-- Venue A: Sydney, has a curated profile (dedicated, 4 courts, public booking).
insert into public.venues (id, name, suburb, state, location) values
  ('d2222222-2222-2222-2222-222222222222', 'Sydney Badminton Centre', 'Homebush', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.venue_profiles (venue_id, courts_badminton, dedicated, bookability, opening_hours, data_source, confidence) values
  ('d2222222-2222-2222-2222-222222222222', 4, true, 'public', '{"mon": "06:00-22:00"}'::jsonb, 'operator', 'high');

-- Venue B: Melbourne (~700km away), no profile — tests radius exclusion, state filter, and the
-- "no profile" branch of venue_detail/venues_directory.
insert into public.venues (id, name, suburb, state, location) values
  ('d3333333-3333-3333-3333-333333333333', 'Melbourne Courts', 'Richmond', 'VIC', extensions.st_point(144.9, -37.8)::extensions.geography);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- --- upsert_places_venue -----------------------------------------------------------------------
select public.upsert_places_venue('New Places Venue', 'Chatswood', 'NSW', '1 Test St', -33.79, 151.18, 'places-id-abc');
SELECT is(
  (select count(*)::int from public.venues where google_place_id = 'places-id-abc'),
  1,
  'upsert_places_venue inserts a new venue keyed on google_place_id'
);

select public.upsert_places_venue('Renamed Places Venue', 'Chatswood', 'NSW', '1 Test St', -33.79, 151.18, 'places-id-abc');
SELECT is(
  (select count(*)::int from public.venues where google_place_id = 'places-id-abc'),
  1,
  're-upserting the same google_place_id does not create a duplicate row'
);
SELECT is(
  (select name from public.venues where google_place_id = 'places-id-abc'),
  'Renamed Places Venue',
  're-upserting the same google_place_id updates the existing row''s fields'
);

-- --- venues_near ---------------------------------------------------------------------------------
SELECT is(
  (select count(*)::int from public.venues_near(-33.8, 151.2, 5000) where id = 'd2222222-2222-2222-2222-222222222222'),
  1,
  'venues_near includes a venue inside the radius'
);
SELECT is(
  (select count(*)::int from public.venues_near(-33.8, 151.2, 5000) where id = 'd3333333-3333-3333-3333-333333333333'),
  0,
  'venues_near excludes a venue outside the radius'
);
SELECT is(
  (select has_profile from public.venues_near(-33.8, 151.2, 5000) where id = 'd2222222-2222-2222-2222-222222222222'),
  true,
  'venues_near flags has_profile true for a venue with a curated profile'
);
SELECT is(
  (select (opening_hours ->> 'mon') from public.venues_near(-33.8, 151.2, 5000) where id = 'd2222222-2222-2222-2222-222222222222'),
  '06:00-22:00',
  'venues_near surfaces opening_hours from the profile'
);

-- --- venue_detail ----------------------------------------------------------------------------
SELECT is(
  (public.venue_detail('d2222222-2222-2222-2222-222222222222') ->> 'name'),
  'Sydney Badminton Centre',
  'venue_detail returns the venue name'
);
SELECT is(
  ((public.venue_detail('d2222222-2222-2222-2222-222222222222') -> 'profile') ->> 'courts_badminton')::int,
  4,
  'venue_detail nests the curated profile'
);
SELECT is(
  (public.venue_detail('d3333333-3333-3333-3333-333333333333') -> 'profile'),
  'null'::jsonb,
  'venue_detail returns a null profile for a venue with no curated data'
);

-- --- venues_directory ---------------------------------------------------------------------------
SELECT is(
  (select count(*)::int from public.venues_directory('VIC')),
  1,
  'venues_directory filters by state (VIC has no seed venues, only our fixture)'
);
SELECT is(
  (select count(*)::int from public.venues_directory(null, 'Sydney Badminton Centre')),
  1,
  'venues_directory filters by name search'
);
SELECT is(
  (select count(*)::int from public.venues_directory(null, 'Sydney Badminton Centre', 5)),
  0,
  'venues_directory excludes venues below p_min_courts (fixture venue has 4)'
);
SELECT is(
  (select total_count from public.venues_directory(null, 'Chatswood', null, null, null, null, 1, 0) limit 1),
  1::bigint,
  'venues_directory total_count reflects the full match set even under p_limit'
);

-- --- report_venue_correction -------------------------------------------------------------------
select public.report_venue_correction('d2222222-2222-2222-2222-222222222222', 'courts_badminton', '6', 'actually has 6 courts now');
SELECT is(
  (select count(*)::int from public.venue_corrections where venue_id = 'd2222222-2222-2222-2222-222222222222' and reporter_id = 'd1111111-1111-1111-1111-111111111111'),
  1,
  'report_venue_correction inserts a correction row'
);

-- 9 more reports today (10 total) exhausts the daily limit; the 11th must be rejected.
set local role postgres;
insert into public.venue_corrections (venue_id, reporter_id, field, note)
select 'd2222222-2222-2222-2222-222222222222', 'd1111111-1111-1111-1111-111111111111', 'note', 'bulk-' || g
from generate_series(1, 9) g;
set local role authenticated;

SELECT throws_ok(
  $$ select public.report_venue_correction('d2222222-2222-2222-2222-222222222222', 'note', null, 'one too many') $$,
  'P0001', 'Daily correction report limit reached',
  'an 11th correction report in a day is rejected'
);

SELECT * FROM finish();
ROLLBACK;
