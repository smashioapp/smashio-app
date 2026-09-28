-- Capacity math and waitlist: open_spots (host slot + held spots), request_to_join,
-- decide_join_request, leave/remove promotion, priority waitlist. See docs/post-game-plan.md.
-- Run: supabase test db
begin;
select plan(17);

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
-- auto_approve defaults false: this file is exercising the manual decide_join_request flow, which
-- fill-the-spot-ultraplan P0 (20260928000000_fill_the_spot_p0.sql) now bypasses when true (the
-- default on public.games itself) and there's an open spot.
create function pg_temp.mk_game(n int, org int, max_players int default 4, reserved int default 0,
                                vis text default 'public', venue int default 1, game_status text default 'published',
                                auto_approve boolean default false)
returns uuid language plpgsql as $$
begin
  insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id,
                            max_players, reserved_spots, visibility, status, auto_approve)
  select pg_temp.gid(n), s.id, format('55555555-0000-0000-0000-%s', lpad(venue::text, 12, '0'))::uuid, pg_temp.uid(org),
         now() + interval '2 days', now() + interval '2 days 90 minutes', t.id, max_players, reserved, vis, game_status, auto_approve
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
-- u1 hosts. Game 1: max 4 with 1 held spot => host + 1 held + 2 open. Game 2: max 2, nothing held.
select pg_temp.mk_game(1, 1, 4, 1);
select pg_temp.mk_game(2, 1, 2, 0);

select is(public.open_spots(pg_temp.gid(1)), 2, 'open_spots = max - host - held spots');
select is(public.open_spots(pg_temp.gid(2)), 1, 'a 2-player game with nothing held has one open spot (the host takes one)');
select throws_ok(
  $$ select pg_temp.mk_game(3, 1, 3, 3) $$,
  '23514', null, 'reserved_spots cannot exceed max_players - 1'
);

-- A pending request takes no capacity.
insert into public.game_players (game_id, profile_id, status) values (pg_temp.gid(1), pg_temp.uid(2), 'requested');
select is(public.approved_player_count(pg_temp.gid(1)), 0, 'requested players are not counted as approved');
select is(public.open_spots(pg_temp.gid(1)), 2, 'a pending request does not use up a spot');

-- u3 requests through the RPC while a spot is open: lands as requested, not waitlisted.
select pg_temp.login(3);
select public.request_to_join(pg_temp.gid(1));
select pg_temp.su();
select is(pg_temp.st(1, 3), 'requested', 'request_to_join with a spot open gives a requested row');

-- Host approves u3 and u2. Host + 1 held + 2 players = 4, full.
select pg_temp.login(1);
select public.decide_join_request(pg_temp.gid(1), pg_temp.uid(3), true);
select public.decide_join_request(pg_temp.gid(1), pg_temp.uid(2), true);
select pg_temp.su();
select is(public.open_spots(pg_temp.gid(1)), 0, 'two approvals fill host + held spot + 2 players');

-- Full game: new requests waitlist, approvals are refused.
insert into public.game_players (game_id, profile_id, status) values (pg_temp.gid(1), pg_temp.uid(6), 'requested');
select pg_temp.login(4);
select public.request_to_join(pg_temp.gid(1));
select pg_temp.login(1);
select throws_ok(
  format('select public.decide_join_request(%L, %L, true)', pg_temp.gid(1), pg_temp.uid(6)),
  'P0001', 'Game is full', 'the host cannot approve past capacity'
);
select pg_temp.su();
select is(pg_temp.st(1, 4), 'waitlisted', 'request_to_join on a full game waitlists the player');
select is(pg_temp.st(1, 6), 'requested', 'the refused approval left the request untouched');

-- u5 joins the waitlist later but holds a priority credit, so is promoted ahead of u4.
insert into public.game_players (game_id, profile_id, status, requested_at, priority_waitlist)
values (pg_temp.gid(1), pg_temp.uid(5), 'waitlisted', now() + interval '1 minute', true);

select pg_temp.login(3);
select public.leave_game(pg_temp.gid(1));
select pg_temp.su();
select is(pg_temp.st(1, 3), 'left', 'leave_game marks the player left');
select is(pg_temp.st(1, 5), 'approved', 'a leave promotes the priority waitlister first');
select is(pg_temp.st(1, 4), 'waitlisted', 'the non-priority waitlister stays waitlisted');

-- Host removes an approved player: the next waitlister (u4) is promoted into the freed spot.
select pg_temp.login(1);
select public.remove_player(pg_temp.gid(1), pg_temp.uid(2));
select pg_temp.su();
select is(pg_temp.st(1, 4), 'approved', 'removing a player promotes the next waitlister');

-- Re-requesting: an approved player changes nothing; a leaver on a full game is waitlisted.
select pg_temp.login(5);
select public.request_to_join(pg_temp.gid(1));
select pg_temp.login(3);
select public.request_to_join(pg_temp.gid(1));
select pg_temp.su();
select is(pg_temp.st(1, 5), 'approved', 'request_to_join on an approved row is a no-op');
select is(pg_temp.st(1, 3), 'waitlisted', 'a player who left and re-requests a full game is waitlisted');

-- Editing max_players below what is already committed is refused (edit rules trigger).
select throws_like(
  format('update public.games set max_players = 3 where id = %L', pg_temp.gid(1)),
  '%set max players below%', 'max_players cannot be edited below the committed roster'
);

select * from finish();
rollback;
