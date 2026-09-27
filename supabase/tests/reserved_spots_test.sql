-- Reserved (held) spots: add/remove, invite tokens, claim, RLS, expiry sweep.
-- See docs/post-game-plan.md and supabase/migrations/20260903010000_claim_screen_backend.sql.
-- Run: supabase test db
begin;
select plan(31);

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
select pg_temp.mk_game(1, 1, 4, 0);          -- host u1, 3 open, nothing held
select pg_temp.mk_game(2, 1, 3, 1);          -- host + 1 held + 1 open (used for the full-game claim)
select pg_temp.mk_game(3, 1, 4, 0);          -- cancelled-game claim

-- ---------------------------------------------------------------------------------------------
-- add_reserved_spot
select pg_temp.login(2);
select throws_ok(
  format('select public.add_reserved_spot(%L, ''Sam'')', pg_temp.gid(1)),
  'P0001', 'Only the organizer can manage this game', 'a non-organizer cannot hold a spot'
);

select pg_temp.login(1);
create temp table _spots (n int, id uuid);
grant all on _spots to public;
insert into _spots select 1, public.add_reserved_spot(pg_temp.gid(1), 'Sam');
select pg_temp.su();
select is((select reserved_spots from public.games where id = pg_temp.gid(1)), 1, 'add_reserved_spot raises the held count');
select is(public.open_spots(pg_temp.gid(1)), 2, 'a held spot comes out of open_spots');

-- A named spot cannot outnumber the held count, and the held count cannot drop below named spots.
select throws_like(
  format('insert into public.game_reserved_spots (game_id, label) values (%L, ''Extra'')', pg_temp.gid(1)),
  '%would exceed%', 'named spots cannot exceed the held count'
);
select throws_like(
  format('update public.games set reserved_spots = 0 where id = %L', pg_temp.gid(1)),
  '%Release a named reserved spot first%', 'held count cannot drop below the named spots'
);

-- ---------------------------------------------------------------------------------------------
-- Invite tokens
select pg_temp.login(2);
select throws_ok(
  format('select public.create_reserved_spot_invite(%L)', (select id from _spots where n = 1)),
  'P0001', 'Only the organizer can manage this game', 'a non-organizer cannot mint an invite token'
);

select pg_temp.login(1);
create temp table _tok (n int, tok text);
grant all on _tok to public;
insert into _tok select 1, public.create_reserved_spot_invite((select id from _spots where n = 1));
select pg_temp.su();
select is(length((select tok from _tok where n = 1)), 64, 'invite tokens are 64 hex chars');

select pg_temp.anon();
select is(
  (select count(*)::int from public.preview_reserved_spot_invite((select tok from _tok where n = 1))),
  1, 'anon can preview a live invite by token'
);
select is(
  (select count(*)::int from public.preview_reserved_spot_invite('not-a-real-token')),
  0, 'an unknown token previews nothing'
);

-- ---------------------------------------------------------------------------------------------
-- claim_reserved_spot
select pg_temp.login(1);
select throws_ok(
  format('select public.claim_reserved_spot(%L)', (select tok from _tok where n = 1)),
  'P0001', 'You already have a spot in this game', 'the host cannot claim their own held spot'
);

select pg_temp.login(3);
select is(
  public.claim_reserved_spot((select tok from _tok where n = 1)),
  pg_temp.gid(1), 'claim_reserved_spot returns the game id'
);
select pg_temp.su();
select is(pg_temp.st(1, 3), 'approved', 'claiming a held spot approves the claimer');
select is(public.claimed_reserved_count(pg_temp.gid(1)), 1, 'the held spot now shows as claimed');
select is(public.open_spots(pg_temp.gid(1)), 2, 'claiming converts held to approved, open_spots is unchanged');

select pg_temp.login(4);
select throws_like(
  format('select public.claim_reserved_spot(%L)', (select tok from _tok where n = 1)),
  '%already been used or was cancelled%', 'a token cannot be claimed twice'
);

-- A claimed spot cannot be minted an invite or removed.
select pg_temp.login(1);
select throws_like(
  format('select public.create_reserved_spot_invite(%L)', (select id from _spots where n = 1)),
  '%already taken%', 'a claimed spot cannot get a fresh invite'
);
select throws_like(
  format('select public.remove_reserved_spot(%L)', (select id from _spots where n = 1)),
  '%remove the player from the roster%', 'a claimed spot must be released via the roster'
);

-- Leaving gives the held spot back without changing open_spots.
select pg_temp.login(3);
select public.leave_game(pg_temp.gid(1));
select pg_temp.su();
select is(
  (select claimed_by from public.game_reserved_spots where id = (select id from _spots where n = 1)),
  null, 'a claimer leaving frees the held spot'
);
select is(public.open_spots(pg_temp.gid(1)), 2, 'open_spots is stable across claim, leave');

-- ---------------------------------------------------------------------------------------------
-- Claiming into an otherwise full game never overbooks: game 2 is host + 1 held + 1 open.
insert into public.game_reserved_spots (game_id, label, invite_token, expires_at)
values (pg_temp.gid(2), 'Held', 'tok-game-2', now() + interval '1 day');
insert into public.game_players (game_id, profile_id, status, decided_at) values (pg_temp.gid(2), pg_temp.uid(4), 'approved', now());
select is(public.open_spots(pg_temp.gid(2)), 0, 'game 2 is full apart from the held spot');
select pg_temp.login(5);
select public.claim_reserved_spot('tok-game-2');
select pg_temp.su();
select is(public.approved_player_count(pg_temp.gid(2)), 2, 'the claim used the held spot, roster is host + 2');
select is(public.open_spots(pg_temp.gid(2)), 0, 'a claim into a full game does not go negative');

-- Cancelled games refuse claims.
update public.games set reserved_spots = 1 where id = pg_temp.gid(3);
insert into public.game_reserved_spots (game_id, label, invite_token) values (pg_temp.gid(3), 'Held', 'tok-game-3');
update public.games set status = 'cancelled' where id = pg_temp.gid(3);
select pg_temp.login(6);
select throws_ok(
  $$ select public.claim_reserved_spot('tok-game-3') $$,
  'P0001', 'That game is no longer open', 'a cancelled game cannot be claimed into'
);

-- ---------------------------------------------------------------------------------------------
-- RLS on game_reserved_spots: host and approved players see spots, the invitee sees theirs, strangers nothing.
select pg_temp.su();
select pg_temp.mk_game(4, 1, 6, 2);
insert into public.game_reserved_spots (game_id, label, invited_profile_id) values (pg_temp.gid(4), 'For u6', pg_temp.uid(6));
insert into public.game_reserved_spots (game_id, label) values (pg_temp.gid(4), 'Open hold');
insert into public.game_players (game_id, profile_id, status, decided_at) values (pg_temp.gid(4), pg_temp.uid(2), 'approved', now());

select pg_temp.login(1);
select is((select count(*)::int from public.game_reserved_spots where game_id = pg_temp.gid(4)), 2, 'the host sees every held spot');
select pg_temp.login(2);
select is((select count(*)::int from public.game_reserved_spots where game_id = pg_temp.gid(4)), 2, 'an approved player sees the held spots');
select pg_temp.login(6);
select is((select count(*)::int from public.game_reserved_spots where game_id = pg_temp.gid(4)), 1, 'an invitee sees only their own held spot');
select pg_temp.login(5);
select is((select count(*)::int from public.game_reserved_spots where game_id = pg_temp.gid(4)), 0, 'a stranger sees no held spots');

-- ---------------------------------------------------------------------------------------------
-- Invites respect blocks; remove_reserved_spot kills a pending invite; sweep releases expired holds.
select pg_temp.su();
insert into public.blocks (blocker_id, blocked_id) values (pg_temp.uid(1), pg_temp.uid(5));
select pg_temp.login(1);
select throws_like(
  format('select public.invite_to_reserved_spot(%L, %L)',
         (select id from public.game_reserved_spots where game_id = pg_temp.gid(4) and label = 'Open hold'), pg_temp.uid(5)),
  '%can''t be invited%', 'a blocked player cannot be invited into a held spot'
);

select public.invite_to_reserved_spot(
  (select id from public.game_reserved_spots where game_id = pg_temp.gid(4) and label = 'Open hold'), pg_temp.uid(4));
select public.remove_reserved_spot(
  (select id from public.game_reserved_spots where game_id = pg_temp.gid(4) and label = 'Open hold'));
select pg_temp.su();
select is(pg_temp.st(4, 4), 'declined', 'removing a held spot declines its pending invite');
select is((select reserved_spots from public.games where id = pg_temp.gid(4)), 1, 'removing a held spot lowers the held count');

-- Sweep: an expired unpinned hold is released; a pinned one is kept.
update public.games set reserved_spots = 3 where id = pg_temp.gid(1);
insert into public.game_reserved_spots (game_id, label, expires_at, pinned) values
  (pg_temp.gid(1), 'Expired', now() - interval '1 minute', false),
  (pg_temp.gid(1), 'Pinned', now() - interval '1 minute', true);
select public.sweep_reserved_spot_holds();
select is(
  (select array_agg(label order by label) from public.game_reserved_spots where game_id = pg_temp.gid(1) and claimed_by is null),
  array['Pinned', 'Sam'], 'the sweep releases expired unpinned holds, keeping pinned and not-yet-due ones'
);

select * from finish();
rollback;
