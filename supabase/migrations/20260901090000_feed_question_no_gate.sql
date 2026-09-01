-- Bug found in testing: a 'question' post is not tied to a place, so gating it behind the
-- 20km radius / follow arm (same as text/looking_for_players) hid it from almost everyone,
-- including the author's own feed when their home_point/venue happened to be missing at
-- insert time. Fix: kind='question' bypasses the point/follow OR-clause entirely and is
-- shown sport-wide (still subject to blocks + status='visible' + sport match).
create or replace function public.feed_home(
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
        p.kind = 'question'
        or (auth.uid() is not null and exists (
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
