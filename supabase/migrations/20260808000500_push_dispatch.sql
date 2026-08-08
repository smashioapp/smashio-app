-- Slice 8: push. DB triggers/cron fire-and-forget an HTTP call into the push-dispatch edge
-- function via pg_net; the function owns actual Expo API delivery (batching, receipts).
-- Business logic (who to notify, dedup) stays in Postgres per backend-plan.md's philosophy
-- for decide_join_request — cheaper and transactional.

create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- Recipients for a game: organizer + approved players (mirrors is_approved_player's roster
-- definition), their registered devices. SECURITY DEFINER since only the edge function's
-- service-role caller should ever cross profiles like this.
create or replace function public.push_recipients_for_game(p_game_id uuid, p_exclude_profile uuid default null)
returns table (profile_id uuid, expo_token text)
language sql
stable
security definer set search_path = public
as $$
  select distinct pt.profile_id, pt.expo_token
  from public.push_tokens pt
  where pt.profile_id in (
    select gp.profile_id from public.game_players gp where gp.game_id = p_game_id and gp.status = 'approved'
    union
    select g.organizer_id from public.games g where g.id = p_game_id
  )
  and pt.profile_id is distinct from p_exclude_profile;
$$;

grant execute on function public.push_recipients_for_game(uuid, uuid) to service_role;

-- Small denormalized summary so push-dispatch doesn't need its own join logic for copy text.
create or replace function public.push_game_summary(p_game_id uuid)
returns table (venue_name text, sport_name text, starts_at timestamptz)
language sql
stable
security definer set search_path = public
as $$
  select v.name, s.name, g.starts_at
  from public.games g
  join public.venues v on v.id = g.venue_id
  join public.sports s on s.id = g.sport_id
  where g.id = p_game_id;
$$;

grant execute on function public.push_game_summary(uuid) to service_role;

-- Reads the push-dispatch shared key from Vault (inserted live, never committed — see
-- backend-plan.md's service-role-key handling precedent). Never blocks the triggering write:
-- if the secret isn't configured yet (e.g. fresh local dev), this is a silent no-op.
create or replace function public.notify_push(p_payload jsonb)
returns void
language plpgsql
security definer set search_path = public, vault
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'push_dispatch_key' limit 1;
  if v_key is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://ajbsvsfwjfeofvjuhzrw.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_payload
  );
end;
$$;

-- New message: notify every other recipient (sender excluded).
create or replace function public.trigger_notify_new_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.notify_push(jsonb_build_object(
    'type', 'message',
    'game_id', new.game_id,
    'sender_id', new.sender_id,
    'message_id', new.id
  ));
  return new;
end;
$$;

create trigger messages_notify_push
  after insert on public.messages
  for each row execute function public.trigger_notify_new_message();

-- Join decision: notify only the requester, only on the requested->approved/rejected edge.
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
  end if;
  return new;
end;
$$;

create trigger game_players_notify_push
  after update on public.game_players
  for each row execute function public.trigger_notify_join_decision();

-- 2-hour reminder: every 5 min, sweep games starting in the next ~2h that haven't been
-- reminded yet. reminded_at is set right after the (async, fire-and-forget) dispatch call so
-- a slow or failed push send can't cause a duplicate reminder on the next sweep.
alter table public.games add column reminded_at timestamptz;

create or replace function public.dispatch_game_reminders()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.games
    where status = 'published'
      and reminded_at is null
      and starts_at between now() + interval '115 minutes' and now() + interval '125 minutes'
  loop
    perform public.notify_push(jsonb_build_object('type', 'reminder', 'game_id', r.id));
    update public.games set reminded_at = now() where id = r.id;
  end loop;
end;
$$;

select cron.schedule('dispatch-game-reminders', '*/5 * * * *', $$select public.dispatch_game_reminders();$$);
