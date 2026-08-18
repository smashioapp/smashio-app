-- Coverage for DB-side notification triggers (supabase/migrations/20260808000500_push_dispatch.sql,
-- 20260811000300_game_alerts.sql, 20260815000700_chat_v2.sql's reminded_at reset).
-- Run: supabase test db
--
-- notify_push() is a silent no-op without a 'push_dispatch_key' Vault secret (by design, so a
-- fresh local db never crashes on a missing secret). Tests 1-4 exercise business logic that's
-- observable without a secret (reminder window, reminded_at reset). Tests 5-7 create a Vault
-- secret so notify_push actually reaches net.http_post, then assert on pg_net's request queue —
-- if pg_net's internal table/column names differ from what's assumed here, those three tests
-- will fail with a clear "relation/column does not exist" error rather than a false pass.
BEGIN;
SELECT plan(9);

set local role postgres;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'organizer@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'approved@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'requester@test.dev'),
  ('44444444-4444-4444-4444-444444444444', 'alert-owner@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('55555555-5555-5555-5555-555555555555', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography),
  ('66666666-6666-6666-6666-666666666666', 'Far Courts', 'Perth', 'WA', extensions.st_point(115.86, -31.95)::extensions.geography);

-- ---------------------------------------------------------------------------------------------
-- 1-2. dispatch_game_reminders(): only games starting 115-125 minutes from now get reminded_at.
-- ---------------------------------------------------------------------------------------------

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000001', s.id, '55555555-5555-5555-5555-555555555555',
  '11111111-1111-1111-1111-111111111111', now() + interval '120 minutes', now() + interval '3 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000002', s.id, '55555555-5555-5555-5555-555555555555',
  '11111111-1111-1111-1111-111111111111', now() + interval '3 hours', now() + interval '5 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

select public.dispatch_game_reminders();

SELECT isnt(
  (select reminded_at from public.games where id = 'a0000000-0000-0000-0000-000000000001'),
  null,
  'game starting in 120 minutes gets reminded_at set by the 115-125min sweep'
);

SELECT is(
  (select reminded_at from public.games where id = 'a0000000-0000-0000-0000-000000000002'),
  null,
  'game starting in 3 hours (outside the window) is left alone'
);

-- ---------------------------------------------------------------------------------------------
-- 3. dispatch_game_reminders() does not re-remind a game already marked reminded_at.
-- ---------------------------------------------------------------------------------------------

update public.games set reminded_at = now() - interval '1 minute' where id = 'a0000000-0000-0000-0000-000000000001';
select public.dispatch_game_reminders();

SELECT ok(
  (select reminded_at from public.games where id = 'a0000000-0000-0000-0000-000000000001') < now() - interval '30 seconds',
  'a game already marked reminded_at is not touched again by a later sweep'
);

-- ---------------------------------------------------------------------------------------------
-- 4. Changing starts_at resets reminded_at (enforce_game_edit_rules, 20260815000700_chat_v2.sql).
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

update public.games set starts_at = now() + interval '2 hours 5 minutes' where id = 'a0000000-0000-0000-0000-000000000001';

SELECT is(
  (select reminded_at from public.games where id = 'a0000000-0000-0000-0000-000000000001'),
  null,
  'rescheduling a game resets reminded_at so it can be re-reminded at the new time'
);

set local role postgres;

-- ---------------------------------------------------------------------------------------------
-- 5-7. pg_net side effects: create a Vault secret so notify_push actually queues a request.
-- ---------------------------------------------------------------------------------------------

select vault.create_secret('test-push-dispatch-key', 'push_dispatch_key');

-- 5. game_players_notify_push fires on requested -> approved/rejected and approved -> removed.
insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'requested');

create temp table _queue_before as select count(*) as n from net.http_request_queue;

update public.game_players
  set status = 'approved'
  where game_id = 'a0000000-0000-0000-0000-000000000001' and profile_id = '22222222-2222-2222-2222-222222222222';

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'requested -> approved queues a push (join_decision)'
);

drop table _queue_before;
create temp table _queue_before as select count(*) as n from net.http_request_queue;

update public.game_players
  set status = 'removed'
  where game_id = 'a0000000-0000-0000-0000-000000000001' and profile_id = '22222222-2222-2222-2222-222222222222';

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'approved -> removed also queues a push (20260810000000_game_management.sql extends the trigger)'
);

drop table _queue_before;
create temp table _queue_before as select count(*) as n from net.http_request_queue;

insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'requested');

update public.game_players
  set status = 'removed'
  where game_id = 'a0000000-0000-0000-0000-000000000001' and profile_id = '33333333-3333-3333-3333-333333333333';

SELECT is(
  (select count(*) from net.http_request_queue),
  (select n from _queue_before),
  'requested -> removed does not queue a push (neither trigger branch matches that edge)'
);

drop table _queue_before;

-- 6. Alert radius match: alert owner inside radius gets matched.
insert into public.game_alerts (profile_id, sport_id, center_lat, center_lng, radius_m)
select '44444444-4444-4444-4444-444444444444', s.id, -33.8, 151.2, 5000
from public.sports s where s.slug = 'badminton' limit 1;

create temp table _queue_before as select count(*) as n from net.http_request_queue;

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000003', s.id, '55555555-5555-5555-5555-555555555555',
  '11111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'a published game inside an alert radius (5km, ~5km fixture distance) queues an alert_match push'
);

drop table _queue_before;

-- 7. Alert radius miss: a game at a venue ~3300km away (Perth) never matches a Sydney-radius alert.
create temp table _queue_before as select count(*) as n from net.http_request_queue;

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000004', s.id, '66666666-6666-6666-6666-666666666666',
  '11111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

SELECT is(
  (select count(*) from net.http_request_queue),
  (select n from _queue_before),
  'a published game far outside every alert radius does not queue a push'
);

drop table _queue_before;

SELECT * FROM finish();
ROLLBACK;
