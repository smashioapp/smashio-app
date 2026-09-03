-- Host a Game v3 edit mode (create-game-plan.md band 08 "loud vs quiet"): duration, courts, cost
-- and max_players changes are meant to reach joined players, and push-dispatch/format.ts's
-- detailsChangedBody() + the "details_changed" dispatch case (index.ts:252-253) and channel map
-- (index.ts:75) have existed since P2 for exactly this — but nothing ever enqueued that type.
-- trigger_notify_game_change only ever fired game_cancelled/game_rescheduled, so editing a
-- published game's price, courts or headcount silently notified no one. Wire the missing branch.
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
  elsif new.status = 'published' and (
    new.duration_minutes <> old.duration_minutes
    or new.courts_booked <> old.courts_booked
    or new.cost_per_player_cents <> old.cost_per_player_cents
    or new.max_players <> old.max_players
  ) then
    select array_agg(profile_id) into v_recipients
    from public.push_recipients_for_game(new.id, new.organizer_id, true, 'game_changes');
    perform public.enqueue_notifications(
      'details_changed', new.id, new.organizer_id, v_recipients, '{}'::jsonb, 'low', null
    );
  end if;
  return new;
end;
$$;
