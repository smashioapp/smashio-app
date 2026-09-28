-- fill-the-spot P5: game-day coordination.
--
--   - host_here_at: the host's "I'm here" tap. Players on the game-day card see it, so nobody is
--     left wondering at reception. Set once, only in the window around the game.
--   - push_game_summary gains payment_method / payment_handle so the 2h reminder can say how to
--     pay (information only, ultraplan §8).

alter table public.games add column host_here_at timestamptz;

create function public.set_host_here(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.games
  set host_here_at = coalesce(host_here_at, now())
  where id = p_game_id
    and organizer_id = auth.uid()
    and status = 'published'
    and starts_at - interval '3 hours' <= now()
    and ends_at + interval '1 hour' >= now();
  if not found then
    raise exception 'You can say you''re here from 3 hours before the game';
  end if;
end;
$$;

grant execute on function public.set_host_here(uuid) to authenticated;

-- Readable by the host and by approved players only.
create function public.game_host_here(p_game_id uuid)
returns timestamptz
language sql
stable
security definer set search_path = public
as $$
  select g.host_here_at
  from public.games g
  where g.id = p_game_id
    and (
      g.organizer_id = auth.uid()
      or exists (
        select 1 from public.game_players gp
        where gp.game_id = g.id and gp.profile_id = auth.uid() and gp.status = 'approved'
      )
    );
$$;

grant execute on function public.game_host_here(uuid) to authenticated;

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
  auto_approve boolean,
  payment_method text,
  payment_handle text
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
    g.auto_approve,
    g.payment_method,
    g.payment_handle
  from public.games g
  join public.venues v on v.id = g.venue_id
  join public.sports s on s.id = g.sport_id
  join public.skill_tiers st on st.id = g.skill_tier_id
  left join public.profiles p on p.id = g.organizer_id
  where g.id = p_game_id;
$$;

grant execute on function public.push_game_summary(uuid) to service_role;
