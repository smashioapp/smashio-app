-- Join/leave flow coverage: request_to_join, decide_join_request, leave_game, remove_player
-- (supabase/migrations/20260808000000_game_players.sql, 20260810000000_game_management.sql,
-- 20260812000000_withdraw_join_request.sql, 20260819000000_request_to_join_rpc.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(16);

-- Fixture: organizer + 4 candidate players, one venue, one game capped at max_players = 2 so the
-- capacity check in decide_join_request is actually exercised.
set local role postgres;

insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'organizer@test.dev'),
  ('a2222222-2222-2222-2222-222222222222', 'playera@test.dev'),
  ('a3333333-3333-3333-3333-333333333333', 'playerb@test.dev'),
  ('a4444444-4444-4444-4444-444444444444', 'playerc@test.dev'),
  ('a5555555-5555-5555-5555-555555555555', 'playerd@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('66666666-6666-6666-6666-666666666666', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select
  '77777777-7777-7777-7777-777777777777',
  s.id,
  '66666666-6666-6666-6666-666666666666',
  'b1111111-1111-1111-1111-111111111111',
  now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 2
from public.sports s
join public.skill_tiers t on t.sport_id = s.id
where s.slug = 'badminton'
limit 1;

set local role authenticated;

-- request_to_join: playerA requests.
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select public.request_to_join('77777777-7777-7777-7777-777777777777');

SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a2222222-2222-2222-2222-222222222222'),
  'requested',
  'request_to_join inserts a requested row'
);

-- request_to_join is safe to call again while still 'requested' — no duplicate, no state change.
select public.request_to_join('77777777-7777-7777-7777-777777777777');

SELECT is(
  (select count(*)::int from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a2222222-2222-2222-2222-222222222222'),
  1,
  're-requesting while already requested does not duplicate the row'
);

-- playerB, playerC, playerD all request too.
select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
select public.request_to_join('77777777-7777-7777-7777-777777777777');
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a3333333-3333-3333-3333-333333333333'),
  'requested',
  'playerB requests to join'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
select public.request_to_join('77777777-7777-7777-7777-777777777777');
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a4444444-4444-4444-4444-444444444444'),
  'requested',
  'playerC requests to join'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);
select public.request_to_join('77777777-7777-7777-7777-777777777777');
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a5555555-5555-5555-5555-555555555555'),
  'requested',
  'playerD requests to join'
);

-- decide_join_request: only the organizer may decide. playerA tries to decide on playerB.
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.decide_join_request('77777777-7777-7777-7777-777777777777', 'a3333333-3333-3333-3333-333333333333', true) $$,
  'P0001',
  'Only the organizer can decide join requests',
  'a non-organizer cannot decide join requests'
);

-- Organizer approves playerA and playerB, filling the game to max_players = 2.
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select public.decide_join_request('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222', true);
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a2222222-2222-2222-2222-222222222222'),
  'approved',
  'organizer approves playerA'
);

select public.decide_join_request('77777777-7777-7777-7777-777777777777', 'a3333333-3333-3333-3333-333333333333', true);
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a3333333-3333-3333-3333-333333333333'),
  'approved',
  'organizer approves playerB, filling the game'
);

-- Game is now full (2/2) — approving playerC must fail the capacity check.
SELECT throws_ok(
  $$ select public.decide_join_request('77777777-7777-7777-7777-777777777777', 'a4444444-4444-4444-4444-444444444444', true) $$,
  'P0001',
  'Game is full',
  'organizer cannot approve past max_players'
);

-- Organizer rejects playerD instead.
select public.decide_join_request('77777777-7777-7777-7777-777777777777', 'a5555555-5555-5555-5555-555555555555', false);
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a5555555-5555-5555-5555-555555555555'),
  'rejected',
  'organizer rejects playerD'
);

-- request_to_join reopens a rejected row back to requested.
select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);
select public.request_to_join('77777777-7777-7777-7777-777777777777');
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a5555555-5555-5555-5555-555555555555'),
  'requested',
  'a rejected player can request to join again, reopening the row'
);

-- leave_game: an approved player leaving.
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select public.leave_game('77777777-7777-7777-7777-777777777777');
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a2222222-2222-2222-2222-222222222222'),
  'left',
  'an approved player can leave the game'
);

-- leave_game: withdrawing a still-pending request.
select set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);
select public.leave_game('77777777-7777-7777-7777-777777777777');
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a5555555-5555-5555-5555-555555555555'),
  'left',
  'a requested (unapproved) player can withdraw via leave_game'
);

-- remove_player: organizer removes an approved player.
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select public.remove_player('77777777-7777-7777-7777-777777777777', 'a3333333-3333-3333-3333-333333333333');
SELECT is(
  (select status from public.game_players where game_id = '77777777-7777-7777-7777-777777777777' and profile_id = 'a3333333-3333-3333-3333-333333333333'),
  'removed',
  'organizer removes an approved player'
);

-- remove_player: the organizer can't remove themself.
SELECT throws_ok(
  $$ select public.remove_player('77777777-7777-7777-7777-777777777777', 'b1111111-1111-1111-1111-111111111111') $$,
  'P0001',
  'The organiser can''t be removed from their own game',
  'organizer cannot remove themself'
);

-- remove_player: only the organizer may remove — playerA (not the organizer) tries on playerC.
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.remove_player('77777777-7777-7777-7777-777777777777', 'a4444444-4444-4444-4444-444444444444') $$,
  'P0001',
  'Only the organiser can remove players',
  'a non-organizer cannot remove players'
);

SELECT * FROM finish();
ROLLBACK;
