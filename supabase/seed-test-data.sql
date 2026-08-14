-- Test data for the 8 accounts created by create-test-users.mjs:
--   test@smashio.dev / maitri@smashio.dev / ajay@smashio.dev  — named accounts, no events, no
--     memberships. Left clean so these can be used to test creating events and joining others'.
--   bot1-5@smashio.dev — "existing users" who already host events, so discover/map/list aren't
--     empty on first login. Nobody is a member of anybody's event — join/approve flow is untested
--     state, ready to exercise by hand.
-- Run against the LINKED hosted project after that script:
--   npx supabase db query --linked -f supabase/seed-test-data.sql
--
-- Idempotent: re-running first deletes this batch's own games (cascades players/messages/ratings)
-- before re-inserting. Only ever touches rows owned by an @smashio.dev account.

delete from public.games where organizer_id in (select id from auth.users where email like '%@smashio.dev');

-- Venues come from supabase/seed.sql (Sydney-only, real courts). Nothing to add here.

-- Profile polish + skill tiers for all 8 test accounts, spread across Sydney suburbs.
with home as (
  select * from (values
    ('test@smashio.dev', 'Surry Hills', 151.2117, -33.8886, 'intermediate'),
    ('ajay@smashio.dev', 'Newtown', 151.1795, -33.8978, 'intermediate'),
    ('maitri@smashio.dev', 'Chatswood', 151.1810, -33.7969, 'beginner'),
    ('bot1@smashio.dev', 'Parramatta', 151.0011, -33.8150, 'intermediate'),
    ('bot2@smashio.dev', 'Hurstville', 151.1027, -33.9669, 'beginner'),
    ('bot3@smashio.dev', 'Marrickville', 151.1552, -33.9107, 'advanced'),
    ('bot4@smashio.dev', 'Ryde', 151.1229, -33.7940, 'intermediate'),
    ('bot5@smashio.dev', 'Bondi Junction', 151.2493, -33.8926, 'pro')
  ) as h(email, suburb, lng, lat, tier_slug)
)
update public.profiles p
set home_suburb = h.suburb,
    home_point = extensions.ST_SetSRID(extensions.ST_MakePoint(h.lng, h.lat), 4326)
from home h
join auth.users u on u.email = h.email
where p.id = u.id;

with badminton as (select id from public.sports where slug = 'badminton'),
tiers as (
  select st.slug, st.id from public.skill_tiers st join badminton b on st.sport_id = b.id
),
assignments as (
  select u.id as profile_id, v.tier_slug as tier_slug
  from auth.users u
  join (values
    ('test@smashio.dev', 'intermediate'),
    ('ajay@smashio.dev', 'intermediate'),
    ('maitri@smashio.dev', 'beginner'),
    ('bot1@smashio.dev', 'intermediate'),
    ('bot2@smashio.dev', 'beginner'),
    ('bot3@smashio.dev', 'advanced'),
    ('bot4@smashio.dev', 'intermediate'),
    ('bot5@smashio.dev', 'pro')
  ) as v(email, tier_slug) on v.email = u.email
)
insert into public.profile_sports (profile_id, sport_id, skill_tier_id)
select a.profile_id, (select id from badminton), tiers.id
from assignments a
join tiers on tiers.slug = a.tier_slug
on conflict (profile_id, sport_id) do update set skill_tier_id = excluded.skill_tier_id;

-- Events — all organized by the bot1-5 "existing user" accounts, spread across the 8 real
-- venues, skill tiers, and dates. verification_status set directly (no game_confirmations row
-- needed to exercise the badge) so Discover/My Games show a realistic mix out of the box.
-- No game_players rows anywhere — join/request/approve is left for manual testing.
with u as (
  select email, id from auth.users where email like '%@smashio.dev'
),
venue as (
  select name, id from public.venues
),
tier as (
  select st.slug, st.id from public.skill_tiers st
  join public.sports s on s.id = st.sport_id where s.slug = 'badminton'
),
badminton as (select id from public.sports where slug = 'badminton')

insert into public.games (
  sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id,
  max_players, cost_per_player_cents, status, verification_status, courts_booked, duration_hours
)
select (select id from badminton), (select id from venue where name = v.venue_name),
  (select id from u where email = v.organizer_email),
  now() + v.starts_in, now() + v.starts_in + v.duration,
  v.court_label, (select id from tier where slug = v.tier_slug),
  v.max_players, v.cost_per_player_cents, 'published', v.verification, v.courts_booked, v.duration_hours
from (values
  -- organizer_email, venue_name, starts_in, duration, court_label, tier_slug, max_players, cost_per_player_cents, verification, courts_booked, duration_hours
  ('bot1@smashio.dev', 'NBC Homebush', interval '1 day' + interval '18 hours', interval '2 hours', 'Court 5', 'intermediate', 6, 300, 'verified', 2, 2),
  ('bot2@smashio.dev', 'Alpha Badminton Centre', interval '2 days' + interval '19 hours', interval '2 hours', 'Court 12', 'beginner', 8, 0, 'none', 2, 2),
  ('bot3@smashio.dev', 'PCYC Auburn', interval '3 days' + interval '17 hours', interval '2 hours', 'Court 2', 'advanced', 4, 400, 'pending', 1, 2),
  ('bot4@smashio.dev', 'Sydney Badminton', interval '3 hours', interval '2 hours', 'Court 1', 'intermediate', 4, 300, 'none', 1, 2),
  ('bot5@smashio.dev', 'Willoughby Leisure Centre', interval '5 days' + interval '10 hours', interval '2 hours', 'Court 3', 'pro', 4, 500, 'verified', 1, 2),
  ('bot1@smashio.dev', 'MUSAC', interval '4 days' + interval '18 hours 30 minutes', interval '2 hours', 'Court 7', 'intermediate', 6, 250, 'none', 2, 2),
  ('bot2@smashio.dev', 'PCYC Marrickville', interval '6 days' + interval '19 hours', interval '2 hours', 'Court 1', 'beginner', 8, 0, 'none', 2, 2),
  ('bot3@smashio.dev', 'Australian Badminton Academy - North Parramatta', interval '2 days' + interval '20 hours', interval '2 hours', 'Court 4', 'advanced', 4, 350, 'pending', 1, 2),
  ('bot4@smashio.dev', 'NBC Homebush', interval '7 days' + interval '16 hours', interval '2 hours', 'Court 9', 'intermediate', 6, 300, 'none', 2, 2)
) as v(organizer_email, venue_name, starts_in, duration, court_label, tier_slug, max_players, cost_per_player_cents, verification, courts_booked, duration_hours);
