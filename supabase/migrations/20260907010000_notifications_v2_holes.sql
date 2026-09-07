-- Notifications v2 (docs/notifications-v2-plan.md), phase V2.0 — the holes. G1 chat_mention
-- (planned Critical in notifications-plan.md §4E, never shipped), H1 waitlist_promoted (waitlist
-- promotion currently borrows join_decision's "approved" copy — §1.3), and game_preview gaining
-- spots_left for the share-card work in V2.5/website.

-- ---------------------------------------------------------------------------------------------
-- game_preview: additive spots_left column (§6.2 "one additive column"). Not PII — it's already
-- derivable from max_players/approved_count, which the public card shows.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.game_preview(uuid);

create function public.game_preview(p_game_id uuid)
returns table (
  id uuid,
  sport_slug text,
  venue_name text,
  venue_suburb text,
  starts_at timestamptz,
  ends_at timestamptz,
  skill_tier_label text,
  max_players int,
  cost_per_player_cents int,
  status text,
  spots_left int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    g.id,
    s.slug as sport_slug,
    v.name as venue_name,
    v.suburb as venue_suburb,
    g.starts_at,
    g.ends_at,
    st.label as skill_tier_label,
    g.max_players,
    g.cost_per_player_cents,
    g.status,
    greatest(0, g.max_players - public.approved_player_count(g.id) - g.reserved_spots) as spots_left
  from public.games g
  join public.venues v on v.id = g.venue_id
  join public.skill_tiers st on st.id = g.skill_tier_id
  join public.sports s on s.id = g.sport_id
  where g.id = p_game_id;
$$;

grant execute on function public.game_preview(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- G1 chat_mention (§3G). A mentioned recipient gets 'chat_mention' (Critical) instead of the
-- ordinary 'message' row, so it isn't lumped into E2's coalescing and reads distinctly in the
-- inbox. Everyone else on the thread keeps the existing 'message' path unchanged. Still gated by
-- the per-game chat_prefs mute (chat_push_recipients already filters that in) — only the global
-- notification_prefs 'chat' category and E2 coalescing are bypassed, per §3G's "no"/"yes".
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
  is_host boolean,
  starts_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select v.name, s.name, coalesce(p.display_name, 'Player'), m.body, m.kind, g.chat_mode,
         (m.sender_id = g.organizer_id), g.starts_at
  from public.messages m
  join public.games g on g.id = m.game_id
  join public.venues v on v.id = g.venue_id
  join public.sports s on s.id = g.sport_id
  left join public.profiles p on p.id = m.sender_id
  where m.id = p_message_id;
$$;

grant execute on function public.push_message_summary(uuid) to service_role;

create or replace function public.trigger_notify_new_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recipients uuid[];
  v_mentioned uuid[];
  v_others uuid[];
begin
  if new.kind in ('text', 'image') then
    select array_agg(profile_id) into v_recipients from public.chat_push_recipients(new.id);

    select array_agg(r) into v_mentioned
    from unnest(coalesce(v_recipients, array[]::uuid[])) r
    where r = any(coalesce(new.mentions, array[]::uuid[]));

    select array_agg(r) into v_others
    from unnest(coalesce(v_recipients, array[]::uuid[])) r
    where r <> all(coalesce(v_mentioned, array[]::uuid[]));

    if v_mentioned is not null and array_length(v_mentioned, 1) > 0 then
      perform public.enqueue_notifications(
        'chat_mention', new.game_id, new.sender_id, v_mentioned,
        jsonb_build_object('message_id', new.id), 'critical', null
      );
    end if;

    if v_others is not null and array_length(v_others, 1) > 0 then
      perform public.enqueue_notifications(
        'message', new.game_id, new.sender_id, v_others,
        jsonb_build_object('message_id', new.id), 'normal', 'message:' || new.game_id
      );
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- H1 waitlist_promoted (§3H). promote_waitlist() (waitlist.sql) flips a waitlisted row straight
-- to 'approved', which trigger_notify_join_decision currently reports as an ordinary
-- join_decision 'approved' — identical copy to a host manually approving a request. Splitting the
-- old-status branch lets the promoted player learn *why*: they were next in line, not picked.
-- ---------------------------------------------------------------------------------------------

create or replace function public.trigger_notify_join_decision()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.status = 'waitlisted' and new.status = 'approved' then
    perform public.enqueue_notifications(
      'waitlist_promoted', new.game_id, null, array[new.profile_id], '{}'::jsonb, 'critical', null
    );
  elsif old.status = 'requested' and new.status = 'approved' then
    perform public.enqueue_notifications(
      'join_decision', new.game_id, null, array[new.profile_id],
      jsonb_build_object('status', 'approved'), 'critical', null
    );
  elsif old.status = 'requested' and new.status = 'rejected' then
    perform public.enqueue_notifications(
      'join_decision', new.game_id, null, array[new.profile_id],
      jsonb_build_object('status', 'rejected'), 'normal', null
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
