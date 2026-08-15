-- Test data for the 8 accounts created by create-test-users.mjs. That script owns identity
-- (email, display_name, password) — this script never touches it. Everything else here is
-- written as if it's a real, lived-in account history: past completed games, rosters,
-- star ratings, behaviour tags, an earned (not hand-set) reliability score, streaks, regulars
-- and a couple of upcoming games including live join requests — not a thin "test data" stub.
--
--   test@smashio.dev / ajay@smashio.dev / maitri@smashio.dev — named accounts (App Store
--     review + team). Used to be left empty for manual join/create testing; now carry the same
--     kind of history as the bots so their own profile screens have something real to show.
--   bot1-5@smashio.dev — "existing users" who host and join games same as everyone else.
--
-- Run against the LINKED hosted project after create-test-users.mjs:
--   npx supabase db query --linked -f supabase/seed-test-data.sql
--
-- Idempotent + atomic: wrapped in one transaction; re-running first deletes this batch's own
-- games (cascades players/messages/ratings/rating_tags) before re-inserting. Only ever touches
-- rows owned by an @smashio.dev account. Venues come from supabase/seed.sql — nothing to add.

begin;

delete from public.games where organizer_id in (select id from auth.users where email like '%@smashio.dev');

-- Home suburb + skill tier, spread across Sydney.
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

-- Past completed games. bot1's four NBC Homebush games land exactly 7 days apart on purpose —
-- that's what gives bot1/ajay/bot4 a real, computed week-streak on their profile
-- (lib/format.ts#computeWeekStreak) instead of a faked number. Every account organizes at
-- least twice and plays in several others', so games-played, games-hosted, regulars and
-- "most-played venue/night" all come out of real overlapping rosters, not hand-set totals.
create temporary table tmp_seed_games (
  label text primary key,
  organizer_email text not null,
  venue_name text not null,
  starts_at timestamptz not null,
  duration interval not null,
  court_label text not null,
  tier_slug text not null,
  max_players int not null,
  cost_per_player_cents int not null,
  status text not null,
  verification text not null,
  courts_booked int not null,
  duration_hours int not null
) on commit drop;

insert into tmp_seed_games (label, organizer_email, venue_name, starts_at, duration, court_label, tier_slug, max_players, cost_per_player_cents, status, verification, courts_booked, duration_hours)
values
  ('g1', 'bot1@smashio.dev', 'NBC Homebush', date_trunc('hour', now()) - interval '3 days' + interval '18 hours', interval '2 hours', 'Court 5', 'intermediate', 6, 300, 'completed', 'verified', 2, 2),
  ('g2', 'bot1@smashio.dev', 'NBC Homebush', date_trunc('hour', now()) - interval '10 days' + interval '18 hours', interval '2 hours', 'Court 5', 'intermediate', 6, 300, 'completed', 'verified', 2, 2),
  ('g3', 'bot1@smashio.dev', 'NBC Homebush', date_trunc('hour', now()) - interval '17 days' + interval '18 hours', interval '2 hours', 'Court 5', 'intermediate', 6, 300, 'completed', 'verified', 2, 2),
  ('g4', 'bot1@smashio.dev', 'NBC Homebush', date_trunc('hour', now()) - interval '24 days' + interval '18 hours', interval '2 hours', 'Court 5', 'intermediate', 6, 300, 'completed', 'verified', 2, 2),
  ('g5', 'ajay@smashio.dev', 'PCYC Marrickville', date_trunc('hour', now()) - interval '6 days' + interval '19 hours', interval '2 hours', 'Court 1', 'intermediate', 4, 250, 'completed', 'none', 1, 2),
  ('g6', 'ajay@smashio.dev', 'PCYC Marrickville', date_trunc('hour', now()) - interval '13 days' + interval '19 hours', interval '2 hours', 'Court 1', 'intermediate', 4, 250, 'completed', 'none', 1, 2),
  ('g7', 'test@smashio.dev', 'MUSAC', date_trunc('hour', now()) - interval '8 days' + interval '17 hours 30 minutes', interval '2 hours', 'Court 7', 'intermediate', 6, 300, 'completed', 'none', 2, 2),
  ('g8', 'test@smashio.dev', 'MUSAC', date_trunc('hour', now()) - interval '15 days' + interval '17 hours 30 minutes', interval '2 hours', 'Court 7', 'intermediate', 6, 300, 'completed', 'none', 2, 2),
  ('g9', 'maitri@smashio.dev', 'Alpha Badminton Centre', date_trunc('hour', now()) - interval '5 days' + interval '10 hours', interval '2 hours', 'Court 12', 'beginner', 8, 0, 'completed', 'none', 2, 2),
  ('g10', 'maitri@smashio.dev', 'Alpha Badminton Centre', date_trunc('hour', now()) - interval '20 days' + interval '10 hours', interval '2 hours', 'Court 12', 'beginner', 8, 0, 'completed', 'none', 2, 2),
  ('g11', 'bot2@smashio.dev', 'Sydney Badminton', date_trunc('hour', now()) - interval '12 days' + interval '11 hours', interval '2 hours', 'Court 3', 'beginner', 8, 0, 'completed', 'none', 2, 2),
  ('g12', 'bot2@smashio.dev', 'Sydney Badminton', date_trunc('hour', now()) - interval '26 days' + interval '11 hours', interval '2 hours', 'Court 3', 'beginner', 8, 0, 'completed', 'none', 2, 2),
  ('g13', 'bot3@smashio.dev', 'PCYC Auburn', date_trunc('hour', now()) - interval '9 days' + interval '19 hours 30 minutes', interval '2 hours', 'Court 2', 'advanced', 4, 400, 'completed', 'pending', 1, 2),
  ('g14', 'bot3@smashio.dev', 'PCYC Auburn', date_trunc('hour', now()) - interval '23 days' + interval '19 hours 30 minutes', interval '2 hours', 'Court 2', 'advanced', 4, 400, 'completed', 'pending', 1, 2),
  ('g15', 'bot4@smashio.dev', 'Australian Badminton Academy - North Parramatta', date_trunc('hour', now()) - interval '14 days' + interval '18 hours 30 minutes', interval '2 hours', 'Court 4', 'intermediate', 6, 250, 'completed', 'none', 2, 2),
  ('g16', 'bot4@smashio.dev', 'Australian Badminton Academy - North Parramatta', date_trunc('hour', now()) - interval '30 days' + interval '18 hours 30 minutes', interval '2 hours', 'Court 4', 'intermediate', 6, 250, 'completed', 'none', 2, 2),
  ('g17', 'bot5@smashio.dev', 'Willoughby Leisure Centre', date_trunc('hour', now()) - interval '11 days' + interval '20 hours', interval '2 hours', 'Court 3', 'pro', 4, 500, 'completed', 'verified', 1, 2),
  ('g18', 'bot5@smashio.dev', 'Willoughby Leisure Centre', date_trunc('hour', now()) - interval '45 days' + interval '20 hours', interval '2 hours', 'Court 3', 'pro', 4, 500, 'completed', 'verified', 1, 2),
  -- Upcoming — a live join-request pair on f1 for host-approval testing, approved rosters on
  -- f4/f5 so My Games "joined" isn't empty either.
  ('f1', 'bot5@smashio.dev', 'MUSAC', date_trunc('hour', now()) + interval '1 day' + interval '18 hours', interval '2 hours', 'Court 7', 'pro', 4, 500, 'published', 'verified', 2, 2),
  ('f2', 'bot2@smashio.dev', 'Alpha Badminton Centre', date_trunc('hour', now()) + interval '2 days' + interval '19 hours', interval '2 hours', 'Court 12', 'beginner', 8, 0, 'published', 'none', 2, 2),
  ('f3', 'bot3@smashio.dev', 'PCYC Auburn', date_trunc('hour', now()) + interval '3 days' + interval '17 hours', interval '2 hours', 'Court 2', 'advanced', 4, 400, 'published', 'pending', 1, 2),
  ('f4', 'maitri@smashio.dev', 'Sydney Badminton', date_trunc('hour', now()) + interval '4 days' + interval '10 hours', interval '2 hours', 'Court 3', 'beginner', 8, 0, 'published', 'none', 2, 2),
  ('f5', 'ajay@smashio.dev', 'NBC Homebush', date_trunc('hour', now()) + interval '6 days' + interval '18 hours 30 minutes', interval '2 hours', 'Court 5', 'intermediate', 6, 300, 'published', 'verified', 2, 2);

with badminton as (select id from public.sports where slug = 'badminton'),
tier as (
  select st.slug, st.id from public.skill_tiers st join public.sports s on s.id = st.sport_id where s.slug = 'badminton'
)
insert into public.games (
  sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id,
  max_players, cost_per_player_cents, status, verification_status, courts_booked, duration_hours
)
select (select id from badminton), v.id, u.id,
  g.starts_at, g.starts_at + g.duration, g.court_label, tier.id,
  g.max_players, g.cost_per_player_cents, g.status, g.verification, g.courts_booked, g.duration_hours
from tmp_seed_games g
join auth.users u on u.email = g.organizer_email
join public.venues v on v.name = g.venue_name
join tier on tier.slug = g.tier_slug;

-- Rosters. `status` includes one deliberate 'left' (ajay leaving g3 after it started) so the
-- reliability recompute below has something real to dock — not a hand-set number.
create temporary table tmp_seed_players (
  game_label text not null,
  player_email text not null,
  status text not null default 'approved'
) on commit drop;

insert into tmp_seed_players (game_label, player_email, status) values
  ('g1', 'bot1@smashio.dev', 'approved'), ('g1', 'ajay@smashio.dev', 'approved'), ('g1', 'bot4@smashio.dev', 'approved'), ('g1', 'test@smashio.dev', 'approved'),
  ('g2', 'bot1@smashio.dev', 'approved'), ('g2', 'ajay@smashio.dev', 'approved'), ('g2', 'bot4@smashio.dev', 'approved'), ('g2', 'test@smashio.dev', 'approved'),
  ('g3', 'bot1@smashio.dev', 'approved'), ('g3', 'ajay@smashio.dev', 'left'), ('g3', 'bot4@smashio.dev', 'approved'), ('g3', 'maitri@smashio.dev', 'approved'),
  ('g4', 'ajay@smashio.dev', 'approved'), ('g4', 'test@smashio.dev', 'approved'),
  ('g5', 'ajay@smashio.dev', 'approved'), ('g5', 'maitri@smashio.dev', 'approved'), ('g5', 'bot3@smashio.dev', 'approved'),
  ('g6', 'ajay@smashio.dev', 'approved'), ('g6', 'bot1@smashio.dev', 'approved'), ('g6', 'test@smashio.dev', 'approved'),
  ('g7', 'test@smashio.dev', 'approved'), ('g7', 'bot3@smashio.dev', 'approved'), ('g7', 'bot5@smashio.dev', 'approved'), ('g7', 'ajay@smashio.dev', 'approved'),
  ('g8', 'test@smashio.dev', 'approved'), ('g8', 'bot3@smashio.dev', 'approved'), ('g8', 'bot5@smashio.dev', 'approved'),
  ('g9', 'maitri@smashio.dev', 'approved'), ('g9', 'bot2@smashio.dev', 'approved'), ('g9', 'bot4@smashio.dev', 'approved'), ('g9', 'test@smashio.dev', 'approved'),
  ('g10', 'maitri@smashio.dev', 'approved'), ('g10', 'bot2@smashio.dev', 'approved'), ('g10', 'bot4@smashio.dev', 'approved'),
  ('g11', 'bot2@smashio.dev', 'approved'), ('g11', 'maitri@smashio.dev', 'approved'), ('g11', 'bot4@smashio.dev', 'approved'), ('g11', 'ajay@smashio.dev', 'approved'),
  ('g12', 'bot2@smashio.dev', 'approved'), ('g12', 'maitri@smashio.dev', 'approved'),
  ('g13', 'bot3@smashio.dev', 'approved'), ('g13', 'bot5@smashio.dev', 'approved'), ('g13', 'test@smashio.dev', 'approved'),
  ('g14', 'bot5@smashio.dev', 'approved'), ('g14', 'ajay@smashio.dev', 'approved'),
  ('g15', 'bot4@smashio.dev', 'approved'), ('g15', 'bot1@smashio.dev', 'approved'), ('g15', 'maitri@smashio.dev', 'approved'), ('g15', 'test@smashio.dev', 'approved'),
  ('g16', 'bot4@smashio.dev', 'approved'), ('g16', 'bot1@smashio.dev', 'approved'), ('g16', 'ajay@smashio.dev', 'approved'),
  ('g17', 'bot5@smashio.dev', 'approved'), ('g17', 'bot3@smashio.dev', 'approved'), ('g17', 'test@smashio.dev', 'approved'),
  ('g18', 'bot5@smashio.dev', 'approved'), ('g18', 'bot3@smashio.dev', 'approved'),
  -- Upcoming
  ('f1', 'ajay@smashio.dev', 'requested'), ('f1', 'bot3@smashio.dev', 'requested'),
  ('f4', 'bot2@smashio.dev', 'approved'),
  ('f5', 'test@smashio.dev', 'approved'), ('f5', 'bot4@smashio.dev', 'approved');

insert into public.game_players (game_id, profile_id, status, requested_at, decided_at)
select
  gm.id,
  u.id,
  sp.status,
  case when g.status = 'completed' then g.starts_at - interval '2 days' else now() - interval '6 hours' end,
  case
    when sp.status = 'requested' then null
    when sp.status = 'left' then g.starts_at + interval '1 hour'
    when g.status = 'completed' then g.starts_at - interval '1 day'
    else now() - interval '3 hours'
  end
from tmp_seed_players sp
join tmp_seed_games g on g.label = sp.game_label
join auth.users u on u.email = sp.player_email
join public.games gm on gm.organizer_id = (select id from auth.users where email = g.organizer_email) and gm.starts_at = g.starts_at;

-- Ratings: every approved pair in every completed game rates each other, mostly 4-5 stars with
-- the odd 3 — the same shape the real post-game flow produces, not a hand-set average.
insert into public.ratings (game_id, rater_id, ratee_id, stars, created_at)
select gp1.game_id, gp1.profile_id, gp2.profile_id,
  (3 + floor(random() * 3))::int,
  gm.ends_at + interval '15 minutes'
from public.game_players gp1
join public.game_players gp2 on gp2.game_id = gp1.game_id and gp2.profile_id <> gp1.profile_id
join public.games gm on gm.id = gp1.game_id
where gp1.status = 'approved' and gp2.status = 'approved' and gm.status = 'completed'
  and gm.organizer_id in (select id from auth.users where email like '%@smashio.dev')
on conflict (game_id, rater_id, ratee_id) do nothing;

-- Behaviour tags: about 4 in 10 ratings also carry a tag — not every rater bothers, same as
-- the real app.
insert into public.rating_tags (game_id, rater_id, ratee_id, tag, created_at)
select r.game_id, r.rater_id, r.ratee_id,
  (array['punctual', 'good_sport', 'strong_player', 'settled_up'])[1 + floor(random() * 4)::int],
  r.created_at
from public.ratings r
join public.games gm on gm.id = r.game_id
where gm.organizer_id in (select id from auth.users where email like '%@smashio.dev')
  and random() < 0.4
on conflict do nothing;

-- Reliability is computed, not written — same nightly formula the cron runs
-- (recompute_reliability_scores, slice 6), forced once here so ajay's late leave on g3
-- actually shows up as a real dip instead of everyone sitting at the default 100.
select public.recompute_reliability_scores();

commit;
