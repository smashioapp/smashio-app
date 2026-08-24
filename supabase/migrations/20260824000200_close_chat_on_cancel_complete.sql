-- Cancelling or completing a game left chat_closed_at null forever unless the host manually
-- closed the thread or the 7-day auto-close cron caught it. The chat_threads() RPC only looks
-- at chat_closed_at, so cancelled/completed games showed up under "Upcoming" in the chat list
-- for up to a week. Close the chat at the same moment the game leaves 'published'.

-- The edit-rules guard blocks any update to an already-cancelled game. system_close_chat's own
-- UPDATE (setting chat_closed_at) runs inside the AFTER trigger below and re-fires this BEFORE
-- trigger on the same row, by which point old.status is already 'cancelled' within the same
-- transaction — it would otherwise block itself. Carve out updates that touch only
-- chat_closed_at.
create or replace function public.enforce_game_edit_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_floor int;
begin
  if old.status = 'cancelled' and new.status = 'cancelled'
     and old.chat_closed_at is distinct from new.chat_closed_at then
    return new;
  end if;

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

-- Internal counterpart to close_chat() with no auth.uid() check — callers here are the cancel
-- trigger and the hourly completion cron, both already running as security definer with no
-- session user to check against.
create function public.system_close_chat(p_game_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rows int;
begin
  update public.games set chat_closed_at = now() where id = p_game_id and chat_closed_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return;
  end if;

  insert into public.messages (game_id, sender_id, kind, system_event, body)
  values (p_game_id, p_actor_id, 'system', 'closed', 'Chat closed');
end;
$$;

create or replace function public.close_chat(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_organizer_id uuid;
begin
  select organizer_id into v_organizer_id from public.games where id = p_game_id;
  if v_organizer_id is null then
    raise exception 'Game not found';
  end if;
  if v_organizer_id <> auth.uid() then
    raise exception 'Only the host can close the chat';
  end if;

  perform public.system_close_chat(p_game_id, v_organizer_id);
end;
$$;

create or replace function public.trigger_notify_game_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recipients uuid[];
begin
  if old.status = 'published' and new.status = 'cancelled' then
    select array_agg(profile_id) into v_recipients
    from public.push_recipients_for_game(new.id, new.organizer_id, true, 'game_changes');
    perform public.enqueue_notifications(
      'game_cancelled', new.id, new.organizer_id, v_recipients, '{}'::jsonb, 'critical', null
    );
    perform public.system_close_chat(new.id, new.organizer_id);
  elsif new.status = 'published' and new.starts_at <> old.starts_at then
    select array_agg(profile_id) into v_recipients
    from public.push_recipients_for_game(new.id, new.organizer_id, true, 'game_changes');
    perform public.enqueue_notifications(
      'game_rescheduled', new.id, new.organizer_id, v_recipients,
      jsonb_build_object('old_starts_at', old.starts_at), 'critical', null
    );
  end if;
  return new;
end;
$$;

create or replace function public.complete_past_games()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    update public.games set status = 'completed'
    where status = 'published' and ends_at < now()
    returning id, organizer_id
  loop
    perform public.system_close_chat(r.id, r.organizer_id);
  end loop;
end;
$$;
