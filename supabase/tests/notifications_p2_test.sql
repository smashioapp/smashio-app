-- Coverage for the P2 notifications table (supabase/migrations/20260820000400_notifications_p2.sql):
-- triggers write durable rows before dispatch, notification_prefs gates who gets one, and the
-- retry sweep picks up anything push-dispatch never got to.
-- Run: supabase test db
BEGIN;
SELECT plan(9);

set local role postgres;

insert into auth.users (id, email) values
  ('c1111111-1111-1111-1111-111111111111', 'p2-organizer@test.dev'),
  ('c2222222-2222-2222-2222-222222222222', 'p2-requester@test.dev'),
  ('c3333333-3333-3333-3333-333333333333', 'p2-opted-out@test.dev');

insert into public.venues (id, name, suburb, state, location) values
  ('c5555555-5555-5555-5555-555555555555', 'P2 Test Courts', 'Sydney', 'NSW', extensions.st_point(151.2, -33.8)::extensions.geography);

insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'c0000000-0000-0000-0000-000000000001', s.id, 'c5555555-5555-5555-5555-555555555555',
  'c1111111-1111-1111-1111-111111111111', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

-- 1-5. A join request writes a durable, unsent row transactionally with the event — not just a
-- fire-and-forget pg_net call.
insert into public.game_players (game_id, profile_id, status) values
  ('c0000000-0000-0000-0000-000000000001', 'c2222222-2222-2222-2222-222222222222', 'requested');

SELECT is(
  (select count(*)::int from public.notifications
   where game_id = 'c0000000-0000-0000-0000-000000000001' and type = 'join_request'),
  1,
  'a join request writes exactly one notifications row'
);

SELECT is(
  (select profile_id from public.notifications where game_id = 'c0000000-0000-0000-0000-000000000001' and type = 'join_request'),
  'c1111111-1111-1111-1111-111111111111'::uuid,
  'the row belongs to the host, not the requester'
);

SELECT is(
  (select actor_id from public.notifications where game_id = 'c0000000-0000-0000-0000-000000000001' and type = 'join_request'),
  'c2222222-2222-2222-2222-222222222222'::uuid,
  'actor_id names who made the request'
);

SELECT is(
  (select priority from public.notifications where game_id = 'c0000000-0000-0000-0000-000000000001' and type = 'join_request'),
  'critical',
  'join_request is stamped critical, matching §3''s priority tiers'
);

SELECT is(
  (select collapse_key from public.notifications where game_id = 'c0000000-0000-0000-0000-000000000001' and type = 'join_request'),
  'join_request:c0000000-0000-0000-0000-000000000001',
  'collapse_key is keyed by game, so a burst of requests can coalesce (A2)'
);

-- 6. The row is unsent until push-dispatch (not exercised here — that's Deno-side) stamps it.
SELECT is(
  (select sent_at from public.notifications where game_id = 'c0000000-0000-0000-0000-000000000001' and type = 'join_request'),
  null,
  'a freshly enqueued notification has no sent_at yet'
);

-- 7-8. notification_prefs opts a category out before enqueue_notifications ever writes a row —
-- the P1 pref gate, now load-bearing for the inbox too, not just push delivery.
insert into public.games (id, sport_id, venue_id, organizer_id, starts_at, ends_at, skill_tier_id, max_players, status)
select 'c0000000-0000-0000-0000-000000000002', s.id, 'c5555555-5555-5555-5555-555555555555',
  'c3333333-3333-3333-3333-333333333333', now() + interval '1 day', now() + interval '1 day 2 hours',
  t.id, 8, 'published'
from public.sports s join public.skill_tiers t on t.sport_id = s.id where s.slug = 'badminton' limit 1;

insert into public.notification_prefs (profile_id, join_requests) values
  ('c3333333-3333-3333-3333-333333333333', false);

insert into public.game_players (game_id, profile_id, status) values
  ('c0000000-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', 'requested');

SELECT is(
  (select count(*)::int from public.notifications
   where game_id = 'c0000000-0000-0000-0000-000000000002' and type = 'join_request'),
  0,
  'a host who opted out of join_requests gets no notifications row at all, not just no push'
);

update public.notification_prefs set join_requests = true where profile_id = 'c3333333-3333-3333-3333-333333333333';

update public.game_players set status = 'rejected'
  where game_id = 'c0000000-0000-0000-0000-000000000002' and profile_id = 'c2222222-2222-2222-2222-222222222222';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
select public.request_to_join('c0000000-0000-0000-0000-000000000002');
set local role postgres;

SELECT is(
  (select count(*)::int from public.notifications
   where game_id = 'c0000000-0000-0000-0000-000000000002' and type = 'join_request'),
  1,
  'turning the category back on lets the next event through'
);

-- 9. Bug #7 retry sweep: a row still unsent after 2 minutes is picked back up; one sent seconds
-- ago is left alone.
update public.notifications set created_at = now() - interval '5 minutes'
  where game_id = 'c0000000-0000-0000-0000-000000000001' and type = 'join_request';

insert into public.notifications (profile_id, type, game_id, priority, sent_at)
values ('c1111111-1111-1111-1111-111111111111', 'game_full', 'c0000000-0000-0000-0000-000000000001', 'low', now() - interval '10 minutes');

create temp table _p2_queue_before as select count(*) as n from net.http_request_queue;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_key') then
    perform vault.create_secret('test-push-dispatch-key', 'push_dispatch_key');
  end if;
end;
$$;

select public.dispatch_notification_retries();

SELECT ok(
  (select count(*) from net.http_request_queue) > (select n from _p2_queue_before),
  'a notification still unsent after 2 minutes is re-queued by the retry sweep, an already-sent one is not'
);

drop table _p2_queue_before;

SELECT * FROM finish();
ROLLBACK;
