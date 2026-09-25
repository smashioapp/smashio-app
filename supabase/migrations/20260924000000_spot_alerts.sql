-- Short-a-player plan S1 (docs/short-a-player-plan.md §3 S1): spot alerts. When a spot opens close
-- to game time, nearby players at the right level hear about it inside minutes. Before this, a
-- drop-out told only the host (`player_left`), a short-notice game was skipped by the host nudge,
-- and the only stranger-facing push (`alert_match`) reached people who had manually saved an
-- alert, which most never do.
--
-- What fires a `spot_open`:
--   1. A published, public game starting within 36h loses an approved player (left / removed),
--      and after the waitlist has had its go there is still an open spot. The plan wrote this as
--      "0 open spots to >= 1"; it is implemented as "any drop-out that leaves an open spot", a
--      superset, because the per-game and per-day caps below already bound the noise and a
--      drop-out from a 2-of-4 game at T-6h is the same last-minute need.
--   2. A host raises max_players or releases a held reserved spot inside the same 36h window.
--   3. A game is published with less than 24h to go.
--
-- The game_players and games triggers are deferred constraint triggers, so they evaluate at
-- commit: after promote_waitlist has already moved the next waitlisted row in (a non-empty
-- waitlist fills first, then nobody outside hears about it), and after create-game has written
-- the host's own row.
--
-- Recipients (spot_open_recipients): tier inside the game's tier range, within the radius, not on
-- the roster in any status, not blocked either way with the host, `alerts` pref on, not in quiet
-- hours (their own window if they set one, else 22:00-07:00), max 1 per game and 2 per rolling
-- 24h. Two sources, unioned:
--   - Default (D1, signed off 2026-09-24): profile_private.home_point + profile_sports tier for the
--     game's sport. Everyone with a home point and a tier is opted in; the existing `alerts`
--     toggle in notification settings turns it off. No new pref key.
--   - Saved game_alerts, at their own centre and radius.
--
-- Also here:
--   - find_a_sub(): the host's "Find a sub" button. Re-sends to a wider ring (15 km), once per 6h.
--   - A2: dispatch_nudge_underfilled no longer skips games created < 24h before start, which were
--     exactly the last-minute ones. It also counted "underfilled" as approved < max_players, which
--     ignored the host's own slot and reserved spots, so a full game got nudged; now open_spots().
--   - spot_openings: one row per fan-out with its recipient count, stamped filled_at when the
--     game fills, for S8's median time-to-fill.

alter table public.games add column spot_open_sent_at timestamptz;
alter table public.games add column spot_boost_sent_at timestamptz;

-- ---------------------------------------------------------------------------------------------
-- spot_openings — S8's measurement. Service-side only: RLS on, no policies, no grants.
-- ---------------------------------------------------------------------------------------------

create table public.spot_openings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  ring text not null check (ring in ('default', 'boost')),
  recipients int not null,
  opened_at timestamptz not null default now(),
  filled_at timestamptz
);

create index spot_openings_game_open_idx on public.spot_openings (game_id) where filled_at is null;

alter table public.spot_openings enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Eligibility and recipients.
-- ---------------------------------------------------------------------------------------------

create function public.spot_open_eligible(p_game_id uuid, p_window interval)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.status = 'published'
      -- link_only games are reachable by their link, never listed (20260910000000).
      and g.visibility = 'public'
      and g.starts_at > now() + interval '30 minutes'
      and g.starts_at <= now() + p_window
      and public.open_spots(g.id) > 0
      and not exists (
        select 1 from public.game_players w where w.game_id = g.id and w.status = 'waitlisted'
      )
  );
$$;

create function public.spot_open_recipients(p_game_id uuid, p_radius_m double precision)
returns table (profile_id uuid)
language sql
stable
security definer set search_path = public, extensions
as $$
  with g as (
    select
      g.id,
      g.sport_id,
      g.organizer_id,
      v.location as venue_location,
      st.ordinal as min_ord,
      coalesce(stmax.ordinal, st.ordinal) as max_ord
    from public.games g
    join public.venues v on v.id = g.venue_id
    join public.skill_tiers st on st.id = g.skill_tier_id
    left join public.skill_tiers stmax on stmax.id = g.skill_tier_max_id
    where g.id = p_game_id
  ),
  candidates as (
    -- Default: home point + the player's tier for this sport.
    select pp.profile_id
    from g
    join public.profile_private pp
      on pp.home_point is not null
     and extensions.ST_DWithin(pp.home_point, g.venue_location, p_radius_m)
    join public.profile_sports ps on ps.profile_id = pp.profile_id and ps.sport_id = g.sport_id
    join public.skill_tiers pst on pst.id = ps.skill_tier_id
    where pst.ordinal between g.min_ord and g.max_ord
    union
    -- Saved alerts, at their own centre and radius; a tier list matches if any of its tiers sits
    -- inside the game's range.
    select ga.profile_id
    from g
    join public.game_alerts ga on ga.sport_id = g.sport_id
    where extensions.ST_DWithin(
            g.venue_location,
            extensions.ST_SetSRID(extensions.ST_MakePoint(ga.center_lng, ga.center_lat), 4326)::extensions.geography,
            ga.radius_m
          )
      and (
        ga.tier_slugs is null
        or exists (
          select 1 from public.skill_tiers t
          where t.sport_id = g.sport_id and t.slug = any(ga.tier_slugs) and t.ordinal between g.min_ord and g.max_ord
        )
      )
  )
  select c.profile_id
  from candidates c
  cross join g
  join public.profiles p on p.id = c.profile_id
  left join public.notification_prefs np on np.profile_id = p.id
  where p.deleted_at is null
    and c.profile_id <> g.organizer_id
    and not exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.profile_id = c.profile_id)
    and not public.blocked_between(g.organizer_id, c.profile_id)
    and public.notification_pref_enabled(c.profile_id, 'alerts')
    and not public.time_in_window(
          (now() at time zone coalesce(p.timezone, 'Australia/Sydney'))::time,
          case when coalesce(np.quiet_hours_enabled, false) then np.quiet_start else '22:00'::time end,
          case when coalesce(np.quiet_hours_enabled, false) then np.quiet_end else '07:00'::time end
        )
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = c.profile_id and n.type = 'spot_open' and n.game_id = g.id
    )
    -- A saved alert already fired alert_match for this game at publish (that trigger isn't
    -- deferred, so its rows exist by now); don't push the same game twice in one go. A drop-out
    -- hours later is new news and still goes out.
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = c.profile_id and n.type = 'alert_match' and n.game_id = g.id
        and n.created_at > now() - interval '1 hour'
    )
    and (
      select count(*) from public.notifications n
      where n.profile_id = c.profile_id and n.type = 'spot_open' and n.created_at > now() - interval '24 hours'
    ) < 2;
$$;

-- One fan-out. Returns how many players were told (0 is a normal answer: nobody nearby, or all
-- capped). Callers check eligibility first.
create function public.fire_spot_open(p_game_id uuid, p_ring text)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_ids uuid[];
  v_count int;
begin
  select array_agg(r.profile_id) into v_ids
  from public.spot_open_recipients(p_game_id, case when p_ring = 'boost' then 15000 else 10000 end) r;

  v_count := coalesce(array_length(v_ids, 1), 0);

  if v_count > 0 then
    perform public.enqueue_notifications(
      'spot_open', p_game_id, null, v_ids, jsonb_build_object('ring', p_ring), 'normal', null
    );
  end if;

  -- Time-to-fill runs from the first unfilled opening; a second drop-out before the game fills
  -- adds its recipients to that row rather than restarting the clock.
  update public.spot_openings set recipients = recipients + v_count
  where game_id = p_game_id and ring = p_ring and filled_at is null;
  if not found then
    insert into public.spot_openings (game_id, ring, recipients) values (p_game_id, p_ring, v_count);
  end if;

  if p_ring = 'boost' then
    update public.games set spot_boost_sent_at = now() where id = p_game_id;
  else
    update public.games set spot_open_sent_at = now() where id = p_game_id;
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Triggers.
-- ---------------------------------------------------------------------------------------------

create function public.trigger_spot_open_on_leave()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'approved' and new.status in ('left', 'removed')
     and public.spot_open_eligible(new.game_id, interval '36 hours') then
    perform public.fire_spot_open(new.game_id, 'default');
  end if;
  return null;
end;
$$;

create constraint trigger game_players_spot_open
  after update of status on public.game_players
  deferrable initially deferred
  for each row execute function public.trigger_spot_open_on_leave();

create function public.trigger_spot_open_on_game()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    -- Newly published with < 24h to go.
    if new.status = 'published' and public.spot_open_eligible(new.id, interval '24 hours') then
      perform public.fire_spot_open(new.id, 'default');
    end if;
  elsif new.max_players > old.max_players or new.reserved_spots < old.reserved_spots then
    -- Host made room: more players, or a held spot let go.
    if public.spot_open_eligible(new.id, interval '36 hours') then
      perform public.fire_spot_open(new.id, 'default');
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger games_spot_open
  after insert or update of status, max_players, reserved_spots on public.games
  deferrable initially deferred
  for each row execute function public.trigger_spot_open_on_game();

-- S8: stamp the open fan-outs filled once the game has no open spots left.
create function public.trigger_spot_filled()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved')
     and public.open_spots(new.game_id) = 0 then
    update public.spot_openings set filled_at = now()
    where game_id = new.game_id and filled_at is null;
  end if;
  return null;
end;
$$;

create constraint trigger game_players_spot_filled
  after insert or update of status on public.game_players
  deferrable initially deferred
  for each row execute function public.trigger_spot_filled();

-- ---------------------------------------------------------------------------------------------
-- Host "Find a sub": the next ring out, once per 6h, inside the 36h window.
-- ---------------------------------------------------------------------------------------------

create function public.find_a_sub(p_game_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  g public.games;
begin
  select * into g from public.games where id = p_game_id for update;

  if g.id is null then
    raise exception 'Game not found';
  end if;
  if g.organizer_id is distinct from auth.uid() then
    raise exception 'Only the host can do that';
  end if;
  if g.visibility <> 'public' then
    raise exception 'Link-only games aren''t listed, share the link instead';
  end if;
  if g.spot_boost_sent_at is not null and g.spot_boost_sent_at > now() - interval '6 hours' then
    raise exception 'Already sent in the last 6 hours, give it a bit';
  end if;
  if not public.spot_open_eligible(p_game_id, interval '36 hours') then
    raise exception 'Find a sub works for games in the next 36 hours with a spot open and nobody on the waitlist';
  end if;

  return public.fire_spot_open(p_game_id, 'boost');
end;
$$;

grant execute on function public.find_a_sub(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- A2: host nudge for short-notice games. Still skips a game made in the last hour so a fresh
-- host isn't nudged before they've had a chance to share it.
-- ---------------------------------------------------------------------------------------------

create or replace function public.dispatch_nudge_underfilled()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select g.id, g.organizer_id
    from public.games g
    where g.status = 'published'
      and g.nudge_underfilled_at is null
      and public.open_spots(g.id) > 0
      and g.starts_at > now() + interval '2 hours'
      and g.starts_at <= now() + interval '24 hours'
      and g.created_at <= now() - interval '1 hour'
  loop
    perform public.enqueue_notifications(
      'nudge_underfilled', r.id, null, array[r.organizer_id], '{}'::jsonb, 'low', null
    );
    update public.games set nudge_underfilled_at = now() where id = r.id;
  end loop;
end;
$$;

-- Everything above except find_a_sub is internal: callable by triggers/cron (definer) and
-- service_role only. The global default-privileges revoke (20260914000400) already keeps these
-- off PUBLIC; the explicit revoke is belt and braces for assert_no_public_definer_execute.
revoke execute on function public.spot_open_eligible(uuid, interval) from public;
revoke execute on function public.spot_open_recipients(uuid, double precision) from public;
revoke execute on function public.fire_spot_open(uuid, text) from public;
revoke execute on function public.trigger_spot_open_on_leave() from public;
revoke execute on function public.trigger_spot_open_on_game() from public;
revoke execute on function public.trigger_spot_filled() from public;
revoke execute on function public.find_a_sub(uuid) from public;
