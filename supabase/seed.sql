-- Dev seed data. Runs after migrations on `supabase db reset`.

insert into public.sports (slug, name) values ('badminton', 'Badminton');

insert into public.skill_tiers (sport_id, slug, label, ordinal)
select sports.id, t.slug, t.label, t.ordinal
from public.sports, (values
  ('beginner', 'Beginner', 1),
  ('intermediate', 'Intermediate', 2),
  ('advanced', 'Advanced', 3),
  ('pro', 'Pro', 4)
) as t(slug, label, ordinal)
where sports.slug = 'badminton';

-- Venues. Sydney-only for launch — see docs/ux-plan.md. Real courts, approximate coordinates.
-- Fixed ids (not looked up by name): the venue-directory migrations (20260815001400 and
-- friends, ~56 rows) can legitimately reinsert a venue sharing one of these names — the
-- e2e fixture below addresses these rows directly rather than risk an ambiguous name lookup.
insert into public.venues (id, name, suburb, state, location, source) values
  ('55555555-0000-0000-0000-000000000001', 'NBC Homebush', 'Homebush Bay', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0678, -33.8474), 4326), 'partner'),
  ('55555555-0000-0000-0000-000000000002', 'Alpha Badminton Centre', 'Silverwater', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0483, -33.8386), 4326), 'partner'),
  ('55555555-0000-0000-0000-000000000003', 'PCYC Auburn', 'Lidcombe', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0435, -33.8656), 4326), 'partner'),
  ('55555555-0000-0000-0000-000000000004', 'Sydney Badminton', 'Hurstville', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1027, -33.9669), 4326), 'partner'),
  ('55555555-0000-0000-0000-000000000005', 'Willoughby Leisure Centre', 'Willoughby', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1993, -33.8039), 4326), 'partner'),
  ('55555555-0000-0000-0000-000000000006', 'MUSAC', 'Macquarie Park', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1219, -33.7749), 4326), 'partner'),
  ('55555555-0000-0000-0000-000000000007', 'PCYC Marrickville', 'Marrickville', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1552, -33.9107), 4326), 'partner'),
  ('55555555-0000-0000-0000-000000000008', 'Australian Badminton Academy - North Parramatta', 'North Parramatta', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0021, -33.8020), 4326), 'partner');

-- Test games/users land once slice 3 (create wizard) can produce a real organizer + game.

-- Seeded auth user matching the app's local/e2e default (ui/scripts/e2e.sh,
-- ui/lib/session.tsx __DEV__ auto-login gate, CLAUDE.md test login). Bypasses
-- Auth's signup flow to insert directly — mirrors what GoTrue itself would write.
create extension if not exists pgcrypto with schema extensions;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'test@smashio.dev',
  extensions.crypt('Test1234!', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  extensions.gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  format('{"sub":"%s","email":"%s"}', '11111111-1111-1111-1111-111111111111', 'test@smashio.dev')::jsonb,
  'email', now(), now(), now()
);

-- ---------------------------------------------------------------------------------------
-- E2E fixture (docs/e2e-test-plan.md §4). Fixed UUIDs so Maestro flows can address rows
-- directly via testID. Applied by `supabase db reset` only — never the hosted project.
-- ---------------------------------------------------------------------------------------

-- Six bot players (organizers, rosters, chat counterparties, rating targets). auth.users
-- insert fires handle_new_user (20260807000200_profiles.sql), which creates a blank
-- profiles row per bot — updated below rather than inserted again.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  bot.id, 'authenticated', 'authenticated', bot.email,
  extensions.crypt('Test1234!', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
from (values
  ('22222222-0000-0000-0000-000000000001'::uuid, 'bot1@smashio.dev'),
  ('22222222-0000-0000-0000-000000000002'::uuid, 'bot2@smashio.dev'),
  ('22222222-0000-0000-0000-000000000003'::uuid, 'bot3@smashio.dev'),
  ('22222222-0000-0000-0000-000000000004'::uuid, 'bot4@smashio.dev'),
  ('22222222-0000-0000-0000-000000000005'::uuid, 'bot5@smashio.dev'),
  ('22222222-0000-0000-0000-000000000006'::uuid, 'bot6@smashio.dev')
) as bot(id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select extensions.gen_random_uuid(), bot.id, bot.id::text,
  format('{"sub":"%s","email":"%s"}', bot.id, bot.email)::jsonb,
  'email', now(), now(), now()
from (values
  ('22222222-0000-0000-0000-000000000001'::uuid, 'bot1@smashio.dev'),
  ('22222222-0000-0000-0000-000000000002'::uuid, 'bot2@smashio.dev'),
  ('22222222-0000-0000-0000-000000000003'::uuid, 'bot3@smashio.dev'),
  ('22222222-0000-0000-0000-000000000004'::uuid, 'bot4@smashio.dev'),
  ('22222222-0000-0000-0000-000000000005'::uuid, 'bot5@smashio.dev'),
  ('22222222-0000-0000-0000-000000000006'::uuid, 'bot6@smashio.dev')
) as bot(id, email);

-- One extra auth user with no profile content, for the onboarding flow (A6) — no display
-- name/skill so onboarding can be tested deterministically without minting a new email.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '33333333-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'onboarding@smashio.dev',
  extensions.crypt('Test1234!', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  extensions.gen_random_uuid(), '33333333-0000-0000-0000-000000000001',
  '33333333-0000-0000-0000-000000000001',
  format('{"sub":"%s","email":"%s"}', '33333333-0000-0000-0000-000000000001', 'onboarding@smashio.dev')::jsonb,
  'email', now(), now(), now()
);

-- Fill in the test user's profile (handle_new_user only gave it a blank row) — Sydney CBD
-- home point so distance/"near you" queries have something to measure against.
update public.profiles set
  display_name = 'Test Player',
  home_suburb = 'Sydney',
  home_point = extensions.ST_SetSRID(extensions.ST_MakePoint(151.2093, -33.8688), 4326),
  reliability_score = 100
where id = '11111111-1111-1111-1111-111111111111';

insert into public.profile_sports (profile_id, sport_id, skill_tier_id)
select '11111111-1111-1111-1111-111111111111', s.id, st.id
from public.sports s join public.skill_tiers st on st.sport_id = s.id
where s.slug = 'badminton' and st.slug = 'intermediate';

-- Bot profiles, spread across tiers.
update public.profiles set display_name = b.name, home_suburb = 'Sydney', reliability_score = 100
from (values
  ('22222222-0000-0000-0000-000000000001'::uuid, 'Ava Chen'),
  ('22222222-0000-0000-0000-000000000002'::uuid, 'Ben Ricci'),
  ('22222222-0000-0000-0000-000000000003'::uuid, 'Chloe Nguyen'),
  ('22222222-0000-0000-0000-000000000004'::uuid, 'Dev Patel'),
  ('22222222-0000-0000-0000-000000000005'::uuid, 'Ella Wright'),
  ('22222222-0000-0000-0000-000000000006'::uuid, 'Finn Okafor')
) as b(id, name)
where public.profiles.id = b.id;

insert into public.profile_sports (profile_id, sport_id, skill_tier_id)
select b.id, s.id, st.id
from (values
  ('22222222-0000-0000-0000-000000000001'::uuid, 'intermediate'),
  ('22222222-0000-0000-0000-000000000002'::uuid, 'intermediate'),
  ('22222222-0000-0000-0000-000000000003'::uuid, 'beginner'),
  ('22222222-0000-0000-0000-000000000004'::uuid, 'advanced'),
  ('22222222-0000-0000-0000-000000000005'::uuid, 'intermediate'),
  ('22222222-0000-0000-0000-000000000006'::uuid, 'beginner')
) as b(id, tier_slug)
join public.sports s on s.slug = 'badminton'
join public.skill_tiers st on st.sport_id = s.id and st.slug = b.tier_slug;

-- ---------------------------------------------------------------------------------------
-- Games. Fixed UUIDs, relative timestamps (now() + interval) so nothing goes stale.
-- One owned fixture per mutating flow so intra-run ordering never matters (§4).
-- ---------------------------------------------------------------------------------------

insert into public.games (
  id, sport_id, venue_id, skill_tier_id, organizer_id,
  starts_at, ends_at, duration_hours, courts_booked, max_players,
  cost_per_player_cents, status
)
select
  g.id::uuid,
  (select id from public.sports where slug = 'badminton'),
  g.venue_id::uuid,
  (select st.id from public.skill_tiers st join public.sports s on s.id = st.sport_id where s.slug = 'badminton' and st.slug = g.tier_slug),
  g.organizer_id::uuid,
  now() + g.starts_offset, now() + g.starts_offset + make_interval(hours => g.duration),
  g.duration, 1, g.max_players, g.cost_cents, g.status
from (values
  -- id suffix, venue_id, tier, organizer, starts offset, duration hours, max players, cost/player cents, status
  ('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', 'intermediate', '22222222-0000-0000-0000-000000000001', interval '26 hours', 2, 6, 1200, 'published'),
  ('44444444-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', 'intermediate', '22222222-0000-0000-0000-000000000002', interval '27 hours', 2, 6, 1200, 'published'),
  ('44444444-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000003', 'intermediate', '22222222-0000-0000-0000-000000000003', interval '28 hours', 2, 6, 1000, 'published'),
  ('44444444-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000003', 'intermediate', '22222222-0000-0000-0000-000000000004', interval '29 hours', 2, 6, 1000, 'published'),
  ('44444444-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000006', 'intermediate', '11111111-1111-1111-1111-111111111111', interval '31 hours', 2, 6, 1500, 'published'),
  ('44444444-0000-0000-0000-000000000006', '55555555-0000-0000-0000-000000000006', 'intermediate', '11111111-1111-1111-1111-111111111111', interval '48 hours', 2, 6, 1500, 'published'),
  ('44444444-0000-0000-0000-000000000007', '55555555-0000-0000-0000-000000000005', 'intermediate', '22222222-0000-0000-0000-000000000002', interval '33 hours', 2, 6, 1200, 'published'),
  ('44444444-0000-0000-0000-000000000010', '55555555-0000-0000-0000-000000000007', 'intermediate', '22222222-0000-0000-0000-000000000003', interval '30 hours', 2, 6, 1200, 'cancelled'),
  ('44444444-0000-0000-0000-000000000011', '55555555-0000-0000-0000-000000000004', 'beginner', '22222222-0000-0000-0000-000000000004', interval '34 hours', 2, 8, 800, 'published'),
  ('44444444-0000-0000-0000-000000000012', '55555555-0000-0000-0000-000000000001', 'advanced', '22222222-0000-0000-0000-000000000005', interval '35 hours', 2, 6, 3000, 'published')
) as g(id, venue_id, tier_slug, organizer_id, starts_offset, duration, max_players, cost_cents, status);

-- `…08`/`…09` inserted as already-completed — the hourly complete_past_games cron only flips
-- published->completed, so a past-dated 'published' row would sit stuck until the cron runs.
insert into public.games (
  id, sport_id, venue_id, skill_tier_id, organizer_id,
  starts_at, ends_at, duration_hours, courts_booked, max_players,
  cost_per_player_cents, status
)
select
  g.id::uuid,
  (select id from public.sports where slug = 'badminton'),
  g.venue_id::uuid,
  (select st.id from public.skill_tiers st join public.sports s on s.id = st.sport_id where s.slug = 'badminton' and st.slug = 'intermediate'),
  g.organizer_id::uuid,
  now() + g.ends_offset - interval '2 hours', now() + g.ends_offset,
  2, 1, 6, 1200, 'completed'
from (values
  ('44444444-0000-0000-0000-000000000008', '55555555-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', interval '-20 hours'),
  ('44444444-0000-0000-0000-000000000009', '55555555-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', interval '-44 hours')
) as g(id, venue_id, organizer_id, ends_offset);

-- ---------------------------------------------------------------------------------------
-- Rosters.
-- ---------------------------------------------------------------------------------------

insert into public.game_players (game_id, profile_id, status, decided_at) values
  -- …01 open, 2/6 approved (organizer bot1 + bot2) — test user is NOT a member (C1 join, C2 withdraw, C3 re-join).
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'approved', now()),
  -- …02 full 6/6 approved — test user is NOT a member (C4 full CTA, B3 has-spots filter).
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'approved', now()),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000003', 'approved', now()),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000004', 'approved', now()),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000005', 'approved', now()),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000006', 'approved', now()),
  -- …03 test user approved + 3 other approved players (F1-F3 chat).
  ('44444444-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'approved', now()),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000004', 'approved', now()),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000005', 'approved', now()),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006', 'approved', now()),
  -- …04 test user approved (C5 leave).
  ('44444444-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'approved', now()),
  -- …05 test user organizer, 2 pending requests (C6 approve, C7 decline, C8 remove).
  ('44444444-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000005', 'requested', null),
  ('44444444-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000006', 'requested', null),
  -- …07 test user requested, organizer bot2 (E1 "Requested" segment).
  ('44444444-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'requested', null),
  -- …10 test user was approved, game now cancelled (E4 cancelled rendering).
  ('44444444-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'approved', now()),
  -- …08 completed, test user approved + 3 co-players, no ratings yet (G1 rating submit).
  ('44444444-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'approved', now()),
  ('44444444-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000003', 'approved', now()),
  ('44444444-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000004', 'approved', now()),
  ('44444444-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000005', 'approved', now()),
  -- …09 completed, test user approved, ratings already written (G2 no re-prompt).
  ('44444444-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'approved', now()),
  ('44444444-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000001', 'approved', now()),
  ('44444444-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000006', 'approved', now());

insert into public.ratings (game_id, rater_id, ratee_id, stars) values
  ('44444444-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001', 5),
  ('44444444-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000006', 4);

-- 4 seeded messages on …03 (F1-F3 chat) — beyond the auto "created this game" system row.
insert into public.messages (game_id, sender_id, body, kind, created_at) values
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000004', 'Anyone bringing spare shuttles?', 'text', now() - interval '3 hours'),
  ('44444444-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'I''ve got a tube, all good', 'text', now() - interval '2 hours 50 minutes'),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000005', 'See everyone there', 'text', now() - interval '2 hours'),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000006', 'Running 5 min late, save my spot', 'text', now() - interval '1 hour');

-- Push dispatch, local. notify_push no-ops without a 'push_dispatch_key' Vault secret and posts
-- to the hosted project without 'push_dispatch_url' (docs/notifications-plan.md §6.7), so a
-- local db could never exercise a notification end to end. These two point it at the local
-- functions runtime instead: run `supabase functions serve` alongside `supabase start` and the
-- triggers reach push-dispatch for real. The key only has to match PUSH_DISPATCH_KEY in
-- supabase/functions/.env locally. Guarded because vault secret names are unique and pgTAP
-- tests create the same key themselves.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_key') then
    perform vault.create_secret('local-push-dispatch-key', 'push_dispatch_key');
  end if;
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_url') then
    -- host.docker.internal: pg_net runs inside the db container, the functions runtime doesn't.
    perform vault.create_secret('http://host.docker.internal:54321/functions/v1/push-dispatch', 'push_dispatch_url');
  end if;
end;
$$;
