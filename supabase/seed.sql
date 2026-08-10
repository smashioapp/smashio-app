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
insert into public.venues (name, suburb, state, location, source) values
  ('NBC Homebush', 'Homebush Bay', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0678, -33.8474), 4326), 'partner'),
  ('Alpha Badminton Centre', 'Silverwater', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0483, -33.8386), 4326), 'partner'),
  ('PCYC Auburn', 'Lidcombe', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0435, -33.8656), 4326), 'partner'),
  ('Sydney Badminton', 'Hurstville', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1027, -33.9669), 4326), 'partner'),
  ('Willoughby Leisure Centre', 'Willoughby', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1993, -33.8039), 4326), 'partner'),
  ('MUSAC', 'Macquarie Park', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1219, -33.7749), 4326), 'partner'),
  ('PCYC Marrickville', 'Marrickville', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.1552, -33.9107), 4326), 'partner'),
  ('Australian Badminton Academy - North Parramatta', 'North Parramatta', 'NSW', extensions.ST_SetSRID(extensions.ST_MakePoint(151.0021, -33.8020), 4326), 'partner');

-- Test games/users land once slice 3 (create wizard) can produce a real organizer + game.
