-- Chat RPC coverage: can_post_in_chat, set_chat_mode, set_player_chat_mute,
-- set_chat_broadcast_settings, toggle_message_reaction, approve_chat_photo, blocked_between,
-- delete_message, close_chat (supabase/migrations/20260815000700_chat_v2.sql,
-- 20260821000000_chat_redesign.sql, 20260822000000_profile_settings.sql).
-- Run: supabase test db
BEGIN;
SELECT plan(30);

-- Fixture: organizer + 2 approved players + 1 stranger, one venue, one game.
set local role postgres;

insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'organizer@test.dev'),
  ('a2222222-2222-2222-2222-222222222222', 'playera@test.dev'),
  ('a3333333-3333-3333-3333-333333333333', 'playerb@test.dev'),
  ('a4444444-4444-4444-4444-444444444444', 'stranger@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('66666666-6666-6666-6666-666666666666', 'Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select
  '77777777-7777-7777-7777-777777777777',
  s.id,
  '66666666-6666-6666-6666-666666666666',
  'b1111111-1111-1111-1111-111111111111',
  now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 4
from public.sports s
join public.skill_tiers t on t.sport_id = s.id
where s.slug = 'badminton'
limit 1;

insert into public.game_players (game_id, profile_id, status, requested_at, decided_at) values
  ('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222', 'approved', now(), now()),
  ('77777777-7777-7777-7777-777777777777', 'a3333333-3333-3333-3333-333333333333', 'approved', now(), now());

set local role authenticated;

-- --- can_post_in_chat baseline: open mode, nobody muted, chat not closed. -------------------
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'b1111111-1111-1111-1111-111111111111'), true, 'organizer can post by default');
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222'), true, 'approved player can post by default');
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'a4444444-4444-4444-4444-444444444444'), false, 'a non-member cannot post');

-- --- set_chat_mode -----------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.set_chat_mode('77777777-7777-7777-7777-777777777777', 'announce') $$,
  'P0001', 'Only the host can change chat mode',
  'a non-host cannot change chat mode'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select public.set_chat_mode('77777777-7777-7777-7777-777777777777', 'announce');
SELECT is(
  (select chat_mode from public.games where id = '77777777-7777-7777-7777-777777777777'),
  'announce',
  'host switches chat to announce mode'
);
SELECT is(
  (select count(*)::int from public.messages where game_id = '77777777-7777-7777-7777-777777777777' and system_event = 'mode_changed'),
  1,
  'switching mode writes exactly one system message'
);

SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'b1111111-1111-1111-1111-111111111111'), true, 'host can still post in announce mode');
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222'), false, 'a player cannot post in announce mode');

select public.set_chat_mode('77777777-7777-7777-7777-777777777777', 'open');
SELECT is(
  (select chat_mode from public.games where id = '77777777-7777-7777-7777-777777777777'),
  'open',
  'host reverts chat back to open mode'
);

-- --- set_player_chat_mute -----------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.set_player_chat_mute('77777777-7777-7777-7777-777777777777', 'a3333333-3333-3333-3333-333333333333', true) $$,
  'P0001', 'Only the host can mute players',
  'a non-host cannot mute players'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.set_player_chat_mute('77777777-7777-7777-7777-777777777777', 'b1111111-1111-1111-1111-111111111111', true) $$,
  'P0001', 'The host can''t be muted',
  'the host cannot mute themself'
);

select public.set_player_chat_mute('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222', true);
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222'), false, 'a muted player cannot post');

select public.set_player_chat_mute('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222', false);
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222'), true, 'unmuting restores posting');

-- --- set_chat_broadcast_settings (pause) ----------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.set_chat_broadcast_settings('77777777-7777-7777-7777-777777777777', now() + interval '1 hour', true) $$,
  'P0001', 'Only the host can change broadcast settings',
  'a non-host cannot change broadcast settings'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select public.set_chat_broadcast_settings('77777777-7777-7777-7777-777777777777', now() + interval '1 hour', true);
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222'), false, 'a paused chat blocks players from posting');
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'b1111111-1111-1111-1111-111111111111'), true, 'the host can still post while chat is paused');

select public.set_chat_broadcast_settings('77777777-7777-7777-7777-777777777777', null, false);
SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222'), true, 'clearing the pause restores posting');

-- --- toggle_message_reaction -----------------------------------------------------------------
-- Fixture rows inserted as postgres (bypasses the sender_id = auth.uid() insert policy) since
-- these are messages set up for the test, not messages being tested for insert permission.
set local role postgres;
insert into public.messages (id, game_id, sender_id, kind, body) values
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222', 'text', 'hello');
set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.toggle_message_reaction('88888888-8888-8888-8888-888888888888', '💀') $$,
  'P0001', 'Unsupported reaction',
  'an emoji outside the allow-list is rejected'
);

SELECT is(public.toggle_message_reaction('88888888-8888-8888-8888-888888888888', '👍'), true, 'first reaction toggle adds it');
SELECT is(public.toggle_message_reaction('88888888-8888-8888-8888-888888888888', '👍'), false, 'second reaction toggle removes it');

-- --- approve_chat_photo -----------------------------------------------------------------------
set local role postgres;
insert into public.messages (id, game_id, sender_id, kind, body, approval_status) values
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222', 'image', '', 'pending');
set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.approve_chat_photo('99999999-9999-9999-9999-999999999999') $$,
  'P0001', 'Only the host can approve photos',
  'a non-host cannot approve a pending photo'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select public.approve_chat_photo('99999999-9999-9999-9999-999999999999');
SELECT is(
  (select approval_status from public.messages where id = '99999999-9999-9999-9999-999999999999'),
  'approved',
  'host approves a pending photo'
);

-- --- blocked_between ---------------------------------------------------------------------------
SELECT is(public.blocked_between('a2222222-2222-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333'), false, 'unrelated players are not blocked');

select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
insert into public.blocks (blocker_id, blocked_id) values ('a3333333-3333-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222');

SELECT is(public.blocked_between('a3333333-3333-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222'), true, 'blocked_between is true for the blocker->blocked direction');
SELECT is(public.blocked_between('a2222222-2222-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333'), true, 'blocked_between is symmetric (true for the reverse direction too)');

-- --- delete_message ------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.delete_message('88888888-8888-8888-8888-888888888888') $$,
  'P0001', 'Only the sender or the host can delete this message',
  'a non-sender, non-host cannot delete a message'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select public.delete_message('88888888-8888-8888-8888-888888888888');
SELECT isnt(
  (select deleted_at from public.messages where id = '88888888-8888-8888-8888-888888888888'),
  null,
  'the sender can delete their own message'
);

-- --- close_chat ------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ select public.close_chat('77777777-7777-7777-7777-777777777777') $$,
  'P0001', 'Only the host can close the chat',
  'a non-host cannot close the chat'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
select public.close_chat('77777777-7777-7777-7777-777777777777');
select public.close_chat('77777777-7777-7777-7777-777777777777');
SELECT is(
  (select count(*)::int from public.messages where game_id = '77777777-7777-7777-7777-777777777777' and system_event = 'closed'),
  1,
  'closing an already-closed chat is idempotent (one system message, no error)'
);

SELECT is(public.can_post_in_chat('77777777-7777-7777-7777-777777777777', 'b1111111-1111-1111-1111-111111111111'), false, 'a closed chat blocks even the host');

SELECT * FROM finish();
ROLLBACK;
