-- Notifications P2 (docs/notifications-plan.md §5 P2, §6.2). Signed off 2026-08-20 — an activity
-- inbox is beyond mvp-spec.md, per AGENTS.md's "ask before scope beyond MVP" rule.
--
-- Replaces the fire-and-forget shape (trigger -> notify_push(event payload) -> push-dispatch
-- resolves recipients + renders + sends, nothing persisted) with a durable one: the trigger
-- resolves recipients and writes one row per recipient into `notifications` *in the same
-- transaction as the event*, then calls notify_push with just the new ids. push-dispatch reads
-- those rows, renders copy, sends, and stamps title/body/sent_at back onto them. This is what
-- makes the retry sweep (bug #7), the unread badge, and the inbox screen possible — none of them
-- have anything to read from under the old shape.

-- ---------------------------------------------------------------------------------------------
-- §6.2 notifications table.
-- ---------------------------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  game_id uuid references public.games(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  params jsonb not null default '{}',
  title text,
  body text,
  priority text not null default 'normal',
  collapse_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz
);

-- Inbox screen: newest first per profile.
create index notifications_profile_created_idx on public.notifications (profile_id, created_at desc);
-- Badge count and the inbox's unread filter.
create index notifications_profile_unread_idx on public.notifications (profile_id) where read_at is null;
-- Retry sweep: anything push-dispatch never got to.
create index notifications_pending_idx on public.notifications (created_at) where sent_at is null;
-- Coalescing: "how many pending rows share this recipient + event group".
create index notifications_collapse_idx on public.notifications (profile_id, collapse_key, created_at)
  where collapse_key is not null;

alter table public.notifications enable row level security;

create policy "notifications self select" on public.notifications
  for select to authenticated using (profile_id = auth.uid());

-- RLS can't restrict *which columns* an UPDATE touches, so the "self-update of read_at only"
-- half of the rule (§6.2) comes from the column-level GRANT below, not the policy: authenticated
-- gets UPDATE on read_at alone, so a client update touching title/body/type fails on the missing
-- column privilege regardless of what the row-level policy would otherwise allow.
create policy "notifications self update read_at" on public.notifications
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- No insert grant to authenticated — every row is written server-side (trigger or cron, both
-- security definer), matching "no client insert".

alter publication supabase_realtime add table public.notifications;

-- One row per recipient, then a single notify_push carrying their new ids. Security definer so
-- every trigger below can call it without its own insert/execute grants.
create or replace function public.enqueue_notifications(
  p_type text,
  p_game_id uuid,
  p_actor_id uuid,
  p_recipient_ids uuid[],
  p_params jsonb default '{}',
  p_priority text default 'normal',
  p_collapse_key text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if p_recipient_ids is null or array_length(p_recipient_ids, 1) is null then
    return;
  end if;

  with ins as (
    insert into public.notifications (profile_id, type, game_id, actor_id, params, priority, collapse_key)
    select r, p_type, p_game_id, p_actor_id, p_params, p_priority, p_collapse_key
    from unnest(p_recipient_ids) as r
    returning id
  )
  select array_agg(id) into v_ids from ins;

  perform public.notify_push(jsonb_build_object('ids', to_jsonb(v_ids)));
end;
$$;

grant execute on function public.enqueue_notifications(text, uuid, uuid, uuid[], jsonb, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- P0/P1's recipient functions joined push_tokens because they were called from push-dispatch,
-- purely to get a token to send to. Under P2 they're called from *triggers*, to decide who gets
-- an inbox row — and a profile with no registered device yet (fresh install, notifications not
-- granted) is still a valid recipient of an in-app notification, just not of a push. Requiring a
-- push_tokens row here silently dropped every one of those recipients before a row was ever
-- written. Redefined to resolve membership + prefs only; push-dispatch already looks up tokens
-- separately by profile_id when it's time to actually send (fetchTokens in index.ts).
-- ---------------------------------------------------------------------------------------------

drop function if exists public.push_recipients_for_game(uuid, uuid, boolean, text);

create function public.push_recipients_for_game(
  p_game_id uuid,
  p_exclude_profile uuid default null,
  p_include_requested boolean default false,
  p_pref_key text default null
)
returns table (profile_id uuid)
language sql
stable
security definer set search_path = public
as $$
  select distinct r.profile_id
  from (
    select gp.profile_id
    from public.game_players gp
    where gp.game_id = p_game_id
      and (gp.status = 'approved' or (p_include_requested and gp.status = 'requested'))
    union
    select g.organizer_id from public.games g where g.id = p_game_id
  ) r
  where r.profile_id is distinct from p_exclude_profile
    and public.notification_pref_enabled(r.profile_id, p_pref_key);
$$;

grant execute on function public.push_recipients_for_game(uuid, uuid, boolean, text) to service_role;

drop function if exists public.push_recipients_for_host(uuid, text);

create function public.push_recipients_for_host(p_game_id uuid, p_pref_key text default null)
returns table (profile_id uuid)
language sql
stable
security definer set search_path = public
as $$
  select g.organizer_id
  from public.games g
  where g.id = p_game_id
    and public.notification_pref_enabled(g.organizer_id, p_pref_key);
$$;

grant execute on function public.push_recipients_for_host(uuid, text) to service_role;

drop function if exists public.push_post_game_recipients(uuid);

create function public.push_post_game_recipients(p_game_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer set search_path = public
as $$
  select distinct r.profile_id
  from (
    select g.organizer_id as profile_id from public.games g where g.id = p_game_id
    union
    select gp.profile_id
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.status = 'approved'
      and public.approved_player_count(p_game_id) >= 2
  ) r
  where public.notification_pref_enabled(r.profile_id, 'reminders');
$$;

grant execute on function public.push_post_game_recipients(uuid) to service_role;

drop function if exists public.chat_push_recipients(uuid);

create function public.chat_push_recipients(p_message_id uuid)
returns table (profile_id uuid)
language sql stable security definer set search_path = public as $$
  with m as (
    select id, game_id, sender_id, mentions from public.messages where id = p_message_id
  ),
  g as (
    select id, organizer_id from public.games where id = (select game_id from m)
  ),
  candidates as (
    select gp.profile_id from public.game_players gp, m
    where gp.game_id = m.game_id and gp.status = 'approved'
    union
    select organizer_id from g
  )
  select distinct c.profile_id
  from candidates c
  cross join m
  left join public.chat_prefs cp on cp.game_id = m.game_id and cp.profile_id = c.profile_id
  where c.profile_id is distinct from m.sender_id
    and coalesce(cp.level, 'all') <> 'none'
    and (cp.muted_until is null or cp.muted_until < now())
    and (
      coalesce(cp.level, 'all') = 'all'
      or (coalesce(cp.level, 'all') = 'mentions' and (c.profile_id = any(m.mentions) or m.sender_id = (select organizer_id from g)))
    )
    and public.notification_pref_enabled(c.profile_id, 'chat');
$$;

grant execute on function public.chat_push_recipients(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Every trigger that used to call notify_push(event payload) directly now resolves its recipient
-- set itself (reusing the same P1 pref-gated functions) and calls enqueue_notifications instead.
-- Same conditions, same recipient functions, same pref keys as P0/P1 — only the last line of each
-- branch changes.
-- ---------------------------------------------------------------------------------------------

-- A1 join_request, A6 player_left, A8 game_full.
create or replace function public.trigger_notify_host_roster()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_organizer_id uuid;
  v_spots_left int;
  v_recipients uuid[];
begin
  select g.organizer_id into v_organizer_id from public.games g where g.id = new.game_id;

  if v_organizer_id is null or v_organizer_id = new.profile_id then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'requested' then
      select array_agg(profile_id) into v_recipients from public.push_recipients_for_host(new.game_id, 'join_requests');
      perform public.enqueue_notifications(
        'join_request', new.game_id, new.profile_id, v_recipients,
        '{}'::jsonb, 'critical', 'join_request:' || new.game_id
      );
    end if;
    return new;
  end if;

  if new.status = 'requested' and old.status is distinct from 'requested' then
    select array_agg(profile_id) into v_recipients from public.push_recipients_for_host(new.game_id, 'join_requests');
    perform public.enqueue_notifications(
      'join_request', new.game_id, new.profile_id, v_recipients,
      '{}'::jsonb, 'critical', 'join_request:' || new.game_id
    );

  elsif old.status = 'approved' and new.status = 'left' then
    select array_agg(profile_id) into v_recipients from public.push_recipients_for_host(new.game_id, 'roster_changes');
    perform public.enqueue_notifications(
      'player_left', new.game_id, new.profile_id, v_recipients, '{}'::jsonb, 'normal', null
    );

  elsif old.status is distinct from 'approved' and new.status = 'approved' then
    select s.spots_left into v_spots_left from public.push_game_summary(new.game_id) s;
    if v_spots_left = 0 then
      select array_agg(profile_id) into v_recipients from public.push_recipients_for_host(new.game_id, 'roster_changes');
      perform public.enqueue_notifications(
        'game_full', new.game_id, null, v_recipients, '{}'::jsonb, 'low', null
      );
    end if;
  end if;

  return new;
end;
$$;

-- B1 game_cancelled, B2 game_rescheduled.
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

-- A3 join_approved, A4 join_declined, A5 player_removed. Single-recipient; never gated by
-- notification_prefs (§4's "never notify someone about their own action" list doesn't cover
-- these, but they're the direct result of the recipient's *own* request, not a category someone
-- would want fully silenced — same call P1 made).
create or replace function public.trigger_notify_join_decision()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'requested' and new.status in ('approved', 'rejected') then
    perform public.enqueue_notifications(
      'join_decision', new.game_id, null, array[new.profile_id],
      jsonb_build_object('status', new.status),
      case when new.status = 'approved' then 'critical' else 'normal' end,
      null
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

-- E1 message. collapse_key groups by game so a burst of chat activity coalesces (E2) the same
-- way a burst of join requests does (A2) — see push-dispatch's coalescing pass.
create or replace function public.trigger_notify_new_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recipients uuid[];
begin
  if new.kind in ('text', 'image') then
    select array_agg(profile_id) into v_recipients from public.chat_push_recipients(new.id);
    perform public.enqueue_notifications(
      'message', new.game_id, new.sender_id, v_recipients,
      jsonb_build_object('message_id', new.id), 'normal', 'message:' || new.game_id
    );
  end if;
  return new;
end;
$$;

-- D1 alert_match.
create or replace function public.trigger_notify_game_alerts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_venue_location extensions.geography;
  v_tier_slug text;
  v_profile_ids uuid[];
begin
  if new.status <> 'published' then
    return new;
  end if;

  select v.location into v_venue_location from public.venues v where v.id = new.venue_id;
  select st.slug into v_tier_slug from public.skill_tiers st where st.id = new.skill_tier_id;

  select array_agg(ga.profile_id) into v_profile_ids
  from public.game_alerts ga
  where ga.sport_id = new.sport_id
    and ga.profile_id is distinct from new.organizer_id
    and (ga.tier_slugs is null or v_tier_slug = any(ga.tier_slugs))
    and public.notification_pref_enabled(ga.profile_id, 'alerts')
    and extensions.ST_DWithin(
          v_venue_location,
          extensions.ST_SetSRID(extensions.ST_MakePoint(ga.center_lng, ga.center_lat), 4326)::extensions.geography,
          ga.radius_m
        );

  perform public.enqueue_notifications('alert_match', new.id, new.organizer_id, v_profile_ids, '{}'::jsonb, 'low', null);

  return new;
end;
$$;

-- C1 reminder_24h, C2 reminder_2h.
create or replace function public.dispatch_game_reminders()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_sydney_hour int;
  v_recipients uuid[];
begin
  v_sydney_hour := extract(hour from (now() at time zone 'Australia/Sydney'))::int;

  for r in
    select id from public.games
    where status = 'published'
      and reminded_24h_at is null
      and starts_at > now() + interval '2 hours'
      and starts_at <= now() + interval '24 hours'
      and created_at <= starts_at - interval '24 hours'
  loop
    select array_agg(profile_id) into v_recipients from public.push_recipients_for_game(r.id, null, false, 'reminders');
    perform public.enqueue_notifications('reminder_24h', r.id, null, v_recipients, '{}'::jsonb, 'normal', null);
    update public.games set reminded_24h_at = now() where id = r.id;
  end loop;

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
      select array_agg(profile_id) into v_recipients from public.push_recipients_for_game(r.id, null, false, 'reminders');
      perform public.enqueue_notifications('reminder_2h', r.id, null, v_recipients, '{}'::jsonb, 'critical', null);
      update public.games set reminded_at = now() where id = r.id;
    end if;
  end loop;
end;
$$;

-- C3 post_game_rate. Two groups because the rateable count differs: the host can rate everyone
-- approved; an approved player's list excludes themselves (and the host, who has no game_players
-- row). Stashed in params now instead of recomputed in the edge function from group membership.
create or replace function public.dispatch_post_game_prompts()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_summary record;
  v_host_ids uuid[];
  v_player_ids uuid[];
begin
  for r in
    select g.id from public.games g
    where g.status = 'completed'
      and g.rate_prompted_at is null
      and g.ends_at < now() - interval '2 hours'
      and g.ends_at > now() - interval '48 hours'
      and public.approved_player_count(g.id) >= 1
  loop
    select * into v_summary from public.push_game_summary(r.id);

    select array_agg(profile_id) into v_host_ids
    from public.push_post_game_recipients(r.id) where profile_id = v_summary.host_id;

    select array_agg(profile_id) into v_player_ids
    from public.push_post_game_recipients(r.id) where profile_id <> v_summary.host_id;

    if v_host_ids is not null and v_summary.approved_count >= 1 then
      perform public.enqueue_notifications(
        'post_game_rate', r.id, null, v_host_ids,
        jsonb_build_object('rateable_count', v_summary.approved_count), 'low', null
      );
    end if;

    if v_player_ids is not null and v_summary.approved_count - 1 >= 1 then
      perform public.enqueue_notifications(
        'post_game_rate', r.id, null, v_player_ids,
        jsonb_build_object('rateable_count', v_summary.approved_count - 1), 'low', null
      );
    end if;

    update public.games set rate_prompted_at = now() where id = r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Bug #7 retry sweep. A row with sent_at still null 2+ minutes after creation means push-dispatch
-- never got to it (pg_net back-pressure, a 5xx, a deploy mid-flight) — re-notify with just its id
-- so the edge function's normal idempotent path (it no-ops a row that's already sent_at-stamped,
-- and coalescing re-derives from current pending rows either way) picks it back up. Bounded to 48h
-- so a permanently broken row doesn't get retried forever.
-- ---------------------------------------------------------------------------------------------

create or replace function public.dispatch_notification_retries()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
  from public.notifications
  where sent_at is null
    and created_at < now() - interval '2 minutes'
    and created_at > now() - interval '48 hours';

  if v_ids is not null then
    perform public.notify_push(jsonb_build_object('ids', to_jsonb(v_ids)));
  end if;
end;
$$;

select cron.schedule('retry-unsent-notifications', '*/5 * * * *', $$select public.dispatch_notification_retries();$$);

-- ---------------------------------------------------------------------------------------------
-- Badge and inbox helpers used by push-dispatch and the client respectively.
-- ---------------------------------------------------------------------------------------------

-- Pre-existing bug, caught by this migration's own local smoke test: profiles.display_name
-- defaults to '' (not null) until a user sets one in onboarding, so P0's original
-- coalesce(display_name, 'A player') never actually caught the empty case — a requester with no
-- display name yet produced "New request from " with a trailing blank. nullif() maps '' to null
-- first so the coalesce has something to catch.
create or replace function public.push_actor_name(p_profile_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(nullif(p.display_name, ''), 'A player') from public.profiles p where p.id = p_profile_id;
$$;

create or replace function public.notification_unread_count(p_profile_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notifications where profile_id = p_profile_id and read_at is null;
$$;

grant execute on function public.notification_unread_count(uuid) to authenticated, service_role;
