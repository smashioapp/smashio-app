-- Security audit 2026-09-11, H4: `profiles.home_point` (exact geocoded home coordinates) sits on
-- a table with `select policy using (true)` and a table-wide grant, so any signed-in account can
-- `GET /rest/v1/profiles?select=home_point` and dump the whole user base's home address down to
-- the metre.
--
-- The column-grant fix (`revoke select on profiles; grant select (safe columns...)`) was tried
-- first and reverted: profile_private's own migration (20260822000000:32-35) already recorded why
-- that shape doesn't work here — every screen that reads its own profile does
-- `supabase.from("profiles").select("*")`, and PostgREST expands `*` to an explicit column list at
-- schema-cache build time, so narrowing the grant makes `select("*")` fail outright for everyone,
-- not just the field we want to hide. profile_private already exists for exactly this reason (it
-- holds `phone` today) and does not have this problem, because home_point is a self-only side
-- table, not a hidden column, so no widely-used `select("*")` on the base table has to change.
--
-- Every current reader of profiles.home_point is a `security definer` function (set_home_point,
-- suggested_players_to_follow, create_post, delete_account) — none of them are affected by
-- narrowing what `authenticated` can read, since they run as the function owner. This migration
-- only has to (1) move the data and the writer, and (2) repoint the two SQL functions that read
-- profiles.home_point directly by name.

alter table public.profile_private add column home_point extensions.geography(Point, 4326);

-- Backfill: profile_private is only created lazily (first phone-number save today), so most rows
-- with a home_point don't have a profile_private row yet.
insert into public.profile_private (profile_id, home_point)
select id, home_point from public.profiles where home_point is not null
on conflict (profile_id) do update set home_point = excluded.home_point;

alter table public.profiles drop column home_point;

create or replace function public.set_home_point(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.profile_private (profile_id, home_point)
  values (auth.uid(), extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326))
  on conflict (profile_id) do update set home_point = excluded.home_point;
end;
$$;

create or replace function public.suggested_players_to_follow(
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
  join public.profile_private pp on pp.profile_id = p.id
  left join public.profile_sports ps on ps.profile_id = p.id
  left join public.skill_tiers st on st.id = ps.skill_tier_id
  where p.deleted_at is null
    and (auth.uid() is null or p.id <> auth.uid())
    and not public.blocked_between(auth.uid(), p.id)
    and (auth.uid() is null or not exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id
    ))
    and pp.home_point is not null
    and extensions.ST_DWithin(pp.home_point, (select pt from centre), p_radius_m)
  order by extensions.ST_Distance(pp.home_point, (select pt from centre)) asc, p.reliability_score desc
  limit p_limit;
$$;

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
    select home_point into v_point from public.profile_private where profile_id = auth.uid();
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

-- delete_account (latest definition, 20260901100000) no longer needs to null out home_point on
-- profiles — the column isn't there any more, and its `delete from public.profile_private where
-- profile_id = p_profile_id` line (already present, runs earlier in the function) now removes the
-- home_point row along with everything else in that table.
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

-- M2: reliability_score, follower_count, following_count, referral_code and
-- referral_priority_credits are all derived server-side (nightly recompute, follow/unfollow
-- triggers, referral RPCs) and were self-editable over REST because public.profiles' update grant
-- is table-wide. referred_by stays client-writable — the referral flow sets it once at signup
-- (ui/lib/session.tsx) with no separate server-side attribution step — but a trigger below stops
-- it being reassigned after the fact, which today only the app's own `.is(null)` filter enforces.
--
-- These columns are safe to protect the ordinary way (unlike home_point, none of them is read via
-- a `select("*")` the client needs to keep working, and the app already reads/writes them by
-- explicit name everywhere — see ui/lib/queries/profile.ts).
create or replace function public.protect_profiles_system_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Blocklist the two PostgREST-facing roles rather than allowlisting service_role: the nightly
  -- reliability recompute and the follow/unfollow count triggers run via pg_cron/other triggers
  -- as postgres, not service_role, and must not get caught by this guard.
  if coalesce(current_setting('role', true), '') in ('authenticated', 'anon') then
    new.reliability_score := old.reliability_score;
    new.follower_count := old.follower_count;
    new.following_count := old.following_count;
    new.referral_code := old.referral_code;
    new.referral_priority_credits := old.referral_priority_credits;
    new.deleted_at := old.deleted_at;
    if old.referred_by is not null then
      new.referred_by := old.referred_by;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_system_columns
  before update on public.profiles
  for each row execute function public.protect_profiles_system_columns();
