-- Short-a-player plan S7 (docs/short-a-player-plan.md §3 S7): the shared-link page and the app's
-- GamePreviewTeaser say "Needs N" and show the court-booked tick, so game_preview has to project
-- both. Neither is new exposure: nearby_games_public already hands `anon` open_spots and
-- verification_status for every listed game (20260910000000).
--
-- open_spots comes from public.open_spots(), the one definition of "open" (host takes a slot,
-- only *unclaimed* reserved spots are held). The old spots_left expression here ignored the
-- host's slot and subtracted claimed reserved spots twice; it's kept under its old name for any
-- cached caller but now returns the same number as open_spots.
--
-- Return-type change, so drop and recreate. Since 20260914000400 a new function is executable by
-- nobody in anon/authenticated until granted, so both grants are explicit.

drop function if exists public.game_preview(uuid);

create function public.game_preview(p_game_id uuid)
returns table (
  id uuid,
  sport_slug text,
  venue_name text,
  venue_suburb text,
  starts_at timestamptz,
  ends_at timestamptz,
  skill_tier_label text,
  max_players int,
  cost_per_player_cents int,
  status text,
  spots_left int,
  open_spots int,
  court_booked boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    g.id,
    s.slug as sport_slug,
    v.name as venue_name,
    v.suburb as venue_suburb,
    g.starts_at,
    g.ends_at,
    st.label as skill_tier_label,
    g.max_players,
    g.cost_per_player_cents,
    g.status,
    public.open_spots(g.id) as spots_left,
    public.open_spots(g.id) as open_spots,
    g.verification_status = 'verified' as court_booked
  from public.games g
  join public.venues v on v.id = g.venue_id
  join public.skill_tiers st on st.id = g.skill_tier_id
  join public.sports s on s.id = g.sport_id
  where g.id = p_game_id;
$$;

revoke execute on function public.game_preview(uuid) from public;
grant execute on function public.game_preview(uuid) to anon, authenticated;
