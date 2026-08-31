-- gtm-plan.md G6 / quick-wins.md §3.1. "Full" was a hard dead end: request_to_join always
-- inserted 'requested' regardless of capacity, and a host could only ever reject an over-capacity
-- request since decide_join_request's approve branch raises on a full game. There was no way for
-- an interested player to queue for the next opening, and no way for that opening to refill itself.
--
-- Waitlisting skips host review entirely (the game is already full, there's nothing for the host
-- to decide) and auto-promotes the head of the queue — ordered by requested_at, same column the
-- existing request flow already stamps — the moment an approved spot frees up. Reuses the P0/P2
-- notification pipeline: promotion is just another game_players row flipping to 'approved', which
-- the existing triggers already turn into a push.

alter table public.game_players drop constraint game_players_status_check;
alter table public.game_players
  add constraint game_players_status_check
  check (status in ('requested', 'invited', 'approved', 'rejected', 'left', 'removed', 'declined', 'waitlisted'));

-- Routes to the waitlist instead of the requested queue once the game has no open spots — a
-- waitlist join needs no host decision, so it skips 'requested' entirely.
create or replace function public.request_to_join(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
begin
  v_status := case when public.open_spots(p_game_id) > 0 then 'requested' else 'waitlisted' end;

  insert into public.game_players (game_id, profile_id, status, requested_at, decided_at)
  values (p_game_id, auth.uid(), v_status, now(), null)
  on conflict (game_id, profile_id) do update
    set status = v_status, requested_at = now(), decided_at = null
    where public.game_players.status in ('rejected', 'left', 'removed');
end;
$$;

-- Widened to also release a waitlisted spot — same "step away" action, just from the other queue.
-- A waitlisted row never holds a claimed reserved spot, so the second update stays a no-op there.
create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.game_players
  set status = 'left', decided_at = now()
  where game_id = p_game_id and profile_id = auth.uid() and status in ('approved', 'waitlisted');

  update public.game_reserved_spots
  set claimed_by = null, claimed_at = null
  where game_id = p_game_id and claimed_by = auth.uid();
end;
$$;

-- The one place a spot reopens: an approved player leaves or is removed. Promotes the
-- longest-waiting waitlisted row straight to 'approved' — that UPDATE re-fires the existing
-- game_players triggers (host roster notify, join-decision notify below), so promotion gets the
-- same "you're in" push an organizer approval would have sent.
create or replace function public.promote_waitlist()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_next_profile uuid;
begin
  if old.status = 'approved' and new.status in ('left', 'removed') and public.open_spots(new.game_id) > 0 then
    select profile_id into v_next_profile
    from public.game_players
    where game_id = new.game_id and status = 'waitlisted'
    order by requested_at asc
    limit 1
    for update skip locked;

    if v_next_profile is not null then
      update public.game_players
      set status = 'approved', decided_at = now()
      where game_id = new.game_id and profile_id = v_next_profile;
    end if;
  end if;

  return new;
end;
$$;

create trigger game_players_promote_waitlist
  after update of status on public.game_players
  for each row execute function public.promote_waitlist();

-- A3/A4/A5 recipients widened: promotion lands here as old.status = 'waitlisted', not 'requested'.
-- Rejection stays 'requested'-only — a waitlisted row is never rejected, only promoted or left.
create or replace function public.trigger_notify_join_decision()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status in ('requested', 'waitlisted') and new.status = 'approved' then
    perform public.enqueue_notifications(
      'join_decision', new.game_id, null, array[new.profile_id],
      jsonb_build_object('status', 'approved'), 'critical', null
    );
  elsif old.status = 'requested' and new.status = 'rejected' then
    perform public.enqueue_notifications(
      'join_decision', new.game_id, null, array[new.profile_id],
      jsonb_build_object('status', 'rejected'), 'normal', null
    );
  elsif old.status = 'approved' and new.status = 'removed' then
    perform public.enqueue_notifications(
      'join_decision', new.game_id, null, array[new.profile_id],
      jsonb_build_object('status', 'removed'), 'normal', null
    );
  end if;
  return new;
end;
$$;

-- 1-indexed queue position for the caller's own waitlisted row, ordered the same way promotion
-- consumes the queue. Null if the caller isn't waitlisted on this game — distinguishes "you're
-- #1" from "you're not on this list" rather than conflating them at count = 0.
create function public.waitlist_position(p_game_id uuid)
returns int
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_requested_at timestamptz;
begin
  select requested_at into v_requested_at
  from public.game_players
  where game_id = p_game_id and profile_id = auth.uid() and status = 'waitlisted';

  if v_requested_at is null then
    return null;
  end if;

  return (
    select count(*)::int + 1
    from public.game_players
    where game_id = p_game_id and status = 'waitlisted' and requested_at < v_requested_at
  );
end;
$$;

grant execute on function public.waitlist_position(uuid) to authenticated;

-- Host-facing count, same roster-privacy shape as approved_player_count.
create function public.waitlist_count(p_game_id uuid)
returns int
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int from public.game_players where game_id = p_game_id and status = 'waitlisted';
$$;

grant execute on function public.waitlist_count(uuid) to authenticated;
