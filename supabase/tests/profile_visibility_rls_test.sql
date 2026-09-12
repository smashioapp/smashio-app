-- RLS coverage for security-audit-2026-09-11.md H5: profile_visibility = 'players_only' folded
-- into public.profiles' select policy (supabase/migrations/20260912000200_profile_visibility_rls.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(6);

set local role postgres;

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'stranger@test.dev'),
  ('e2222222-2222-2222-2222-222222222222', 'restricted-hoster@test.dev'),
  ('e3333333-3333-3333-3333-333333333333', 'restricted-quiet@test.dev'),
  ('e4444444-4444-4444-4444-444444444444', 'restricted-coplayer@test.dev'),
  ('e5555555-5555-5555-5555-555555555555', 'coplayer@test.dev');

update public.profiles set profile_visibility = 'players_only'
  where id in (
    'e2222222-2222-2222-2222-222222222222',
    'e3333333-3333-3333-3333-333333333333',
    'e4444444-4444-4444-4444-444444444444'
  );

insert into public.venues (id, name, suburb, state, location) values
  ('e6666666-6666-6666-6666-666666666666', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

-- e2222222 (players_only) hosts a published public game — their own advertisement stays visible.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status, visibility)
select
  'e7777777-7777-7777-7777-777777777777', s.id, 'e6666666-6666-6666-6666-666666666666',
  'e2222222-2222-2222-2222-222222222222', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8, 'published', 'public'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

-- e4444444 (players_only) and e5555555 are both approved players in a shared game.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status, visibility)
select
  'e8888888-8888-8888-8888-888888888888', s.id, 'e6666666-6666-6666-6666-666666666666',
  'e5555555-5555-5555-5555-555555555555', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8, 'published', 'public'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

insert into public.game_players (game_id, profile_id, status, requested_at, decided_at) values
  ('e8888888-8888-8888-8888-888888888888', 'e4444444-4444-4444-4444-444444444444', 'approved', now(), now()),
  ('e8888888-8888-8888-8888-888888888888', 'e5555555-5555-5555-5555-555555555555', 'approved', now(), now());

-- Act as a total stranger with no games in common with anyone above.
select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

SELECT is(
  (select count(*)::int from public.profiles where id = 'e3333333-3333-3333-3333-333333333333'),
  0,
  'a players_only profile with no shared game and no published game is invisible to a stranger'
);

SELECT is(
  (select count(*)::int from public.profiles where id = 'e2222222-2222-2222-2222-222222222222'),
  1,
  'a players_only profile currently hosting a published public game is visible to a stranger'
);

SELECT is(
  (select count(*)::int from public.profiles where id = 'e4444444-4444-4444-4444-444444444444'),
  0,
  'a players_only profile is still invisible to a stranger who is not their co-player'
);

-- Act as the co-player who shares game e8888888 with the restricted profile.
select set_config('request.jwt.claims', json_build_object('sub', 'e5555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;

SELECT is(
  (select count(*)::int from public.profiles where id = 'e4444444-4444-4444-4444-444444444444'),
  1,
  'a players_only profile is visible to an approved co-player from a shared game'
);

-- Act as the restricted profile itself.
select set_config('request.jwt.claims', json_build_object('sub', 'e3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

SELECT is(
  (select count(*)::int from public.profiles where id = 'e3333333-3333-3333-3333-333333333333'),
  1,
  'a players_only profile can always read its own row'
);

SELECT is(
  (select public.shares_a_game_with(null, 'e5555555-5555-5555-5555-555555555555')),
  false,
  'shares_a_game_with is null-safe'
);

SELECT * FROM finish();
ROLLBACK;
