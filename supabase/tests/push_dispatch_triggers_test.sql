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
SELECT plan(23);

set local role postgres;

insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'organizer@test.dev'),
  ('b2222222-2222-2222-2222-222222222222', 'approved@test.dev'),
  ('b3333333-3333-3333-3333-333333333333', 'requester@test.dev'),
  ('b4444444-4444-4444-4444-444444444444', 'alert-owner@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('b5555555-5555-5555-5555-555555555555', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography),
  ('b6666666-6666-6666-6666-666666666666', 'Far Courts', 'Perth', 'WA', extensions.st_point(115.86, -31.95)::extensions.geography);

-- ---------------------------------------------------------------------------------------------
-- 1-2. dispatch_game_reminders(): the 2h sweep covers anything starting inside the next
-- 2h05m that hasn't been reminded yet (P0 widened this from a hard 115-125 minute band).
-- ---------------------------------------------------------------------------------------------

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000001', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() + interval '120 minutes', now() + interval '3 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000002', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() + interval '3 hours', now() + interval '5 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

select public.dispatch_game_reminders();

SELECT isnt(
  (select reminded_at from public.games where id = 'a0000000-0000-0000-0000-000000000001'),
  null,
  'game starting in 120 minutes gets reminded_at set by the 2h sweep'
);

SELECT is(
  (select reminded_at from public.games where id = 'a0000000-0000-0000-0000-000000000002'),
  null,
  'game starting in 3 hours (outside the 2h window, posted <24h ahead) is left alone'
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
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

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

-- Guarded: supabase/seed.sql now creates this secret so local dev can dispatch for real
-- (docs/notifications-plan.md §6.7), and vault secret names are unique.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_key') then
    perform vault.create_secret('test-push-dispatch-key', 'push_dispatch_key');
  end if;
end;
$$;

-- 5. game_players_notify_push fires on requested -> approved/rejected and approved -> removed.
insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'requested');

create temp table _queue_before as select count(*) as n from net.http_request_queue;

update public.game_players
  set status = 'approved'
  where game_id = 'a0000000-0000-0000-0000-000000000001' and profile_id = 'b2222222-2222-2222-2222-222222222222';

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'requested -> approved queues a push (join_decision)'
);

drop table _queue_before;
create temp table _queue_before as select count(*) as n from net.http_request_queue;

update public.game_players
  set status = 'removed'
  where game_id = 'a0000000-0000-0000-0000-000000000001' and profile_id = 'b2222222-2222-2222-2222-222222222222';

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'approved -> removed also queues a push (20260810000000_game_management.sql extends the trigger)'
);

drop table _queue_before;

-- The insert itself now queues a join_request push (A1), so the baseline is taken after it.
insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'b3333333-3333-3333-3333-333333333333', 'requested');

create temp table _queue_before as select count(*) as n from net.http_request_queue;

update public.game_players
  set status = 'removed'
  where game_id = 'a0000000-0000-0000-0000-000000000001' and profile_id = 'b3333333-3333-3333-3333-333333333333';

SELECT is(
  (select count(*) from net.http_request_queue),
  (select n from _queue_before),
  'requested -> removed does not queue a push (neither trigger branch matches that edge)'
);

drop table _queue_before;

-- 6. Alert radius match: alert owner inside radius gets matched.
insert into public.game_alerts (profile_id, sport_id, center_lat, center_lng, radius_m)
select 'b4444444-4444-4444-4444-444444444444', s.id, -33.8, 151.2, 5000
from public.sports s where s.slug = 'badminton' limit 1;

create temp table _queue_before as select count(*) as n from net.http_request_queue;

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000003', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours',
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
select 'a0000000-0000-0000-0000-000000000004', s.id, 'b6666666-6666-6666-6666-666666666666',
  'b1111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

SELECT is(
  (select count(*) from net.http_request_queue),
  (select n from _queue_before),
  'a published game far outside every alert radius does not queue a push'
);

drop table _queue_before;


-- ---------------------------------------------------------------------------------------------
-- 10-13. Notifications P0 roster triggers (20260820000200_notifications_p0.sql): the events a
-- host could previously only discover by opening the game screen.
-- ---------------------------------------------------------------------------------------------

-- 10. A1 on the plain INSERT path.
create temp table _queue_before as select count(*) as n from net.http_request_queue;

insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000003', 'b2222222-2222-2222-2222-222222222222', 'requested');

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'a new join request queues a push to the host (A1, INSERT path)'
);

drop table _queue_before;

-- 11. A1 on the request_to_join reopen path. A returning player (rejected/left/removed) hits
-- ON CONFLICT DO UPDATE, which an INSERT-only trigger would silently miss.
update public.game_players set status = 'rejected'
  where game_id = 'a0000000-0000-0000-0000-000000000003' and profile_id = 'b2222222-2222-2222-2222-222222222222';

create temp table _queue_before as select count(*) as n from net.http_request_queue;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select public.request_to_join('a0000000-0000-0000-0000-000000000003');
set local role postgres;

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'request_to_join reopening a rejected row also queues a join_request push (A1, UPDATE path)'
);

drop table _queue_before;

-- 12. A6: approved -> left tells the host a spot reopened.
update public.game_players set status = 'approved'
  where game_id = 'a0000000-0000-0000-0000-000000000003' and profile_id = 'b2222222-2222-2222-2222-222222222222';

create temp table _queue_before as select count(*) as n from net.http_request_queue;

update public.game_players set status = 'left'
  where game_id = 'a0000000-0000-0000-0000-000000000003' and profile_id = 'b2222222-2222-2222-2222-222222222222';

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'approved -> left queues a player_left push to the host (A6)'
);

drop table _queue_before;

-- 13. A8: the approval that takes the last spot queues game_full on top of join_decision.
-- max_players 2 with 1 reserved spot, so a single approval fills the roster.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, reserved_spots, status)
select 'a0000000-0000-0000-0000-000000000005', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() + interval '5 days', now() + interval '5 days 2 hours',
  t.id, 2, 1, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000005', 'b3333333-3333-3333-3333-333333333333', 'requested');

create temp table _queue_before as select count(*) as n from net.http_request_queue;

update public.game_players set status = 'approved'
  where game_id = 'a0000000-0000-0000-0000-000000000005' and profile_id = 'b3333333-3333-3333-3333-333333333333';

SELECT is(
  (select count(*) from net.http_request_queue),
  (select n + 2 from _queue_before),
  'the approval that fills the roster queues both join_decision and game_full (A8)'
);

drop table _queue_before;

-- ---------------------------------------------------------------------------------------------
-- 14-16. Recipient sets and the richer summary.
-- ---------------------------------------------------------------------------------------------

insert into public.push_tokens (profile_id, expo_token, platform) values
  ('b1111111-1111-1111-1111-111111111111', 'ExponentPushToken[host]', 'ios'),
  ('b2222222-2222-2222-2222-222222222222', 'ExponentPushToken[approved]', 'ios'),
  ('b4444444-4444-4444-4444-444444444444', 'ExponentPushToken[requester]', 'android');

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, reserved_spots, status)
select 'a0000000-0000-0000-0000-000000000006', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() + interval '6 days', now() + interval '6 days 2 hours',
  t.id, 8, 2, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000006', 'b2222222-2222-2222-2222-222222222222', 'approved'),
  ('a0000000-0000-0000-0000-000000000006', 'b4444444-4444-4444-4444-444444444444', 'requested');

-- 14. Default: roster + host only, which is right for a reminder.
SELECT is(
  (select count(*)::int from public.push_recipients_for_game('a0000000-0000-0000-0000-000000000006')),
  2,
  'push_recipients_for_game defaults to approved roster + host, excluding pending requesters'
);

-- 15. Bug #1: a cancellation or reschedule has to reach the pending requester too.
SELECT is(
  (select count(*)::int from public.push_recipients_for_game(
     'a0000000-0000-0000-0000-000000000006', null, true)),
  3,
  'p_include_requested widens the set to pending requesters (bug #1: cancel/reschedule)'
);

-- 16. spots_left is max - approved - reserved (8 - 1 - 2), the number every host-facing string
-- quotes back to the user.
SELECT is(
  (select spots_left from public.push_game_summary('a0000000-0000-0000-0000-000000000006')),
  5,
  'push_game_summary.spots_left subtracts both approved players and reserved spots'
);

-- ---------------------------------------------------------------------------------------------
-- 17-20. Reminder sweeps: the 24h addition (C1) and the self-healing window (bug #3).
-- ---------------------------------------------------------------------------------------------

-- Posted two days ahead, starting in 23 hours: inside the 24h window.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status, created_at)
select 'a0000000-0000-0000-0000-000000000007', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() + interval '23 hours', now() + interval '25 hours',
  t.id, 8, 'published', now() - interval '2 days'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

-- Posted just now for a game 20 hours out: "Tomorrow" is not news to whoever just joined it.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000008', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() + interval '20 hours', now() + interval '22 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

-- Starting in 30 minutes and never reminded: the old hard 115-125 minute band would have skipped
-- this game forever after one lagged cron tick.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000009', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() + interval '30 minutes', now() + interval '2 hours 30 minutes',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

select public.dispatch_game_reminders();

SELECT isnt(
  (select reminded_24h_at from public.games where id = 'a0000000-0000-0000-0000-000000000007'),
  null,
  'a game 23 hours out, posted two days ahead, gets the 24h reminder (C1)'
);

SELECT is(
  (select reminded_24h_at from public.games where id = 'a0000000-0000-0000-0000-000000000008'),
  null,
  'a game posted less than 24 hours ahead skips the 24h reminder'
);

SELECT isnt(
  (select reminded_at from public.games where id = 'a0000000-0000-0000-0000-000000000009'),
  null,
  'the 2h sweep is self-healing: a game 30 minutes out with no reminder still gets swept (bug #3)'
);

-- 20. Rescheduling has to clear both stamps, or a moved game keeps yesterday's 24h flag and
-- never reminds again (bug #2, extended to the new column).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

update public.games set starts_at = now() + interval '3 days', ends_at = now() + interval '3 days 2 hours'
  where id = 'a0000000-0000-0000-0000-000000000007';

set local role postgres;

SELECT is(
  (select reminded_24h_at from public.games where id = 'a0000000-0000-0000-0000-000000000007'),
  null,
  'rescheduling resets reminded_24h_at as well as reminded_at'
);

-- ---------------------------------------------------------------------------------------------
-- 21-23. C3 post-game rating prompt. complete_past_games flipped games to completed and told
-- nobody, so the ratings -> reliability -> trust chain hung on a prompt that never fired.
-- ---------------------------------------------------------------------------------------------

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'a0000000-0000-0000-0000-000000000010', s.id, 'b5555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111', now() - interval '5 hours', now() - interval '3 hours',
  t.id, 8, 'completed'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000010', 'b2222222-2222-2222-2222-222222222222', 'approved');

create temp table _queue_before as select count(*) as n from net.http_request_queue;

select public.dispatch_post_game_prompts();

SELECT ok(
  (select rate_prompted_at from public.games where id = 'a0000000-0000-0000-0000-000000000010') is not null
  and (select count(*) from net.http_request_queue) > (select n from _queue_before),
  'a game completed more than 2 hours ago queues one post_game_rate push and stamps rate_prompted_at (C3)'
);

drop table _queue_before;

-- 22. One approved player: only the host has someone to rate (the player's rate list excludes
-- themselves, and the host has no game_players row).
SELECT is(
  (select count(*)::int from public.push_post_game_recipients('a0000000-0000-0000-0000-000000000010')),
  1,
  'with a single approved player the rating prompt goes to the host alone'
);

-- 23. Two approved players: everyone has a co-player to rate.
insert into public.game_players (game_id, profile_id, status) values
  ('a0000000-0000-0000-0000-000000000010', 'b4444444-4444-4444-4444-444444444444', 'approved');

SELECT is(
  (select count(*)::int from public.push_post_game_recipients('a0000000-0000-0000-0000-000000000010')),
  3,
  'with two approved players the rating prompt goes to the whole roster plus the host'
);

SELECT * FROM finish();
ROLLBACK;
