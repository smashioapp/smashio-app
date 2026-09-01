-- Host a Game v3 (docs/create-game-plan.md E0-E6, design-brief.md Prompt 6/6a/6b).
--
-- Schema deltas for the draft-card rebuild:
--   1. duration_hours (int, whole hours) -> duration_minutes (int, 15-minute steps, 60-360).
--      1h30 is the most common Sydney badminton block; rounding to whole hours published an end
--      time later than the receipt proves, which breaks verification's premise.
--   2. games.notes, games.shuttles, games.visibility, games.auto_approve, game_formats — the
--      "More options" row's fields, all with sensible defaults so a host can publish having
--      never opened it (create-game-plan.md §9.2).
--   3. skill_tier_max_id — skill *range*, not a point. skill_tier_id stays the range floor.
--   4. create_game_with_spots — atomic game + named/anonymous reserved spots in one call, so the
--      lineup strip's "who's coming" picks land with the publish instead of N follow-up RPCs.

-- ---------------------------------------------------------------------------------------------
-- 1. duration_hours -> duration_minutes
-- ---------------------------------------------------------------------------------------------

alter table public.games rename column duration_hours to duration_minutes;
alter table public.games alter column duration_minutes set default 90;
update public.games set duration_minutes = duration_minutes * 60;
alter table public.games drop constraint games_duration_hours_check;
alter table public.games add constraint games_duration_minutes_check
  check (duration_minutes >= 60 and duration_minutes <= 360 and duration_minutes % 15 = 0);

-- ---------------------------------------------------------------------------------------------
-- 2. More-options fields
-- ---------------------------------------------------------------------------------------------

create table public.game_formats (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id),
  slug text not null,
  label text not null,
  ordinal int not null default 0,
  unique (sport_id, slug)
);

alter table public.game_formats enable row level security;
create policy "game_formats readable by authenticated" on public.game_formats
  for select to authenticated using (true);
grant select on public.game_formats to authenticated;

insert into public.game_formats (sport_id, slug, label, ordinal)
select s.id, f.slug, f.label, f.ordinal
from public.sports s
cross join (values
  ('social', 'Social', 0),
  ('competitive', 'Competitive', 1),
  ('drills', 'Drills', 2),
  ('doubles_rotation', 'Doubles rotation', 3)
) as f(slug, label, ordinal)
where s.slug = 'badminton'
on conflict (sport_id, slug) do nothing;

alter table public.games add column format_id uuid references public.game_formats(id);
update public.games g set format_id = (
  select gf.id from public.game_formats gf where gf.sport_id = g.sport_id and gf.slug = 'social'
);
alter table public.games alter column format_id set not null;

-- A column DEFAULT can't hold a subquery, and the right default is sport-specific — a trigger
-- instead of a flat constant, so a second sport isn't silently defaulted to badminton's format.
create function public.default_game_format()
returns trigger
language plpgsql
as $$
begin
  if new.format_id is null then
    select id into new.format_id from public.game_formats where sport_id = new.sport_id and slug = 'social';
  end if;
  return new;
end;
$$;

create trigger games_default_format
  before insert on public.games
  for each row execute function public.default_game_format();

alter table public.games add column visibility text not null default 'public'
  check (visibility in ('public', 'link_only'));
alter table public.games add column auto_approve boolean not null default true;
alter table public.games add column shuttles text;
alter table public.games add column notes text check (notes is null or char_length(notes) <= 280);

-- Skill range: skill_tier_id is the floor, skill_tier_max_id the ceiling. Null max = a point
-- tier, same as today — every existing row backfills to a range of exactly one tier.
alter table public.games add column skill_tier_max_id uuid references public.skill_tiers(id);
update public.games set skill_tier_max_id = skill_tier_id;
-- Nullable on purpose: null means "same as the floor", so any insert that doesn't set it (the
-- seed, older RPC callers) still reads as a single-tier game via coalesce() below.

-- ---------------------------------------------------------------------------------------------
-- 3. games_public / nearby_games / nearby_games_public — rebuilt for the renamed + new columns.
-- Return-type changes force a drop before recreate on the two functions.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.nearby_games_public(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, text[]);
drop function if exists public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean, text[]);
drop view public.games_public;

create view public.games_public
with (security_invoker = true) as
select
  g.id,
  g.sport_id,
  g.venue_id,
  v.name as venue_name,
  v.suburb as venue_suburb,
  v.location as venue_location,
  g.organizer_id,
  g.starts_at,
  g.ends_at,
  g.court_label,
  g.skill_tier_id,
  st.slug as skill_tier_slug,
  st.label as skill_tier_label,
  coalesce(g.skill_tier_max_id, g.skill_tier_id) as skill_tier_max_id,
  coalesce(stmax.label, st.label) as skill_tier_max_label,
  g.max_players,
  g.cost_per_player_cents,
  g.status,
  g.verification_status,
  g.created_at,
  public.approved_player_count(g.id) as approved_count,
  v.address as venue_address,
  extensions.ST_Y(v.location::extensions.geometry) as venue_lat,
  extensions.ST_X(v.location::extensions.geometry) as venue_lng,
  st.ordinal as skill_tier_ordinal,
  p.display_name as organizer_display_name,
  p.photo_path as organizer_photo_path,
  p.reliability_score as organizer_reliability_score,
  (select count(*) from public.games hg where hg.organizer_id = g.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
  g.courts_booked,
  g.duration_minutes,
  g.reserved_spots,
  public.claimed_reserved_count(g.id) as reserved_claimed,
  public.open_spots(g.id) as open_spots,
  p.avatar_key as organizer_avatar_key,
  g.cover_key,
  g.format_id,
  gf.slug as format_slug,
  gf.label as format_label,
  g.visibility,
  g.auto_approve,
  g.shuttles,
  g.notes
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id
left join public.skill_tiers stmax on stmax.id = g.skill_tier_max_id
join public.profiles p on p.id = g.organizer_id
join public.game_formats gf on gf.id = g.format_id;

grant select on public.games_public to authenticated;

create function public.nearby_games(
  lat double precision,
  lng double precision,
  radius_m double precision,
  sport_slug text,
  from_ts timestamptz default now(),
  to_ts timestamptz default null,
  tier_slugs text[] default null,
  has_spots_only boolean default false,
  verified_only boolean default false,
  max_cost_per_player_cents int default null,
  sort_by text default 'soonest',
  p_exclude_mine boolean default true,
  p_amenity_slugs text[] default null
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_address text,
  venue_lat double precision,
  venue_lng double precision,
  organizer_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  court_label text,
  skill_tier_slug text,
  skill_tier_label text,
  skill_tier_ordinal int,
  max_players int,
  cost_per_player_cents int,
  status text,
  verification_status text,
  approved_count int,
  distance_m double precision,
  organizer_display_name text,
  organizer_photo_path text,
  organizer_reliability_score numeric,
  organizer_hosted_count int,
  courts_booked int,
  duration_minutes int,
  reserved_spots int,
  reserved_claimed int,
  open_spots int,
  organizer_avatar_key text,
  cover_key text,
  skill_tier_max_label text,
  format_label text,
  notes text
)
language sql
stable
security invoker
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    gp.venue_address,
    gp.venue_lat,
    gp.venue_lng,
    gp.organizer_id,
    gp.starts_at,
    gp.ends_at,
    gp.court_label,
    gp.skill_tier_slug,
    gp.skill_tier_label,
    gp.skill_tier_ordinal,
    gp.max_players,
    gp.cost_per_player_cents,
    gp.status,
    gp.verification_status,
    gp.approved_count,
    extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) as distance_m,
    p.display_name as organizer_display_name,
    p.photo_path as organizer_photo_path,
    p.reliability_score as organizer_reliability_score,
    (select count(*) from public.games hg where hg.organizer_id = gp.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
    gp.courts_booked,
    gp.duration_minutes,
    gp.reserved_spots,
    gp.reserved_claimed,
    gp.open_spots,
    p.avatar_key as organizer_avatar_key,
    gp.cover_key,
    gp.skill_tier_max_label,
    gp.format_label,
    gp.notes
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  join public.profiles p on p.id = gp.organizer_id
  where s.slug = sport_slug
    and gp.status = 'published'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and (not has_spots_only or gp.open_spots > 0)
    and (not verified_only or gp.verification_status = 'verified')
    and (max_cost_per_player_cents is null or gp.cost_per_player_cents <= max_cost_per_player_cents)
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
    and not public.blocked_between(auth.uid(), gp.organizer_id)
    and (
      p_amenity_slugs is null or array_length(p_amenity_slugs, 1) is null or not exists (
        select 1 from unnest(p_amenity_slugs) as wanted(slug)
        where not exists (
          select 1 from public.venue_amenities va
          where va.venue_id = gp.venue_id and va.amenity_slug = wanted.slug and va.availability in ('yes', 'paid')
        )
      )
    )
    and (
      not p_exclude_mine
      or (
        gp.organizer_id <> auth.uid()
        and not exists (
          select 1 from public.game_players mygp
          where mygp.game_id = gp.id and mygp.profile_id = auth.uid() and mygp.status in ('approved', 'invited')
        )
      )
    )
  order by
    case when sort_by = 'soonest' then gp.starts_at end asc,
    case when sort_by = 'nearest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean, text[]) to authenticated;

create function public.nearby_games_public(
  lat double precision,
  lng double precision,
  radius_m double precision,
  sport_slug text,
  from_ts timestamptz default now(),
  to_ts timestamptz default null,
  tier_slugs text[] default null,
  has_spots_only boolean default false,
  verified_only boolean default false,
  max_cost_per_player_cents int default null,
  sort_by text default 'soonest',
  p_amenity_slugs text[] default null
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_lat double precision,
  venue_lng double precision,
  starts_at timestamptz,
  ends_at timestamptz,
  court_label text,
  skill_tier_slug text,
  skill_tier_label text,
  skill_tier_ordinal int,
  max_players int,
  cost_per_player_cents int,
  status text,
  verification_status text,
  approved_count int,
  distance_m double precision,
  courts_booked int,
  duration_minutes int,
  reserved_spots int,
  reserved_claimed int,
  open_spots int,
  cover_key text
)
language sql
stable
security definer set search_path = public
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    gp.venue_lat,
    gp.venue_lng,
    gp.starts_at,
    gp.ends_at,
    gp.court_label,
    gp.skill_tier_slug,
    gp.skill_tier_label,
    gp.skill_tier_ordinal,
    gp.max_players,
    gp.cost_per_player_cents,
    gp.status,
    gp.verification_status,
    gp.approved_count,
    extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) as distance_m,
    gp.courts_booked,
    gp.duration_minutes,
    gp.reserved_spots,
    gp.reserved_claimed,
    gp.open_spots,
    gp.cover_key
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  where s.slug = sport_slug
    and gp.status = 'published'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and (not has_spots_only or gp.open_spots > 0)
    and (not verified_only or gp.verification_status = 'verified')
    and (max_cost_per_player_cents is null or gp.cost_per_player_cents <= max_cost_per_player_cents)
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
    and (
      p_amenity_slugs is null or array_length(p_amenity_slugs, 1) is null or not exists (
        select 1 from unnest(p_amenity_slugs) as wanted(slug)
        where not exists (
          select 1 from public.venue_amenities va
          where va.venue_id = gp.venue_id and va.amenity_slug = wanted.slug and va.availability in ('yes', 'paid')
        )
      )
    )
  order by
    case when sort_by = 'closest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc nulls last,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    case when sort_by = 'most_spots' then gp.open_spots end desc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games_public(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. create_game_with_spots — atomic publish. Reuses add_reserved_spot / invite_to_reserved_spot
-- (20260824000000_host_slot_reserved_spots.sql) for each requested spot so the cap/floor triggers
-- stay the single source of truth; this function only owns the insert + the loop.
-- ---------------------------------------------------------------------------------------------

create function public.create_game_with_spots(
  p_sport_id uuid,
  p_venue_id uuid,
  p_skill_tier_id uuid,
  p_starts_at timestamptz,
  p_max_players int,
  p_courts_booked int,
  p_duration_minutes int,
  p_cost_per_player_cents int,
  p_court_label text default null,
  p_skill_tier_max_id uuid default null,
  p_format_id uuid default null,
  p_visibility text default 'public',
  p_auto_approve boolean default true,
  p_shuttles text default null,
  p_notes text default null,
  p_cover_key text default 'auto',
  p_spots jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
  v_ends_at timestamptz;
  v_spot jsonb;
  v_spot_id uuid;
  v_format_id uuid;
begin
  v_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);
  v_format_id := coalesce(p_format_id, (select id from public.game_formats where sport_id = p_sport_id and slug = 'social'));

  insert into public.games (
    sport_id, venue_id, organizer_id, starts_at, ends_at, court_label,
    skill_tier_id, skill_tier_max_id, max_players, courts_booked, duration_minutes,
    cost_per_player_cents, format_id, visibility, auto_approve, shuttles, notes, cover_key
  ) values (
    p_sport_id, p_venue_id, auth.uid(), p_starts_at, v_ends_at, nullif(trim(coalesce(p_court_label, '')), ''),
    p_skill_tier_id, coalesce(p_skill_tier_max_id, p_skill_tier_id), p_max_players, p_courts_booked, p_duration_minutes,
    p_cost_per_player_cents, v_format_id, p_visibility, p_auto_approve, nullif(trim(coalesce(p_shuttles, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_cover_key, 'auto')
  )
  returning id into v_game_id;

  for v_spot in select * from jsonb_array_elements(coalesce(p_spots, '[]'::jsonb))
  loop
    v_spot_id := public.add_reserved_spot(v_game_id, v_spot->>'label');
    if v_spot ? 'invited_profile_id' and (v_spot->>'invited_profile_id') is not null then
      perform public.invite_to_reserved_spot(v_spot_id, (v_spot->>'invited_profile_id')::uuid);
    end if;
  end loop;

  return v_game_id;
end;
$$;

grant execute on function public.create_game_with_spots(uuid, uuid, uuid, timestamptz, int, int, int, int, text, uuid, uuid, text, boolean, text, text, text, jsonb) to authenticated;
