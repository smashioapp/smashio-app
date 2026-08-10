-- Slice 10: organiser game management — edit, cancel, remove player. The 'games update own'
-- policy from slice 2 already lets an organiser update their own row; what was missing is the
-- guard rails (can't shrink below the roster, can't reschedule into the past, can't edit a
-- cancelled game) and a roster-removal path.

-- Editing invariants live in a trigger rather than table checks because they compare the new
-- row against live game_players state, which a check constraint can't see.
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

  -- Rescheduling re-arms the 2h reminder sweep; without this a moved game keeps the
  -- reminded_at stamp from its old slot and silently never reminds again.
  if new.starts_at <> old.starts_at then
    new.reminded_at := null;
  end if;

  return new;
end;
$$;

create trigger games_enforce_edit_rules
  before update on public.games
  for each row execute function public.enforce_game_edit_rules();

-- Mirrors leave_game, but organiser-initiated. Approved-only so it can't resurrect or
-- overwrite a 'rejected'/'left' row.
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
    raise exception 'Only the organiser can remove players';
  end if;

  if p_profile_id = v_organizer_id then
    raise exception 'The organiser can''t be removed from their own game';
  end if;

  update public.game_players
  set status = 'removed', decided_at = now()
  where game_id = p_game_id and profile_id = p_profile_id and status = 'approved';
end;
$$;

grant execute on function public.remove_player(uuid, uuid) to authenticated;

-- Extends slice 8's join-decision notifier: a removal is the other transition a player needs
-- to hear about, and it's the same trigger on the same table.
create or replace function public.trigger_notify_join_decision()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'requested' and new.status in ('approved', 'rejected') then
    perform public.notify_push(jsonb_build_object(
      'type', 'join_decision',
      'game_id', new.game_id,
      'profile_id', new.profile_id,
      'status', new.status
    ));
  elsif old.status = 'approved' and new.status = 'removed' then
    perform public.notify_push(jsonb_build_object(
      'type', 'join_decision',
      'game_id', new.game_id,
      'profile_id', new.profile_id,
      'status', 'removed'
    ));
  end if;
  return new;
end;
$$;

-- Cancellations and reschedules are the two edits players must not miss. Fires after the
-- edit-rules trigger so a rejected edit never notifies.
create or replace function public.trigger_notify_game_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'published' and new.status = 'cancelled' then
    perform public.notify_push(jsonb_build_object('type', 'game_cancelled', 'game_id', new.id));
  elsif new.status = 'published' and new.starts_at <> old.starts_at then
    perform public.notify_push(jsonb_build_object(
      'type', 'game_rescheduled',
      'game_id', new.id,
      'organizer_id', new.organizer_id
    ));
  end if;
  return new;
end;
$$;

create trigger games_notify_change
  after update on public.games
  for each row execute function public.trigger_notify_game_change();

-- A cancelled game's chat and roster stay readable (players need the history and the reason),
-- but it must drop out of the reminder sweep. status = 'published' already covers that.
