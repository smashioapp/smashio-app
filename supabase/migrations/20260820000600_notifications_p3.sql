-- Notifications P3 (docs/notifications-plan.md §5). Notification actions (Approve/Decline from
-- tray, inline chat reply), event triggers for B3/B4/C4/C5, D1 cap refinement (#8).
--
-- Covers: B3 details_changed, B4 booking_verified, C4 nudge_underfilled, C5 nudge_pending,
-- D1 cap (3/day/user, minus host, minus already on roster).

-- Add columns to games table for tracking notification sends (C4, C5 nudges)
alter table public.games add column nudge_underfilled_at timestamptz;
alter table public.games add column nudge_pending_at timestamptz;

-- B3: Notify approved roster when court_label, cost_total_cents, or max_players changes
create or replace function public.trigger_notify_game_details_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recipients uuid[];
begin
  -- Only fire if game is published (live).
  if new.status <> 'published' then
    return new;
  end if;

  -- Court label, cost, or max_players changed
  if new.court_label <> old.court_label
    or new.cost_per_player_cents <> old.cost_per_player_cents
    or new.max_players <> old.max_players then
    select array_agg(profile_id) into v_recipients
    from public.push_recipients_for_game(new.id, new.organizer_id, false, 'game_changes');
    perform public.enqueue_notifications(
      'details_changed', new.id, null, v_recipients, '{}'::jsonb, 'low', null
    );
  end if;

  return new;
end;
$$;

create trigger games_notify_details_change
  after update on public.games
  for each row execute function public.trigger_notify_game_details_change();

-- B4: Notify approved roster when booking is verified
create or replace function public.trigger_notify_booking_verified()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recipients uuid[];
begin
  if new.status = 'published'
    and new.verification_status <> old.verification_status
    and new.verification_status = 'verified' then
    select array_agg(profile_id) into v_recipients
    from public.push_recipients_for_game(new.id, new.organizer_id, false, 'game_changes');
    perform public.enqueue_notifications(
      'booking_verified', new.id, null, v_recipients, '{}'::jsonb, 'low', null
    );
  end if;

  return new;
end;
$$;

create trigger games_notify_booking_verified
  after update on public.games
  for each row execute function public.trigger_notify_booking_verified();

-- C4: Nudge host at T-24h if game still has open spots (underfilled)
create or replace function public.dispatch_nudge_underfilled()
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
      and g.nudge_underfilled_at is null
      and public.approved_player_count(g.id) < g.max_players
      and g.starts_at > now() + interval '2 hours'
      and g.starts_at <= now() + interval '24 hours'
      and g.created_at <= g.starts_at - interval '24 hours'
  loop
    perform public.enqueue_notifications(
      'nudge_underfilled', r.id, null, array[g.organizer_id], '{}'::jsonb, 'low', null
    ) from public.games g where g.id = r.id;
    update public.games set nudge_underfilled_at = now() where id = r.id;
  end loop;
end;
$$;

select cron.schedule('dispatch-nudge-underfilled', '15 * * * *', $$select public.dispatch_nudge_underfilled();$$);

-- C5: Nudge host if join requests pending >12h and game <48h away
create or replace function public.dispatch_nudge_pending_requests()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_pending_count int;
begin
  for r in
    select g.id, g.organizer_id
    from public.games g
    where g.status = 'published'
      and g.nudge_pending_at is null
      and g.starts_at > now()
      and g.starts_at <= now() + interval '48 hours'
  loop
    select count(*) into v_pending_count
    from public.game_players gp
    where gp.game_id = r.id
      and gp.status = 'requested'
      and gp.created_at <= now() - interval '12 hours';

    if v_pending_count > 0 then
      perform public.enqueue_notifications(
        'nudge_pending', r.id, null, array[r.organizer_id],
        jsonb_build_object('pending_count', v_pending_count), 'low', null
      );
      update public.games set nudge_pending_at = now() where id = r.id;
    end if;
  end loop;
end;
$$;

select cron.schedule('dispatch-nudge-pending-requests', '*/5 * * * *', $$select public.dispatch_nudge_pending_requests();$$);

-- D1 refinement: Cap alert_match at 3/day/user, exclude host, exclude anyone already on roster
create or replace function public.trigger_notify_game_alerts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_venue_location extensions.geography;
  v_tier_slug text;
  v_profile_ids uuid[];
  v_roster_ids uuid[];
begin
  if new.status <> 'published' then
    return new;
  end if;

  select v.location into v_venue_location from public.venues v where v.id = new.venue_id;
  select st.slug into v_tier_slug from public.skill_tiers st where st.id = new.skill_tier_id;

  -- Get roster (anyone with a game_players row, any status)
  select array_agg(distinct gp.profile_id) into v_roster_ids
  from public.game_players gp
  where gp.game_id = new.id;

  -- Alert recipients: matching alerts, excluding host and roster
  select array_agg(ga.profile_id) into v_profile_ids
  from public.game_alerts ga
  where ga.sport_id = new.sport_id
    and ga.profile_id is distinct from new.organizer_id
    and ga.profile_id <> all(coalesce(v_roster_ids, array[]::uuid[]))
    and public.notification_pref_enabled(ga.profile_id, 'alerts')
    and (ga.tier_slugs is null or v_tier_slug = any(ga.tier_slugs))
    and extensions.ST_DWithin(
          v_venue_location,
          extensions.ST_SetSRID(extensions.ST_MakePoint(ga.center_lng, ga.center_lat), 4326)::extensions.geography,
          ga.radius_m
        )
    -- Cap at 3 per day per user (check for existing alert_match sends in last 24h)
    and (select count(*) from public.notifications n
         where n.profile_id = ga.profile_id
           and n.type = 'alert_match'
           and n.created_at > now() - interval '24 hours'
       ) < 3;

  if v_profile_ids is not null and array_length(v_profile_ids, 1) > 0 then
    perform public.enqueue_notifications('alert_match', new.id, null, v_profile_ids, '{}'::jsonb, 'low', null);
  end if;

  return new;
end;
$$;

-- Reschedule already resets reminded_at and reminded_24h_at; also reset nudge flags
create or replace function public.enforce_game_edit_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_approved_count int;
begin
  if old.status = 'cancelled' and new.status = 'cancelled' then
    raise exception 'This game is cancelled and can no longer be edited';
  end if;

  if new.max_players <> old.max_players then
    select count(*) into v_approved_count
    from public.game_players
    where game_id = new.id and status = 'approved';

    if new.max_players < v_approved_count then
      raise exception 'Can''t set max players below the % already approved', v_approved_count;
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
