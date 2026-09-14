-- Fix C5 nudge_pending: dispatch_nudge_pending_requests() (20260820000600_notifications_p3.sql)
-- filtered on gp.created_at, but game_players has never had a created_at column — the request
-- timestamp is requested_at (refreshed on every re-request by request_to_join). plpgsql only
-- resolves the column when the loop body first runs, so the function compiled fine and then
-- raised "column gp.created_at does not exist" on every 5-minute cron tick that found a
-- published game inside 48h, rolling back the whole run. No nudge_pending has ever been sent.
--
-- Same signature, so create or replace keeps the existing grants (postgres + service_role only,
-- per 20260910030000_revoke_public_bucket_b.sql). pg_cron job is unchanged.

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
      and gp.requested_at <= now() - interval '12 hours';

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
