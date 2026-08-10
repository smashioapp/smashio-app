-- game_cancelled push previously included the organiser, who just triggered the cancellation
-- themselves. Match game_rescheduled and exclude them.
create or replace function public.trigger_notify_game_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'published' and new.status = 'cancelled' then
    perform public.notify_push(jsonb_build_object(
      'type', 'game_cancelled',
      'game_id', new.id,
      'organizer_id', new.organizer_id
    ));
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
