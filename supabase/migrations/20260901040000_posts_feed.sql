-- social-plan.md B1+B7 (§13.6 step 3): posts + system-post triggers + feed_home + deletion
-- tombstoning. Only feed_home ships here — feed_venue/feed_profile/feed_club are proposed, not
-- approved (§13.1's B1 row lists feed_home only). No screen mounts this yet; N1 (step 4) is what
-- puts it on a tab. post_comments/post_reactions/post_media and the composer are B2/B3, later.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('text', 'question', 'looking_for_players', 'system')),
  body text,
  sport_id uuid references public.sports(id),
  venue_id uuid references public.venues(id) on delete set null,
  game_id uuid references public.games(id) on delete set null,
  club_id uuid references public.clubs(id) on delete set null,
  point extensions.geography(Point, 4326),
  payload jsonb,
  accepted_answer_id uuid,
  reply_count int not null default 0,
  reaction_count int not null default 0,
  status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index posts_feed_idx on public.posts (created_at desc) where status = 'visible';
create index posts_point_idx on public.posts using gist (point);
create index posts_venue_idx on public.posts (venue_id, created_at desc);
create index posts_club_idx on public.posts (club_id, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);

alter table public.posts enable row level security;

-- §5.5: visible + not blocked either direction. kind='system' inserts are rejected from
-- authenticated — triggers below write those as service role (security definer functions),
-- which bypasses RLS entirely, so the with-check here only has to stop a client claiming 'system'.
create policy "posts select visible" on public.posts for select to authenticated
  using (status = 'visible' and not public.blocked_between(auth.uid(), author_id));
create policy "posts insert own" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and kind <> 'system');
create policy "posts update own" on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "posts delete own" on public.posts for delete to authenticated using (author_id = auth.uid());
grant select, insert, update, delete on public.posts to authenticated;

-- ---------------------------------------------------------------------------------------------
-- System-post triggers (§4) — content that writes itself, so the feed is never empty on day one.
-- Each is service role via security definer, never client-writable.
-- ---------------------------------------------------------------------------------------------

create function public.post_system_game_published()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'published' then
    insert into public.posts (kind, sport_id, venue_id, game_id, point, payload)
    select 'system', new.sport_id, new.venue_id, new.id, v.location,
      jsonb_build_object(
        'event', 'game_published',
        'organizer_id', new.organizer_id,
        'venue_name', v.name,
        'venue_suburb', v.suburb,
        'starts_at', new.starts_at,
        'max_players', new.max_players
      )
    from public.venues v where v.id = new.venue_id;
  end if;
  return new;
end;
$$;

create trigger post_system_game_published
  after insert on public.games
  for each row execute function public.post_system_game_published();

create function public.post_system_game_completed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.posts (kind, sport_id, venue_id, game_id, point, payload)
    select 'system', new.sport_id, new.venue_id, new.id, v.location,
      jsonb_build_object(
        'event', 'game_completed',
        'organizer_id', new.organizer_id,
        'venue_name', v.name,
        'venue_suburb', v.suburb,
        'starts_at', new.starts_at
      )
    from public.venues v where v.id = new.venue_id;
  end if;
  return new;
end;
$$;

create trigger post_system_game_completed
  after update on public.games
  for each row execute function public.post_system_game_completed();

-- "This one filled in 20 minutes, N on the waitlist" — fires the moment the first row lands in
-- 'waitlisted' for a game, which is exactly when route_join_request (waitlist.sql) starts
-- routing new requests there instead of 'requested', i.e. the game just went from open to full.
create function public.post_system_game_filled()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_prior_waitlisted int;
  v_game record;
begin
  if new.status = 'waitlisted' then
    select count(*) into v_prior_waitlisted
    from public.game_players
    where game_id = new.game_id and status = 'waitlisted' and profile_id <> new.profile_id;

    if v_prior_waitlisted = 0 then
      select g.*, v.location as venue_location, v.name as venue_name, v.suburb as venue_suburb
        into v_game
      from public.games g join public.venues v on v.id = g.venue_id
      where g.id = new.game_id;

      insert into public.posts (kind, sport_id, venue_id, game_id, point, payload)
      values (
        'system', v_game.sport_id, v_game.venue_id, v_game.id, v_game.venue_location,
        jsonb_build_object(
          'event', 'game_filled',
          'organizer_id', v_game.organizer_id,
          'venue_name', v_game.venue_name,
          'venue_suburb', v_game.venue_suburb,
          'starts_at', v_game.starts_at
        )
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger post_system_game_filled
  after insert on public.game_players
  for each row execute function public.post_system_game_filled();

create function public.post_system_new_venue()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.posts (kind, venue_id, point, payload)
  values (
    'system', new.id, new.location,
    jsonb_build_object('event', 'new_venue', 'venue_name', new.name, 'venue_suburb', new.suburb)
  );
  return new;
end;
$$;

create trigger post_system_new_venue
  after insert on public.venues
  for each row execute function public.post_system_new_venue();

-- "Ravi hit 10 games hosted" — the whole reason B0.5 exists (§0.1). Author-anchored, not
-- venue-anchored, so no point is set; feed_home's radius term simply won't match it, only the
-- follow term will (which is the intended behaviour for an achievement post).
create function public.post_system_achievement_awarded()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.posts (kind, author_id, payload)
  values ('system', new.profile_id, jsonb_build_object('event', 'achievement_awarded', 'achievement_id', new.achievement_id));
  return new;
end;
$$;

create trigger post_system_achievement_awarded
  after insert on public.achievement_awards
  for each row execute function public.post_system_achievement_awarded();

-- ---------------------------------------------------------------------------------------------
-- feed_home (§6.1) — takes a centre + sport, mirrors nearby_games. Union of posts by people the
-- caller follows and posts within p_radius_m of the given centre; system posts already carry a
-- venue point so they're covered by the radius arm without a separate union branch. No club arm
-- yet — club_members doesn't exist (C0 was seed-only), so that union term is simply absent until
-- C1. Keyset-paginated on (created_at, id), never offset (§6).
-- ---------------------------------------------------------------------------------------------

create function public.feed_home(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision,
  p_sport_slug text,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 20
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
        (auth.uid() is not null and exists (
          select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.author_id
        ))
        or (p.point is not null and extensions.ST_DWithin(p.point, (select pt from centre), p_radius_m))
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

grant execute on function public.feed_home(double precision, double precision, double precision, text, timestamptz, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_account — tombstone posts the way blocks/follows already are (§9).
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
