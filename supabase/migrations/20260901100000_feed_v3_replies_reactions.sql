-- v3 Feed redesign (claude.ai/design 23bc2cae…, "SMASHIO v3 - Feed.html") requires three things
-- the current backend doesn't have: reply threads (screen 3, Question detail), reactions (the
-- heart/bubble strip on every post), and a suggested-follow query (screen 4's cold-start row).
-- Also widens feed_home with the mode/kind filters the design's Filters sheet (screen 2) needs.

-- ---------------------------------------------------------------------------------------------
-- 1. post_replies — flat, chronological, no nesting (matches the design's single-level thread).
-- posts.accepted_answer_id already exists (posts_feed.sql) but nothing ever set it until now.
-- ---------------------------------------------------------------------------------------------

create table public.post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now()
);

create index post_replies_post_idx on public.post_replies (post_id, created_at asc);
create index post_replies_author_idx on public.post_replies (author_id, created_at desc);

alter table public.posts
  add constraint posts_accepted_answer_fk foreign key (accepted_answer_id) references public.post_replies(id) on delete set null;

alter table public.post_replies enable row level security;

create policy "post_replies select visible" on public.post_replies for select to authenticated
  using (status = 'visible' and not public.blocked_between(auth.uid(), author_id));
create policy "post_replies insert own" on public.post_replies for insert to authenticated
  with check (author_id = auth.uid());
create policy "post_replies delete own" on public.post_replies for delete to authenticated using (author_id = auth.uid());
grant select, insert, delete on public.post_replies to authenticated;

create function public.post_replies_apply_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reply_count = reply_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
    update public.posts set accepted_answer_id = null where accepted_answer_id = old.id;
  end if;
  return null;
end;
$$;

create trigger post_replies_apply_count
  after insert or delete on public.post_replies
  for each row execute function public.post_replies_apply_count();

-- 30 replies/day (§10 item 7's comments cap, carried over from social-plan.md's B3 note).
create function public.post_replies_rate_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_recent int;
begin
  select count(*) into v_recent
  from public.post_replies
  where author_id = new.author_id and created_at >= now() - interval '1 day';

  if v_recent >= 30 then
    raise exception 'You''ve hit today''s reply limit, try again tomorrow';
  end if;

  return new;
end;
$$;

create trigger post_replies_rate_limit
  before insert on public.post_replies
  for each row execute function public.post_replies_rate_limit();

-- create_reply — same pre-publish classification pattern as create_post (server_side_moderation.sql).
create function public.create_reply(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if coalesce(trim(p_body), '') = '' then
    raise exception 'Reply needs some text';
  end if;

  if not exists (select 1 from public.posts where id = p_post_id and status = 'visible') then
    raise exception 'This post is no longer available';
  end if;

  if public.classify_post_text(auth.uid(), p_body) then
    raise exception 'That doesn''t look like it fits our community guidelines, give it another go.';
  end if;

  insert into public.post_replies (post_id, author_id, body)
  values (p_post_id, auth.uid(), trim(p_body))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_reply(uuid, text) to authenticated;

-- accept_reply — post author only, and only on a question post (design's "accepted answer" is
-- specific to Q&A). Passing null clears it.
create function public.accept_reply(p_post_id uuid, p_reply_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.posts where id = p_post_id and author_id = auth.uid() and kind = 'question'
  ) then
    raise exception 'Only the question''s author can accept an answer';
  end if;

  if p_reply_id is not null and not exists (
    select 1 from public.post_replies where id = p_reply_id and post_id = p_post_id and status = 'visible'
  ) then
    raise exception 'Reply not found';
  end if;

  update public.posts set accepted_answer_id = p_reply_id where id = p_post_id;
end;
$$;

grant execute on function public.accept_reply(uuid, uuid) to authenticated;

-- list_replies — chronological, accepted answer flagged so the client can pin it without a
-- second round trip.
create function public.list_replies(p_post_id uuid)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  author_display_name text,
  author_photo_path text,
  author_avatar_key text,
  body text,
  created_at timestamptz,
  is_accepted boolean
)
language sql
stable
security definer set search_path = public
as $$
  select
    r.id, r.post_id, r.author_id, p.display_name, p.photo_path, p.avatar_key, r.body, r.created_at,
    (r.id = po.accepted_answer_id) as is_accepted
  from public.post_replies r
  join public.posts po on po.id = r.post_id
  left join public.profiles p on p.id = r.author_id
  where r.post_id = p_post_id
    and r.status = 'visible'
    and not public.blocked_between(auth.uid(), r.author_id)
  order by is_accepted desc, r.created_at asc;
$$;

grant execute on function public.list_replies(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. post_reactions — single reaction type (a like), matches the design's heart-count-only strip.
-- ---------------------------------------------------------------------------------------------

create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create index post_reactions_post_idx on public.post_reactions(post_id);

alter table public.post_reactions enable row level security;
create policy "post_reactions select all" on public.post_reactions for select to authenticated using (true);
create policy "post_reactions self insert" on public.post_reactions for insert to authenticated
  with check (profile_id = auth.uid());
create policy "post_reactions self delete" on public.post_reactions for delete to authenticated using (profile_id = auth.uid());
grant select, insert, delete on public.post_reactions to authenticated;

create function public.post_reactions_apply_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reaction_count = reaction_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set reaction_count = greatest(reaction_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_reactions_apply_count
  after insert or delete on public.post_reactions
  for each row execute function public.post_reactions_apply_count();

-- toggle_reaction — insert if absent, delete if present, returns the new state.
create function public.toggle_reaction(p_post_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select exists (
    select 1 from public.post_reactions where post_id = p_post_id and profile_id = auth.uid()
  ) into v_existing;

  if v_existing then
    delete from public.post_reactions where post_id = p_post_id and profile_id = auth.uid();
    return false;
  else
    insert into public.post_reactions (post_id, profile_id) values (p_post_id, auth.uid());
    return true;
  end if;
end;
$$;

grant execute on function public.toggle_reaction(uuid) to authenticated;

-- my_reacted_post_ids — one round trip to hydrate "did I react to this" across a page of posts,
-- instead of an extra per-row query.
create function public.my_reacted_post_ids(p_post_ids uuid[])
returns uuid[]
language sql
stable
security definer set search_path = public
as $$
  select coalesce(array_agg(post_id), '{}')
  from public.post_reactions
  where profile_id = auth.uid() and post_id = any(p_post_ids);
$$;

grant execute on function public.my_reacted_post_ids(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. feed_home — add p_mode ('nearby' | 'following') and p_kind (filter tokens: 'text',
-- 'question', 'looking_for_players', 'achievement', 'games'). 'games' matches the three
-- system game_* events; 'achievement' matches achievement_awarded. new_venue system posts have
-- no matching token (design's filter chips don't offer one), so an active kind filter hides them
-- — same as the design intends only the five shown chip types to be selectable.
-- ---------------------------------------------------------------------------------------------

create or replace function public.feed_home(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision,
  p_sport_slug text,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 20,
  p_mode text default 'nearby',
  p_kind text[] default null
)
returns table (
  id uuid,
  author_id uuid,
  author_display_name text,
  author_photo_path text,
  author_avatar_key text,
  kind text,
  body text,
  venue_id uuid,
  venue_name text,
  game_id uuid,
  club_id uuid,
  payload jsonb,
  reply_count int,
  reaction_count int,
  created_at timestamptz,
  distance_bucket text,
  is_followed_author boolean
)
language sql
stable
security definer set search_path = public
as $$
  with centre as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography as pt
  ),
  candidates as (
    select p.*
    from public.posts p
    left join public.sports s on s.id = p.sport_id
    where p.status = 'visible'
      and not public.blocked_between(auth.uid(), p.author_id)
      and (p.sport_id is null or s.slug = p_sport_slug)
      and (
        p_mode = 'following'
        and auth.uid() is not null
        and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.author_id)
        or (
          p_mode <> 'following'
          and (
            p.kind = 'question'
            or (auth.uid() is not null and exists (
              select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.author_id
            ))
            or (p.point is not null and extensions.ST_DWithin(p.point, (select pt from centre), p_radius_m))
          )
        )
      )
      and (
        p_kind is null
        or (p.kind = 'text' and 'text' = any(p_kind))
        or (p.kind = 'question' and 'question' = any(p_kind))
        or (p.kind = 'looking_for_players' and 'looking_for_players' = any(p_kind))
        or (p.kind = 'system' and p.payload->>'event' = 'achievement_awarded' and 'achievement' = any(p_kind))
        or (p.kind = 'system' and p.payload->>'event' in ('game_published', 'game_filled', 'game_completed') and 'games' = any(p_kind))
      )
      and (
        p_cursor_created_at is null
        or p.created_at < p_cursor_created_at
        or (p.created_at = p_cursor_created_at and p.id < p_cursor_id)
      )
  ),
  scored as (
    select
      c.*,
      case when c.point is null then null else extensions.ST_Distance(c.point, (select pt from centre)) end as distance_m,
      exists (
        select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = c.author_id
      ) as followed,
      extract(epoch from (now() - c.created_at)) / 3600.0 as hours_since
    from candidates c
  )
  select
    s.id,
    s.author_id,
    ap.display_name,
    ap.photo_path,
    ap.avatar_key,
    s.kind,
    s.body,
    s.venue_id,
    v.name,
    s.game_id,
    s.club_id,
    s.payload,
    s.reply_count,
    s.reaction_count,
    s.created_at,
    case
      when s.distance_m is null then null
      when s.distance_m < 1000 then 'under_1km'
      when s.distance_m < 3000 then '1_3km'
      when s.distance_m < 10000 then '3_10km'
      when s.distance_m < 25000 then '10_25km'
      else 'over_25km'
    end as distance_bucket,
    s.followed
  from scored s
  left join public.profiles ap on ap.id = s.author_id
  left join public.venues v on v.id = s.venue_id
  order by
    (
      ln(1 + s.reaction_count + 2 * s.reply_count)
      + (case when s.followed then 2.0 else 0 end)
      + (case when s.distance_m is null then 0 else -0.6 * ln(1 + s.distance_m / 1000.0) end)
      - 1.2 * s.hours_since / 24.0
    ) desc,
    s.created_at desc,
    s.id desc
  limit p_limit;
$$;

grant execute on function public.feed_home(double precision, double precision, double precision, text, timestamptz, uuid, int, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. suggested_players_to_follow — design screen 4's cold-start row. Nearby (home_point),
-- not self, not already followed, not blocked. Distance then reliability, badminton-only (the
-- only sport that ships) tier label included since the mock shows it under the name.
-- ---------------------------------------------------------------------------------------------

create function public.suggested_players_to_follow(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 50000,
  p_limit int default 5
)
returns table (
  id uuid,
  display_name text,
  photo_path text,
  avatar_key text,
  home_suburb text,
  skill_tier_label text
)
language sql
stable
security definer set search_path = public
as $$
  with centre as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography as pt
  )
  select
    p.id,
    p.display_name,
    p.photo_path,
    p.avatar_key,
    case when p.show_suburb then p.home_suburb else null end,
    st.label
  from public.profiles p
  left join public.profile_sports ps on ps.profile_id = p.id
  left join public.skill_tiers st on st.id = ps.skill_tier_id
  where p.deleted_at is null
    and (auth.uid() is null or p.id <> auth.uid())
    and not public.blocked_between(auth.uid(), p.id)
    and (auth.uid() is null or not exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id
    ))
    and p.home_point is not null
    and extensions.ST_DWithin(p.home_point, (select pt from centre), p_radius_m)
  order by extensions.ST_Distance(p.home_point, (select pt from centre)) asc, p.reliability_score desc
  limit p_limit;
$$;

grant execute on function public.suggested_players_to_follow(double precision, double precision, double precision, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_account — tombstone post_replies and post_reactions too (§9's pattern).
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
  delete from public.post_reactions where profile_id = p_profile_id;
  delete from public.post_replies where author_id = p_profile_id;
  delete from public.posts where author_id = p_profile_id;

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
