-- fill-the-spot P4: "Not for me" lowers relevance for that venue, the sweep never double-sends.
-- Run: supabase test db
BEGIN;
SELECT plan(4);

set local role postgres;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'rel-host@test.dev'),
  ('a2222222-2222-2222-2222-222222222222', 'rel-player@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('a5555555-5555-5555-5555-555555555555', 'Relevance Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select 'a6666666-6666-6666-6666-666666666666', s.id, 'a5555555-5555-5555-5555-555555555555',
  'a1111111-1111-1111-1111-111111111111', now() + interval '5 hours', now() + interval '7 hours', t.id, 4
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

create temp table before_score as
  select public.spot_relevance('a2222222-2222-2222-2222-222222222222', 'a6666666-6666-6666-6666-666666666666') as s;

SELECT ok((select s from before_score) > 0.1, 'a neutral candidate clears the first-ping floor');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select public.dismiss_spot('a6666666-6666-6666-6666-666666666666');

set local role postgres;
SELECT is((select count(*)::int from public.spot_dismissals where profile_id = 'a2222222-2222-2222-2222-222222222222'), 1, 'dismiss_spot records the venue and slot pattern');
SELECT ok(
  public.spot_relevance('a2222222-2222-2222-2222-222222222222', 'a6666666-6666-6666-6666-666666666666') < (select s from before_score) - 0.6,
  'same venue and same slot drops the score by 0.7'
);

-- Nobody nearby has a home point, so the sweep finds no one and writes nothing.
select public.fire_spot_open_sweep('a6666666-6666-6666-6666-666666666666');
SELECT is((select count(*)::int from public.spot_openings where game_id = 'a6666666-6666-6666-6666-666666666666'), 0, 'sweep with no recipients writes no spot_openings row');

SELECT * FROM finish();
ROLLBACK;
