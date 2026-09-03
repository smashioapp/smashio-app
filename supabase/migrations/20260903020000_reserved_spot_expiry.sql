-- Host a Game v3, band 12e (create-game-plan.md "Holds expire — the point of this section").
-- Default release 4 hours before start (not 24 — same-day Sydney weeknight socials would release
-- a hold the instant it was created under a 24h rule). Quiet for most of the window; inside the
-- last 2 hours the host gets one nudge, then the spot auto-releases at expiry unless pinned.

alter table public.game_reserved_spots add column expires_at timestamptz;
alter table public.game_reserved_spots add column pinned boolean not null default false;
alter table public.game_reserved_spots add column nudged_at timestamptz;

-- New holds default to 4h-before-start. Existing holds (from before this migration) get the same
-- default backfilled off their game's current starts_at, rather than being left null (null would
-- read as "never expires", which is a bigger behaviour change than intended for rows that predate
-- the feature).
update public.game_reserved_spots rs
set expires_at = g.starts_at - interval '4 hours'
from public.games g
where g.id = rs.game_id and rs.claimed_by is null and rs.expires_at is null;

-- Same body as 20260824000000_host_slot_reserved_spots.sql's add_reserved_spot, unchanged, plus
-- expires_at seeded to 4h-before-start on insert (band 12e's default).
create or replace function public.add_reserved_spot(p_game_id uuid, p_label text default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_held int;
  v_named int;
  v_id uuid;
  v_starts_at timestamptz;
begin
  perform public.assert_is_organizer(p_game_id);

  select reserved_spots, starts_at into v_held, v_starts_at from public.games where id = p_game_id for update;

  select count(*) into v_named from public.game_reserved_spots where game_id = p_game_id;

  if v_named >= v_held then
    if public.open_spots(p_game_id) <= 0 then
      raise exception 'No spots left to reserve';
    end if;
    update public.games set reserved_spots = reserved_spots + 1 where id = p_game_id;
  end if;

  insert into public.game_reserved_spots (game_id, label, expires_at)
  values (p_game_id, nullif(trim(coalesce(p_label, '')), ''), v_starts_at - interval '4 hours')
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_reserved_spot(uuid, text) to authenticated;

-- band 12e "the host can drag this per spot, shorter for a game filling fast, longer or pinned
-- for a mate who's just slow to check their phone." A slider isn't a good fit for this
-- component's existing controls (no drag primitive on this screen), so the host picks from
-- preset offsets or pins it; p_hours_before null + p_pinned true pins, p_hours_before set
-- recomputes expires_at off the game's current starts_at.
create or replace function public.set_reserved_spot_expiry(p_spot_id uuid, p_hours_before numeric, p_pinned boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
  v_starts_at timestamptz;
begin
  select rs.game_id, g.starts_at into v_game_id, v_starts_at
  from public.game_reserved_spots rs join public.games g on g.id = rs.game_id
  where rs.id = p_spot_id;

  if v_game_id is null then
    raise exception 'Reserved spot not found';
  end if;
  perform public.assert_is_organizer(v_game_id);

  update public.game_reserved_spots
  set pinned = p_pinned,
      expires_at = case when p_pinned then null else v_starts_at - make_interval(hours => p_hours_before) end,
      nudged_at = null
  where id = p_spot_id;
end;
$$;

grant execute on function public.set_reserved_spot_expiry(uuid, numeric, boolean) to authenticated;

-- The sweep. One pass, two jobs: nudge holds that just entered their last 2 hours (once each,
-- nudged_at guards the repeat), then release anything actually past expiry. Pure SQL — unlike
-- the confirmations purge cron this never touches Storage, so there's no edge-function hop.
create or replace function public.sweep_reserved_spot_holds()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_recipients uuid[];
begin
  for r in
    select rs.id as spot_id, rs.label, rs.game_id, g.organizer_id
    from public.game_reserved_spots rs
    join public.games g on g.id = rs.game_id
    where rs.claimed_by is null
      and rs.pinned = false
      and rs.nudged_at is null
      and rs.expires_at is not null
      and rs.expires_at <= now() + interval '2 hours'
      and rs.expires_at > now()
      and g.status = 'published'
  loop
    update public.game_reserved_spots set nudged_at = now() where id = r.spot_id;
    perform public.enqueue_notifications(
      'hold_nudge', r.game_id, null, array[r.organizer_id], jsonb_build_object('label', r.label), 'normal', null
    );
  end loop;

  for r in
    select rs.id as spot_id, rs.label, rs.invited_profile_id, rs.game_id, g.organizer_id
    from public.game_reserved_spots rs
    join public.games g on g.id = rs.game_id
    where rs.claimed_by is null
      and rs.pinned = false
      and rs.expires_at is not null
      and rs.expires_at <= now()
      and g.status = 'published'
  loop
    if r.invited_profile_id is not null then
      update public.game_players set status = 'declined', decided_at = now()
      where game_id = r.game_id and profile_id = r.invited_profile_id and status = 'invited';
    end if;

    delete from public.game_reserved_spots where id = r.spot_id;
    update public.games set reserved_spots = greatest(0, reserved_spots - 1) where id = r.game_id;

    perform public.enqueue_notifications(
      'hold_auto_released', r.game_id, null, array[r.organizer_id], jsonb_build_object('label', r.label), 'low', null
    );
  end loop;
end;
$$;

grant execute on function public.sweep_reserved_spot_holds() to service_role;

select cron.schedule('sweep-reserved-spot-holds', '*/15 * * * *', $$select public.sweep_reserved_spot_holds();$$);
