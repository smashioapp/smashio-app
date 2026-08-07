-- Slice 2: games joined to venue + tier, so the client never assembles this itself.
-- security_invoker so the view is subject to the querying user's own RLS on games/venues,
-- not the view owner's.
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
  g.max_players,
  g.cost_total_cents,
  g.status,
  g.verification_status,
  g.created_at,
  -- Placeholder until slice 4 adds game_players; shape doesn't change when that lands.
  0 as approved_count
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id;

grant select on public.games_public to authenticated;
