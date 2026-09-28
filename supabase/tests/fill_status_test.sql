-- fill-the-spot P3: game_fill_status is organizer-only counts; record_game_view dedupes and skips
-- the host. Run: supabase test db
BEGIN;
SELECT plan(5);

set local role postgres;

insert into auth.users (id, email) values
  ('f1111111-1111-1111-1111-111111111111', 'fill-host@test.dev'),
  ('f2222222-2222-2222-2222-222222222222', 'fill-viewer@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('f5555555-5555-5555-5555-555555555555', 'Fill Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select 'f6666666-6666-6666-6666-666666666666', s.id, 'f5555555-5555-5555-5555-555555555555',
  'f1111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours', t.id, 4
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

set local role authenticated;

-- A viewer opens the game twice: one row.
select set_config('request.jwt.claims', json_build_object('sub', 'f2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select public.record_game_view('f6666666-6666-6666-6666-666666666666');
select public.record_game_view('f6666666-6666-6666-6666-666666666666');

-- The host opening their own game is not a view.
select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select public.record_game_view('f6666666-6666-6666-6666-666666666666');

SELECT is((select viewed from public.game_fill_status('f6666666-6666-6666-6666-666666666666')), 1, 'views are deduped per viewer and exclude the host');
SELECT is((select keen from public.game_fill_status('f6666666-6666-6666-6666-666666666666')), 0, 'nobody keen yet');
SELECT is((select filled_seconds from public.game_fill_status('f6666666-6666-6666-6666-666666666666')), null, 'not filled, so no fill time');

-- Anyone else gets no row, so no counts.
select set_config('request.jwt.claims', json_build_object('sub', 'f2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
SELECT is((select count(*)::int from public.game_fill_status('f6666666-6666-6666-6666-666666666666')), 0, 'non-organizers get nothing');

set local role anon;
SELECT throws_ok($$select public.game_fill_status('f6666666-6666-6666-6666-666666666666')$$, '42501', null, 'anon cannot call it');

SELECT * FROM finish();
ROLLBACK;
