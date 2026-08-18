-- RLS + RPC coverage for public.game_players (supabase/migrations/20260808000000_game_players.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(13);

-- Fixture: organizer, an approved member, a requester, and a stranger. Reuses seed.sql's
-- badminton sport/skill_tier (slug is unique — inserting a fresh one would collide).
set local role postgres;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'organizer@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'member@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'requester@test.dev'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('55555555-5555-5555-5555-555555555555', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select
  '66666666-6666-6666-6666-666666666666',
  s.id, '55555555-5555-5555-5555-555555555555',
  '11111111-1111-1111-1111-111111111111',
  now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 4
from public.sports s
join public.skill_tiers t on t.sport_id = s.id
where s.slug = 'badminton'
limit 1;

insert into public.game_players (game_id, profile_id, status) values
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'approved'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 'requested');

-- Act as the stranger: no relation to this game at all.
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

SELECT is(
  (select count(*)::int from public.game_players where game_id = '66666666-6666-6666-6666-666666666666'),
  0,
  'a stranger sees zero roster rows (roster identities are private)'
);

SELECT throws_ok(
  $$ insert into public.game_players (game_id, profile_id, status)
     values ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'requested') $$,
  '42501',
  null,
  'cannot insert a join request on someone else''s behalf'
);

SELECT throws_ok(
  $$ insert into public.game_players (game_id, profile_id, status)
     values ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 'approved') $$,
  '42501',
  null,
  'cannot self-insert with a status other than requested'
);

SELECT lives_ok(
  $$ insert into public.game_players (game_id, profile_id, status)
     values ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 'requested') $$,
  'can insert own requested row'
);

SELECT throws_ok(
  $$ update public.game_players set status = 'approved'
     where game_id = '66666666-6666-6666-6666-666666666666' and profile_id = '44444444-4444-4444-4444-444444444444' $$,
  '42501',
  null,
  'no client update policy — even on own row'
);

SELECT throws_ok(
  $$ select public.decide_join_request('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', true) $$,
  'Only the organizer can decide join requests',
  'non-organizer cannot approve join requests via the RPC'
);

-- Act as the approved member: sees own row + organizer + fellow approved/requested rows.
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.game_players where game_id = '66666666-6666-6666-6666-666666666666'),
  3,
  'an approved member sees the full roster (own + requester + the stranger''s new request)'
);

SELECT throws_ok(
  $$ select public.decide_join_request('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', true) $$,
  'Only the organizer can decide join requests',
  'an approved member (not organizer) cannot decide join requests'
);

SELECT lives_ok(
  $$ select public.leave_game('66666666-6666-6666-6666-666666666666') $$,
  'an approved member can leave via the RPC'
);

SELECT is(
  (select status from public.game_players where game_id = '66666666-6666-6666-6666-666666666666' and profile_id = '22222222-2222-2222-2222-222222222222'),
  'left',
  'leave_game transitions the member''s own row to left'
);

-- Act as the organizer: full roster visibility + can decide requests.
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.game_players where game_id = '66666666-6666-6666-6666-666666666666'),
  3,
  'the organizer sees the full roster without being a player themselves'
);

SELECT lives_ok(
  $$ select public.decide_join_request('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', true) $$,
  'the organizer can approve a join request'
);

SELECT is(
  (select status from public.game_players where game_id = '66666666-6666-6666-6666-666666666666' and profile_id = '33333333-3333-3333-3333-333333333333'),
  'approved',
  'decide_join_request(approve=true) sets status to approved'
);

SELECT * FROM finish();
ROLLBACK;
