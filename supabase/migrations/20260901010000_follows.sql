-- social-plan.md B0 (§13.6 step 1): the graph the feed's "posts by people I follow" union and
-- score term (§6.1) both depend on, so it has to exist before feed_home can be written. Follow
-- is asymmetric and public (Twitter-shaped) — no accept step, no request/notification surface.

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows(followee_id);
create index follows_follower_idx on public.follows(follower_id);

alter table public.follows enable row level security;

-- Counts are public (they render on every player card), so select stays open unlike blocks.
create policy "follows select all" on public.follows for select to authenticated using (true);
create policy "follows self insert" on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.blocked_between(follower_id, followee_id));
create policy "follows self delete" on public.follows for delete to authenticated using (follower_id = auth.uid());
grant select, insert, delete on public.follows to authenticated;

-- Denormalised counts on profiles (§5.1) — a count(*) per player card is an N+1 waiting to happen.
alter table public.profiles
  add column follower_count int not null default 0,
  add column following_count int not null default 0;

create function public.follows_apply_counts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1 where id = new.followee_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
  end if;
  return null;
end;
$$;

create trigger follows_apply_counts
  after insert or delete on public.follows
  for each row execute function public.follows_apply_counts();

-- §10 item 7's 50-follows/day cap, decided alongside the other rate limits — folded in here
-- rather than left for B5 since the table (and the abuse case, mass-follow spam) exists now.
create function public.follows_rate_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recent int;
begin
  select count(*) into v_recent
  from public.follows
  where follower_id = new.follower_id and created_at >= now() - interval '1 day';

  if v_recent >= 50 then
    raise exception 'Too many follows today, give it a rest and try again tomorrow';
  end if;

  return new;
end;
$$;

create trigger follows_rate_limit
  before insert on public.follows
  for each row execute function public.follows_rate_limit();

-- ---------------------------------------------------------------------------------------------
-- player_card — add follower_count, following_count, is_following. Body otherwise carried over
-- verbatim from 20260824000300, the latest definition.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.player_card(uuid);

create function public.player_card(target_id uuid)
returns table (
  id uuid,
  display_name text,
  photo_path text,
  home_suburb text,
  member_since timestamptz,
  games_played int,
  games_hosted int,
  reliability_score numeric,
  reliability_band text,
  rating_avg numeric,
  rating_count int,
  host_rating_avg numeric,
  host_rating_count int,
  games_together int,
  badge_counts jsonb,
  host_badge_counts jsonb,
  peer_skill_label text,
  peer_skill_votes int,
  sports jsonb,
  restricted boolean,
  avatar_key text,
  follower_count int,
  following_count int,
  is_following boolean
)
language sql
stable
security definer set search_path = public
as $fn$
  with base as (
    select p.*, auth.uid() as vid
    from public.profiles p
    where p.id = target_id
      and p.deleted_at is null
      and not public.blocked_between(auth.uid(), p.id)
  ),
  computed as (
    select
      b.*,
      case
        when b.vid is null or b.vid = b.id then null
        else (
          select count(distinct g.id)::int
          from public.games g
          where g.status = 'completed'
            and (public.is_approved_player(g.id, b.id) or g.organizer_id = b.id)
            and (public.is_approved_player(g.id, b.vid) or g.organizer_id = b.vid)
        )
      end as games_together_calc
    from base b
  ),
  gated as (
    select
      c.*,
      (
        c.vid is not null
        and c.vid <> c.id
        and c.profile_visibility = 'players_only'
        and coalesce(c.games_together_calc, 0) = 0
        and not exists (
          select 1
          from public.games g
          join public.game_players gp on gp.game_id = g.id
          where g.organizer_id = c.vid
            and gp.profile_id = c.id
            and gp.status in ('requested', 'approved')
        )
      ) as is_restricted
    from computed c
  )
  select
    g.id,
    g.display_name,
    g.photo_path,
    case when g.show_suburb or g.vid = g.id then g.home_suburb else null end as home_suburb,
    g.created_at as member_since,
    (
      select count(*)::int from public.game_players gp
      join public.games gm on gm.id = gp.game_id
      where gp.profile_id = g.id and gp.status = 'approved' and gm.status = 'completed'
    ) as games_played,
    (
      select count(*)::int from public.games gm
      where gm.organizer_id = g.id and gm.status = 'completed'
    ) as games_hosted,
    case when g.is_restricted then null else g.reliability_score end as reliability_score,
    case
      when g.is_restricted then null
      when g.reliability_score >= 90 then 'Excellent'
      when g.reliability_score >= 75 then 'Good'
      when g.reliability_score >= 50 then 'Fair'
      else 'Needs work'
    end as reliability_band,
    case when g.is_restricted then null
         else (select avg(stars)::numeric(3, 2) from public.ratings where ratee_id = g.id and dimension = 'player') end as rating_avg,
    case when g.is_restricted then null
         else (select count(*)::int from public.ratings where ratee_id = g.id and dimension = 'player') end as rating_count,
    case when g.is_restricted then null
         else (select avg(stars)::numeric(3, 2) from public.ratings where ratee_id = g.id and dimension = 'host') end as host_rating_avg,
    case when g.is_restricted then null
         else (select count(*)::int from public.ratings where ratee_id = g.id and dimension = 'host') end as host_rating_count,
    g.games_together_calc as games_together,
    case when g.is_restricted then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb)
      from (
        select tag, count(*) as n from public.rating_tags where ratee_id = g.id and dimension = 'player' group by tag
      ) counted
    ) end as badge_counts,
    case when g.is_restricted then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb)
      from (
        select tag, count(*) as n from public.rating_tags where ratee_id = g.id and dimension = 'host' group by tag
      ) counted
    ) end as host_badge_counts,
    case when g.is_restricted then null else (select v.tier_label from public.peer_skill_vote(g.id) v) end as peer_skill_label,
    case when g.is_restricted then null else (select v.vote_count from public.peer_skill_vote(g.id) v) end as peer_skill_votes,
    (
      select coalesce(jsonb_agg(jsonb_build_object('sport_slug', s.slug, 'tier_label', st.label, 'tier_ordinal', st.ordinal) order by s.slug), '[]'::jsonb)
      from public.profile_sports ps
      join public.sports s on s.id = ps.sport_id
      join public.skill_tiers st on st.id = ps.skill_tier_id
      where ps.profile_id = g.id
    ) as sports,
    g.is_restricted as restricted,
    g.avatar_key,
    g.follower_count,
    g.following_count,
    case when g.vid is null then false else exists (
      select 1 from public.follows f where f.follower_id = g.vid and f.followee_id = g.id
    ) end as is_following
  from gated g;
$fn$;

grant execute on function public.player_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Follower / following list RPCs — need player_card's own blocked/deleted filtering, not a bare
-- select on follows, so a stranger can't enumerate a blocked player's graph either.
-- ---------------------------------------------------------------------------------------------

create function public.followers_of(target_id uuid)
returns table (id uuid, display_name text, photo_path text, avatar_key text, home_suburb text, is_following boolean)
language sql
stable
security definer set search_path = public
as $$
  select p.id, p.display_name, p.photo_path, p.avatar_key,
    case when p.show_suburb then p.home_suburb else null end,
    case when auth.uid() is null then false else exists (
      select 1 from public.follows f2 where f2.follower_id = auth.uid() and f2.followee_id = p.id
    ) end
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followee_id = target_id
    and p.deleted_at is null
    and not public.blocked_between(auth.uid(), p.id)
  order by f.created_at desc;
$$;

create function public.following_of(target_id uuid)
returns table (id uuid, display_name text, photo_path text, avatar_key text, home_suburb text, is_following boolean)
language sql
stable
security definer set search_path = public
as $$
  select p.id, p.display_name, p.photo_path, p.avatar_key,
    case when p.show_suburb then p.home_suburb else null end,
    case when auth.uid() is null then false else exists (
      select 1 from public.follows f2 where f2.follower_id = auth.uid() and f2.followee_id = p.id
    ) end
  from public.follows f
  join public.profiles p on p.id = f.followee_id
  where f.follower_id = target_id
    and p.deleted_at is null
    and not public.blocked_between(auth.uid(), p.id)
  order by f.created_at desc;
$$;

grant execute on function public.followers_of(uuid) to authenticated;
grant execute on function public.following_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_account — tombstone follows both directions, same pattern as blocks (20260822000000:501).
-- ---------------------------------------------------------------------------------------------

create or replace function public.delete_account(p_profile_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_cancelled uuid[];
  v_confirmation_paths text[];
begin
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Profile not found';
  end if;

  with cancelled as (
    update public.games
    set status = 'cancelled'
    where organizer_id = p_profile_id
      and status = 'published'
      and starts_at > now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_cancelled from cancelled;

  with removed as (
    delete from public.game_confirmations
    where uploaded_by = p_profile_id
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_confirmation_paths from removed;

  delete from public.ratings where ratee_id = p_profile_id;
  delete from public.rating_tags where ratee_id = p_profile_id;

  delete from public.game_players where profile_id = p_profile_id;
  delete from public.message_reads where profile_id = p_profile_id;
  delete from public.push_tokens where profile_id = p_profile_id;
  delete from public.game_alerts where profile_id = p_profile_id;
  delete from public.profile_sports where profile_id = p_profile_id;
  delete from public.notification_prefs where profile_id = p_profile_id;
  delete from public.chat_prefs where profile_id = p_profile_id;
  delete from public.notifications where profile_id = p_profile_id;
  delete from public.profile_private where profile_id = p_profile_id;

  delete from public.blocks where blocker_id = p_profile_id or blocked_id = p_profile_id;
  delete from public.follows where follower_id = p_profile_id or followee_id = p_profile_id;

  delete from public.user_reports where reporter_id = p_profile_id;

  update public.profiles
  set display_name = 'Deleted user',
      photo_path = null,
      home_suburb = null,
      home_point = null,
      reliability_score = 100,
      profile_visibility = 'everyone',
      show_suburb = true,
      distance_units = 'km',
      follower_count = 0,
      following_count = 0,
      deleted_at = now()
  where id = p_profile_id;

  return jsonb_build_object(
    'cancelled_game_ids', to_jsonb(v_cancelled),
    'confirmation_paths', to_jsonb(v_confirmation_paths)
  );
end;
$$;

revoke all on function public.delete_account(uuid) from public;
revoke all on function public.delete_account(uuid) from anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
