-- Notifications P0 (docs/notifications-plan.md §5). Closes the notification holes that the
-- shipped pipeline never covered, and the correctness bugs that made the ones it did cover
-- unreliable. Same architecture as slice 8 — trigger/cron -> notify_push -> pg_net ->
-- push-dispatch -> Expo. Copy stays in TypeScript (format.ts); recipients stay in SQL.
--
-- Covers: A1 join_request, A6 player_left, A8 game_full, B1/B2 widened to pending requesters,
-- C1 reminder_24h, C3 post_game_rate; bugs #1 (pending requesters missed), #3 (reminder sweep
-- not self-healing), #6 (hardcoded dispatch URL).

-- ---------------------------------------------------------------------------------------------
-- §6.1 Richer summary. Every improved string needs more than (venue, sport, starts_at): spot
-- counts for the host-facing copy, price/tier for discovery, court for reminders, host name for
-- everything a player reads. Return type changes, so the old signature has to go first.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.push_game_summary(uuid);

create function public.push_game_summary(p_game_id uuid)
returns table (
  game_id uuid,
  sport_name text,
  venue_name text,
  venue_suburb text,
  starts_at timestamptz,
  ends_at timestamptz,
  court_label text,
  host_id uuid,
  host_name text,
  max_players int,
  approved_count int,
  reserved_spots int,
  spots_left int,
  per_player_cents int,
  tier_name text,
  verification_status text
)
language sql
stable
security definer set search_path = public
as $$
  select
    g.id,
    s.name,
    v.name,
    v.suburb,
    g.starts_at,
    g.ends_at,
    g.court_label,
    g.organizer_id,
    coalesce(p.display_name, 'The host'),
    g.max_players,
    public.approved_player_count(g.id),
    g.reserved_spots,
    greatest(0, g.max_players - public.approved_player_count(g.id) - g.reserved_spots),
    g.cost_per_player_cents,
    st.label,
    g.verification_status
  from public.games g
  join public.venues v on v.id = g.venue_id
  join public.sports s on s.id = g.sport_id
  join public.skill_tiers st on st.id = g.skill_tier_id
  left join public.profiles p on p.id = g.organizer_id
  where g.id = p_game_id;
$$;

grant execute on function public.push_game_summary(uuid) to service_role;

-- Actor names stay out of the game summary — the actor is per-event, the summary is per-game.
create or replace function public.push_actor_name(p_profile_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(p.display_name, 'A player') from public.profiles p where p.id = p_profile_id;
$$;

grant execute on function public.push_actor_name(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- §6.4 + bug #1. A cancellation or reschedule has to reach people with an open request, not just
-- the approved roster — otherwise a requester turns up at a court for a game that no longer
-- exists. Widening via a new parameter, so every other caller keeps today's roster-only set.
-- Overloading would make the existing 2-arg calls ambiguous, so replace the function outright.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.push_recipients_for_game(uuid, uuid);

create function public.push_recipients_for_game(
  p_game_id uuid,
  p_exclude_profile uuid default null,
  p_include_requested boolean default false
)
returns table (profile_id uuid, expo_token text)
language sql
stable
security definer set search_path = public
as $$
  select distinct pt.profile_id, pt.expo_token
  from public.push_tokens pt
  where pt.profile_id in (
    select gp.profile_id
    from public.game_players gp
    where gp.game_id = p_game_id
      and (gp.status = 'approved' or (p_include_requested and gp.status = 'requested'))
    union
    select g.organizer_id from public.games g where g.id = p_game_id
  )
  and pt.profile_id is distinct from p_exclude_profile;
$$;

grant execute on function public.push_recipients_for_game(uuid, uuid, boolean) to service_role;

-- Host-only fan-out for the roster events only the host can act on (A1, A6, A8).
create or replace function public.push_recipients_for_host(p_game_id uuid)
returns table (profile_id uuid, expo_token text)
language sql
stable
security definer set search_path = public
as $$
  select pt.profile_id, pt.expo_token
  from public.push_tokens pt
  join public.games g on g.organizer_id = pt.profile_id
  where g.id = p_game_id;
$$;

grant execute on function public.push_recipients_for_host(uuid) to service_role;

-- C3 recipients. The organizer is not a game_players row, so "everyone who was there" is the
-- approved roster plus the host. A rating prompt is only worth sending to someone who has
-- somebody to rate: an approved player's rate list excludes themselves and the host, so with a
-- single approved player only the host has a co-player.
create or replace function public.push_post_game_recipients(p_game_id uuid)
returns table (profile_id uuid, expo_token text)
language sql
stable
security definer set search_path = public
as $$
  select distinct pt.profile_id, pt.expo_token
  from public.push_tokens pt
  where pt.profile_id in (
    select g.organizer_id from public.games g where g.id = p_game_id
    union
    select gp.profile_id
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.status = 'approved'
      and public.approved_player_count(p_game_id) >= 2
  );
$$;

grant execute on function public.push_post_game_recipients(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- §6.7 / bug #6. The dispatch URL was hardcoded to the hosted project ref, so local dev never
-- dispatched (no notification change could be exercised end to end) and a project-ref change
-- would silently kill every push. Read it from Vault alongside the key, falling back to the
-- hosted URL so an existing project keeps working without a new secret.
-- ---------------------------------------------------------------------------------------------

create or replace function public.notify_push(p_payload jsonb)
returns void
language plpgsql
security definer set search_path = public, vault
as $$
declare
  v_key text;
  v_url text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'push_dispatch_key' limit 1;
  if v_key is null then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url' limit 1;

  perform net.http_post(
    url := coalesce(v_url, 'https://ajbsvsfwjfeofvjuhzrw.supabase.co/functions/v1/push-dispatch'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_payload
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- A1 / A6 / A8: the three roster events the host can still act on. A1 is the headline gap —
-- there was no INSERT trigger on game_players at all, so a host only learned about a request by
-- opening the game screen. It must fire on both paths: a first-time insert, and request_to_join's
-- ON CONFLICT reopen from rejected/left/removed (20260819000000), which is an UPDATE.
-- ---------------------------------------------------------------------------------------------

create or replace function public.trigger_notify_host_roster()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_organizer_id uuid;
  v_spots_left int;
begin
  select g.organizer_id into v_organizer_id from public.games g where g.id = new.game_id;

  -- Never notify someone about their own action (§3.2).
  if v_organizer_id is null or v_organizer_id = new.profile_id then
    return new;
  end if;

  -- OLD is unassigned in an INSERT trigger, and SQL's AND/OR give no short-circuit guarantee,
  -- so the two operations branch before anything reads OLD.
  if tg_op = 'INSERT' then
    if new.status = 'requested' then
      perform public.notify_push(jsonb_build_object(
        'type', 'join_request',
        'game_id', new.game_id,
        'actor_id', new.profile_id,
        'host_id', v_organizer_id
      ));
    end if;
    return new;
  end if;

  if new.status = 'requested' and old.status is distinct from 'requested' then
    -- request_to_join's ON CONFLICT reopen (20260819000000) lands here, not on INSERT.
    perform public.notify_push(jsonb_build_object(
      'type', 'join_request',
      'game_id', new.game_id,
      'actor_id', new.profile_id,
      'host_id', v_organizer_id
    ));

  elsif old.status = 'approved' and new.status = 'left' then
    perform public.notify_push(jsonb_build_object(
      'type', 'player_left',
      'game_id', new.game_id,
      'actor_id', new.profile_id,
      'host_id', v_organizer_id
    ));

  elsif old.status is distinct from 'approved' and new.status = 'approved' then
    select s.spots_left into v_spots_left from public.push_game_summary(new.game_id) s;
    if v_spots_left = 0 then
      perform public.notify_push(jsonb_build_object(
        'type', 'game_full',
        'game_id', new.game_id,
        'host_id', v_organizer_id
      ));
    end if;
  end if;

  return new;
end;
$$;

create trigger game_players_notify_host
  after insert or update on public.game_players
  for each row execute function public.trigger_notify_host_roster();

-- B2 needs the time the game moved *from*, which the edge function can't recover by re-reading
-- the row. Pass old.starts_at in the payload.
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
      'organizer_id', new.organizer_id,
      'old_starts_at', old.starts_at
    ));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- C1 + bugs #2/#3. Two reminders now: T-24h (time to arrange transport or bail politely) and
-- T-2h. The old sweep matched a hard 115-125 minute band, so a single skipped or lagged cron
-- tick dropped that game's reminder permanently. Both sweeps are now "anything inside the
-- window that hasn't been reminded yet", which self-heals after any outage shorter than the
-- window itself.
-- ---------------------------------------------------------------------------------------------

alter table public.games add column reminded_24h_at timestamptz;

-- Rescheduling already re-armed reminded_at (20260810000000); the new flag needs the same reset,
-- or a game moved a day later keeps yesterday's stamp and never sends its 24h reminder.
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
  end if;

  return new;
end;
$$;

create or replace function public.dispatch_game_reminders()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_sydney_hour int;
begin
  v_sydney_hour := extract(hour from (now() at time zone 'Australia/Sydney'))::int;

  -- T-24h. Games posted less than a day ahead skip it: "Tomorrow" is not news to someone who
  -- joined this morning, and they still get the T-2h.
  for r in
    select id from public.games
    where status = 'published'
      and reminded_24h_at is null
      and starts_at > now() + interval '2 hours'
      and starts_at <= now() + interval '24 hours'
      and created_at <= starts_at - interval '24 hours'
  loop
    perform public.notify_push(jsonb_build_object('type', 'reminder_24h', 'game_id', r.id));
    update public.games set reminded_24h_at = now() where id = r.id;
  end loop;

  -- T-2h. Suppressed 22:00-07:00 Sydney (§4C) — the 24h reminder covers early games. The stamp
  -- is still written so the sweep doesn't fire it late, at 6am, for a 7am game.
  for r in
    select id from public.games
    where status = 'published'
      and reminded_at is null
      and starts_at > now()
      and starts_at <= now() + interval '2 hours 5 minutes'
  loop
    if v_sydney_hour < 7 or v_sydney_hour >= 22 then
      update public.games set reminded_at = now() where id = r.id;
    else
      perform public.notify_push(jsonb_build_object('type', 'reminder_2h', 'game_id', r.id));
      update public.games set reminded_at = now() where id = r.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- C3 post_game_rate. complete_past_games flips games to completed hourly and notified nobody,
-- so the whole ratings -> reliability -> trust chain depended on a prompt that didn't exist.
-- T+2h after ends_at, and never for a game that finished more than two days ago (a backfill
-- shouldn't page everyone about last month).
-- ---------------------------------------------------------------------------------------------

alter table public.games add column rate_prompted_at timestamptz;

create or replace function public.dispatch_post_game_prompts()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select g.id from public.games g
    where g.status = 'completed'
      and g.rate_prompted_at is null
      and g.ends_at < now() - interval '2 hours'
      and g.ends_at > now() - interval '48 hours'
      and public.approved_player_count(g.id) >= 1
  loop
    perform public.notify_push(jsonb_build_object('type', 'post_game_rate', 'game_id', r.id));
    update public.games set rate_prompted_at = now() where id = r.id;
  end loop;
end;
$$;

select cron.schedule('dispatch-post-game-prompts', '15 * * * *', $$select public.dispatch_post_game_prompts();$$);

-- ---------------------------------------------------------------------------------------------
-- E1 copy fix: the message push titled itself "{sender} · {venue}", but a venue hosts many
-- games — the title has to name the game. Adding sport_name changes the return type, so the old
-- signature has to be dropped first.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.push_message_summary(uuid);

create function public.push_message_summary(p_message_id uuid)
returns table (
  venue_name text,
  sport_name text,
  sender_name text,
  body text,
  kind text,
  chat_mode text,
  is_host boolean
)
language sql stable security definer set search_path = public as $$
  select v.name, s.name, coalesce(p.display_name, 'Player'), m.body, m.kind, g.chat_mode,
         (m.sender_id = g.organizer_id)
  from public.messages m
  join public.games g on g.id = m.game_id
  join public.venues v on v.id = g.venue_id
  join public.sports s on s.id = g.sport_id
  left join public.profiles p on p.id = m.sender_id
  where m.id = p_message_id;
$$;

grant execute on function public.push_message_summary(uuid) to service_role;
