-- Product call: plain "text" posts are cut from the composer's scope (looking_for_players and
-- question are the only kinds a player creates — see compose.tsx, which never offered "text" in
-- the UI to begin with). create_post_fixes.sql still accepted p_kind='text' at the RPC layer and
-- posts.kind's check constraint still allowed it, so tighten both and remove any rows that
-- slipped through before this was decided. 'system' posts are untouched.

delete from public.posts where kind = 'text';

alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('question', 'looking_for_players', 'system'));

create or replace function public.create_post(
  p_kind text,
  p_body text default null,
  p_venue_id uuid default null,
  p_starts_at timestamptz default null,
  p_skill_tier_label text default null,
  p_max_players int default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_point extensions.geography;
  v_venue_name text;
  v_venue_suburb text;
  v_payload jsonb;
  v_id uuid;
begin
  if p_kind not in ('question', 'looking_for_players') then
    raise exception 'Unsupported post kind';
  end if;

  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post needs some text';
  end if;

  if public.classify_post_text(auth.uid(), p_body) then
    raise exception 'That doesn''t look like it fits our community guidelines, give it another go.';
  end if;

  if p_venue_id is not null then
    select location, name, suburb into v_point, v_venue_name, v_venue_suburb
    from public.venues where id = p_venue_id;
  else
    select home_point into v_point from public.profiles where id = auth.uid();
  end if;

  if p_kind = 'looking_for_players' then
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'venue_name', v_venue_name,
      'venue_suburb', v_venue_suburb,
      'starts_at', p_starts_at,
      'skill_tier_label', p_skill_tier_label,
      'max_players', p_max_players
    ));
  end if;

  insert into public.posts (author_id, kind, body, venue_id, point, payload)
  values (auth.uid(), p_kind, trim(p_body), p_venue_id, v_point, v_payload)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_post(text, text, uuid, timestamptz, text, int) to authenticated;

-- feed_home's p_kind filter — drop the 'text' token, nothing can produce that kind any more.
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
