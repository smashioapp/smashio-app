-- fill-the-spot P4: smart delivery, "not too much". Serves gtm-strategy §9 (alert health) and
-- ultraplan F3, F4 and the relevance rules in §4 P4.
--
--   1. Defer, don't drop (F3). Quiet-hours recipients are skipped at fire time. A sweep re-runs
--      the recipient query every 15 minutes for games that are still open, so anyone whose quiet
--      hours have ended gets told, and nobody is told twice (spot_open_recipients already skips
--      anyone with a spot_open for the game).
--   2. Ping when the window opens (F4). The same sweep picks up games that were published more
--      than 24h out and have just crossed into the window.
--   3. Relevance. spot_relevance() scores a candidate; the recipient query uses it to reserve the
--      second daily ping for strong matches and to honour "Not for me".
--   4. Health. spot_alert_mute_rate() for the weekly scorecard.

-- ---------------------------------------------------------------------------------------------
-- "Not for me": a pattern, never a count. Service-side only, written through dismiss_spot.
-- ---------------------------------------------------------------------------------------------

create table public.spot_dismissals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  dow int not null,
  evening boolean not null,
  created_at timestamptz not null default now()
);

create index spot_dismissals_profile_idx on public.spot_dismissals (profile_id, created_at desc);

alter table public.spot_dismissals enable row level security;

create function public.dismiss_spot(p_game_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.spot_dismissals (profile_id, venue_id, dow, evening)
  select auth.uid(), g.venue_id,
         extract(dow from g.starts_at at time zone 'Australia/Sydney')::int,
         extract(hour from g.starts_at at time zone 'Australia/Sydney') >= 17
  from public.games g
  where g.id = p_game_id and auth.uid() is not null;
$$;

grant execute on function public.dismiss_spot(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- spot_relevance: 0..1-ish. Weights: distance .30, level fit .20, plays this slot .20, host turns
-- up .15, court booked .15, minus 30 days of "Not for me" (same venue -.40, same weekday and
-- day/evening -.30). Unknown inputs (no home point, no tier) score neutral, not zero.
-- ---------------------------------------------------------------------------------------------

create function public.spot_relevance(p_profile_id uuid, p_game_id uuid)
returns numeric
language sql
stable
security definer set search_path = public, extensions
as $$
  with g as (
    select
      g.id, g.sport_id, g.venue_id, g.starts_at, g.verification_status,
      v.location as loc,
      st.ordinal as min_ord,
      coalesce(stmax.ordinal, st.ordinal) as max_ord,
      coalesce(hp.reliability_score, 100) as host_score,
      extract(dow from g.starts_at at time zone 'Australia/Sydney')::int as dow,
      extract(hour from g.starts_at at time zone 'Australia/Sydney') >= 17 as evening
    from public.games g
    join public.venues v on v.id = g.venue_id
    join public.skill_tiers st on st.id = g.skill_tier_id
    left join public.skill_tiers stmax on stmax.id = g.skill_tier_max_id
    left join public.profiles hp on hp.id = g.organizer_id
    where g.id = p_game_id
  ),
  me as (
    select pp.home_point, pst.ordinal as ord
    from g
    left join public.profile_private pp on pp.profile_id = p_profile_id
    left join public.profile_sports ps on ps.profile_id = p_profile_id and ps.sport_id = g.sport_id
    left join public.skill_tiers pst on pst.id = ps.skill_tier_id
  )
  select round((
      0.30 * coalesce(greatest(0, 1 - extensions.ST_Distance(me.home_point, g.loc) / 15000.0), 0.5)
    + 0.20 * coalesce(greatest(0, 1 - abs(me.ord - (g.min_ord + g.max_ord) / 2.0) / (g.max_ord - g.min_ord + 1)), 0.5)
    + 0.20 * least(1, (
        select count(*) from public.game_players gp
        join public.games g2 on g2.id = gp.game_id
        where gp.profile_id = p_profile_id and gp.status = 'approved'
          and g2.starts_at < now() and g2.starts_at > now() - interval '90 days'
          and extract(dow from g2.starts_at at time zone 'Australia/Sydney')::int = g.dow
          and (extract(hour from g2.starts_at at time zone 'Australia/Sydney') >= 17) = g.evening
      ) / 3.0)
    + 0.15 * (g.host_score / 100.0)
    + 0.15 * (case when g.verification_status = 'verified' then 1 else 0 end)
    - (select coalesce(max(case when d.venue_id = g.venue_id then 0.40 else 0 end), 0)
            + coalesce(max(case when d.dow = g.dow and d.evening = g.evening then 0.30 else 0 end), 0)
       from public.spot_dismissals d
       where d.profile_id = p_profile_id and d.created_at > now() - interval '30 days')
  )::numeric, 3)
  from g, me;
$$;

revoke execute on function public.spot_relevance(uuid, uuid) from public;

-- ---------------------------------------------------------------------------------------------
-- spot_open_recipients, now relevance-aware. Same signature, so this replaces it in place.
-- ---------------------------------------------------------------------------------------------

create or replace function public.spot_open_recipients(p_game_id uuid, p_radius_m double precision)
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
    ) < 2
    -- P4.3: the cap stays at 2, relevance decides who gets the second one. Anyone at or above the
    -- floor gets a first ping; a player who already had one today only gets another for a strong
    -- match (near, right level, a slot they play, a host who turns up, court booked).
    and public.spot_relevance(c.profile_id, g.id) >= case
      when (
        select count(*) from public.notifications n
        where n.profile_id = c.profile_id and n.type = 'spot_open' and n.created_at > now() - interval '24 hours'
      ) >= 1 then 0.5
      else 0.1
    end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The sweep (1 and 2 above). Unlike fire_spot_open it writes nothing when there is nobody new to
-- tell, so it never restarts a clock or re-stamps spot_open_sent_at.
-- ---------------------------------------------------------------------------------------------

create function public.fire_spot_open_sweep(p_game_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_ids uuid[];
  v_count int;
begin
  select array_agg(r.profile_id) into v_ids
  from public.spot_open_recipients(p_game_id, 10000) r;

  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then
    return 0;
  end if;

  perform public.enqueue_notifications(
    'spot_open', p_game_id, null, v_ids, jsonb_build_object('ring', 'default', 'sweep', true), 'normal', null
  );

  update public.spot_openings set recipients = recipients + v_count
  where game_id = p_game_id and ring = 'default' and filled_at is null;
  if not found then
    insert into public.spot_openings (game_id, ring, recipients) values (p_game_id, 'default', v_count);
  end if;

  update public.games set spot_open_sent_at = coalesce(spot_open_sent_at, now()) where id = p_game_id;
  return v_count;
end;
$$;

revoke execute on function public.fire_spot_open_sweep(uuid) from public;

create function public.dispatch_spot_open_sweep()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select g.id
    from public.games g
    where g.status = 'published'
      and (g.spot_open_sent_at is null or g.spot_open_sent_at > now() - interval '12 hours')
      and public.spot_open_eligible(g.id, interval '24 hours')
  loop
    perform public.fire_spot_open_sweep(r.id);
  end loop;
end;
$$;

revoke execute on function public.dispatch_spot_open_sweep() from public;

select cron.schedule('dispatch-spot-open-sweep', '*/15 * * * *', $$select public.dispatch_spot_open_sweep();$$);

-- ---------------------------------------------------------------------------------------------
-- Weekly health: of the players who got a spot alert in the window, how many have alerts off now.
-- Target under 5%. Service role only (ops query, not app data).
-- ---------------------------------------------------------------------------------------------

create function public.spot_alert_mute_rate(p_days int default 7)
returns table (recipients int, muted int, mute_rate numeric)
language sql
stable
security definer set search_path = public
as $$
  with got as (
    select distinct n.profile_id
    from public.notifications n
    where n.type = 'spot_open' and n.created_at > now() - make_interval(days => p_days)
  )
  select
    count(*)::int,
    count(*) filter (where not public.notification_pref_enabled(got.profile_id, 'alerts'))::int,
    case when count(*) = 0 then 0
         else round(count(*) filter (where not public.notification_pref_enabled(got.profile_id, 'alerts'))::numeric / count(*), 4)
    end
  from got;
$$;

revoke execute on function public.spot_alert_mute_rate(int) from public;
grant execute on function public.spot_alert_mute_rate(int) to service_role;
