-- Chat redesign (SMASHIO Chat Redesign.html, claude.ai/design 23bc2cae-...). Adds what the mock
-- needs beyond chat_v2 (20260815000700): reactions, quoted replies, in-chat game-share cards,
-- and two granular broadcast settings (pause-until, photo approval) alongside the existing
-- announce-mode + per-player mute.

-- ---------------------------------------------------------------------------------------
-- Reactions. Reacting is deliberately not gated by can_post_in_chat — the mock's broadcast-
-- only rule is "players can still react", so only membership (is_approved_player/organizer)
-- is required, same predicate as the messages select policy.
-- ---------------------------------------------------------------------------------------

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '🏸', '😂', '🔥')),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "message_reactions readable by organizer and approved players" on public.message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.messages m
      join public.games g on g.id = m.game_id
      where m.id = message_reactions.message_id
        and (public.is_approved_player(g.id, auth.uid()) or g.organizer_id = auth.uid())
    )
  );

create policy "message_reactions insert self as member" on public.message_reactions
  for insert to authenticated with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.messages m
      join public.games g on g.id = m.game_id
      where m.id = message_reactions.message_id
        and (public.is_approved_player(g.id, auth.uid()) or g.organizer_id = auth.uid())
    )
  );

create policy "message_reactions delete own" on public.message_reactions
  for delete to authenticated using (profile_id = auth.uid());

grant select, insert, delete on public.message_reactions to authenticated;

alter publication supabase_realtime add table public.message_reactions;

create function public.toggle_message_reaction(p_message_id uuid, p_emoji text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_existing boolean;
begin
  if p_emoji not in ('👍', '🏸', '😂', '🔥') then
    raise exception 'Unsupported reaction';
  end if;

  select true into v_existing from public.message_reactions
  where message_id = p_message_id and profile_id = auth.uid() and emoji = p_emoji;

  if v_existing then
    delete from public.message_reactions
    where message_id = p_message_id and profile_id = auth.uid() and emoji = p_emoji;
    return false;
  end if;

  insert into public.message_reactions (message_id, profile_id, emoji)
  values (p_message_id, auth.uid(), p_emoji);
  return true;
end;
$$;

grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Quoted replies (denormalized snapshot — survives the source message being paginated out
-- or later deleted, mirrors WhatsApp/iMessage quoting) and in-chat game-share cards.
-- ---------------------------------------------------------------------------------------

alter table public.messages
  add column reply_to_message_id uuid references public.messages(id) on delete set null,
  add column reply_to_sender_id uuid,
  add column reply_to_body text,
  add column reply_to_kind text,
  add column game_share_id uuid references public.games(id),
  add column approval_status text not null default 'approved'
    check (approval_status in ('approved', 'pending'));

alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'image', 'system', 'game_share'));

-- Server decides approval_status, not the client: pending only for an image posted into a
-- game with chat_photo_approval on, by someone other than the host (the host's own photos
-- never need approving).
create function public.trigger_set_photo_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_needs_approval boolean;
begin
  if new.kind <> 'image' then
    new.approval_status := 'approved';
    return new;
  end if;

  select g.chat_photo_approval and g.organizer_id <> new.sender_id
  into v_needs_approval
  from public.games g where g.id = new.game_id;

  new.approval_status := case when v_needs_approval then 'pending' else 'approved' end;
  return new;
end;
$$;

create trigger messages_set_photo_approval
  before insert on public.messages
  for each row execute function public.trigger_set_photo_approval();

create function public.approve_chat_photo(p_message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_organizer_id uuid;
  v_game_id uuid;
begin
  select game_id into v_game_id from public.messages where id = p_message_id;
  if v_game_id is null then
    raise exception 'Message not found';
  end if;

  select organizer_id into v_organizer_id from public.games where id = v_game_id;
  if v_organizer_id <> auth.uid() then
    raise exception 'Only the host can approve photos';
  end if;

  update public.messages set approval_status = 'approved' where id = p_message_id;
end;
$$;

grant execute on function public.approve_chat_photo(uuid) to authenticated;

-- Non-host readers never see a pending photo (the sender always sees their own via the
-- `sender_id = auth.uid()` branch, so they get the "pending host approval" state client-side).
drop policy "messages readable by organizer and approved players" on public.messages;

create policy "messages readable by organizer and approved players" on public.messages
  for select to authenticated using (
    (
      public.is_approved_player(game_id, auth.uid())
      or exists (select 1 from public.games g where g.id = messages.game_id and g.organizer_id = auth.uid())
    )
    and (
      approval_status = 'approved'
      or sender_id = auth.uid()
      or exists (select 1 from public.games g where g.id = messages.game_id and g.organizer_id = auth.uid())
    )
  );

-- Insert: text/image already permitted by can_post_in_chat; game_share additionally requires
-- the shared game to be one the sender actually belongs to (own membership, not an arbitrary
-- game id) so a share can't be used to leak details of a game the sender isn't in.
drop policy "messages insert by permitted posters" on public.messages;

create policy "messages insert by permitted posters" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and kind in ('text', 'image', 'game_share')
    and public.can_post_in_chat(game_id, auth.uid())
    and (
      kind <> 'game_share'
      or (
        game_share_id is not null
        and (
          public.is_approved_player(game_share_id, auth.uid())
          or exists (select 1 from public.games g where g.id = game_share_id and g.organizer_id = auth.uid())
        )
      )
    )
  );

-- ---------------------------------------------------------------------------------------
-- Granular broadcast settings: pause-until (host/organizer can still post while paused —
-- reuses can_post_in_chat's existing organizer-always-can-post branch) and photo approval.
-- ---------------------------------------------------------------------------------------

alter table public.games
  add column chat_pause_until timestamptz,
  add column chat_photo_approval boolean not null default false;

create or replace function public.can_post_in_chat(p_game_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_closed_at is not null) then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.organizer_id = p_profile_id) then true
    when not public.is_approved_player(p_game_id, p_profile_id) then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_mode = 'announce') then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_pause_until is not null and g.chat_pause_until > now()) then false
    when exists (select 1 from public.game_players gp
                 where gp.game_id = p_game_id and gp.profile_id = p_profile_id
                   and gp.chat_muted_at is not null) then false
    else true
  end;
$$;

create function public.set_chat_broadcast_settings(p_game_id uuid, p_pause_until timestamptz, p_photo_approval boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_organizer_id uuid;
  v_was_paused boolean;
  v_now_paused boolean;
begin
  select organizer_id, (chat_pause_until is not null and chat_pause_until > now())
  into v_organizer_id, v_was_paused
  from public.games where id = p_game_id;

  if v_organizer_id is null then
    raise exception 'Game not found';
  end if;
  if v_organizer_id <> auth.uid() then
    raise exception 'Only the host can change broadcast settings';
  end if;

  update public.games
  set chat_pause_until = p_pause_until, chat_photo_approval = p_photo_approval
  where id = p_game_id;

  v_now_paused := p_pause_until is not null and p_pause_until > now();
  if v_now_paused <> v_was_paused then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (
      p_game_id, v_organizer_id, 'system', 'mode_changed',
      case when v_now_paused then 'Chat paused until closer to the game' else 'Chat is open again' end
    );
  end if;
end;
$$;

grant execute on function public.set_chat_broadcast_settings(uuid, timestamptz, boolean) to authenticated;
