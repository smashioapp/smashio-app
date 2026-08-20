-- Notifications P1 (docs/notifications-plan.md §5 P1, §6.3-6.5, §7). Controls and hygiene on top
-- of the P0 pipeline: per-category preferences, quiet hours, dead-token pruning, per-recipient
-- timezone. No new event types — every trigger from P0 keeps firing, just gated.
--
-- Deviation from the plan doc as written: §6.5 describes quiet hours as "hold, then a P2 sweeper
-- re-delivers" using notifications.sent_at/deliver_after — but that table is P2 (needs its own
-- sign-off, §5). Re-delivery needs a durable queue either way, so it's deferred to P2 alongside
-- the retry sweeper (bug #7) it would share. P1 quiet hours instead **drop** a low-tier push for a
-- recipient currently in their window, evaluated per-recipient at send time. Nothing critical or
-- normal ever drops — only the tier the plan already calls "silent, respects quiet hours".

-- ---------------------------------------------------------------------------------------------
-- Bug #9. profiles.timezone retires the SYDNEY_TZ hardcode for anyone outside it. Defaults to
-- Sydney so every existing profile (and format.ts, still Sydney-pinned until a second city ships)
-- keeps today's behaviour.
-- ---------------------------------------------------------------------------------------------

alter table public.profiles add column if not exists timezone text not null default 'Australia/Sydney';

-- ---------------------------------------------------------------------------------------------
-- §6.3 notification_prefs. One row per profile, all seven categories defaulting true. A missing
-- row (the common case — nobody has touched settings yet) reads as "everything on" via
-- notification_pref_enabled's coalesce, so there's no need to backfill one per profile.
-- ---------------------------------------------------------------------------------------------

create table public.notification_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  join_requests boolean not null default true,
  roster_changes boolean not null default true,
  chat boolean not null default true,
  reminders boolean not null default true,
  game_changes boolean not null default true,
  alerts boolean not null default true,
  nudges boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "notification_prefs self read" on public.notification_prefs
  for select to authenticated using (profile_id = auth.uid());

create policy "notification_prefs self insert" on public.notification_prefs
  for insert to authenticated with check (profile_id = auth.uid());

create policy "notification_prefs self update" on public.notification_prefs
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, insert, update on public.notification_prefs to authenticated;

create or replace function public.notification_prefs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.notification_prefs_touch_updated_at();

-- One category check, reused by every recipient function below. Unknown/null key = always on, so
-- callers that don't pass one (join_decision, the P0 default) are unaffected.
create or replace function public.notification_pref_enabled(p_profile_id uuid, p_pref_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case p_pref_key
    when 'join_requests'  then coalesce((select join_requests  from public.notification_prefs where profile_id = p_profile_id), true)
    when 'roster_changes' then coalesce((select roster_changes from public.notification_prefs where profile_id = p_profile_id), true)
    when 'chat'           then coalesce((select chat           from public.notification_prefs where profile_id = p_profile_id), true)
    when 'reminders'      then coalesce((select reminders      from public.notification_prefs where profile_id = p_profile_id), true)
    when 'game_changes'   then coalesce((select game_changes   from public.notification_prefs where profile_id = p_profile_id), true)
    when 'alerts'         then coalesce((select alerts         from public.notification_prefs where profile_id = p_profile_id), true)
    when 'nudges'         then coalesce((select nudges         from public.notification_prefs where profile_id = p_profile_id), true)
    else true
  end;
$$;

grant execute on function public.notification_pref_enabled(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- §6.5 quiet hours. time_in_window handles the overnight wrap (22:00-07:00 crosses midnight, so a
-- plain start<=t<end range is wrong half the time). filter_quiet_recipients is the one place the
-- edge function calls for low-tier sends — it hands back only the ids allowed to receive right
-- now, evaluated in each recipient's own timezone.
-- ---------------------------------------------------------------------------------------------

create or replace function public.time_in_window(p_t time, p_start time, p_end time)
returns boolean
language sql immutable
as $$
  select case when p_start <= p_end
    then p_t >= p_start and p_t < p_end
    else p_t >= p_start or p_t < p_end
  end;
$$;

create or replace function public.filter_quiet_recipients(p_profile_ids uuid[])
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id
  from public.profiles p
  left join public.notification_prefs np on np.profile_id = p.id
  where p.id = any(p_profile_ids)
    and not (
      coalesce(np.quiet_hours_enabled, false)
      and public.time_in_window(
            (now() at time zone coalesce(p.timezone, 'Australia/Sydney'))::time,
            coalesce(np.quiet_start, '22:00'::time),
            coalesce(np.quiet_end, '07:00'::time)
          )
    );
$$;

grant execute on function public.filter_quiet_recipients(uuid[]) to service_role;

-- ---------------------------------------------------------------------------------------------
-- §6.4 recipient function rework. Each gains p_pref_key, checked before a token is returned so an
-- opted-out user never reaches the edge function at all.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.push_recipients_for_game(uuid, uuid, boolean);

create function public.push_recipients_for_game(
  p_game_id uuid,
  p_exclude_profile uuid default null,
  p_include_requested boolean default false,
  p_pref_key text default null
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
  and pt.profile_id is distinct from p_exclude_profile
  and public.notification_pref_enabled(pt.profile_id, p_pref_key);
$$;

grant execute on function public.push_recipients_for_game(uuid, uuid, boolean, text) to service_role;

drop function if exists public.push_recipients_for_host(uuid);

create function public.push_recipients_for_host(p_game_id uuid, p_pref_key text default null)
returns table (profile_id uuid, expo_token text)
language sql
stable
security definer set search_path = public
as $$
  select pt.profile_id, pt.expo_token
  from public.push_tokens pt
  join public.games g on g.organizer_id = pt.profile_id
  where g.id = p_game_id
    and public.notification_pref_enabled(pt.profile_id, p_pref_key);
$$;

grant execute on function public.push_recipients_for_host(uuid, text) to service_role;

-- C3 stays under the 'reminders' category (it's the other time-based prompt; the plan's category
-- list has no dedicated bucket for it and P3's nudges are a different, host-facing concept).
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
  )
  and public.notification_pref_enabled(pt.profile_id, 'reminders');
$$;

grant execute on function public.push_post_game_recipients(uuid) to service_role;

-- Chat gains the same global-layer check on top of its existing per-game chat_prefs.
create or replace function public.chat_push_recipients(p_message_id uuid)
returns table (profile_id uuid, expo_token text)
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
  select distinct pt.profile_id, pt.expo_token
  from public.push_tokens pt
  join candidates c on c.profile_id = pt.profile_id
  cross join m
  left join public.chat_prefs cp on cp.game_id = m.game_id and cp.profile_id = pt.profile_id
  where pt.profile_id is distinct from m.sender_id
    and coalesce(cp.level, 'all') <> 'none'
    and (cp.muted_until is null or cp.muted_until < now())
    and (
      coalesce(cp.level, 'all') = 'all'
      or (coalesce(cp.level, 'all') = 'mentions' and (pt.profile_id = any(m.mentions) or m.sender_id = (select organizer_id from g)))
    )
    and public.notification_pref_enabled(pt.profile_id, 'chat');
$$;

grant execute on function public.chat_push_recipients(uuid) to service_role;

-- game_alerts fan-out gains the same gate before it ever builds the profile_ids array.
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

  if v_profile_ids is not null and array_length(v_profile_ids, 1) > 0 then
    perform public.notify_push(jsonb_build_object(
      'type', 'alert_match',
      'game_id', new.id,
      'profile_ids', to_jsonb(v_profile_ids)
    ));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Bug #5. Expo returns DeviceNotRegistered on the *receipt*, fetched separately and only after
-- the push has had time to attempt delivery (Expo recommends ~15 min later) — not on the initial
-- ticket, which is almost always "ok" even for a dead token. So dead-token pruning needs the
-- ticket ids kept somewhere between send and receipt-check. push_receipts is that handoff, purely
-- transient: every row is deleted the first time its receipt is checked, whether or not the token
-- turned out to be dead.
-- ---------------------------------------------------------------------------------------------

create table public.push_receipts (
  ticket_id text primary key,
  expo_token text not null,
  created_at timestamptz not null default now()
);

alter table public.push_receipts enable row level security;

create index push_receipts_created_at_idx on public.push_receipts (created_at);

create or replace function public.prune_ready_receipt_batch(p_limit int default 1000)
returns table (ticket_id text, expo_token text)
language sql
security definer set search_path = public
as $$
  select ticket_id, expo_token
  from public.push_receipts
  where created_at < now() - interval '15 minutes'
  order by created_at
  limit p_limit;
$$;

grant execute on function public.prune_ready_receipt_batch(int) to service_role;

create or replace function public.delete_push_receipts(p_ticket_ids text[])
returns void
language sql
security definer set search_path = public
as $$
  delete from public.push_receipts where ticket_id = any(p_ticket_ids);
$$;

grant execute on function public.delete_push_receipts(text[]) to service_role;

create or replace function public.delete_push_token(p_expo_token text)
returns void
language sql
security definer set search_path = public
as $$
  delete from public.push_tokens where expo_token = p_expo_token;
$$;

grant execute on function public.delete_push_token(text) to service_role;

grant insert on public.push_receipts to service_role;

-- Cron hits push-dispatch itself with a synthetic payload type, same fan-out path as every other
-- notification, rather than standing up a second function just for this.
select cron.schedule(
  'prune-dead-push-tokens',
  '*/20 * * * *',
  $$select public.notify_push(jsonb_build_object('type', 'prune_receipts'));$$
);
