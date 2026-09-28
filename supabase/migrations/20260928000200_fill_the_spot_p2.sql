-- fill-the-spot P2 (F2, F7): how the host wants to be paid, and the alert knowing whether a tap
-- joins or asks.
--
-- payment_method / payment_handle are information only. No money moves through Smashio
-- (ultraplan §8). The spot card and the "you're in" sheet show them so a player knows cash vs
-- transfer before committing.

alter table public.games
  add column payment_method text check (payment_method is null or payment_method in ('cash', 'transfer', 'chat')),
  add column payment_handle text check (payment_handle is null or char_length(payment_handle) <= 80);

grant insert (payment_method, payment_handle) on public.games to authenticated;
grant update (payment_method, payment_handle) on public.games to authenticated;

create or replace view public.games_public
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
  g.notes,
  g.court_cost_cents,
  g.payment_method,
  g.payment_handle
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id
left join public.skill_tiers stmax on stmax.id = g.skill_tier_max_id
join public.profiles p on p.id = g.organizer_id
join public.game_formats gf on gf.id = g.format_id;

grant select on public.games_public to authenticated;

drop function if exists public.create_game_with_spots(
  uuid, uuid, uuid, timestamptz, int, int, int, int, text, uuid, uuid, text, boolean, text, text, text, jsonb, int
);

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
  p_spots jsonb default '[]'::jsonb,
  p_court_cost_cents int default null,
  p_payment_method text default null,
  p_payment_handle text default null
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
    cost_per_player_cents, format_id, visibility, auto_approve, shuttles, notes, cover_key,
    court_cost_cents, payment_method, payment_handle
  ) values (
    p_sport_id, p_venue_id, auth.uid(), p_starts_at, v_ends_at, nullif(trim(coalesce(p_court_label, '')), ''),
    p_skill_tier_id, coalesce(p_skill_tier_max_id, p_skill_tier_id), p_max_players, p_courts_booked, p_duration_minutes,
    p_cost_per_player_cents, v_format_id, p_visibility, p_auto_approve, nullif(trim(coalesce(p_shuttles, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_cover_key, 'auto'),
    p_court_cost_cents, p_payment_method, nullif(trim(coalesce(p_payment_handle, '')), '')
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

grant execute on function public.create_game_with_spots(
  uuid, uuid, uuid, timestamptz, int, int, int, int, text, uuid, uuid, text, boolean, text, text, text, jsonb, int, text, text
) to authenticated;

-- push_game_summary gains auto_approve so push-dispatch can pick "I'm in" (instant) vs "Ask to
-- join" for the spot alert's inline action.
drop function if exists public.push_game_summary(uuid);

create function public.push_game_summary(p_game_id uuid)
returns table (
  game_id uuid,
  sport_name text,
  venue_name text,
  venue_suburb text,
  starts_at timestamptz,
  ends_at timestamptz,
  court_label text,
  host_id uuid,
  host_name text,
  max_players int,
  approved_count int,
  reserved_spots int,
  spots_left int,
  per_player_cents int,
  tier_name text,
  verification_status text,
  auto_approve boolean
)
language sql
stable
security definer set search_path = public
as $$
  select
    g.id,
    s.name,
    v.name,
    v.suburb,
    g.starts_at,
    g.ends_at,
    g.court_label,
    g.organizer_id,
    coalesce(p.display_name, 'The host'),
    g.max_players,
    public.approved_player_count(g.id),
    g.reserved_spots,
    public.open_spots(g.id),
    g.cost_per_player_cents,
    st.label,
    g.verification_status,
    g.auto_approve
  from public.games g
  join public.venues v on v.id = g.venue_id
  join public.sports s on s.id = g.sport_id
  join public.skill_tiers st on st.id = g.skill_tier_id
  left join public.profiles p on p.id = g.organizer_id
  where g.id = p_game_id;
$$;

grant execute on function public.push_game_summary(uuid) to service_role;
