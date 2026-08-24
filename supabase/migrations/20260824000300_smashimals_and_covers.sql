-- Avatars & Game Covers (docs/avatars-plan.md), P0: schema + plumbing. Avatars ship this round
-- (P0-P2); covers are parked (plan §6.6) but the column lands now so a second migration isn't
-- needed when covers unpark.

alter table public.profiles add column avatar_key text;
alter table public.games add column cover_key text not null default 'auto';

comment on column public.profiles.avatar_key is
  'Client-chosen Smashimal key (ui/lib/avatars.ts ANIMALS). No FK/enum/check on purpose — an '
  'unrecognized key (old client, future animal) falls through to the id-hash animal client-side. '
  'Reserved key ''ghost'' means delete_account scrubbed this profile.';

comment on column public.games.cover_key is
  'Parked (avatars-plan.md P3) — always ''auto'', nothing reads it yet.';

-- ---------------------------------------------------------------------------------------------
-- games_public / nearby_games: carry the organizer's avatar_key alongside their existing
-- organizer_photo_path, plus the new cover_key. Appending at the end keeps this a pure column
-- addition for every existing positional/JSON consumer.
-- ---------------------------------------------------------------------------------------------

create or replace view public.games_public
with (security_invoker = true) as
select
  g.id,
  g.sport_id,
  g.venue_id,
  v.name as venue_name,
  v.suburb as venue_suburb,
  v.location as venue_location,
  g.organizer_id,
  g.starts_at,
  g.ends_at,
  g.court_label,
  g.skill_tier_id,
  st.slug as skill_tier_slug,
  st.label as skill_tier_label,
  g.max_players,
  g.cost_per_player_cents,
  g.status,
  g.verification_status,
  g.created_at,
  public.approved_player_count(g.id) as approved_count,
  v.address as venue_address,
  extensions.ST_Y(v.location::extensions.geometry) as venue_lat,
  extensions.ST_X(v.location::extensions.geometry) as venue_lng,
  st.ordinal as skill_tier_ordinal,
  p.display_name as organizer_display_name,
  p.photo_path as organizer_photo_path,
  p.reliability_score as organizer_reliability_score,
  (select count(*) from public.games hg where hg.organizer_id = g.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
  g.courts_booked,
  g.duration_hours,
  g.reserved_spots,
  public.claimed_reserved_count(g.id) as reserved_claimed,
  public.open_spots(g.id) as open_spots,
  p.avatar_key as organizer_avatar_key,
  g.cover_key
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id
join public.profiles p on p.id = g.organizer_id;

grant select on public.games_public to authenticated;

drop function if exists public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean, text[]);

create function public.nearby_games(
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
  duration_hours int,
  reserved_spots int,
  reserved_claimed int,
  open_spots int,
  organizer_avatar_key text,
  cover_key text
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
    gp.duration_hours,
    gp.reserved_spots,
    gp.reserved_claimed,
    gp.open_spots,
    p.avatar_key as organizer_avatar_key,
    gp.cover_key
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  join public.profiles p on p.id = gp.organizer_id
  where s.slug = sport_slug
    and gp.status = 'published'
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
-- player_card / post_game_roster: same treatment for the player-facing avatar.
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
  avatar_key text
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
    g.avatar_key
  from gated g;
$fn$;

grant execute on function public.player_card(uuid) to authenticated;

drop function if exists public.post_game_roster(uuid);

create function public.post_game_roster(p_game_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  photo_path text,
  is_host boolean,
  attended boolean,
  declared_tier_label text,
  rated_player boolean,
  rated_host boolean,
  skill_voted boolean,
  avatar_key text
)
language sql
stable
security definer set search_path = public
as $$
  with g as (
    select id, organizer_id, sport_id, status, attendance_marked_at
    from public.games where id = p_game_id
  ),
  people as (
    select g.organizer_id as profile_id, true as is_host, true as attended from g
    union all
    select gp.profile_id, false, coalesce(gp.attended, true)
    from public.game_players gp, g
    where gp.game_id = g.id and gp.status = 'approved'
  )
  select
    pe.profile_id,
    pr.display_name,
    pr.photo_path,
    pe.is_host,
    pe.attended,
    (
      select st.label from public.profile_sports ps
      join public.skill_tiers st on st.id = ps.skill_tier_id
      where ps.profile_id = pe.profile_id and ps.sport_id = (select sport_id from g)
    ) as declared_tier_label,
    exists (
      select 1 from public.ratings r
      where r.game_id = p_game_id and r.rater_id = auth.uid() and r.ratee_id = pe.profile_id and r.dimension = 'player'
    ) as rated_player,
    exists (
      select 1 from public.ratings r
      where r.game_id = p_game_id and r.rater_id = auth.uid() and r.ratee_id = pe.profile_id and r.dimension = 'host'
    ) as rated_host,
    exists (
      select 1 from public.skill_votes sv
      where sv.game_id = p_game_id and sv.rater_id = auth.uid() and sv.ratee_id = pe.profile_id
    ) as skill_voted,
    pr.avatar_key
  from people pe
  join public.profiles pr on pr.id = pe.profile_id
  where pe.profile_id <> auth.uid()
    and public.can_rate_in_game(p_game_id, auth.uid())
    and pe.attended
  order by pe.is_host desc, pr.display_name;
$$;

grant execute on function public.post_game_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_account: reserved 'ghost' key instead of the id-hash handing a deleted user a cheerful
-- animal (avatars-plan.md decision 7).
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

  delete from public.user_reports where reporter_id = p_profile_id;

  update public.profiles
  set display_name = 'Deleted user',
      photo_path = null,
      avatar_key = 'ghost',
      home_suburb = null,
      home_point = null,
      reliability_score = 100,
      profile_visibility = 'everyone',
      show_suburb = true,
      distance_units = 'km',
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
