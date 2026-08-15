-- Chat v2 (docs/chat-plan.md). The thread becomes the game's timeline: host control,
-- richer messages, per-thread notification prefs, and a single chat_threads() RPC replacing
-- the old three-query unbounded client fetch.

-- ---------------------------------------------------------------------------------------
-- Host control on the game
-- ---------------------------------------------------------------------------------------

alter table public.games
  add column chat_mode text not null default 'open'
    check (chat_mode in ('open', 'announce')),
  add column chat_closed_at timestamptz;

alter table public.game_players
  add column chat_muted_at timestamptz;

-- enforce_game_edit_rules (20260810000000_game_management.sql) blocks *any* update to an
-- already-cancelled game, including this migration's own chat_mode/chat_closed_at writes from
-- set_chat_mode/close_chat/auto_close_stale_chats — a cancelled game's chat still needs to be
-- closeable. Narrow the guard to fire only when a substantive field actually changes.
create or replace function public.enforce_game_edit_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_approved_count int;
begin
  if old.status = 'cancelled' and new.status = 'cancelled'
     and (new.starts_at, new.max_players, new.cost_per_player_cents, new.duration_hours, new.courts_booked, new.skill_tier_id)
         is distinct from (old.starts_at, old.max_players, old.cost_per_player_cents, old.duration_hours, old.courts_booked, old.skill_tier_id)
  then
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
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Messages grow three kinds, plus mentions and an optimistic-send dedupe key.
-- ---------------------------------------------------------------------------------------

alter table public.messages
  add column kind text not null default 'text'
    check (kind in ('text', 'image', 'system')),
  add column image_path text,
  add column system_event text
    check (system_event in ('created', 'joined', 'left', 'removed', 'rescheduled', 'cancelled', 'verified', 'mode_changed', 'closed')),
  add column mentions uuid[] not null default '{}',
  add column client_id uuid;

alter table public.messages alter column sender_id drop not null;
alter table public.messages alter column body set default '';

create unique index messages_client_id_idx on public.messages (client_id) where client_id is not null;

-- ---------------------------------------------------------------------------------------
-- One predicate owns "can this person post" — host outranks announce-mode and mute, a
-- closed chat blocks everyone including the host, mute and announce-mode never touch the
-- host.
-- ---------------------------------------------------------------------------------------

create function public.can_post_in_chat(p_game_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_closed_at is not null) then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.organizer_id = p_profile_id) then true
    when not public.is_approved_player(p_game_id, p_profile_id) then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_mode = 'announce') then false
    when exists (select 1 from public.game_players gp
                 where gp.game_id = p_game_id and gp.profile_id = p_profile_id
                   and gp.chat_muted_at is not null) then false
    else true
  end;
$$;

grant execute on function public.can_post_in_chat(uuid, uuid) to authenticated;

-- Delete is a soft tombstone (deleted_at, already on the table) rather than a client RLS
-- delete policy — own message, or any message if the requester organizes the game.
create function public.delete_message(p_message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sender_id uuid;
  v_game_id uuid;
  v_organizer_id uuid;
begin
  select sender_id, game_id into v_sender_id, v_game_id from public.messages where id = p_message_id;
  if v_game_id is null then
    raise exception 'Message not found';
  end if;

  select organizer_id into v_organizer_id from public.games where id = v_game_id;

  if v_sender_id <> auth.uid() and v_organizer_id <> auth.uid() then
    raise exception 'Only the sender or the host can delete this message';
  end if;

  update public.messages set deleted_at = now() where id = p_message_id;
end;
$$;

grant execute on function public.delete_message(uuid) to authenticated;

drop policy "messages insert by organizer and approved players" on public.messages;

create policy "messages insert by permitted posters" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and kind in ('text', 'image')
    and public.can_post_in_chat(game_id, auth.uid())
  );

-- select policy is untouched — organizer + approved players, as today.

-- ---------------------------------------------------------------------------------------
-- Per-thread notification preference.
-- ---------------------------------------------------------------------------------------

create table public.chat_prefs (
  game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  level text not null default 'all' check (level in ('all', 'mentions', 'none')),
  muted_until timestamptz,
  primary key (game_id, profile_id)
);

alter table public.chat_prefs enable row level security;

create policy "chat_prefs self only" on public.chat_prefs
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on public.chat_prefs to authenticated;

-- ---------------------------------------------------------------------------------------
-- Host action RPCs. Each writes its own system row in the same transaction.
-- ---------------------------------------------------------------------------------------

create function public.set_chat_mode(p_game_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_organizer_id uuid;
begin
  if p_mode not in ('open', 'announce') then
    raise exception 'Invalid chat mode';
  end if;

  select organizer_id into v_organizer_id from public.games where id = p_game_id;
  if v_organizer_id is null then
    raise exception 'Game not found';
  end if;
  if v_organizer_id <> auth.uid() then
    raise exception 'Only the host can change chat mode';
  end if;

  update public.games set chat_mode = p_mode where id = p_game_id;

  insert into public.messages (game_id, sender_id, kind, system_event, body)
  values (
    p_game_id, v_organizer_id, 'system', 'mode_changed',
    case when p_mode = 'announce'
      then 'Turned on announcements — only the host can post now'
      else 'Turned off announcements — everyone can post again'
    end
  );
end;
$$;

grant execute on function public.set_chat_mode(uuid, text) to authenticated;

create function public.set_player_chat_mute(p_game_id uuid, p_profile_id uuid, p_muted boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_organizer_id uuid;
begin
  select organizer_id into v_organizer_id from public.games where id = p_game_id;
  if v_organizer_id is null then
    raise exception 'Game not found';
  end if;
  if v_organizer_id <> auth.uid() then
    raise exception 'Only the host can mute players';
  end if;
  if p_profile_id = v_organizer_id then
    raise exception 'The host can''t be muted';
  end if;

  update public.game_players
  set chat_muted_at = case when p_muted then now() else null end
  where game_id = p_game_id and profile_id = p_profile_id and status = 'approved';
end;
$$;

grant execute on function public.set_player_chat_mute(uuid, uuid, boolean) to authenticated;

create function public.close_chat(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_organizer_id uuid;
  v_rows int;
begin
  select organizer_id into v_organizer_id from public.games where id = p_game_id;
  if v_organizer_id is null then
    raise exception 'Game not found';
  end if;
  if v_organizer_id <> auth.uid() then
    raise exception 'Only the host can close the chat';
  end if;

  update public.games set chat_closed_at = now() where id = p_game_id and chat_closed_at is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return;
  end if;

  insert into public.messages (game_id, sender_id, kind, system_event, body)
  values (p_game_id, v_organizer_id, 'system', 'closed', 'Chat closed');
end;
$$;

grant execute on function public.close_chat(uuid) to authenticated;

-- Cron auto-close, 7 days after ends_at — long enough for "same time next week", short
-- enough that dead threads stop generating notifications.
create function public.auto_close_stale_chats()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.messages (game_id, sender_id, kind, system_event, body)
  select g.id, g.organizer_id, 'system', 'closed', 'Chat closed'
  from public.games g
  where g.chat_closed_at is null and g.ends_at < now() - interval '7 days';

  update public.games
  set chat_closed_at = now()
  where chat_closed_at is null and ends_at < now() - interval '7 days';
end;
$$;

select cron.schedule('auto-close-stale-chats', '11 4 * * *', $$select public.auto_close_stale_chats();$$);

-- ---------------------------------------------------------------------------------------
-- System rows for the existing flows: created, joined, left, removed, rescheduled,
-- cancelled, verified. sender_id carries the affected profile so the client can render a
-- name via the same chat_members lookup it already does for typed messages; game-level
-- events (reschedule/cancel/verify) carry the organizer since only they can trigger those.
-- ---------------------------------------------------------------------------------------

create function public.trigger_chat_system_game_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.messages (game_id, sender_id, kind, system_event, body)
  select new.id, new.organizer_id, 'system', 'created',
    coalesce(p.display_name, 'Someone') || ' created this game'
  from public.profiles p where p.id = new.organizer_id;
  return new;
end;
$$;

create trigger games_chat_system_created
  after insert on public.games
  for each row execute function public.trigger_chat_system_game_created();

create function public.trigger_chat_system_game_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'published' and new.status = 'published' and new.starts_at <> old.starts_at then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.id, new.organizer_id, 'system', 'rescheduled', 'Game time changed — check the details above');
  end if;

  if old.status = 'published' and new.status = 'cancelled' then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.id, new.organizer_id, 'system', 'cancelled', 'This game was cancelled');
  end if;

  if old.verification_status is distinct from 'verified' and new.verification_status = 'verified' then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.id, new.organizer_id, 'system', 'verified', 'Booking verified ✓');
  end if;

  return new;
end;
$$;

create trigger games_chat_system_changed
  after update on public.games
  for each row execute function public.trigger_chat_system_game_changed();

create function public.trigger_chat_system_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = new.profile_id;
  v_name := coalesce(v_name, 'A player');

  if old.status = 'requested' and new.status = 'approved' then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.game_id, new.profile_id, 'system', 'joined', v_name || ' joined');
  elsif old.status = 'approved' and new.status = 'left' then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.game_id, new.profile_id, 'system', 'left', v_name || ' left');
  elsif old.status = 'approved' and new.status = 'removed' then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.game_id, new.profile_id, 'system', 'removed', v_name || ' was removed');
  end if;

  return new;
end;
$$;

create trigger game_players_chat_system_membership
  after update on public.game_players
  for each row execute function public.trigger_chat_system_membership();

-- ---------------------------------------------------------------------------------------
-- Thread list — one RPC, replacing the three-query unbounded fetch in messages.ts.
-- ---------------------------------------------------------------------------------------

create function public.chat_threads()
returns table (
  game_id uuid,
  venue_name text,
  starts_at timestamptz,
  game_status text,
  chat_closed_at timestamptz,
  last_message_body text,
  last_message_kind text,
  last_message_sender_name text,
  last_message_sender_is_me boolean,
  last_message_at timestamptz,
  unread_count int
)
language sql stable security definer set search_path = public as $$
  with my_games as (
    select gp.game_id from public.game_players gp
    where gp.profile_id = auth.uid() and gp.status = 'approved'
    union
    select g.id from public.games g where g.organizer_id = auth.uid()
  ),
  last_msg as (
    select distinct on (m.game_id) m.game_id, m.body, m.kind, m.sender_id, m.created_at
    from public.messages m
    where m.game_id in (select game_id from my_games) and m.deleted_at is null
    order by m.game_id, m.created_at desc
  ),
  unread as (
    select m.game_id, count(*)::int as unread_count
    from public.messages m
    left join public.message_reads mr on mr.game_id = m.game_id and mr.profile_id = auth.uid()
    where m.game_id in (select game_id from my_games)
      and m.deleted_at is null
      and m.sender_id is distinct from auth.uid()
      and m.kind is distinct from 'system'
      and (mr.last_read_at is null or m.created_at > mr.last_read_at)
    group by m.game_id
  )
  select
    g.id,
    v.name,
    g.starts_at,
    g.status,
    g.chat_closed_at,
    lm.body,
    lm.kind,
    coalesce(sp.display_name, 'Player'),
    lm.sender_id = auth.uid(),
    lm.created_at,
    coalesce(u.unread_count, 0)
  from my_games mg
  join public.games g on g.id = mg.game_id
  join public.venues v on v.id = g.venue_id
  left join last_msg lm on lm.game_id = g.id
  left join public.profiles sp on sp.id = lm.sender_id
  left join unread u on u.game_id = g.id
  order by coalesce(lm.created_at, g.created_at) desc;
$$;

grant execute on function public.chat_threads() to authenticated;

-- ---------------------------------------------------------------------------------------
-- Push: only text/image messages page out (system rows are visual, not push-worthy), and
-- the recipient list now respects chat_prefs.
-- ---------------------------------------------------------------------------------------

create or replace function public.trigger_notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('text', 'image') then
    perform public.notify_push(jsonb_build_object(
      'type', 'message',
      'game_id', new.game_id,
      'sender_id', new.sender_id,
      'message_id', new.id
    ));
  end if;
  return new;
end;
$$;

create function public.chat_push_recipients(p_message_id uuid)
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
    );
$$;

grant execute on function public.chat_push_recipients(uuid) to service_role;

create function public.push_message_summary(p_message_id uuid)
returns table (venue_name text, sender_name text, body text, kind text, chat_mode text, is_host boolean)
language sql stable security definer set search_path = public as $$
  select v.name, coalesce(p.display_name, 'Player'), m.body, m.kind, g.chat_mode, (m.sender_id = g.organizer_id)
  from public.messages m
  join public.games g on g.id = m.game_id
  join public.venues v on v.id = g.venue_id
  left join public.profiles p on p.id = m.sender_id
  where m.id = p_message_id;
$$;

grant execute on function public.push_message_summary(uuid) to service_role;

-- ---------------------------------------------------------------------------------------
-- P4: private chat-media bucket, mirrors messages' select policy so a removed player also
-- loses the photos. Path convention {game_id}/{uid}/{uuid}.jpg.
-- ---------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', false);

create policy "chat media readable by organizer and approved players" on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media'
    and (
      public.is_approved_player(((storage.foldername(name))[1])::uuid, auth.uid())
      or exists (
        select 1 from public.games g
        where g.id = ((storage.foldername(name))[1])::uuid and g.organizer_id = auth.uid()
      )
    )
  );

create policy "chat media insert by permitted posters" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.can_post_in_chat(((storage.foldername(name))[1])::uuid, auth.uid())
  );
