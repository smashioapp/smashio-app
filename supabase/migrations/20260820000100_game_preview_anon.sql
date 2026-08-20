-- Anon deep-link teaser (whatsapp/sms share links open before login): expose only enough to
-- entice login/signup — no organizer PII, no exact address, no roster. security definer so it
-- can bypass the authenticated-only RLS on games/venues without granting anon broad table access;
-- single-id lookup only, so a UUID must already be known (not listable).
create or replace function public.game_preview(p_game_id uuid)
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
  status text
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
    g.status
  from public.games g
  join public.venues v on v.id = g.venue_id
  join public.skill_tiers st on st.id = g.skill_tier_id
  join public.sports s on s.id = g.sport_id
  where g.id = p_game_id;
$$;

grant execute on function public.game_preview(uuid) to anon, authenticated;
