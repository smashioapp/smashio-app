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

-- Venues, matching the mocked list so discover looks the same on first run.
insert into public.venues (name, suburb, state, location, source) values
  ('Melbourne Sports Centre', 'Albert Park', 'VIC', extensions.ST_SetSRID(extensions.ST_MakePoint(144.9631, -37.8446), 4326), 'partner'),
  ('Bounce Badminton', 'Richmond', 'VIC', extensions.ST_SetSRID(extensions.ST_MakePoint(144.9982, -37.8225), 4326), 'partner'),
  ('Victorian Badminton Centre', 'Boronia', 'VIC', extensions.ST_SetSRID(extensions.ST_MakePoint(145.2847, -37.8497), 4326), 'partner'),
  ('Preston Sports Hub', 'Preston', 'VIC', extensions.ST_SetSRID(extensions.ST_MakePoint(145.0025, -37.7480), 4326), 'partner');

-- Test games/users land once slice 3 (create wizard) can produce a real organizer + game.
