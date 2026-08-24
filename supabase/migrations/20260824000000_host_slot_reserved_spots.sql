-- post-game-plan.md D1/D2/D3/D10/D11. Two problems, one migration because they share the
-- capacity formula:
--
--   1. The host never occupied a slot. `approved_count` only counts game_players rows and the
--      organizer has none, so a max_players = 4 game seated 4 joiners + the host. On top of
--      that decide_join_request compared approved_count against max_players and ignored
--      reserved_spots entirely, so a host could approve strangers into spots held for friends.
--   2. `reserved_spots` was an anonymous integer with no way to name, invite, or claim a spot.
--      A friend who joined through the front door consumed an *open* spot while the reserved
--      one stayed held.
--
-- New formula, used everywhere "spots left" appears:
--   open = max_players - 1 (host) - approved_count - max(0, reserved_spots - claimed_reserved)
--
-- A claimed reserved spot becomes an approved game_players row, so it leaves the reserved pool
-- and enters approved_count in the same step — net zero, capacity stays honest.

-- The host's own slot is not reservable, so the ceiling drops by one.
alter table public.games drop constraint games_reserved_spots_check;
alter table public.games
  add constraint games_reserved_spots_check check (reserved_spots >= 0 and reserved_spots <= max_players - 1);

-- 'invited' = the host direct-added an existing user to a named reserved spot and they haven't
-- answered yet. Distinct from 'requested' (player asked, host decides) — here the host asked
-- and the player decides. Holds no capacity of its own: the reserved spot it points at is
-- already held.
alter table public.game_players drop constraint game_players_status_check;
alter table public.game_players
  add constraint game_players_status_check
  check (status in ('requested', 'invited', 'approved', 'rejected', 'left', 'removed', 'declined'));

-- One row per *named* reserved spot. games.reserved_spots stays the total the host is holding;
-- rows here are the subset they've put a name, an invite, or a link on. The remainder is the
-- anonymous count the wizard has always supported (D2 — both, not either).
create table public.game_reserved_spots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  -- Free text, host's own shorthand ("Raj", "my brother"). Shown on the roster to members so a
  -- 2-of-4 headcount reads sensibly; null for a spot the host named but left blank.
  label text,
  -- Direct-add target (D10). The matching game_players row carries status 'invited' until they
  -- answer; accepting sets claimed_by, declining clears this back to null so the host can retry.
  invited_profile_id uuid references public.profiles(id) on delete set null,
  -- Single-use share link token (D11). Burned to null on claim; the host can mint a new one.
  invite_token text unique,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  -- One person per spot, and a spot can't be both awaiting an invite answer and already claimed.
  unique (game_id, claimed_by),
  constraint game_reserved_spots_claim_check check (
    (claimed_by is null and claimed_at is null) or (claimed_by is not null and claimed_at is not null)
  )
);

create index game_reserved_spots_game_id_idx on public.game_reserved_spots (game_id);
create index game_reserved_spots_claimed_by_idx on public.game_reserved_spots (claimed_by);

-- Named spots can never outnumber the spots actually held. Enforced here rather than as a check
-- constraint because it compares the row count against games.reserved_spots.
create function public.enforce_reserved_spot_cap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_held int;
  v_named int;
begin
  select reserved_spots into v_held from public.games where id = new.game_id for update;
  select count(*) into v_named from public.game_reserved_spots where game_id = new.game_id and id <> new.id;
  if v_named + 1 > coalesce(v_held, 0) then
    raise exception 'Named reserved spots (%) would exceed the % reserved on this game', v_named + 1, coalesce(v_held, 0);
  end if;
  return new;
end;
$$;

create trigger game_reserved_spots_cap
  before insert or update of game_id on public.game_reserved_spots
  for each row execute function public.enforce_reserved_spot_cap();

-- Mirror guard on the games side: a host can't shrink reserved_spots below the spots they've
-- already named, and can't shrink below the ones already claimed at all.
create function public.enforce_reserved_spot_floor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_named int;
begin
  if new.reserved_spots >= old.reserved_spots then
    return new;
  end if;
  select count(*) into v_named from public.game_reserved_spots where game_id = new.id;
  if v_named > new.reserved_spots then
    raise exception 'Release a named reserved spot first — % named, % requested', v_named, new.reserved_spots;
  end if;
  return new;
end;
$$;

create trigger games_reserved_spot_floor
  before update of reserved_spots on public.games
  for each row execute function public.enforce_reserved_spot_floor();

alter table public.game_reserved_spots enable row level security;

-- Roster privacy: members see the named spots (that's the point — the headcount has to make
-- sense), everyone else sees nothing. Same organizer-or-approved shape as chat/player_card.
-- No client writes at all; every mutation is a SECURITY DEFINER RPC below.
create policy "game_reserved_spots readable by members" on public.game_reserved_spots
  for select to authenticated using (
    exists (
      select 1 from public.games g
      where g.id = game_reserved_spots.game_id
        and (g.organizer_id = auth.uid() or public.is_approved_player(g.id, auth.uid()))
    )
    or invited_profile_id = auth.uid()
  );

grant select on public.game_reserved_spots to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Capacity
-- ---------------------------------------------------------------------------------------------

create function public.claimed_reserved_count(p_game_id uuid)
returns int
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int from public.game_reserved_spots
  where game_id = p_game_id and claimed_by is not null;
$$;

grant execute on function public.claimed_reserved_count(uuid) to anon, authenticated;

-- The one place the formula lives. Everything else — the view, nearby_games, the join guard,
-- the client — reads this instead of re-deriving it.
create function public.open_spots(p_game_id uuid)
returns int
language sql
stable
security definer set search_path = public
as $$
  select greatest(
    0,
    g.max_players
      - 1
      - public.approved_player_count(p_game_id)
      - greatest(0, g.reserved_spots - public.claimed_reserved_count(p_game_id))
  )::int
  from public.games g
  where g.id = p_game_id;
$$;

grant execute on function public.open_spots(uuid) to anon, authenticated;

-- Was: approved_count >= max_players, which both ignored the host's slot and let strangers eat
-- reserved spots. A player claiming a reserved spot never comes through here (claim_reserved_spot
-- and respond_to_game_invite own that path), so this is unconditionally the stranger check.
create or replace function public.decide_join_request(p_game_id uuid, p_profile_id uuid, approve boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_organizer_id uuid;
begin
  select organizer_id into v_organizer_id
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
    if public.open_spots(p_game_id) <= 0 then
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

-- ---------------------------------------------------------------------------------------------
-- Reserved spot management (organizer)
-- ---------------------------------------------------------------------------------------------

create function public.assert_is_organizer(p_game_id uuid)
returns void
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.games where id = p_game_id and organizer_id = auth.uid()) then
    raise exception 'Only the organizer can manage this game';
  end if;
end;
$$;

grant execute on function public.assert_is_organizer(uuid) to authenticated;

-- Names a spot the host is already holding. Bumps reserved_spots by one when every held spot is
-- already named, so "add a friend" is one action rather than two (raise the count, then name it).
create function public.add_reserved_spot(p_game_id uuid, p_label text default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_held int;
  v_named int;
  v_id uuid;
begin
  perform public.assert_is_organizer(p_game_id);

  select reserved_spots into v_held from public.games where id = p_game_id for update;

  select count(*) into v_named from public.game_reserved_spots where game_id = p_game_id;

  if v_named >= v_held then
    if public.open_spots(p_game_id) <= 0 then
      raise exception 'No spots left to reserve';
    end if;
    update public.games set reserved_spots = reserved_spots + 1 where id = p_game_id;
  end if;

  insert into public.game_reserved_spots (game_id, label)
  values (p_game_id, nullif(trim(coalesce(p_label, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_reserved_spot(uuid, text) to authenticated;

create function public.rename_reserved_spot(p_spot_id uuid, p_label text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
begin
  select game_id into v_game_id from public.game_reserved_spots where id = p_spot_id;
  if v_game_id is null then
    raise exception 'Reserved spot not found';
  end if;
  perform public.assert_is_organizer(v_game_id);

  update public.game_reserved_spots
  set label = nullif(trim(coalesce(p_label, '')), '')
  where id = p_spot_id;
end;
$$;

grant execute on function public.rename_reserved_spot(uuid, text) to authenticated;

-- D3: an unclaimed reserved spot stays held until the host releases it. Releasing frees the
-- capacity too (drops reserved_spots by one), which is what "my friend cancelled" means.
-- A claimed spot can't be released this way — remove_player is the path for someone on the
-- roster, and it hands the spot back automatically (see below).
create function public.remove_reserved_spot(p_spot_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
  v_claimed_by uuid;
  v_invited uuid;
begin
  select game_id, claimed_by, invited_profile_id
  into v_game_id, v_claimed_by, v_invited
  from public.game_reserved_spots where id = p_spot_id;

  if v_game_id is null then
    raise exception 'Reserved spot not found';
  end if;
  perform public.assert_is_organizer(v_game_id);

  if v_claimed_by is not null then
    raise exception 'That spot is taken — remove the player from the roster instead';
  end if;

  -- A pending invite dies with the spot.
  if v_invited is not null then
    update public.game_players set status = 'declined', decided_at = now()
    where game_id = v_game_id and profile_id = v_invited and status = 'invited';
  end if;

  delete from public.game_reserved_spots where id = p_spot_id;
  update public.games set reserved_spots = greatest(0, reserved_spots - 1) where id = v_game_id;
end;
$$;

grant execute on function public.remove_reserved_spot(uuid) to authenticated;

-- D10: direct-add is an invitation, not an enrolment. The invitee owes money for this game;
-- they get to say yes.
create function public.invite_to_reserved_spot(p_spot_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
  v_claimed_by uuid;
  v_organizer uuid;
begin
  select rs.game_id, rs.claimed_by, g.organizer_id
  into v_game_id, v_claimed_by, v_organizer
  from public.game_reserved_spots rs
  join public.games g on g.id = rs.game_id
  where rs.id = p_spot_id;

  if v_game_id is null then
    raise exception 'Reserved spot not found';
  end if;
  perform public.assert_is_organizer(v_game_id);

  if v_claimed_by is not null then
    raise exception 'That spot is already taken';
  end if;
  if p_profile_id = v_organizer then
    raise exception 'You already have a spot in this game';
  end if;
  if exists (
    select 1 from public.game_players
    where game_id = v_game_id and profile_id = p_profile_id and status in ('approved', 'invited')
  ) then
    raise exception 'That player is already on this game';
  end if;

  update public.game_reserved_spots set invited_profile_id = p_profile_id where id = p_spot_id;

  insert into public.game_players (game_id, profile_id, status, requested_at, decided_at)
  values (v_game_id, p_profile_id, 'invited', now(), null)
  on conflict (game_id, profile_id) do update
    set status = 'invited', requested_at = now(), decided_at = null;
end;
$$;

grant execute on function public.invite_to_reserved_spot(uuid, uuid) to authenticated;

-- D11: one single-use token per spot, regenerable. Two uuids' worth of entropy so it can be
-- pasted into a chat safely; no pgcrypto dependency.
create function public.create_reserved_spot_invite(p_spot_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
  v_claimed_by uuid;
  v_token text;
begin
  select game_id, claimed_by into v_game_id, v_claimed_by
  from public.game_reserved_spots where id = p_spot_id;

  if v_game_id is null then
    raise exception 'Reserved spot not found';
  end if;
  perform public.assert_is_organizer(v_game_id);

  if v_claimed_by is not null then
    raise exception 'That spot is already taken';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.game_reserved_spots set invite_token = v_token where id = p_spot_id;
  return v_token;
end;
$$;

grant execute on function public.create_reserved_spot_invite(uuid) to authenticated;

-- Called by whoever opens the share link, after sign-in. Burns the token, so the second person
-- to open the same link gets a clean "already taken" rather than silently stealing the spot.
create function public.claim_reserved_spot(p_token text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_spot_id uuid;
  v_game_id uuid;
  v_organizer uuid;
  v_status text;
begin
  select rs.id, rs.game_id, g.organizer_id, g.status
  into v_spot_id, v_game_id, v_organizer, v_status
  from public.game_reserved_spots rs
  join public.games g on g.id = rs.game_id
  where rs.invite_token = p_token and rs.claimed_by is null
  for update of rs;

  if v_spot_id is null then
    raise exception 'That invite has already been used or was cancelled';
  end if;
  if v_status <> 'published' then
    raise exception 'That game is no longer open';
  end if;
  if v_organizer = auth.uid() then
    raise exception 'You already have a spot in this game';
  end if;
  if exists (
    select 1 from public.game_players
    where game_id = v_game_id and profile_id = auth.uid() and status = 'approved'
  ) then
    raise exception 'You are already on this game';
  end if;

  update public.game_reserved_spots
  set claimed_by = auth.uid(), claimed_at = now(), invite_token = null, invited_profile_id = null
  where id = v_spot_id;

  insert into public.game_players (game_id, profile_id, status, requested_at, decided_at)
  values (v_game_id, auth.uid(), 'approved', now(), now())
  on conflict (game_id, profile_id) do update
    set status = 'approved', decided_at = now();

  return v_game_id;
end;
$$;

grant execute on function public.claim_reserved_spot(text) to authenticated;

-- The invitee's side of invite_to_reserved_spot.
create function public.respond_to_game_invite(p_game_id uuid, p_accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_spot_id uuid;
begin
  if not exists (
    select 1 from public.game_players
    where game_id = p_game_id and profile_id = auth.uid() and status = 'invited'
  ) then
    raise exception 'No pending invite for this game';
  end if;

  select id into v_spot_id
  from public.game_reserved_spots
  where game_id = p_game_id and invited_profile_id = auth.uid() and claimed_by is null
  for update;

  if p_accept then
    if v_spot_id is null then
      raise exception 'That spot is no longer available';
    end if;

    update public.game_reserved_spots
    set claimed_by = auth.uid(), claimed_at = now(), invite_token = null
    where id = v_spot_id;

    update public.game_players
    set status = 'approved', decided_at = now()
    where game_id = p_game_id and profile_id = auth.uid();
  else
    update public.game_reserved_spots set invited_profile_id = null where id = v_spot_id;

    update public.game_players
    set status = 'declined', decided_at = now()
    where game_id = p_game_id and profile_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.respond_to_game_invite(uuid, boolean) to authenticated;

-- Removing a claimed player has to hand their reserved spot back to the host, otherwise the
-- spot is stranded — held, unnamed to anyone, and unusable.
create or replace function public.remove_player(p_game_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_organizer_id uuid;
begin
  select organizer_id into v_organizer_id from public.games where id = p_game_id;

  if v_organizer_id is null then
    raise exception 'Game not found';
  end if;
  if v_organizer_id <> auth.uid() then
    raise exception 'Only the organizer can remove players';
  end if;
  if p_profile_id = v_organizer_id then
    raise exception 'The organizer cannot be removed';
  end if;

  update public.game_players
  set status = 'removed', decided_at = now()
  where game_id = p_game_id and profile_id = p_profile_id and status = 'approved';

  update public.game_reserved_spots
  set claimed_by = null, claimed_at = null
  where game_id = p_game_id and claimed_by = p_profile_id;
end;
$$;

-- Same for a player who walks away from a spot they claimed.
create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.game_players
  set status = 'left', decided_at = now()
  where game_id = p_game_id and profile_id = auth.uid() and status = 'approved';

  update public.game_reserved_spots
  set claimed_by = null, claimed_at = null
  where game_id = p_game_id and claimed_by = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Projections: games_public + nearby_games carry the computed numbers so no client re-derives
-- the formula.
-- ---------------------------------------------------------------------------------------------

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
  g.duration_hours,
  g.reserved_spots,
  public.claimed_reserved_count(g.id) as reserved_claimed,
  public.open_spots(g.id) as open_spots
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id
join public.profiles p on p.id = g.organizer_id;

grant select on public.games_public to authenticated;

-- Return type changes (two new columns), so drop-and-recreate the amenity_filters signature.
drop function if exists public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean, text[]);

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
  duration_hours int,
  reserved_spots int,
  reserved_claimed int,
  open_spots int
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
    gp.duration_hours,
    gp.reserved_spots,
    gp.reserved_claimed,
    gp.open_spots
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
    case when sort_by = 'closest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc nulls last,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    case when sort_by = 'most_spots' then gp.open_spots end desc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean, text[]) to authenticated;

-- Push copy said "2 spots left" off the old formula, so every reminder/nudge overstated the
-- game by one. Same fix, one source: open_spots.
create or replace function public.push_game_summary(p_game_id uuid)
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
  verification_status text
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
    g.verification_status
  from public.games g
  join public.venues v on v.id = g.venue_id
  join public.sports s on s.id = g.sport_id
  join public.skill_tiers st on st.id = g.skill_tier_id
  left join public.profiles p on p.id = g.organizer_id
  where g.id = p_game_id;
$$;

grant execute on function public.push_game_summary(uuid) to service_role;

-- The shrink guard compared max_players against approved_count alone, which under the new
-- formula would let a host shrink a full game (host + 3 approved) from 4 to 3 and strand
-- someone. The floor is now everything already committed: the host, the roster, and any
-- reserved spot nobody has claimed yet.
create or replace function public.enforce_game_edit_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_floor int;
begin
  if old.status = 'cancelled' and new.status = 'cancelled' then
    raise exception 'This game is cancelled and can no longer be edited';
  end if;

  if new.max_players <> old.max_players then
    select 1
      + public.approved_player_count(new.id)
      + greatest(0, new.reserved_spots - public.claimed_reserved_count(new.id))
    into v_floor;

    if new.max_players < v_floor then
      raise exception 'Can''t set max players below the % already committed (you, the roster, and any spots you''re holding)', v_floor;
    end if;
  end if;

  if new.starts_at <> old.starts_at and new.starts_at <= now() then
    raise exception 'Start time must be in the future';
  end if;

  if new.starts_at <> old.starts_at then
    new.reminded_at := null;
    new.reminded_24h_at := null;
    new.nudge_underfilled_at := null;
    new.nudge_pending_at := null;
  end if;

  return new;
end;
$$;
