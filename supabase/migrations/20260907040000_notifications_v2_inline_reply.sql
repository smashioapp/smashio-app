-- Notifications v2 (docs/notifications-v2-plan.md), phase V2.3 §5.4 — real inline chat reply.
-- send_chat_reply (P3, 20260820000600) was a stub that only marked the triggering notification
-- read; the Reply button opened the app and did nothing. This is the real implementation: verify
-- the notification is the caller's own and is chat-shaped, verify they're still allowed to post
-- (can_post_in_chat — the same check the ordinary chat insert RLS policy applies), insert the
-- message, and mark the notification read. The insert itself fires the existing
-- trigger_notify_new_message trigger, so the rest of the roster gets pushed the normal way — no
-- separate dispatch needed here.
create or replace function public.send_chat_reply(p_notification_id uuid, p_game_id uuid, p_text text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile_id uuid;
  v_type text;
  v_game_id uuid;
begin
  select profile_id, type, game_id into v_profile_id, v_type, v_game_id
  from public.notifications
  where id = p_notification_id;

  if v_profile_id is null or v_profile_id <> auth.uid() then
    raise exception 'Notification not found';
  end if;

  if v_type not in ('message', 'chat_mention') or v_game_id is distinct from p_game_id then
    raise exception 'Not a chat notification';
  end if;

  if coalesce(trim(p_text), '') = '' then
    raise exception 'Reply needs some text';
  end if;

  if not public.can_post_in_chat(p_game_id, auth.uid()) then
    raise exception 'You can''t post in this chat right now';
  end if;

  insert into public.messages (game_id, sender_id, body, kind)
  values (p_game_id, auth.uid(), trim(p_text), 'text');

  update public.notifications set read_at = now() where id = p_notification_id;
end;
$$;

grant execute on function public.send_chat_reply(uuid, uuid, text) to authenticated;
