-- p_exclude_mine coverage for public.nearby_games (supabase/migrations/20260818000000_discover_exclude_own_games.sql).
-- security invoker: auth.uid() inside the RPC reflects whoever set_config'd request.jwt.claims.
-- Run: supabase test db
BEGIN;
SELECT plan(5);

-- Fixture: a published game at a venue near the query point (151.2, -33.8), hosted by the
-- organizer, with one approved player and one requester.
set local role postgres;

insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'organizer@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'approved@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'requester@test.dev'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('55555555-5555-5555-5555-555555555555', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select
  '66666666-6666-6666-6666-666666666666',
  s.id, '55555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111',
  now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8, 'published'
from public.sports s
join public.skill_tiers t on t.sport_id = s.id
where s.slug = 'badminton'
limit 1;

insert into public.game_players (game_id, profile_id, status) values
  ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'approved'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 'requested');

set local role authenticated;

-- 1. Host, default p_exclude_mine=true — does not see their own game.
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.nearby_games(-33.8, 151.2, 5000, 'badminton') where id = '66666666-6666-6666-6666-666666666666'),
  0,
  'host does not see their own hosted game with default p_exclude_mine'
);

-- 2. Approved player, default — does not see a game they're already approved in.
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.nearby_games(-33.8, 151.2, 5000, 'badminton') where id = '66666666-6666-6666-6666-666666666666'),
  0,
  'approved player does not see a game they are already in with default p_exclude_mine'
);

-- 3. Stranger, default — sees it.
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.nearby_games(-33.8, 151.2, 5000, 'badminton') where id = '66666666-6666-6666-6666-666666666666'),
  1,
  'a stranger sees the game with default p_exclude_mine'
);

-- 4. Host, p_exclude_mine := false — sees their own game (pulse-strip mode).
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.nearby_games(-33.8, 151.2, 5000, 'badminton', p_exclude_mine := false) where id = '66666666-6666-6666-6666-666666666666'),
  1,
  'host sees their own game when p_exclude_mine is false'
);

-- 5. Requested-but-not-approved player, default — still sees it (only approved/organizer count as "mine").
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.nearby_games(-33.8, 151.2, 5000, 'badminton') where id = '66666666-6666-6666-6666-666666666666'),
  1,
  'a pending requester still sees the game with default p_exclude_mine (not yet approved, not "mine")'
);

SELECT * FROM finish();
ROLLBACK;
