-- fill-the-spot-ultraplan.md P1.3: spot_reach_estimate is an aggregate, rounded, never identities.
-- Run: supabase test db
BEGIN;
SELECT plan(4);

set local role postgres;

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'reach-host@test.dev'),
  ('e2222222-2222-2222-2222-222222222222', 'reach-near@test.dev'),
  ('e3333333-3333-3333-3333-333333333333', 'reach-far@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('e5555555-5555-5555-5555-555555555555', 'Reach Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

-- One nearby player at the game's tier, one 100+ km away.
insert into public.profile_private (profile_id, home_point) values
  ('e2222222-2222-2222-2222-222222222222', extensions.st_point(151.21, -33.81)::extensions.geography),
  ('e3333333-3333-3333-3333-333333333333', extensions.st_point(150.0, -34.5)::extensions.geography)
on conflict (profile_id) do update set home_point = excluded.home_point;

insert into public.profile_sports (profile_id, sport_id, skill_tier_id)
select p.id, s.id, t.id
from (values ('e2222222-2222-2222-2222-222222222222'::uuid), ('e3333333-3333-3333-3333-333333333333'::uuid)) p(id)
cross join public.sports s
join public.skill_tiers t on t.sport_id = s.id and t.slug = (select slug from public.skill_tiers where sport_id = s.id order by ordinal limit 1)
where s.slug = 'badminton'
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT is(
  public.spot_reach_estimate(
    'e5555555-5555-5555-5555-555555555555',
    (select t.id from public.skill_tiers t join public.sports s on s.id = t.sport_id where s.slug = 'badminton' order by t.ordinal limit 1),
    null
  ),
  5,
  'one nearby player rounds up to the 5 floor, the far one is out of range'
);

SELECT is(
  public.spot_reach_estimate(
    'e5555555-5555-5555-5555-555555555555',
    (select t.id from public.skill_tiers t join public.sports s on s.id = t.sport_id where s.slug = 'badminton' order by t.ordinal desc limit 1),
    null
  ),
  0,
  'nobody at that tier nearby is an honest 0'
);

SELECT is(
  public.spot_reach_estimate('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', null),
  0,
  'unknown venue or tier returns 0, not an error'
);

set local role anon;
SELECT throws_ok(
  $$select public.spot_reach_estimate('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', null)$$,
  '42501',
  null,
  'anon cannot call it'
);

SELECT * FROM finish();
ROLLBACK;
