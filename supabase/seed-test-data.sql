-- Test data for the 8 accounts created by create-test-users.mjs (test@smashio.dev + bot1-7).
-- Run against the LINKED hosted project after that script:
--   npx supabase db query --linked -f supabase/seed-test-data.sql
--
-- NOT idempotent for games/messages/ratings (each run adds another batch) — safe to run once.
-- To wipe just this batch: delete from public.games where organizer_id in
-- (select id from auth.users where email like '%@smashio.dev'); (cascades players/messages/ratings).
-- profiles/profile_sports upserts below ARE safe to re-run.

-- Venues come from supabase/seed.sql (Sydney-only). Nothing to add here.

-- Profile polish + skill tiers for all 8 test accounts.
with test_profiles as (
  select u.id, u.email from auth.users u where u.email like '%@smashio.dev'
)
update public.profiles p
set home_suburb = 'Surry Hills',
    home_point = extensions.ST_SetSRID(extensions.ST_MakePoint(151.2117, -33.8886), 4326)
from test_profiles tp
where p.id = tp.id and p.home_suburb is null;

with badminton as (select id from public.sports where slug = 'badminton'),
tiers as (
  select st.slug, st.id from public.skill_tiers st join badminton b on st.sport_id = b.id
),
assignments as (
  select u.id as profile_id, v.tier_slug as tier_slug
  from auth.users u
  join (values
    ('test@smashio.dev', 'intermediate'),
    ('bot1@smashio.dev', 'intermediate'),
    ('bot2@smashio.dev', 'beginner'),
    ('bot3@smashio.dev', 'advanced'),
    ('bot4@smashio.dev', 'intermediate'),
    ('bot5@smashio.dev', 'pro'),
    ('bot6@smashio.dev', 'beginner'),
    ('bot7@smashio.dev', 'advanced')
  ) as v(email, tier_slug) on v.email = u.email
)
insert into public.profile_sports (profile_id, sport_id, skill_tier_id)
select a.profile_id, (select id from badminton), tiers.id
from assignments a
join tiers on tiers.slug = a.tier_slug
on conflict (profile_id, sport_id) do update set skill_tier_id = excluded.skill_tier_id;

-- Everything below keys off these 9 named lookups (8 test users + venues).
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
badminton as (select id from public.sports where slug = 'badminton'),

-- G1: organizer=test, near-full (5/6 approved), +2 days, Sydney Badminton Centre, intermediate.
g1 as (
  insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id, max_players, cost_total_cents, status)
  select (select id from badminton), (select id from venue where name = 'Sydney Badminton Centre'),
    (select id from u where email = 'test@smashio.dev'),
    now() + interval '2 days' + interval '18 hours', now() + interval '2 days' + interval '20 hours',
    'Court 3', (select id from tier where slug = 'intermediate'), 6, 1800, 'published'
  returning id
),
-- G2: organizer=test, 2 pending join requests to approve, +3 days, Bondi Badminton Club, beginner.
g2 as (
  insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id, max_players, cost_total_cents, status)
  select (select id from badminton), (select id from venue where name = 'Bondi Badminton Club'),
    (select id from u where email = 'test@smashio.dev'),
    now() + interval '3 days' + interval '19 hours', now() + interval '3 days' + interval '21 hours',
    'Court 1', (select id from tier where slug = 'beginner'), 8, 0, 'published'
  returning id
),
-- G3: organizer=bot1, test is an approved player, +1 day, Inner West Badminton Centre, intermediate.
g3 as (
  insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id, max_players, cost_total_cents, status)
  select (select id from badminton), (select id from venue where name = 'Inner West Badminton Centre'),
    (select id from u where email = 'bot1@smashio.dev'),
    now() + interval '1 day' + interval '17 hours', now() + interval '1 day' + interval '19 hours',
    'Court 2', (select id from tier where slug = 'intermediate'), 4, 1200, 'published'
  returning id
),
-- G4: organizer=bot2, test has a pending (unapproved) request, +4 days, Parramatta Badminton Arena, advanced.
g4 as (
  insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id, max_players, cost_total_cents, status)
  select (select id from badminton), (select id from venue where name = 'Parramatta Badminton Arena'),
    (select id from u where email = 'bot2@smashio.dev'),
    now() + interval '4 days' + interval '18 hours', now() + interval '4 days' + interval '20 hours',
    'Court 1', (select id from tier where slug = 'advanced'), 4, 1500, 'published'
  returning id
),
-- G5: organizer=bot3, open discover game test hasn't touched, +5 days, Chatswood Badminton Centre, pro.
g5 as (
  insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id, max_players, cost_total_cents, status)
  select (select id from badminton), (select id from venue where name = 'Chatswood Badminton Centre'),
    (select id from u where email = 'bot3@smashio.dev'),
    now() + interval '5 days' + interval '10 hours', now() + interval '5 days' + interval '12 hours',
    'Court 4', (select id from tier where slug = 'pro'), 4, 2000, 'published'
  returning id
),
-- G6: organizer=bot4, test approved, starts in 90 min — exercises the urgent countdown chip.
g6 as (
  insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id, max_players, cost_total_cents, status)
  select (select id from badminton), (select id from venue where name = 'Sydney Badminton Centre'),
    (select id from u where email = 'bot4@smashio.dev'),
    now() + interval '90 minutes', now() + interval '3 hours',
    'Court 2', (select id from tier where slug = 'intermediate'), 4, 1000, 'published'
  returning id
),
-- G7: completed, organizer=test, ended yesterday — feeds the ratings flow. Ryde Badminton Stadium.
g7 as (
  insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id, max_players, cost_total_cents, status)
  select (select id from badminton), (select id from venue where name = 'Ryde Badminton Stadium'),
    (select id from u where email = 'test@smashio.dev'),
    now() - interval '1 day' - interval '3 hours', now() - interval '1 day' - interval '1 hours',
    'Court 1', (select id from tier where slug = 'intermediate'), 4, 1200, 'completed'
  returning id, starts_at
),
-- G8: cancelled, organizer=bot5, test's request is now moot — Rockdale Badminton Centre.
g8 as (
  insert into public.games (sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id, max_players, cost_total_cents, status)
  select (select id from badminton), (select id from venue where name = 'Rockdale Badminton Centre'),
    (select id from u where email = 'bot5@smashio.dev'),
    now() + interval '6 days' + interval '15 hours', now() + interval '6 days' + interval '17 hours',
    'Court 3', (select id from tier where slug = 'beginner'), 4, 0, 'cancelled'
  returning id
),

game_players_ins as (
  insert into public.game_players (game_id, profile_id, status, requested_at, decided_at)
  select (select id from g1), u.id, 'approved', now() - interval '1 day', now() - interval '1 day'
  from u where u.email in ('bot1@smashio.dev','bot2@smashio.dev','bot3@smashio.dev','bot4@smashio.dev','bot6@smashio.dev')
  union all
  select (select id from g2), u.id, 'approved', now() - interval '1 day', now() - interval '1 day'
  from u where u.email in ('bot1@smashio.dev','bot6@smashio.dev','bot7@smashio.dev')
  union all
  select (select id from g2), u.id, 'requested', now() - interval '2 hours', null
  from u where u.email in ('bot2@smashio.dev','bot3@smashio.dev')
  union all
  select (select id from g3), u.id, 'approved', now() - interval '1 day', now() - interval '1 day'
  from u where u.email = 'test@smashio.dev'
  union all
  select (select id from g3), u.id, 'approved', now() - interval '1 day', now() - interval '1 day'
  from u where u.email = 'bot7@smashio.dev'
  union all
  select (select id from g4), u.id, 'requested', now() - interval '3 hours', null
  from u where u.email = 'test@smashio.dev'
  union all
  select (select id from g4), u.id, 'approved', now() - interval '1 day', now() - interval '1 day'
  from u where u.email = 'bot6@smashio.dev'
  union all
  select (select id from g5), u.id, 'approved', now() - interval '1 day', now() - interval '1 day'
  from u where u.email in ('bot4@smashio.dev','bot7@smashio.dev')
  union all
  select (select id from g6), u.id, 'approved', now() - interval '1 day', now() - interval '1 day'
  from u where u.email in ('test@smashio.dev','bot1@smashio.dev','bot3@smashio.dev')
  union all
  select (select id from g7), u.id, 'approved', now() - interval '2 days', now() - interval '2 days'
  from u where u.email in ('bot1@smashio.dev','bot2@smashio.dev')
  union all
  -- late leave on g7 (decided after starts_at) so recompute_reliability_scores has a signal to dock.
  select (select id from g7), u.id, 'left',
    now() - interval '2 days',
    (select starts_at from g7) + interval '10 minutes'
  from u where u.email = 'bot3@smashio.dev'
  union all
  select (select id from g8), u.id, 'requested', now() - interval '2 days', null
  from u where u.email = 'test@smashio.dev'
  returning game_id, profile_id
),

messages_ins as (
  insert into public.messages (game_id, sender_id, body, created_at)
  select (select id from g1), u.id, m.body, now() - m.ago
  from (values
    ('test@smashio.dev', 'Court''s booked, see you all Thursday!', interval '20 hours'),
    ('bot1@smashio.dev', 'Nice, I''ll bring an extra shuttle tube', interval '18 hours'),
    ('bot4@smashio.dev', 'Running 5 min late, save me a spot', interval '2 hours')
  ) as m(email, body, ago)
  join u on u.email = m.email
  union all
  select (select id from g3), u.id, m.body, now() - m.ago
  from (values
    ('bot1@smashio.dev', 'Anyone know if the courts have AC? Last time it was brutal', interval '10 hours'),
    ('test@smashio.dev', 'Yeah it''s fine, decent aircon there', interval '9 hours')
  ) as m(email, body, ago)
  join u on u.email = m.email
  union all
  select (select id from g6), u.id, m.body, now() - m.ago
  from (values
    ('bot4@smashio.dev', 'Starting soon, heading over now', interval '30 minutes')
  ) as m(email, body, ago)
  join u on u.email = m.email
  returning id
),

ratings_ins as (
  insert into public.ratings (game_id, rater_id, ratee_id, stars, created_at)
  select (select id from g7), rater.id, ratee.id, r.stars, now() - interval '12 hours'
  from (values
    ('bot1@smashio.dev', 'test@smashio.dev', 5),
    ('bot2@smashio.dev', 'test@smashio.dev', 4),
    ('test@smashio.dev', 'bot1@smashio.dev', 5),
    ('test@smashio.dev', 'bot2@smashio.dev', 4)
  ) as r(rater_email, ratee_email, stars)
  join u rater on rater.email = r.rater_email
  join u ratee on ratee.email = r.ratee_email
  returning game_id
)

select
  (select count(*) from game_players_ins) as game_players_inserted,
  (select count(*) from messages_ins) as messages_inserted,
  (select count(*) from ratings_ins) as ratings_inserted;
