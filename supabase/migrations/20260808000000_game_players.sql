-- Slice 4: join requests + organizer approve/reject. Client only ever inserts a 'requested'
-- row for itself; every later transition goes through decide_join_request/leave_game
-- (SECURITY DEFINER) so capacity checks stay atomic under concurrent approvals.
create table public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'left', 'removed')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (game_id, profile_id)
);

create index game_players_game_id_idx on public.game_players (game_id);

alter table public.game_players enable row level security;

-- SECURITY DEFINER so RLS policies that need "is uid an approved member of this game" don't
-- self-reference game_players (self-joins on a table's own RLS policy recurse in Postgres).
-- Reused by messages RLS in slice 5.
create function public.is_approved_player(p_game_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.game_players
    where game_id = p_game_id and profile_id = p_profile_id and status = 'approved'
  );
$$;

grant execute on function public.is_approved_player(uuid, uuid) to authenticated;

-- Bypasses the roster-privacy RLS below on purpose: discover/game cards show a headcount to
-- everyone, not just members, without exposing who those members are.
create function public.approved_player_count(p_game_id uuid)
returns int
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int from public.game_players where game_id = p_game_id and status = 'approved';
$$;

grant execute on function public.approved_player_count(uuid) to authenticated;

-- Roster identities stay private to the organizer + approved members — strangers browsing
-- discover only ever see the count (via approved_player_count / games_public), not names.
create policy "game_players readable by organizer and members" on public.game_players
  for select to authenticated using (
    profile_id = auth.uid()
    or exists (select 1 from public.games g where g.id = game_players.game_id and g.organizer_id = auth.uid())
    or public.is_approved_player(game_id, auth.uid())
  );

create policy "game_players insert own request" on public.game_players
  for insert to authenticated
  with check (profile_id = auth.uid() and status = 'requested');

-- No update/delete policy for clients — decide_join_request and leave_game own every other
-- transition.
grant select, insert on public.game_players to authenticated;

-- Row lock on the game serializes concurrent decisions so two organizers/taps can't both
-- approve past max_players.
create function public.decide_join_request(p_game_id uuid, p_profile_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_organizer_id uuid;
  v_max_players int;
  v_approved_count int;
begin
  select organizer_id, max_players into v_organizer_id, v_max_players
  from public.games
  where id = p_game_id
  for update;

  if v_organizer_id is null then
    raise exception 'Game not found';
  end if;

  if v_organizer_id <> auth.uid() then
    raise exception 'Only the organizer can decide join requests';
  end if;

  if approve then
    select count(*) into v_approved_count
    from public.game_players
    where game_id = p_game_id and status = 'approved';

    if v_approved_count >= v_max_players then
      raise exception 'Game is full';
    end if;

    update public.game_players
    set status = 'approved', decided_at = now()
    where game_id = p_game_id and profile_id = p_profile_id and status = 'requested';
  else
    update public.game_players
    set status = 'rejected', decided_at = now()
    where game_id = p_game_id and profile_id = p_profile_id and status = 'requested';
  end if;
end;
$$;

grant execute on function public.decide_join_request(uuid, uuid, boolean) to authenticated;

-- Notice-window / reliability scoring off the leave timestamp is slice 6's job (formula is
-- still an open question) — this just records the transition.
create function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.game_players
  set status = 'left', decided_at = now()
  where game_id = p_game_id and profile_id = auth.uid() and status = 'approved';
end;
$$;

grant execute on function public.leave_game(uuid) to authenticated;

-- Real headcount now that game_players exists — was hardcoded 0 in slice 2.
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
  g.max_players,
  g.cost_total_cents,
  g.status,
  g.verification_status,
  g.created_at,
  public.approved_player_count(g.id) as approved_count
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id;

grant select on public.games_public to authenticated;
