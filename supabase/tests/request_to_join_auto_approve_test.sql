-- fill-the-spot-ultraplan.md P0.1 (F1): request_to_join enforces auto_approve instead of always
-- landing on 'requested'. Covers both games.auto_approve = true (default) and = false, the
-- reopen-after-rejection path, and the host notification (supabase/migrations/20260928000000_fill_the_spot_p0.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(10);

set local role postgres;

insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111', 'auto-organizer@test.dev'),
  ('d2222222-2222-2222-2222-222222222222', 'auto-playera@test.dev'),
  ('d3333333-3333-3333-3333-333333333333', 'manual-playerb@test.dev'),
  ('d4444444-4444-4444-4444-444444444444', 'auto-playerc@test.dev'),
  ('d9999999-9999-9999-9999-999999999999', 'auto-playerd@test.dev'),
  ('d8888888-8888-8888-8888-888888888888', 'auto-playere@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('d5555555-5555-5555-5555-555555555555', 'Auto Approve Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

-- Game A: auto_approve = true (the default), 4 max players, host + 3 open spots.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, auto_approve)
select 'd6666666-6666-6666-6666-666666666666', s.id, 'd5555555-5555-5555-5555-555555555555',
  'd1111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 4, true
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

-- Game B: auto_approve = false, same shape.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, auto_approve)
select 'd7777777-7777-7777-7777-777777777777', s.id, 'd5555555-5555-5555-5555-555555555555',
  'd1111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 4, false
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

set local role authenticated;

-- 1. auto_approve = true and a spot open: lands straight on 'approved'.
select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select public.request_to_join('d6666666-6666-6666-6666-666666666666');

SELECT is(
  (select status from public.game_players where game_id = 'd6666666-6666-6666-6666-666666666666' and profile_id = 'd2222222-2222-2222-2222-222222222222'),
  'approved',
  'auto_approve games land the join straight on approved'
);

SELECT is(
  (select decided_at is not null from public.game_players where game_id = 'd6666666-6666-6666-6666-666666666666' and profile_id = 'd2222222-2222-2222-2222-222222222222'),
  true,
  'an auto-approved row is stamped decided_at, same as a manual approval'
);

-- 2. The host gets told, unprompted (F1: previously silent).
set local role postgres;
SELECT is(
  (select count(*)::int from public.notifications
   where game_id = 'd6666666-6666-6666-6666-666666666666' and type = 'player_joined' and profile_id = 'd1111111-1111-1111-1111-111111111111'),
  1,
  'the host is notified when a player auto-joins, since there is nothing left for them to approve'
);

-- 3. A chat "joined" system message posts for the auto-approved join, same as a manual one would.
SELECT is(
  (select count(*)::int from public.messages
   where game_id = 'd6666666-6666-6666-6666-666666666666' and system_event = 'joined' and sender_id = 'd2222222-2222-2222-2222-222222222222'),
  1,
  'an auto-approved join still posts the chat "joined" system message'
);

-- 4. Reopen path: leaving and rejoining the same auto-approve game lands on approved again, not
-- 'requested' (the UPDATE/on-conflict branch, not just the INSERT branch).
set local role authenticated;
select public.leave_game('d6666666-6666-6666-6666-666666666666');
select public.request_to_join('d6666666-6666-6666-6666-666666666666');

SELECT is(
  (select status from public.game_players where game_id = 'd6666666-6666-6666-6666-666666666666' and profile_id = 'd2222222-2222-2222-2222-222222222222'),
  'approved',
  'rejoining an auto-approve game after leaving also lands straight on approved (reopen path)'
);

set local role postgres;
SELECT is(
  (select count(*)::int from public.notifications
   where game_id = 'd6666666-6666-6666-6666-666666666666' and type = 'player_joined' and profile_id = 'd1111111-1111-1111-1111-111111111111'),
  2,
  'the reopen path notifies the host again, same as the first auto-approve join'
);

-- 5. auto_approve = false: unaffected, still lands on 'requested' and needs a decision.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
select public.request_to_join('d7777777-7777-7777-7777-777777777777');

SELECT is(
  (select status from public.game_players where game_id = 'd7777777-7777-7777-7777-777777777777' and profile_id = 'd3333333-3333-3333-3333-333333333333'),
  'requested',
  'a host who turned auto_approve off still gets a plain request'
);

set local role postgres;
SELECT is(
  (select count(*)::int from public.notifications
   where game_id = 'd7777777-7777-7777-7777-777777777777' and type = 'player_joined'),
  0,
  'no player_joined notification fires for a request that still needs a decision'
);

-- 6. Waitlist path is untouched by auto_approve: fill the 4-max game (host + d2222222 approved so
-- far, 2 spots left), two more auto-joins take the last two spots, and the join after that
-- waitlists despite auto_approve being on.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'd4444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
select public.request_to_join('d6666666-6666-6666-6666-666666666666');

SELECT is(
  (select status from public.game_players where game_id = 'd6666666-6666-6666-6666-666666666666' and profile_id = 'd4444444-4444-4444-4444-444444444444'),
  'approved',
  'the join that takes a still-open spot still auto-approves'
);

select set_config('request.jwt.claims', json_build_object('sub', 'd9999999-9999-9999-9999-999999999999', 'role', 'authenticated')::text, true);
select public.request_to_join('d6666666-6666-6666-6666-666666666666');

select set_config('request.jwt.claims', json_build_object('sub', 'd8888888-8888-8888-8888-888888888888', 'role', 'authenticated')::text, true);
select public.request_to_join('d6666666-6666-6666-6666-666666666666');

SELECT is(
  (select status from public.game_players where game_id = 'd6666666-6666-6666-6666-666666666666' and profile_id = 'd8888888-8888-8888-8888-888888888888'),
  'waitlisted',
  'auto_approve never overrides capacity — a full auto-approve game still waitlists'
);

SELECT * FROM finish();
ROLLBACK;
