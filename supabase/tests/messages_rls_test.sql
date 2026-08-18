-- RLS + can_post_in_chat coverage for public.messages (supabase/migrations/20260808000100_messages.sql,
-- supabase/migrations/20260815000700_chat_v2.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(19);

-- Fixture: organizer, an approved member (positive control), a requester, a stranger, a
-- removed player, a left player, and a dedicated mutedMember (kept separate from the
-- positive-control member so the mute test doesn't clobber an earlier assertion).
set local role postgres;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'organizer@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'member@test.dev'),
  ('33333333-3333-3333-3333-333333333333', 'requester@test.dev'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@test.dev'),
  ('55555555-5555-5555-5555-555555555555', 'removed@test.dev'),
  ('66666666-6666-6666-6666-666666666666', 'left@test.dev'),
  ('77777777-7777-7777-7777-777777777777', 'muted@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('88888888-8888-8888-8888-888888888888', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select
  '99999999-9999-9999-9999-999999999999',
  s.id, '88888888-8888-8888-8888-888888888888',
  '11111111-1111-1111-1111-111111111111',
  now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8
from public.sports s
join public.skill_tiers t on t.sport_id = s.id
where s.slug = 'badminton'
limit 1;

insert into public.game_players (game_id, profile_id, status) values
  ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'approved'),
  ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', 'requested'),
  ('99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555', 'approved'),
  ('99999999-9999-9999-9999-999999999999', '66666666-6666-6666-6666-666666666666', 'approved'),
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', 'approved');

-- Transition the removed/left players now, while still postgres (game_players has no client
-- update policy — see game_players_rls_test.sql).
update public.game_players set status = 'removed'
  where game_id = '99999999-9999-9999-9999-999999999999' and profile_id = '55555555-5555-5555-5555-555555555555';

update public.game_players set status = 'left'
  where game_id = '99999999-9999-9999-9999-999999999999' and profile_id = '66666666-6666-6666-6666-666666666666';

-- ---------------------------------------------------------------------------------------
-- 1. Stranger: never requested to join.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
set local role authenticated;

SELECT is(
  (select count(*)::int from public.messages where game_id = '99999999-9999-9999-9999-999999999999'),
  0,
  'a stranger sees zero messages'
);

SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444') $$,
  '42501',
  null,
  'a stranger cannot post'
);

-- ---------------------------------------------------------------------------------------
-- 2. Requested but not yet approved.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333') $$,
  '42501',
  null,
  'a requested-but-not-approved player cannot post'
);

-- ---------------------------------------------------------------------------------------
-- 3. Removed player: was approved, host removed them.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.messages where game_id = '99999999-9999-9999-9999-999999999999'),
  0,
  'a removed player sees zero messages (system rows from other flows don''t exist yet in this fixture)'
);

SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '55555555-5555-5555-5555-555555555555') $$,
  '42501',
  null,
  'a removed player cannot post'
);

-- ---------------------------------------------------------------------------------------
-- 4. Left player: left voluntarily.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

SELECT is(
  (select count(*)::int from public.messages where game_id = '99999999-9999-9999-9999-999999999999'),
  0,
  'a left player sees zero messages'
);

SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '66666666-6666-6666-6666-666666666666') $$,
  '42501',
  null,
  'a left player cannot post'
);

-- ---------------------------------------------------------------------------------------
-- 5. Positive control: approved, default open mode, unmuted, chat open — must succeed.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

SELECT lives_ok(
  $$ insert into public.messages (game_id, sender_id, body) values ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'hello') $$,
  'an approved player can post in default open mode, unmuted, chat open'
);

-- ---------------------------------------------------------------------------------------
-- 6. Announce mode: only the host can post.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT lives_ok(
  $$ select public.set_chat_mode('99999999-9999-9999-9999-999999999999', 'announce') $$,
  'the organizer can turn on announce mode'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'an approved non-host player cannot post while chat_mode is announce'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT lives_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111') $$,
  'the host can post even while chat_mode is announce (host outranks announce mode)'
);

SELECT lives_ok(
  $$ select public.set_chat_mode('99999999-9999-9999-9999-999999999999', 'open') $$,
  'the organizer can turn announce mode back off'
);

-- ---------------------------------------------------------------------------------------
-- 7 & 8. Mute: blocks the muted player, is irrelevant to the host, and the host can''t be
-- muted at all.
-- ---------------------------------------------------------------------------------------
SELECT lives_ok(
  $$ select public.set_player_chat_mute('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', true) $$,
  'the organizer can mute an approved player'
);

select set_config('request.jwt.claims', json_build_object('sub', '77777777-7777-7777-7777-777777777777', 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777') $$,
  '42501',
  null,
  'a muted player cannot post'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$ select public.set_player_chat_mute('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', true) $$,
  'The host can''t be muted',
  'set_player_chat_mute refuses to mute the organizer'
);

-- ---------------------------------------------------------------------------------------
-- Only the organizer can call the host RPCs.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$ select public.set_chat_mode('99999999-9999-9999-9999-999999999999', 'announce') $$,
  'Only the host can change chat mode',
  'a non-organizer approved member cannot change chat mode'
);

-- ---------------------------------------------------------------------------------------
-- 9. Closed chat blocks everyone, including the host.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT lives_ok(
  $$ select public.close_chat('99999999-9999-9999-9999-999999999999') $$,
  'the organizer can close the chat'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'an approved player cannot post once chat is closed'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'even the host cannot post once chat is closed'
);

SELECT * FROM finish();
ROLLBACK;
