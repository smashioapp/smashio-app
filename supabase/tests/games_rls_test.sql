-- RLS coverage for public.games (supabase/migrations/20260807000600_games.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(6);

-- Fixture: two profiles (organizer + other player), one venue. Reuses seed.sql's badminton
-- sport/skill_tier rows rather than inserting new ones (slug is unique, seed already has it).
set local role postgres;

insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'organizer@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'other@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('55555555-5555-5555-5555-555555555555', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select
  '66666666-6666-6666-6666-666666666666',
  s.id,
  '55555555-5555-5555-5555-555555555555',
  'b1111111-1111-1111-1111-111111111111',
  now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8
from public.sports s
join public.skill_tiers t on t.sport_id = s.id
where s.slug = 'badminton'
limit 1;

-- Act as the organizer.
select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Scoped to this file's fixture row: supabase/seed.sql populates games too, so a bare count
-- over the table measures the seed, not the policy.
SELECT is(
  (select count(*)::int from public.games where id = '66666666-6666-6666-6666-666666666666'),
  1,
  'any authenticated user can read games'
);

SELECT lives_ok(
  $$ insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
     select s.id, '55555555-5555-5555-5555-555555555555',
            'b1111111-1111-1111-1111-111111111111', now() + interval '2 days', now() + interval '2 days 2 hours',
            t.id, 8
     from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1 $$,
  'organizer can insert a game with organizer_id = own uid'
);

SELECT throws_ok(
  $$ insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
     select s.id, '55555555-5555-5555-5555-555555555555',
            '22222222-2222-2222-2222-222222222222', now() + interval '2 days', now() + interval '2 days 2 hours',
            t.id, 8
     from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1 $$,
  '42501',
  null,
  'cannot insert a game organized by someone else'
);

SELECT lives_ok(
  $$ update public.games set court_label = 'Court 3' where id = '66666666-6666-6666-6666-666666666666' $$,
  'organizer can update their own game'
);

SELECT throws_ok(
  $$ update public.games set status = 'completed' where id = '66666666-6666-6666-6666-666666666666' $$,
  '42501',
  null,
  'client cannot transition a game to completed directly'
);

-- Switch to the other (non-organizer) user.
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

SELECT results_eq(
  $$ update public.games set court_label = 'Hijacked' where id = '66666666-6666-6666-6666-666666666666' returning id $$,
  ARRAY[]::uuid[],
  'a non-organizer update matches zero rows (RLS filters, not errors)'
);

SELECT * FROM finish();
ROLLBACK;
