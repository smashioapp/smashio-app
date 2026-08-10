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

-- Venues. Sydney-only for launch — see docs/ux-plan.md.
insert into public.venues (name, suburb, state, location, source) values
  ('Sydney Badminton Centre', 'Homebush', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0678, -33.8474), 4326), 'partner'),
  ('Ryde Badminton Stadium', 'North Ryde', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1229, -33.7940), 4326), 'partner'),
  ('Rockdale Badminton Centre', 'Rockdale', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1385, -33.9522), 4326), 'partner'),
  ('Bondi Badminton Club', 'Bondi Junction', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.2493, -33.8926), 4326), 'partner'),
  ('Inner West Badminton Centre', 'Marrickville', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1552, -33.9107), 4326), 'partner'),
  ('Parramatta Badminton Arena', 'Parramatta', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0011, -33.8150), 4326), 'partner'),
  ('Chatswood Badminton Centre', 'Chatswood', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1810, -33.7969), 4326), 'partner');

-- Test games/users land once slice 3 (create wizard) can produce a real organizer + game.
