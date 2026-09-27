-- Who can see which game: games RLS (public vs link_only), nearby_games / nearby_games_public
-- filters (radius, status, visibility, spots, blocks, "mine"), game_preview, plus ratings and
-- blocks RLS. See supabase/migrations/20260910000000_link_only_visibility.sql.
-- Run: supabase test db
begin;
select plan(21);

-- Helpers, duplicated per file on purpose: each pgTAP file is its own rolled-back transaction.
-- Users: aaaaaaaa-0000-0000-0000-0000000000NN (mk_user)   Games: bbbbbbbb-0000-0000-0000-0000000000NN (mk_game)
create function pg_temp.uid(n int) returns uuid language sql as $$
  select format('aaaaaaaa-0000-0000-0000-%s', lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.gid(n int) returns uuid language sql as $$
  select format('bbbbbbbb-0000-0000-0000-%s', lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.mk_user(n int) returns uuid language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', pg_temp.uid(n), 'authenticated', 'authenticated',
          'pgtap' || n || '@smashio.test', '{}', '{}', now(), now());
  return pg_temp.uid(n);
end $$;

-- Organizer u<org>. max_players includes the host. reserved = held spots. venue 1 = NBC Homebush.
create function pg_temp.mk_game(n int, org int, max_players int default 4, reserved int default 0,
                                vis text default 'public', venue int default 1, game_status text default 'published')
returns uuid language plpgsql as $$
begin
  insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id,
                            max_players, reserved_spots, visibility, status)
  select pg_temp.gid(n), s.id, format('55555555-0000-0000-0000-%s', lpad(venue::text, 12, '0'))::uuid, pg_temp.uid(org),
         now() + interval '2 days', now() + interval '2 days 90 minutes', t.id, max_players, reserved, vis, game_status
  from public.sports s join public.skill_tiers t on t.sport_id = s.id and t.slug = 'beginner'
  where s.slug = 'badminton';
  return pg_temp.gid(n);
end $$;

-- Act as a signed-in user (RLS applies) / as anon / back to postgres (bypasses RLS, for setup and asserts).
-- Callable from any role, so tests just chain them.
create function pg_temp.login(n int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function pg_temp.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end $$;
create function pg_temp.su() returns void language plpgsql as $$ begin reset role; end $$;
create function pg_temp.st(g int, u int) returns text language sql as $$
  select status from public.game_players where game_id = pg_temp.gid(g) and profile_id = pg_temp.uid(u) $$;
grant execute on function pg_temp.uid(int), pg_temp.gid(int), pg_temp.login(int), pg_temp.anon(), pg_temp.su(), pg_temp.st(int, int) to public;

select pg_temp.mk_user(n) from generate_series(1, 6) n;
select pg_temp.mk_game(1, 1, 4);                              -- public, near, spots
select pg_temp.mk_game(2, 1, 4, 0, 'link_only');              -- reachable by link only
select pg_temp.mk_game(3, 1, 4, 0, 'public', 1, 'cancelled'); -- cancelled
select pg_temp.mk_game(4, 1, 4, 0, 'public', 4);              -- far away (Hurstville)
select pg_temp.mk_game(5, 1, 2);                              -- public, full once u2 is approved
select pg_temp.mk_game(6, 3, 4);                              -- public, hosted by u3
insert into public.game_players (game_id, profile_id, status, decided_at) values
  (pg_temp.gid(2), pg_temp.uid(2), 'approved', now()),
  (pg_temp.gid(5), pg_temp.uid(2), 'approved', now());

-- Only this test's games (the seed already has games around NBC Homebush), 2km around the venue.
create function pg_temp.near(spots_only boolean default false, exclude_mine boolean default true)
returns uuid[] language sql as $$
  select coalesce(array_agg(id order by id), '{}')
  from public.nearby_games(-33.8474, 151.0678, 2000, 'badminton', has_spots_only => spots_only, p_exclude_mine => exclude_mine)
  where id = any(array[pg_temp.gid(1), pg_temp.gid(2), pg_temp.gid(3), pg_temp.gid(4), pg_temp.gid(5), pg_temp.gid(6)]) $$;
create function pg_temp.near_public() returns uuid[] language sql as $$
  select coalesce(array_agg(id order by id), '{}')
  from public.nearby_games_public(-33.8474, 151.0678, 2000, 'badminton')
  where id = any(array[pg_temp.gid(1), pg_temp.gid(2), pg_temp.gid(3), pg_temp.gid(4), pg_temp.gid(5), pg_temp.gid(6)]) $$;
grant execute on function pg_temp.near(boolean, boolean), pg_temp.near_public() to public;

-- ---------------------------------------------------------------------------------------------
-- games RLS
select pg_temp.login(5);
select is((select count(*)::int from public.games where id = pg_temp.gid(1)), 1, 'a stranger can read a public game');
select is((select count(*)::int from public.games where id = pg_temp.gid(2)), 0, 'a stranger cannot read a link_only game');
select pg_temp.login(2);
select is((select count(*)::int from public.games where id = pg_temp.gid(2)), 1, 'an approved player can read a link_only game');
select pg_temp.login(1);
select is((select count(*)::int from public.games where id = pg_temp.gid(2)), 1, 'the host can read their link_only game');
select pg_temp.anon();
select throws_ok('select count(*) from public.games', '42501', null, 'anon has no direct read on games');

-- ---------------------------------------------------------------------------------------------
-- nearby_games (signed in). A stranger gets 1, 5, 6: never 2 (link_only), 3 (cancelled), 4 (out of radius).
select pg_temp.login(4);
select is(pg_temp.near(), array[pg_temp.gid(1), pg_temp.gid(5), pg_temp.gid(6)],
  'nearby_games lists public published in-radius games, not link_only, cancelled or far ones');
select is(pg_temp.near(spots_only => true), array[pg_temp.gid(1), pg_temp.gid(6)],
  'has_spots_only drops the full game (host + approved player at max 2)');

select pg_temp.login(1);
select is(pg_temp.near(), array[pg_temp.gid(6)], 'the host does not see their own games by default');
select is(pg_temp.near(exclude_mine => false), array[pg_temp.gid(1), pg_temp.gid(5), pg_temp.gid(6)],
  'p_exclude_mine = false brings their public games back, link_only still unlisted');
select pg_temp.login(2);
select is(pg_temp.near(), array[pg_temp.gid(1), pg_temp.gid(6)], 'games the caller is already approved in are excluded');

-- A block hides the blocked host's games from the blocker.
select pg_temp.su();
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid(4), pg_temp.uid(3));
select pg_temp.login(4);
select is(pg_temp.near(), array[pg_temp.gid(1), pg_temp.gid(5)], 'a blocked host''s games disappear from Discover');
select pg_temp.login(3);
select is(pg_temp.near(exclude_mine => false), array[pg_temp.gid(1), pg_temp.gid(5), pg_temp.gid(6)],
  'the blocked host still sees their own game with p_exclude_mine = false');

select pg_temp.anon();
select throws_ok('select * from public.nearby_games(-33.8474, 151.0678, 2000, ''badminton'')', '42501', null,
  'anon cannot call nearby_games (games_public is signed-in only)');

-- ---------------------------------------------------------------------------------------------
-- nearby_games_public (logged-out Discover) and game_preview (share links)
select is(pg_temp.near_public(), array[pg_temp.gid(1), pg_temp.gid(5), pg_temp.gid(6)],
  'nearby_games_public applies the same visibility filters for anon');
select is(position('organizer_id' in pg_get_function_result('public.nearby_games_public'::regproc)), 0,
  'nearby_games_public never exposes organizer identity');
select is((select count(*)::int from public.game_preview(pg_temp.gid(2))), 1,
  'game_preview resolves a link_only game for anon (that is what the share link is for)');
select is((select open_spots from public.game_preview(pg_temp.gid(5))), 0, 'game_preview reports open spots (full game = 0)');

-- ---------------------------------------------------------------------------------------------
-- ratings and blocks RLS
select pg_temp.su();
insert into public.ratings (game_id, rater_id, ratee_id, stars, dimension) values
  (pg_temp.gid(1), pg_temp.uid(2), pg_temp.uid(3), 5, 'player'),
  (pg_temp.gid(1), pg_temp.uid(3), pg_temp.uid(2), 4, 'player');
select pg_temp.login(2);
select is((select count(*)::int from public.ratings), 1, 'a rater can only read ratings they gave, never ones about them');
select pg_temp.login(5);
select throws_ok(
  format('insert into public.ratings (game_id, rater_id, ratee_id, stars) values (%L, %L, %L, 5)', pg_temp.gid(1), pg_temp.uid(5), pg_temp.uid(2)),
  '42501', null, 'someone who was not in the game cannot rate its players'
);
select pg_temp.login(4);
select is((select count(*)::int from public.blocks), 1, 'a blocker sees their own block');
select pg_temp.login(3);
select is((select count(*)::int from public.blocks), 0, 'the blocked user cannot see who blocked them');

select * from finish();
rollback;
