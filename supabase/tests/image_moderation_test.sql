-- image-moderation-plan.md: the SQL half of I1-I3 plus avatar moderation
-- (20260925000000_image_moderation_core.sql, 20260925000100_post_media.sql,
-- 20260925000200_avatar_moderation.sql). ai-proxy itself isn't reachable from here and the
-- 'ai_proxy_service_key' Vault secret doesn't exist in a fresh db, so classify_images() takes its
-- unconfigured path: that's the IM2 "only the text posts" branch, which is the one worth pinning.
-- Verdict-dependent rows (visible/review/rejected) are inserted as postgres to test what reads them.
-- Run: supabase test db
BEGIN;
SELECT plan(35);

set local role postgres;

-- Nothing in this file should reach a real classifier.
delete from vault.secrets where name = 'ai_proxy_service_key';

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'author@test.dev'),
  ('a2222222-2222-2222-2222-222222222222', 'reader@test.dev'),
  ('a3333333-3333-3333-3333-333333333333', 'blocked@test.dev');

-- Storage rows only (no blobs): enough for the existence checks and the policies.
insert into storage.objects (bucket_id, name) values
  ('post-media', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-000000000001.jpg'),
  ('post-media', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-000000000002.jpg'),
  ('post-media', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.jpg'),
  ('post-media', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000b.jpg'),
  ('post-media', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000c.jpg'),
  ('avatars', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-0000000000a1.jpg');

-- ---------------------------------------------------------------------------------------------
-- 1. create_post with photos, classifier unconfigured: IM2, text posts, photos dropped, trail left.
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

create temp table t_result on commit drop as
select public.create_post(
  'question', 'Best grip for a beginner?', null, null, null, null,
  array[
    'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-000000000001.jpg',
    'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-000000000002.jpg'
  ]
) as r;

SELECT is((select (r->>'photos_dropped')::int from t_result), 2, 'IM2: an unreachable classifier drops every photo');
SELECT ok((select exists (select 1 from public.posts where id = (select (r->>'post_id')::uuid from t_result))), 'IM2: the text still posts');

set local role postgres;
SELECT is(
  (select count(*)::int from public.post_media where post_id = (select (r->>'post_id')::uuid from t_result)),
  0,
  'IM2: no post_media rows for dropped photos'
);
SELECT is(
  (select count(*)::int from public.moderation_flags where reason = 'classify_unconfigured' and subject_type = 'post_media'),
  2,
  'IM2: one flag row per dropped photo'
);

-- ---------------------------------------------------------------------------------------------
-- 2. create_post path checks.
-- ---------------------------------------------------------------------------------------------
set local role authenticated;

SELECT throws_ok(
  $$ select public.create_post('question', 'x', null, null, null, null, array[
       'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-000000000001.jpg',
       'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-000000000002.jpg',
       'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.jpg',
       'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000b.jpg',
       'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000c.jpg']) $$,
  'P0001', 'You can add up to 4 photos to a post.', 'a fifth photo is refused'
);

SELECT throws_ok(
  $$ select public.create_post('question', 'x', null, null, null, null, array['a2222222-2222-2222-2222-222222222222/00000000-0000-0000-0000-000000000001.jpg']) $$,
  'P0001', 'That photo can''t be attached.', 'someone else''s path is refused'
);

SELECT throws_ok(
  $$ select public.create_post('question', 'x', null, null, null, null, array['a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-0000000000ff.jpg']) $$,
  'P0001', 'One of your photos didn''t finish uploading, give it another go.', 'a path with no object is refused'
);

SELECT throws_ok(
  $$ select public.create_post('question', 'x', null, null, null, null, array[
       'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.jpg',
       'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.jpg']) $$,
  'P0001', 'That photo can''t be attached.', 'the same path twice is refused'
);

-- ---------------------------------------------------------------------------------------------
-- 3. post_media reads: visible for everyone, review for the author, rejected row (not image)
-- for the author only, nothing for a blocked reader.
-- ---------------------------------------------------------------------------------------------
set local role postgres;

insert into public.posts (id, author_id, kind, body) values
  ('b0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'question', 'with photos');

insert into public.post_media (id, post_id, author_id, storage_path, ordinal, media_status) values
  ('c0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.jpg', 0, 'visible'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000b.jpg', 1, 'review'),
  ('c0000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000c.jpg', 2, 'rejected');

insert into public.blocks (blocker_id, blocked_id) values ('a1111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333');

set local role authenticated;
SELECT is((select count(*)::int from public.post_media where post_id = 'b0000000-0000-0000-0000-000000000001'), 3, 'the author sees every row on their post');
SELECT ok(public.can_read_post_media('a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000b.jpg'), 'the author can open their own review photo');
SELECT ok(not public.can_read_post_media('a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000c.jpg'), 'nobody opens a rejected photo, author included');

SELECT throws_ok(
  $$ select public.create_post('question', 'x', null, null, null, null, array['a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.jpg']) $$,
  'P0001', 'That photo can''t be attached.', 'an already-attached photo can''t be reused'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
SELECT is((select count(*)::int from public.post_media where post_id = 'b0000000-0000-0000-0000-000000000001'), 1, 'another reader sees only the visible photo');
SELECT ok(public.can_read_post_media('a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000a.jpg'), 'another reader can open the visible photo');
SELECT ok(not public.can_read_post_media('a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000b.jpg'), 'another reader can''t open a review photo');
SELECT ok(not public.can_read_post_media('a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-000000000001.jpg'), 'another reader can''t open an unattached upload');

SELECT throws_ok(
  $$ insert into public.post_media (post_id, author_id, storage_path, media_status) values
       ('b0000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'x/y.jpg', 'visible') $$,
  '42501', null, 'clients can''t write post_media'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
SELECT is((select count(*)::int from public.post_media where post_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'a blocked reader sees none of it');

-- ---------------------------------------------------------------------------------------------
-- 4. Chat photos: status is server-owned, removed hides from everyone but the sender, and the
-- daily limit refuses the send.
-- ---------------------------------------------------------------------------------------------
set local role postgres;

insert into public.venues (id, name, suburb, state, location) values
  ('d0000000-0000-0000-0000-000000000001', 'Moderation Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select 'e0000000-0000-0000-0000-000000000001', s.id, 'd0000000-0000-0000-0000-000000000001',
       'a1111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours', t.id, 8
from public.sports s join public.skill_tiers t on t.sport_id = s.id
where s.slug = 'badminton' limit 1;

insert into public.game_players (game_id, profile_id, status) values
  ('e0000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'approved');

select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.messages (id, game_id, sender_id, kind, body, image_path, moderation_status) values
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'image', '',
   'e0000000-0000-0000-0000-000000000001/a2222222-2222-2222-2222-222222222222/p1.jpg', 'clean');

SELECT is(
  (select moderation_status from public.messages where id = 'f0000000-0000-0000-0000-000000000001'),
  'unchecked',
  'a client can''t send a photo pre-marked clean'
);

set local role postgres;
update public.messages set moderation_status = 'removed' where id = 'f0000000-0000-0000-0000-000000000001';

set local role authenticated;
SELECT is((select count(*)::int from public.messages where id = 'f0000000-0000-0000-0000-000000000001'), 1, 'the sender still sees their removed photo row');

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
SELECT is((select count(*)::int from public.messages where id = 'f0000000-0000-0000-0000-000000000001'), 0, 'the host doesn''t see a removed photo');
SELECT ok(public.chat_media_is_removed('e0000000-0000-0000-0000-000000000001/a2222222-2222-2222-2222-222222222222/p1.jpg'), 'the storage check knows the object is removed');

set local role postgres;
update public.moderation_config set chat_photos_per_day = 1;

select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;
SELECT throws_ok(
  $$ insert into public.messages (game_id, sender_id, kind, body, image_path) values
       ('e0000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'image', '',
        'e0000000-0000-0000-0000-000000000001/a2222222-2222-2222-2222-222222222222/p2.jpg') $$,
  'P0001', 'That''s a lot of photos today, try again tomorrow.', 'the daily chat photo limit refuses the send'
);
SELECT lives_ok(
  $$ insert into public.messages (game_id, sender_id, kind, body) values
       ('e0000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'text', 'still here') $$,
  'text messages don''t count toward the photo limit'
);

-- ---------------------------------------------------------------------------------------------
-- 5. Avatars: photo_path only moves through set_avatar_photo; unconfigured = unavailable.
-- ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT throws_ok(
  $$ update public.profiles set photo_path = 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-0000000000a1.jpg'
     where id = 'a1111111-1111-1111-1111-111111111111' $$,
  'P0001', 'Profile photos go through set_avatar_photo', 'a client can''t point photo_path at an object'
);
SELECT lives_ok(
  $$ update public.profiles set photo_path = null where id = 'a1111111-1111-1111-1111-111111111111' $$,
  'a client can still clear photo_path (picking a Smashimal)'
);
SELECT is(
  public.set_avatar_photo('a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-0000000000a1.jpg')->>'status',
  'unavailable',
  'an unreachable classifier leaves the avatar unchanged'
);
SELECT throws_ok(
  $$ select public.set_avatar_photo('a2222222-2222-2222-2222-222222222222/00000000-0000-0000-0000-0000000000a1.jpg') $$,
  'P0001', 'That photo can''t be used.', 'set_avatar_photo refuses someone else''s path'
);
SELECT ok(
  (select photo_path is null from public.profiles where id = 'a1111111-1111-1111-1111-111111111111'),
  'photo_path is untouched after an unavailable check'
);

-- ---------------------------------------------------------------------------------------------
-- 6. resolve_media_flag: service role only, flips the subject, closes the flag.
-- ---------------------------------------------------------------------------------------------
SELECT throws_ok(
  $$ select public.resolve_media_flag(gen_random_uuid(), 'approve') $$,
  '42501', null, 'authenticated can''t resolve flags'
);

set local role postgres;
insert into public.moderation_flags (id, author_id, reason, subject_type, subject_id, storage_bucket, storage_path) values
  ('90000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'classifier_low_confidence', 'post_media',
   'c0000000-0000-0000-0000-00000000000b', 'post-media', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-00000000000b.jpg'),
  ('90000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'classifier_low_confidence', 'avatar',
   'a1111111-1111-1111-1111-111111111111', 'avatars', 'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-0000000000a1.jpg');

select public.resolve_media_flag('90000000-0000-0000-0000-000000000001', 'approve');
SELECT is((select media_status from public.post_media where id = 'c0000000-0000-0000-0000-00000000000b'), 'visible', 'approve makes a review photo visible');
SELECT is((select status from public.moderation_flags where id = '90000000-0000-0000-0000-000000000001'), 'dismissed', 'approve closes the flag');

select public.resolve_media_flag('90000000-0000-0000-0000-000000000002', 'approve');
SELECT is(
  (select photo_path from public.profiles where id = 'a1111111-1111-1111-1111-111111111111'),
  'a1111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-0000000000a1.jpg',
  'approving a held avatar makes it live'
);

-- ---------------------------------------------------------------------------------------------
-- 7. Orphan sweep: a flagged unattached upload is kept for the trail, a plain abandoned one goes.
-- ---------------------------------------------------------------------------------------------
update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'post-media';

SELECT ok(
  not exists (select 1 from public.media_sweep_candidates(500) where name like '%00000000-0000-0000-0000-000000000001.jpg'),
  'a dropped photo with a fresh flag is kept'
);

delete from public.moderation_flags where storage_path like '%00000000-0000-0000-0000-000000000002.jpg';
SELECT ok(
  exists (select 1 from public.media_sweep_candidates(500) where name like '%00000000-0000-0000-0000-000000000002.jpg'),
  'an abandoned, unflagged upload is swept'
);

SELECT * FROM finish();
ROLLBACK;
