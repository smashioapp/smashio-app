-- games.visibility ('public' | 'link_only') shipped with the create-game v3 wizard
-- (20260901120000_host_a_game_v3.sql) but nothing ever read it. Every listing surface still
-- selected on `status = 'published'` alone, so a host who picked "link only" got their game
-- listed in Discover for every signed-in user and served to any anonymous caller of
-- nearby_games_public — which website/api/* already calls. Found while writing
-- docs/website-plan.md §5.2, which gates the live-data website work on this.
--
-- The rule this establishes: link_only means "reachable by its link, never listed". So every
-- surface that *enumerates* games excludes it, and every surface that resolves one *known id*
-- (game_preview, games_public by id, the /game/:id page, post_preview) is deliberately left
-- alone — that is what the link is for.
--
-- Fixed here:
--   1. nearby_games            — Discover list + map markers (authenticated).
--   2. nearby_games_public     — anon Discover RPC, granted to `anon`.
--   3. venue_detail            — in-app venue screen's upcoming-game count/next-game time.
--   4. venue_seo_detail        — the same two numbers on the public /venue/:slug page.
--   5. trigger_notify_game_alerts — alert_match push fan-out to strangers.
--   6. feed_home               — system posts (game_published / game_filled / game_completed).
--   7. the stale 7-arg feed_home overload, which the v3 rewrite left behind unfiltered.
--   8. feed_home's default PUBLIC execute grant, which made the whole feed anon-readable.
--
-- Deliberately untouched: my-games/hosting lists and post_game_roster (membership-scoped),
-- player_card and profile activity (aggregate counts of *completed* games), the reminder and
-- roster notification fan-outs (participants only), and every by-id read listed above.

-- ---------------------------------------------------------------------------------------------
-- 1. nearby_games — Discover for a signed-in user. Recreated whole rather than patched in place;
-- the repo convention is that a new dated migration owns the current definition.
-- ---------------------------------------------------------------------------------------------

create or replace function public.nearby_games(
  lat double precision,
  lng double precision,
  radius_m double precision,
  sport_slug text,
  from_ts timestamptz default now(),
  to_ts timestamptz default null,
  tier_slugs text[] default null,
  has_spots_only boolean default false,
  verified_only boolean default false,
  max_cost_per_player_cents int default null,
  sort_by text default 'soonest',
  p_exclude_mine boolean default true,
  p_amenity_slugs text[] default null
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_address text,
  venue_lat double precision,
  venue_lng double precision,
  organizer_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  court_label text,
  skill_tier_slug text,
  skill_tier_label text,
  skill_tier_ordinal int,
  max_players int,
  cost_per_player_cents int,
  status text,
  verification_status text,
  approved_count int,
  distance_m double precision,
  organizer_display_name text,
  organizer_photo_path text,
  organizer_reliability_score numeric,
  organizer_hosted_count int,
  courts_booked int,
  duration_minutes int,
  reserved_spots int,
  reserved_claimed int,
  open_spots int,
  organizer_avatar_key text,
  cover_key text,
  skill_tier_max_label text,
  format_label text,
  notes text
)
language sql
stable
security invoker
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    gp.venue_address,
    gp.venue_lat,
    gp.venue_lng,
    gp.organizer_id,
    gp.starts_at,
    gp.ends_at,
    gp.court_label,
    gp.skill_tier_slug,
    gp.skill_tier_label,
    gp.skill_tier_ordinal,
    gp.max_players,
    gp.cost_per_player_cents,
    gp.status,
    gp.verification_status,
    gp.approved_count,
    extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) as distance_m,
    p.display_name as organizer_display_name,
    p.photo_path as organizer_photo_path,
    p.reliability_score as organizer_reliability_score,
    (select count(*) from public.games hg where hg.organizer_id = gp.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
    gp.courts_booked,
    gp.duration_minutes,
    gp.reserved_spots,
    gp.reserved_claimed,
    gp.open_spots,
    p.avatar_key as organizer_avatar_key,
    gp.cover_key,
    gp.skill_tier_max_label,
    gp.format_label,
    gp.notes
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  join public.profiles p on p.id = gp.organizer_id
  where s.slug = sport_slug
    and gp.status = 'published'
    -- link_only games are reachable by their link, never listed (see header).
    and gp.visibility = 'public'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and (not has_spots_only or gp.open_spots > 0)
    and (not verified_only or gp.verification_status = 'verified')
    and (max_cost_per_player_cents is null or gp.cost_per_player_cents <= max_cost_per_player_cents)
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
    and not public.blocked_between(auth.uid(), gp.organizer_id)
    and (
      p_amenity_slugs is null or array_length(p_amenity_slugs, 1) is null or not exists (
        select 1 from unnest(p_amenity_slugs) as wanted(slug)
        where not exists (
          select 1 from public.venue_amenities va
          where va.venue_id = gp.venue_id and va.amenity_slug = wanted.slug and va.availability in ('yes', 'paid')
        )
      )
    )
    and (
      not p_exclude_mine
      or (
        gp.organizer_id <> auth.uid()
        and not exists (
          select 1 from public.game_players mygp
          where mygp.game_id = gp.id and mygp.profile_id = auth.uid() and mygp.status in ('approved', 'invited')
        )
      )
    )
  order by
    case when sort_by = 'soonest' then gp.starts_at end asc,
    case when sort_by = 'nearest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean, text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. nearby_games_public — the anon variant (20260831000000_discover_anon.sql). This is the one
-- that actually leaked to the open internet: it is security definer and granted to `anon`.
-- ---------------------------------------------------------------------------------------------

create or replace function public.nearby_games_public(
  lat double precision,
  lng double precision,
  radius_m double precision,
  sport_slug text,
  from_ts timestamptz default now(),
  to_ts timestamptz default null,
  tier_slugs text[] default null,
  has_spots_only boolean default false,
  verified_only boolean default false,
  max_cost_per_player_cents int default null,
  sort_by text default 'soonest',
  p_amenity_slugs text[] default null
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_lat double precision,
  venue_lng double precision,
  starts_at timestamptz,
  ends_at timestamptz,
  court_label text,
  skill_tier_slug text,
  skill_tier_label text,
  skill_tier_ordinal int,
  max_players int,
  cost_per_player_cents int,
  status text,
  verification_status text,
  approved_count int,
  distance_m double precision,
  courts_booked int,
  duration_minutes int,
  reserved_spots int,
  reserved_claimed int,
  open_spots int,
  cover_key text
)
language sql
stable
security definer set search_path = public
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    gp.venue_lat,
    gp.venue_lng,
    gp.starts_at,
    gp.ends_at,
    gp.court_label,
    gp.skill_tier_slug,
    gp.skill_tier_label,
    gp.skill_tier_ordinal,
    gp.max_players,
    gp.cost_per_player_cents,
    gp.status,
    gp.verification_status,
    gp.approved_count,
    extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) as distance_m,
    gp.courts_booked,
    gp.duration_minutes,
    gp.reserved_spots,
    gp.reserved_claimed,
    gp.open_spots,
    gp.cover_key
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  where s.slug = sport_slug
    and gp.status = 'published'
    -- link_only games are reachable by their link, never listed (see header).
    and gp.visibility = 'public'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and (not has_spots_only or gp.open_spots > 0)
    and (not verified_only or gp.verification_status = 'verified')
    and (max_cost_per_player_cents is null or gp.cost_per_player_cents <= max_cost_per_player_cents)
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
    and (
      p_amenity_slugs is null or array_length(p_amenity_slugs, 1) is null or not exists (
        select 1 from unnest(p_amenity_slugs) as wanted(slug)
        where not exists (
          select 1 from public.venue_amenities va
          where va.venue_id = gp.venue_id and va.amenity_slug = wanted.slug and va.availability in ('yes', 'paid')
        )
      )
    )
  order by
    case when sort_by = 'closest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc nulls last,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    case when sort_by = 'most_spots' then gp.open_spots end desc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games_public(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. venue_detail — "3 games coming up here" on the in-app venue screen. A count is a small leak
-- but it is still a listing signal, and it is what makes a link_only game discoverable by
-- browsing venues instead of Discover.
-- ---------------------------------------------------------------------------------------------

create or replace function public.venue_detail(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'id', v.id,
    'name', v.name,
    'suburb', v.suburb,
    'state', v.state,
    'address', v.address,
    'lat', extensions.ST_Y(v.location::extensions.geometry),
    'lng', extensions.ST_X(v.location::extensions.geometry),
    'region', v.region,
    'slug', v.slug,
    'google_place_id', v.google_place_id,
    'profile', (
      select jsonb_build_object(
        'courts_badminton', vp.courts_badminton,
        'courts_total', vp.courts_total,
        'dedicated', vp.dedicated,
        'surface', vp.surface,
        'bookability', vp.bookability,
        'club_contact', vp.club_contact,
        'booking_platform', vp.booking_platform,
        'booking_url', vp.booking_url,
        'website_url', vp.website_url,
        'phone', vp.phone,
        'opening_hours', vp.opening_hours,
        'access_notes', vp.access_notes,
        'summary', vp.summary,
        'confidence', vp.confidence,
        'verified_at', vp.verified_at
      )
      from public.venue_profiles vp
      where vp.venue_id = v.id
    ),
    'amenities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', at.slug,
        'label', at.label,
        'icon', at.icon,
        'category', at.category,
        'availability', va.availability,
        'note', va.note
      ) order by at.category, at.ordinal), '[]'::jsonb)
      from public.venue_amenities va
      join public.amenity_types at on at.slug = va.amenity_slug
      where va.venue_id = v.id
    ),
    'pricing_bands', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pb.id,
        'label', pb.label,
        'days', pb.days,
        'starts_time', pb.starts_time,
        'ends_time', pb.ends_time,
        'cents', pb.cents,
        'unit', pb.unit,
        'notes', pb.notes
      ) order by pb.label), '[]'::jsonb)
      from public.venue_pricing_bands pb
      where pb.venue_id = v.id
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'storage_path', ph.storage_path,
        'credit', ph.credit
      ) order by ph.ordinal), '[]'::jsonb)
      from public.venue_photos ph
      where ph.venue_id = v.id and ph.status = 'approved'
    ),
    'upcoming_game_count', (
      select count(*)::int from public.games g
      where g.venue_id = v.id and g.status = 'published' and g.visibility = 'public' and g.starts_at >= now()
    ),
    'next_game_at', (
      select min(g.starts_at) from public.games g
      where g.venue_id = v.id and g.status = 'published' and g.visibility = 'public' and g.starts_at >= now()
    )
  )
  from public.venues v
  where v.id = p_venue_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. venue_seo_detail — same two numbers, but anon and server-rendered onto smashio.com.au.
-- ---------------------------------------------------------------------------------------------

create or replace function public.venue_seo_detail(p_identifier text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', v.id,
    'slug', v.slug,
    'name', v.name,
    'suburb', v.suburb,
    'state', v.state,
    'address', v.address,
    'region', v.region,
    'profile', (
      select jsonb_build_object(
        'courts_badminton', vp.courts_badminton,
        'courts_total', vp.courts_total,
        'dedicated', vp.dedicated,
        'surface', vp.surface,
        'bookability', vp.bookability,
        'booking_url', vp.booking_url,
        'website_url', vp.website_url,
        'phone', vp.phone,
        'opening_hours', vp.opening_hours,
        'access_notes', vp.access_notes,
        'summary', vp.summary
      )
      from public.venue_profiles vp
      where vp.venue_id = v.id
    ),
    'amenities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', at.slug,
        'label', at.label,
        'category', at.category,
        'availability', va.availability
      ) order by at.category, at.ordinal), '[]'::jsonb)
      from public.venue_amenities va
      join public.amenity_types at on at.slug = va.amenity_slug
      where va.venue_id = v.id and va.availability in ('yes', 'paid')
    ),
    'pricing_bands', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'label', pb.label,
        'days', pb.days,
        'starts_time', pb.starts_time,
        'ends_time', pb.ends_time,
        'cents', pb.cents,
        'unit', pb.unit
      ) order by pb.label), '[]'::jsonb)
      from public.venue_pricing_bands pb
      where pb.venue_id = v.id
    ),
    'upcoming_game_count', (
      select count(*)::int from public.games g
      where g.venue_id = v.id and g.status = 'published' and g.visibility = 'public' and g.starts_at >= now()
    ),
    'next_game_at', (
      select min(g.starts_at) from public.games g
      where g.venue_id = v.id and g.status = 'published' and g.visibility = 'public' and g.starts_at >= now()
    )
  )
  from public.venues v
  where v.slug = p_identifier or v.id::text = p_identifier;
$$;

grant execute on function public.venue_seo_detail(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. trigger_notify_game_alerts — a saved alert pushing "new game near you" is a listing surface
-- with a notification attached. Insert-only trigger, so this is evaluated once at create time.
-- ---------------------------------------------------------------------------------------------

create or replace function public.trigger_notify_game_alerts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_venue_location extensions.geography;
  v_tier_slug text;
  v_profile_ids uuid[];
  v_roster_ids uuid[];
begin
  if new.status <> 'published' then
    return new;
  end if;

  -- A link_only game is reachable by its link and nothing else, so it must not fan out to
  -- strangers who saved a matching alert.
  if new.visibility = 'link_only' then
    return new;
  end if;

  select v.location into v_venue_location from public.venues v where v.id = new.venue_id;
  select st.slug into v_tier_slug from public.skill_tiers st where st.id = new.skill_tier_id;

  -- Get roster (anyone with a game_players row, any status)
  select array_agg(distinct gp.profile_id) into v_roster_ids
  from public.game_players gp
  where gp.game_id = new.id;

  -- Alert recipients: matching alerts, excluding host and roster
  select array_agg(ga.profile_id) into v_profile_ids
  from public.game_alerts ga
  where ga.sport_id = new.sport_id
    and ga.profile_id is distinct from new.organizer_id
    and ga.profile_id <> all(coalesce(v_roster_ids, array[]::uuid[]))
    and public.notification_pref_enabled(ga.profile_id, 'alerts')
    and (ga.tier_slugs is null or v_tier_slug = any(ga.tier_slugs))
    and extensions.ST_DWithin(
          v_venue_location,
          extensions.ST_SetSRID(extensions.ST_MakePoint(ga.center_lng, ga.center_lat), 4326)::extensions.geography,
          ga.radius_m
        )
    -- Cap at 3 per day per user (check for existing alert_match sends in last 24h)
    and (select count(*) from public.notifications n
         where n.profile_id = ga.profile_id
           and n.type = 'alert_match'
           and n.created_at > now() - interval '24 hours'
       ) < 3;

  if v_profile_ids is not null and array_length(v_profile_ids, 1) > 0 then
    perform public.enqueue_notifications('alert_match', new.id, null, v_profile_ids, '{}'::jsonb, 'low', null);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. feed_home — the game_published / game_filled / game_completed system posts carry venue,
-- suburb, start time and organizer into everyone's feed. Filtered on read rather than at the
-- post_system_* triggers so that flipping a game's visibility later takes effect both ways.
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
      -- A post anchored to a link_only game never lands in the feed: link_only means
      -- reachable by its link, not listed. Filtered on read, not on the system-post
      -- trigger, because a host can flip visibility after the game is created.
      and (
        p.game_id is null
        or exists (select 1 from public.games g where g.id = p.game_id and g.visibility = 'public')
      )
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

-- ---------------------------------------------------------------------------------------------
-- 7. Drop the superseded 7-arg feed_home. 20260901100000_feed_v3_replies_reactions.sql added
-- p_mode + p_kind as a new overload rather than replacing the original, so the pre-v3 body stayed
-- in the database, callable, and outside the filter added above. The client has always sent
-- p_mode (ui/lib/queries/feed.ts), so nothing resolves to this signature.
-- ---------------------------------------------------------------------------------------------

drop function if exists public.feed_home(double precision, double precision, double precision, text, timestamptz, uuid, int);

-- ---------------------------------------------------------------------------------------------
-- 8. Revoke the default PUBLIC execute grant on feed_home. Same class of bug as
-- 20260904000000_sweep_holds_revoke_public.sql: every new function is created with EXECUTE for
-- PUBLIC, and granting to `authenticated` on top of that does not take it away. feed_home is
-- security definer, so PUBLIC execute meant anyone holding the (public) anon key could read the
-- whole feed straight off /rest/v1/rpc/feed_home — posts, authors, venues, distance buckets —
-- with no account. The client only ever calls it as an authenticated user
-- (ui/lib/queries/feed.ts), and no website/api/* page touches it, so nothing loses access.
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.feed_home(double precision, double precision, double precision, text, timestamptz, uuid, int, text, text[]) from public;
