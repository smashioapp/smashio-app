-- website-plan.md W2 — the SEO-facing games surface. §5.3 rule: SEO pages get their own
-- security-definer RPCs with an explicit column allowlist, never a reuse of the Discover RPCs
-- (nearby_games_public carries organizer/venue-coordinate fields that are an app contract, not a
-- public-web one — see the plan's §5.3 for why that reuse is refused).
--
-- Column allowlist enforced here per §5.4/§5.3: game id, venue name, venue suburb, venue slug,
-- start, end, skill tier label, format label, max players, open spots, cost per player, courts
-- booked. No lat/lng (§5.5 T2 — game rows with coordinates make a scraped movement dataset
-- trivially joinable; suburb only, the venue page already carries the address). No organiser
-- identity, no notes, no roster/rating data (§5.4).
--
-- Bounds per §5.5 T1 (enumeration): hard p_limit cap of 50, no offset paging, and a window of
-- now to now+14 days — past games never appear, and games.visibility = 'public' is enforced
-- everywhere per 20260910000000_link_only_visibility.sql.

-- ---------------------------------------------------------------------------------------------
-- 1. games_seo_feed — city-wide or suburb-scoped live listing, for the home page and /sydney.
-- ---------------------------------------------------------------------------------------------

create or replace function public.games_seo_feed(
  p_suburb text default null,
  p_from timestamptz default now(),
  p_to timestamptz default null,
  p_limit int default 12
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_slug text,
  starts_at timestamptz,
  ends_at timestamptz,
  skill_tier_label text,
  format_label text,
  max_players int,
  open_spots int,
  cost_per_player_cents int,
  courts_booked int
)
language sql
stable
security definer set search_path = public
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    v.slug as venue_slug,
    gp.starts_at,
    gp.ends_at,
    gp.skill_tier_label,
    gp.format_label,
    gp.max_players,
    gp.open_spots,
    gp.cost_per_player_cents,
    gp.courts_booked
  from public.games_public gp
  join public.venues v on v.id = gp.venue_id
  where gp.status = 'published'
    and gp.visibility = 'public'
    and gp.starts_at >= greatest(p_from, now())
    and gp.starts_at <= coalesce(p_to, now() + interval '14 days')
    and (p_suburb is null or gp.venue_suburb = p_suburb)
  order by gp.starts_at asc
  limit least(coalesce(p_limit, 12), 50);
$$;

grant execute on function public.games_seo_feed(text, timestamptz, timestamptz, int) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. games_seo_at_venue — same allowlist, scoped to one venue by slug. Feeds W5 (venue pages);
-- shipped now since it costs nothing extra and W5 is gated on W4.5's host-consent window, not on
-- this function existing.
-- ---------------------------------------------------------------------------------------------

create or replace function public.games_seo_at_venue(
  p_venue_slug text,
  p_limit int default 12
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_slug text,
  starts_at timestamptz,
  ends_at timestamptz,
  skill_tier_label text,
  format_label text,
  max_players int,
  open_spots int,
  cost_per_player_cents int,
  courts_booked int
)
language sql
stable
security definer set search_path = public
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    v.slug as venue_slug,
    gp.starts_at,
    gp.ends_at,
    gp.skill_tier_label,
    gp.format_label,
    gp.max_players,
    gp.open_spots,
    gp.cost_per_player_cents,
    gp.courts_booked
  from public.games_public gp
  join public.venues v on v.id = gp.venue_id
  where gp.status = 'published'
    and gp.visibility = 'public'
    and v.slug = p_venue_slug
    and gp.starts_at >= now()
    and gp.starts_at <= now() + interval '14 days'
  order by gp.starts_at asc
  limit least(coalesce(p_limit, 12), 50);
$$;

grant execute on function public.games_seo_at_venue(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. city_seo_stats — aggregate social proof for the home page and /sydney hero ("41 games this
-- week"). Counts only, no rows, so it carries none of the §5.4 PII concerns.
-- ---------------------------------------------------------------------------------------------

create or replace function public.city_seo_stats()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'games_this_week', (
      select count(*)::int from public.games_public gp
      where gp.status = 'published'
        and gp.visibility = 'public'
        and gp.starts_at >= now()
        and gp.starts_at <= now() + interval '7 days'
    ),
    'venues_tracked', (
      select count(*)::int from public.venues v where v.slug is not null
    ),
    'generated_at', now()
  );
$$;

grant execute on function public.city_seo_stats() to anon, authenticated;
