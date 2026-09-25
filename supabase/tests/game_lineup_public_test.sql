-- game_lineup_public (20260925100100, short-a-player-ux-plan.md D-U2): signed-in only, never anon
-- (website-plan §5.4 keeps player identities off anonymous surfaces), and it hides a
-- players_only profile from a stranger while still showing an 'everyone' one.
-- Run: supabase test db
BEGIN;
SELECT plan(5);

SELECT ok(
  not has_function_privilege('anon', 'public.game_lineup_public(uuid)', 'execute'),
  'anon cannot execute game_lineup_public'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.game_lineup_public(uuid)', 'execute'),
  'authenticated can execute game_lineup_public'
);

set local role postgres;

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'lineup-host@test.dev'),
  ('e2222222-2222-2222-2222-222222222222', 'lineup-open@test.dev'),
  ('e3333333-3333-3333-3333-333333333333', 'lineup-private@test.dev'),
  ('e4444444-4444-4444-4444-444444444444', 'lineup-viewer@test.dev');

update public.profiles set display_name = 'Olive Open', profile_visibility = 'everyone' where id = 'e2222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'Pat Private', profile_visibility = 'players_only' where id = 'e3333333-3333-3333-3333-333333333333';

insert into public.games (id, sport_id, venue_id, skill_tier_id, organizer_id, starts_at, ends_at, duration_minutes, courts_booked, max_players, cost_per_player_cents, status)
select
  'e5555555-5555-5555-5555-555555555555',
  s.id,
  (select id from public.venues limit 1),
  (select st.id from public.skill_tiers st where st.sport_id = s.id order by st.ordinal limit 1),
  'e1111111-1111-1111-1111-111111111111',
  now() + interval '1 day', now() + interval '1 day 2 hours', 120, 1, 4, 1000, 'published'
from public.sports s where s.slug = 'badminton';

insert into public.game_players (game_id, profile_id, status) values
  ('e5555555-5555-5555-5555-555555555555', 'e2222222-2222-2222-2222-222222222222', 'approved'),
  ('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333', 'approved');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'e4444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.game_lineup_public('e5555555-5555-5555-5555-555555555555')),
  1,
  'a stranger sees the everyone-visible player only'
);
SELECT is(
  (select first_name from public.game_lineup_public('e5555555-5555-5555-5555-555555555555') limit 1),
  'Olive',
  'first name only'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
SELECT is(
  (select count(*)::int from public.game_lineup_public('e5555555-5555-5555-5555-555555555555')),
  2,
  'the host sees everyone on their own game'
);

SELECT * FROM finish();
ROLLBACK;
