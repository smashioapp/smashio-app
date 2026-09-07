-- Notifications v2 (docs/notifications-v2-plan.md), phase V2.1 — social notifications. §1.1: five
-- tables (posts, post_replies, post_reactions, follows, achievement_awards) shipped 2026-09-01/02
-- with zero notification triggers. F1-F7 close that gap.

-- ---------------------------------------------------------------------------------------------
-- Two new preference categories (§3F note: F6 needs its own so someone following 40 players can
-- silence it while keeping F1). Both default true, same as every other category at launch.
-- ---------------------------------------------------------------------------------------------

alter table public.notification_prefs
  add column if not exists social boolean not null default true,
  add column if not exists social_activity boolean not null default true;

create or replace function public.notification_pref_enabled(p_profile_id uuid, p_pref_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case p_pref_key
    when 'join_requests'    then coalesce((select join_requests    from public.notification_prefs where profile_id = p_profile_id), true)
    when 'roster_changes'   then coalesce((select roster_changes   from public.notification_prefs where profile_id = p_profile_id), true)
    when 'chat'             then coalesce((select chat             from public.notification_prefs where profile_id = p_profile_id), true)
    when 'reminders'        then coalesce((select reminders        from public.notification_prefs where profile_id = p_profile_id), true)
    when 'game_changes'     then coalesce((select game_changes     from public.notification_prefs where profile_id = p_profile_id), true)
    when 'alerts'           then coalesce((select alerts           from public.notification_prefs where profile_id = p_profile_id), true)
    when 'nudges'           then coalesce((select nudges           from public.notification_prefs where profile_id = p_profile_id), true)
    when 'social'           then coalesce((select social           from public.notification_prefs where profile_id = p_profile_id), true)
    when 'social_activity'  then coalesce((select social_activity  from public.notification_prefs where profile_id = p_profile_id), true)
    else true
  end;
$$;

grant execute on function public.notification_pref_enabled(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- push_actor_summary (§4.2) — the player-card facts a host needs to decide on a join request,
-- reused here for F5's "{tier} · {n} games played · plays around {suburb}". Everything in it is
-- already visible on the player card to any authenticated user.
-- ---------------------------------------------------------------------------------------------

create or replace function public.push_actor_summary(p_profile_id uuid, p_sport_id uuid default null)
returns table (
  display_name text,
  tier_label text,
  games_played int,
  reliability_label text,
  suburb text
)
language sql
stable
security definer set search_path = public
as $$
  select
    coalesce(nullif(p.display_name, ''), 'A player'),
    st.label,
    (
      select count(*)::int from public.game_players gp
      join public.games gm on gm.id = gp.game_id
      where gp.profile_id = p.id and gp.status = 'approved' and gm.status = 'completed'
    ),
    case
      when p.reliability_score >= 90 then 'Excellent'
      when p.reliability_score >= 75 then 'Good'
      when p.reliability_score >= 50 then 'Fair'
      else 'Needs work'
    end,
    case when p.show_suburb then p.home_suburb else null end
  from public.profiles p
  left join public.profile_sports ps on ps.profile_id = p.id and (p_sport_id is null or ps.sport_id = p_sport_id)
  left join public.skill_tiers st on st.id = ps.skill_tier_id
  where p.id = p_profile_id
  limit 1;
$$;

grant execute on function public.push_actor_summary(uuid, uuid) to service_role;

-- push_post_summary — the excerpt every F1/F2/F3/F4/F6 body needs.
create or replace function public.push_post_summary(p_post_id uuid)
returns table (author_id uuid, body text, kind text, sport_name text, venue_name text, game_id uuid, starts_at timestamptz, spots_left int)
language sql
stable
security definer set search_path = public
as $$
  select
    p.author_id, p.body, p.kind, s.name, v.name, p.game_id,
    g.starts_at,
    case when g.id is null then null else greatest(0, g.max_players - public.approved_player_count(g.id) - g.reserved_spots) end
  from public.posts p
  left join public.sports s on s.id = p.sport_id
  left join public.venues v on v.id = p.venue_id
  left join public.games g on g.id = p.game_id
  where p.id = p_post_id;
$$;

grant execute on function public.push_post_summary(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- F1/F2 post_reply (+coalesced). Same generic coalescing mechanism as A2/E2 in push-dispatch
-- (collapse_key + type-keyed threshold/window, index.ts) — no new SQL machinery needed, just a
-- collapse_key per post.
-- ---------------------------------------------------------------------------------------------

create or replace function public.trigger_notify_post_reply()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_author_id uuid;
  v_prior_repliers uuid[];
begin
  select author_id into v_author_id from public.posts where id = new.post_id;

  if v_author_id is not null and v_author_id is distinct from new.author_id
     and public.notification_pref_enabled(v_author_id, 'social') then
    perform public.enqueue_notifications(
      'post_reply', null, new.author_id, array[v_author_id],
      jsonb_build_object('post_id', new.post_id, 'reply_id', new.id), 'normal', 'post_reply:' || new.post_id
    );
  end if;

  -- F4: everyone who replied to this post before this reply, minus the post author (they already
  -- got F1/F2 above) and minus this replier themselves.
  select array_agg(distinct pr.author_id) into v_prior_repliers
  from public.post_replies pr
  where pr.post_id = new.post_id
    and pr.id <> new.id
    and pr.author_id is distinct from new.author_id
    and pr.author_id is distinct from v_author_id;

  if v_prior_repliers is not null and array_length(v_prior_repliers, 1) > 0 then
    perform public.enqueue_notifications(
      'reply_to_thread', null, new.author_id,
      array(select r from unnest(v_prior_repliers) r where public.notification_pref_enabled(r, 'social')),
      jsonb_build_object('post_id', new.post_id, 'reply_id', new.id), 'low', null
    );
  end if;

  return new;
end;
$$;

create trigger post_replies_notify
  after insert on public.post_replies
  for each row execute function public.trigger_notify_post_reply();

-- ---------------------------------------------------------------------------------------------
-- F3 post_reaction — coalesced-only, batched hourly (§3F note: "the fastest way to make people
-- disable the category" if sent per-reaction). reaction_notified_count tracks how much of
-- posts.reaction_count has already been notified; the digest only fires on the delta.
-- ---------------------------------------------------------------------------------------------

alter table public.posts add column if not exists reaction_notified_count int not null default 0;

create or replace function public.dispatch_post_reaction_digest()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_actor uuid;
  v_delta int;
begin
  for r in
    select id, author_id, reaction_count, reaction_notified_count
    from public.posts
    where status = 'visible'
      and author_id is not null
      and reaction_count > reaction_notified_count
  loop
    v_delta := r.reaction_count - r.reaction_notified_count;

    select profile_id into v_actor
    from public.post_reactions
    where post_id = r.id
    order by created_at desc
    limit 1;

    if public.notification_pref_enabled(r.author_id, 'social') then
      perform public.enqueue_notifications(
        'post_reaction', null, v_actor, array[r.author_id],
        jsonb_build_object('post_id', r.id, 'count', v_delta), 'low', null
      );
    end if;

    update public.posts set reaction_notified_count = r.reaction_count where id = r.id;
  end loop;
end;
$$;

select cron.schedule('dispatch-post-reaction-digest', '0 * * * *', $$select public.dispatch_post_reaction_digest();$$);

-- ---------------------------------------------------------------------------------------------
-- F5 new_follower.
-- ---------------------------------------------------------------------------------------------

create or replace function public.trigger_notify_new_follower()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.notification_pref_enabled(new.followee_id, 'social') then
    perform public.enqueue_notifications(
      'new_follower', null, new.follower_id, array[new.followee_id], '{}'::jsonb, 'low', null
    );
  end if;
  return new;
end;
$$;

create trigger follows_notify
  after insert on public.follows
  for each row execute function public.trigger_notify_new_follower();

-- ---------------------------------------------------------------------------------------------
-- F6 followed_posted (§3F, decided 2026-09-07: ship with a hard 2/day/user cap and its own
-- category). looking_for_players only, never question, never system. The cap is enforced here in
-- the same transaction the post is created in, not left to a client-side or dispatch-time check.
-- ---------------------------------------------------------------------------------------------

create or replace function public.trigger_notify_followed_posted()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recipients uuid[];
begin
  if new.kind <> 'looking_for_players' or new.author_id is null then
    return new;
  end if;

  select array_agg(f.follower_id) into v_recipients
  from public.follows f
  where f.followee_id = new.author_id
    and public.notification_pref_enabled(f.follower_id, 'social_activity')
    and (
      select count(*) from public.notifications n
      where n.profile_id = f.follower_id
        and n.type = 'followed_posted'
        and n.created_at > now() - interval '24 hours'
    ) < 2;

  if v_recipients is not null and array_length(v_recipients, 1) > 0 then
    perform public.enqueue_notifications(
      'followed_posted', null, new.author_id, v_recipients,
      jsonb_build_object('post_id', new.id), 'low', null
    );
  end if;

  return new;
end;
$$;

create trigger posts_notify_followed_posted
  after insert on public.posts
  for each row execute function public.trigger_notify_followed_posted();

-- ---------------------------------------------------------------------------------------------
-- F7 achievement_earned.
-- ---------------------------------------------------------------------------------------------

create or replace function public.trigger_notify_achievement_earned()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.notification_pref_enabled(new.profile_id, 'social') then
    perform public.enqueue_notifications(
      'achievement_earned', null, null, array[new.profile_id],
      jsonb_build_object('achievement_id', new.achievement_id), 'low', null
    );
  end if;
  return new;
end;
$$;

create trigger achievement_awards_notify
  after insert on public.achievement_awards
  for each row execute function public.trigger_notify_achievement_earned();
