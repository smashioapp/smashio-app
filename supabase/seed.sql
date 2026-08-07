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

-- Venues/test users land in slice 2 alongside their tables.
