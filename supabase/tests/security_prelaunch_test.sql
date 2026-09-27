-- Pre-launch security review 2026-09-27 (migrations 20260927000000/100/200).
-- Run: supabase test db
BEGIN;
SELECT plan(28);

set local role postgres;

insert into auth.users (id, email) values
  ('c1111111-1111-1111-1111-111111111111', 'host@sec.test'),
  ('c2222222-2222-2222-2222-222222222222', 'player@sec.test'),
  ('c3333333-3333-3333-3333-333333333333', 'stranger@sec.test'),
  ('c4444444-4444-4444-4444-444444444444', 'blocked@sec.test');

insert into public.venues (id, name, suburb, state, location) values
  ('c5555555-5555-5555-5555-555555555555', 'Sec Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players)
select 'c6666666-6666-6666-6666-666666666666', s.id, 'c5555555-5555-5555-5555-555555555555',
  'c1111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours', t.id, 4
from public.sports s join public.skill_tiers t on t.sport_id = s.id
where s.slug = 'badminton' limit 1;

insert into public.game_players (game_id, profile_id, status) values
  ('c6666666-6666-6666-6666-666666666666', 'c2222222-2222-2222-2222-222222222222', 'approved');

insert into public.posts (id, author_id, kind, body, status, point) values
  ('c7777777-7777-7777-7777-777777777777', 'c2222222-2222-2222-2222-222222222222', 'question', 'visible post', 'visible',
   extensions.st_point(151.2, -33.8)::extensions.geography),
  ('c8888888-8888-8888-8888-888888888888', 'c2222222-2222-2222-2222-222222222222', 'question', 'removed post', 'removed', null);

insert into public.blocks (blocker_id, blocked_id) values
  ('c1111111-1111-1111-1111-111111111111', 'c4444444-4444-4444-4444-444444444444');

insert into public.profile_private (profile_id, home_point) values
  ('c2222222-2222-2222-2222-222222222222', extensions.st_point(151.21234, -33.81234)::extensions.geography)
on conflict (profile_id) do update set home_point = excluded.home_point;

-- coarse_point snaps to 2 decimal places.
SELECT is(
  extensions.ST_AsText(public.coarse_point(extensions.st_point(151.21234, -33.81234)::extensions.geography)),
  'POINT(151.21 -33.81)',
  'coarse_point snaps to a ~1 km grid'
);

-- M4 breaker: 10 fail-open flags in 10 minutes pause posting.
SELECT is(public.moderation_breaker_tripped(), false, 'M4: breaker starts closed');
insert into public.moderation_flags (author_id, text, reason)
select 'c3333333-3333-3333-3333-333333333333', 'x', 'classify_timeout' from generate_series(1, 10);
SELECT is(public.moderation_breaker_tripped(), true, 'M4: breaker trips after 10 classify failures');
delete from public.moderation_flags where author_id = 'c3333333-3333-3333-3333-333333333333';

-- ---- as the stranger ------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c3333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

SELECT throws_ok(
  $$ insert into public.posts (author_id, kind, body) values ('c3333333-3333-3333-3333-333333333333', 'question', 'skip moderation') $$,
  '42501', null, 'H3: posts cannot be inserted directly'
);
SELECT throws_ok(
  $$ update public.posts set body = 'x' where author_id = 'c3333333-3333-3333-3333-333333333333' $$,
  '42501', null, 'H3: posts cannot be updated directly'
);
SELECT throws_ok(
  $$ insert into public.post_replies (post_id, author_id, body) values ('c7777777-7777-7777-7777-777777777777', 'c3333333-3333-3333-3333-333333333333', 'x') $$,
  '42501', null, 'H3: post_replies cannot be inserted directly'
);
SELECT throws_ok(
  $$ select point from public.posts limit 1 $$,
  '42501', null, 'H1: posts.point is not readable'
);
SELECT is(
  (select count(*)::int from public.posts where id = 'c7777777-7777-7777-7777-777777777777'),
  1, 'H1: other posts columns still readable'
);
SELECT throws_ok(
  $$ insert into public.game_players (game_id, profile_id, status) values ('c6666666-6666-6666-6666-666666666666', 'c3333333-3333-3333-3333-333333333333', 'requested') $$,
  '42501', null, 'H5: game_players cannot be inserted directly'
);
SELECT is(
  public.is_approved_player('c6666666-6666-6666-6666-666666666666', 'c2222222-2222-2222-2222-222222222222'),
  false, 'M2: is_approved_player refuses to answer about someone else'
);
SELECT is(
  public.can_post_in_chat('c6666666-6666-6666-6666-666666666666', 'c1111111-1111-1111-1111-111111111111'),
  false, 'M2: can_post_in_chat refuses to answer about someone else'
);
SELECT is(
  public.blocked_between('c1111111-1111-1111-1111-111111111111', 'c4444444-4444-4444-4444-444444444444'),
  false, 'M2: blocked_between refuses to answer about two other people'
);
SELECT throws_ok(
  $$ select public.notification_unread_count('c1111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'M2: notification_unread_count is service-only'
);
SELECT is(
  (select count(*)::int from public.post_preview('c8888888-8888-8888-8888-888888888888')),
  0, 'M3: post_preview returns nothing for a removed post'
);
SELECT is(
  (select count(*)::int from public.post_preview('c7777777-7777-7777-7777-777777777777')),
  1, 'M3: post_preview still serves a visible post'
);
SELECT throws_ok(
  $$ select public.report_content('post', 'c7777777-7777-7777-7777-777777777777', 'c1111111-1111-1111-1111-111111111111', 'spam') $$,
  'P0001', 'That can''t be reported', 'M7: report_content rejects a reported id that isn''t the author'
);
SELECT lives_ok(
  $$ select public.report_content('post', 'c7777777-7777-7777-7777-777777777777', null, 'spam') $$,
  'M7: report_content derives the author itself'
);
SELECT throws_ok(
  $$ select usual_nights from public.profiles limit 1 $$,
  '42501', null, 'M1: usual_nights is not readable over REST'
);
SELECT is(
  (select count(*)::int from public.my_profile()),
  1, 'M1: my_profile returns the caller''s own row'
);
SELECT lives_ok(
  $$ select public.set_referrer('c3333333-3333-3333-3333-333333333333') $$,
  'L1: self-referral is a silent no-op'
);
SELECT is(
  (select count(*)::int from public.my_referrals()),
  0, 'L1: self-referral recorded nothing'
);
SELECT throws_ok(
  $$ select public.ai_proxy_take_slot('c3333333-3333-3333-3333-333333333333', 'parse', 5, 20) $$,
  '42501', null, 'M4: ai_proxy_take_slot is service-only'
);

-- ---- as the blocked user --------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c4444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);
SELECT is(
  (select count(*)::int from public.profiles where id = 'c1111111-1111-1111-1111-111111111111'),
  0, 'M1: a blocked user cannot read the blocker''s profile'
);

-- ---- as the host ----------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
SELECT throws_ok(
  $$ update public.games set status = 'completed' where id = 'c6666666-6666-6666-6666-666666666666' $$,
  'P0001', null, 'H6: host cannot mark a game completed'
);
SELECT lives_ok(
  $$ update public.games set status = 'cancelled' where id = 'c6666666-6666-6666-6666-666666666666' $$,
  'H6: host can still cancel'
);

-- ---- service role ---------------------------------------------------------------------------
set local role service_role;
SELECT is(
  public.ai_proxy_take_slot('c3333333-3333-3333-3333-333333333333', 'parse', 1, 20),
  null, 'M4: first parse in a minute is allowed and recorded'
);
SELECT is(
  public.ai_proxy_take_slot('c3333333-3333-3333-3333-333333333333', 'parse', 1, 20),
  'Too Many Requests', 'M4: second parse in the same minute is refused'
);

-- ---- guard: the default-privilege trap can't come back quietly ------------------------------
-- Any public table authenticated can INSERT or UPDATE (table- or column-level) must be on this
-- list. Adding one means reviewing its RLS insert/update policy first.
set local role postgres;
SELECT is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_any_column_privilege('authenticated', c.oid, 'INSERT') or has_any_column_privilege('authenticated', c.oid, 'UPDATE'))
     and c.relname not in (
       'blocks', 'chat_prefs', 'follows', 'game_alerts', 'games', 'message_reactions', 'message_reads',
       'messages', 'notification_prefs', 'notifications', 'post_reactions', 'profile_private',
       'profile_sports', 'profiles', 'push_tokens', 'rating_tags', 'ratings', 'skill_votes',
       'venue_corrections', 'venue_photos'
     )),
  '', 'authenticated can only write to reviewed tables'
);

SELECT * FROM finish();
ROLLBACK;
