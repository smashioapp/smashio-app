-- Misc RPC coverage: set_home_point, report_user, recompute_reliability_scores,
-- notification_pref_enabled, time_in_window (supabase/migrations/20260815000200_set_home_point.sql,
-- 20260822000000_profile_settings.sql, 20260808000200_ratings_and_completion.sql,
-- 20260820000300_notifications_p1.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(17);

set local role postgres;

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'reporter@test.dev'),
  ('e2222222-2222-2222-2222-222222222222', 'reported@test.dev'),
  ('e3333333-3333-3333-3333-333333333333', 'reported-2@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('e5555555-5555-5555-5555-555555555555', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

-- --- set_home_point ------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select public.set_home_point(-33.87, 151.21);

SELECT isnt(
  (select home_point from public.profiles where id = 'e1111111-1111-1111-1111-111111111111'),
  null,
  'set_home_point writes a point for the caller'
);
SELECT is(
  (select round(extensions.ST_Y(home_point::extensions.geometry)::numeric, 2) from public.profiles where id = 'e1111111-1111-1111-1111-111111111111'),
  -33.87,
  'set_home_point stores the given latitude'
);
SELECT is(
  (select home_point from public.profiles where id = 'e2222222-2222-2222-2222-222222222222'),
  null,
  'set_home_point only ever touches the caller''s own row'
);

-- --- report_user -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ select public.report_user('e1111111-1111-1111-1111-111111111111', 'spam') $$,
  'P0001', 'Cannot report yourself',
  'a player cannot report themself'
);

select public.report_user('e2222222-2222-2222-2222-222222222222', 'spam', 'kept spamming the chat');
SELECT is(
  (select count(*)::int from public.user_reports where reporter_id = 'e1111111-1111-1111-1111-111111111111' and reported_id = 'e2222222-2222-2222-2222-222222222222'),
  1,
  'report_user inserts a report row'
);

SELECT throws_ok(
  $$ select public.report_user('e2222222-2222-2222-2222-222222222222', 'spam') $$,
  'P0001', 'You have already reported this player today',
  'reporting the same player twice in a day is rejected'
);

-- A different target is a different rate-limit bucket, so it's unaffected.
select public.report_user('e3333333-3333-3333-3333-333333333333', 'no_show');
SELECT is(
  (select count(*)::int from public.user_reports where reporter_id = 'e1111111-1111-1111-1111-111111111111' and reported_id = 'e3333333-3333-3333-3333-333333333333'),
  1,
  'the daily limit is scoped per (reporter, reported) pair, not globally'
);

-- --- recompute_reliability_scores --------------------------------------------------------------
set local role postgres;

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'e6666666-6666-6666-6666-666666666666', s.id, 'e5555555-5555-5555-5555-555555555555',
  'e2222222-2222-2222-2222-222222222222', now() - interval '2 days', now() - interval '2 days' + interval '2 hours',
  t.id, 8, 'completed'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

-- e1111111 left after the game had already started (a "late leave"); recorded via a decided_at
-- after starts_at, same shape leave_game itself would write.
insert into public.game_players (game_id, profile_id, status, requested_at, decided_at) values
  ('e6666666-6666-6666-6666-666666666666', 'e1111111-1111-1111-1111-111111111111', 'left', now() - interval '3 days', now() - interval '2 days' + interval '10 minutes');

select public.recompute_reliability_scores();

SELECT is(
  (select reliability_score from public.profiles where id = 'e1111111-1111-1111-1111-111111111111'),
  95::numeric,
  'one late leave costs 5 reliability points'
);
SELECT is(
  (select reliability_score from public.profiles where id = 'e2222222-2222-2222-2222-222222222222'),
  100::numeric,
  'a profile with no late leaves stays at 100'
);

-- --- notification_pref_enabled -------------------------------------------------------------------
SELECT is(
  public.notification_pref_enabled('e3333333-3333-3333-3333-333333333333', 'reminders'),
  true,
  'a profile with no notification_prefs row defaults every category to enabled'
);

insert into public.notification_prefs (profile_id, reminders) values
  ('e3333333-3333-3333-3333-333333333333', false);

SELECT is(
  public.notification_pref_enabled('e3333333-3333-3333-3333-333333333333', 'reminders'),
  false,
  'an explicit false in notification_prefs is respected'
);
SELECT is(
  public.notification_pref_enabled('e3333333-3333-3333-3333-333333333333', 'chat'),
  true,
  'an untouched category on an existing prefs row still defaults to enabled'
);
SELECT is(
  public.notification_pref_enabled('e3333333-3333-3333-3333-333333333333', 'not_a_real_key'),
  true,
  'an unrecognized pref key defaults to enabled rather than failing closed'
);

-- --- time_in_window ------------------------------------------------------------------------------
SELECT is(public.time_in_window('12:00'::time, '09:00'::time, '17:00'::time), true, 'a same-day window contains a time inside it');
SELECT is(public.time_in_window('20:00'::time, '09:00'::time, '17:00'::time), false, 'a same-day window excludes a time outside it');
SELECT is(public.time_in_window('23:30'::time, '22:00'::time, '07:00'::time), true, 'an overnight window contains a time after midnight-crossing start');
SELECT is(public.time_in_window('12:00'::time, '22:00'::time, '07:00'::time), false, 'an overnight window excludes a time in the middle of the day');

SELECT * FROM finish();
ROLLBACK;
