-- Pre-launch security review 2026-09-27, phase 2 (docs/security-audit-2026-09-27.md, local only).
-- Serves gtm-strategy.md §13 launch readiness.
--
--   M1  profiles readable across a block (column narrowing ships in _c after the client OTA)
--   M2  permission helpers answered questions about any third party
--   M4  ai-proxy rate limits: atomic, and counted per attempt rather than per success
--   M6  account deletion left personal data behind and reset visibility to 'everyone'
--   M7  report_content trusted the caller's p_reported_id
--   L1  self-referral farmed queue-jump credits
--   L2  upsert_places_venue had no rate limit
--   L3  follows / post_reactions readable across blocks and for players_only users
--   L4  notifications update grant was table-wide
--   L11 invoker functions without a pinned search_path

-- ---------------------------------------------------------------------------------------------
-- M2. Helpers stay callable from RLS policies (a policy's function call is checked against the
-- caller's EXECUTE, so revoking would break RLS). Instead the public name becomes a SECURITY
-- INVOKER guard around a private definer body: inside RLS or a direct RPC current_user is
-- authenticated/anon and the profile argument must be the caller; inside another definer
-- function current_user is the owner and anything goes. Every policy and invoker call site
-- passes auth.uid() (checked 2026-09-27), so nothing legitimate changes. CREATE OR REPLACE keeps
-- the OIDs, so existing policies keep pointing at the same functions.
-- ---------------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_approved_player(p_game_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.game_players
    where game_id = p_game_id and profile_id = p_profile_id and status = 'approved'
  );
$$;

create or replace function private.can_post_in_chat(p_game_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_closed_at is not null) then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.organizer_id = p_profile_id) then true
    when not private.is_approved_player(p_game_id, p_profile_id) then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_mode = 'announce') then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_pause_until is not null and g.chat_pause_until > now()) then false
    when exists (select 1 from public.game_players gp
                 where gp.game_id = p_game_id and gp.profile_id = p_profile_id
                   and gp.chat_muted_at is not null) then false
    else true
  end;
$$;

create or replace function private.blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function private.shares_a_game_with(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select a is not null and b is not null and (
    a = b
    or exists (
      select 1 from public.games g
      join public.game_players gp on gp.game_id = g.id
      where g.organizer_id = a and gp.profile_id = b and gp.status in ('requested', 'approved')
    )
    or exists (
      select 1 from public.games g
      join public.game_players gp on gp.game_id = g.id
      where g.organizer_id = b and gp.profile_id = a and gp.status in ('requested', 'approved')
    )
    or exists (
      select 1 from public.game_players gp1
      join public.game_players gp2 on gp2.game_id = gp1.game_id
      where gp1.profile_id = a and gp1.status = 'approved'
        and gp2.profile_id = b and gp2.status = 'approved'
    )
  );
$$;

revoke execute on all functions in schema private from public;
grant execute on function private.is_approved_player(uuid, uuid) to anon, authenticated, service_role;
grant execute on function private.can_post_in_chat(uuid, uuid) to anon, authenticated, service_role;
grant execute on function private.blocked_between(uuid, uuid) to anon, authenticated, service_role;
grant execute on function private.shares_a_game_with(uuid, uuid) to anon, authenticated, service_role;

create or replace function public.is_approved_player(p_game_id uuid, p_profile_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select case
    when current_user in ('authenticated', 'anon') and p_profile_id is distinct from auth.uid() then false
    else private.is_approved_player(p_game_id, p_profile_id)
  end;
$$;

create or replace function public.can_post_in_chat(p_game_id uuid, p_profile_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select case
    when current_user in ('authenticated', 'anon') and p_profile_id is distinct from auth.uid() then false
    else private.can_post_in_chat(p_game_id, p_profile_id)
  end;
$$;

create or replace function public.blocked_between(a uuid, b uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select case
    when current_user in ('authenticated', 'anon')
         and auth.uid() is distinct from a and auth.uid() is distinct from b then false
    else private.blocked_between(a, b)
  end;
$$;

create or replace function public.shares_a_game_with(a uuid, b uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select case
    when current_user in ('authenticated', 'anon')
         and auth.uid() is distinct from a and auth.uid() is distinct from b then false
    else private.shares_a_game_with(a, b)
  end;
$$;

-- push-dispatch (service_role) is the only caller.
revoke execute on function public.notification_unread_count(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- M1 (part 1): a block hides the whole profile row, both ways. Column narrowing is _c.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (
      not public.blocked_between(auth.uid(), id)
      and (
        profile_visibility = 'everyone'
        or public.shares_a_game_with(id, auth.uid())
        or exists (
          select 1 from public.games g
          where g.organizer_id = profiles.id and g.status = 'published' and g.visibility = 'public'
        )
      )
    )
  );

-- The signed-in user's own row, every column. The client reads its own profile through this so
-- _c can column-revoke the pattern-of-life fields (usual_nights, home_venue_id, home_suburb,
-- referred_by) from everyone else's rows.
create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_profile() from public;
grant execute on function public.my_profile() to authenticated;

-- Referral stats without reading referred_by off other people's rows.
create or replace function public.my_referrals()
returns table(id uuid, display_name text, avatar_key text, photo_path text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_key, p.photo_path, p.created_at
  from public.profiles p
  where p.referred_by = auth.uid() and p.deleted_at is null
  order by p.created_at desc;
$$;
revoke execute on function public.my_referrals() from public;
grant execute on function public.my_referrals() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- L1: attribution goes through one RPC. No self-referral, no deleted referrer, first write wins,
-- and only inside the first week of the account (the deep-link window; stops farming credits by
-- pointing old sock puppets at yourself later).
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_referrer(p_referrer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_referrer_id is null or p_referrer_id = v_uid then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_referrer_id and deleted_at is null) then
    return;
  end if;
  update public.profiles
  set referred_by = p_referrer_id
  where id = v_uid
    and referred_by is null
    and created_at >= now() - interval '7 days';
end;
$$;
revoke execute on function public.set_referrer(uuid) from public;
grant execute on function public.set_referrer(uuid) to authenticated;

create or replace function public.protect_profiles_system_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- L1: never, whoever writes it.
  if new.referred_by = new.id then
    new.referred_by := old.referred_by;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- L3: the social graph respects blocks, and players_only people's connections stay private
-- (you still see your own rows and rows about you).
-- ---------------------------------------------------------------------------------------------
drop policy if exists "follows select all" on public.follows;
create policy "follows select visible" on public.follows
  for select to authenticated
  using (
    follower_id = auth.uid()
    or followee_id = auth.uid()
    or (
      not public.blocked_between(auth.uid(), follower_id)
      and not public.blocked_between(auth.uid(), followee_id)
      and exists (select 1 from public.profiles p where p.id = follower_id and p.profile_visibility = 'everyone')
      and exists (select 1 from public.profiles p where p.id = followee_id and p.profile_visibility = 'everyone')
    )
  );

drop policy if exists "post_reactions select all" on public.post_reactions;
create policy "post_reactions select visible" on public.post_reactions
  for select to authenticated
  using (profile_id = auth.uid() or not public.blocked_between(auth.uid(), profile_id));

-- ---------------------------------------------------------------------------------------------
-- L4: notifications: only read_at is writable.
-- ---------------------------------------------------------------------------------------------
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------------------------
-- M4: ai-proxy rate limits. One call takes the per-user advisory lock, counts and records the
-- attempt in the same transaction, so a burst can't all pass the check before any of them
-- inserts, and failed parses count too. service_role only (ai-proxy).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.ai_proxy_parse_calls (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_proxy_parse_calls_profile_created on public.ai_proxy_parse_calls (profile_id, created_at desc);
alter table public.ai_proxy_parse_calls enable row level security;
revoke all on public.ai_proxy_parse_calls from anon, authenticated;

-- Returns null when the call may proceed (and has been recorded), otherwise the reason.
create or replace function public.ai_proxy_take_slot(p_profile_id uuid, p_kind text, p_per_minute int, p_per_day int, p_count int default 1)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minute int;
  v_day int;
begin
  if p_kind not in ('parse', 'text') then
    raise exception 'unknown slot kind %', p_kind;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_proxy_slot:' || p_kind || ':' || p_profile_id::text, 0));

  if p_kind = 'parse' then
    select count(*) filter (where created_at >= now() - interval '1 minute'), count(*)
      into v_minute, v_day
    from public.ai_proxy_parse_calls
    where profile_id = p_profile_id and created_at >= now() - interval '1 day';
  else
    select count(*) filter (where created_at >= now() - interval '1 minute'), count(*)
      into v_minute, v_day
    from public.ai_proxy_classify_calls
    where profile_id = p_profile_id and kind = 'text' and created_at >= now() - interval '1 day';
  end if;

  if v_minute + p_count > p_per_minute then
    return 'Too Many Requests';
  end if;
  if v_day + p_count > p_per_day then
    return case when p_kind = 'parse' then 'Daily scan limit reached' else 'Daily classify limit reached' end;
  end if;

  if p_kind = 'parse' then
    insert into public.ai_proxy_parse_calls (profile_id) select p_profile_id from generate_series(1, p_count);
  else
    insert into public.ai_proxy_classify_calls (profile_id, kind) select p_profile_id, 'text' from generate_series(1, p_count);
  end if;
  return null;
end;
$$;
revoke execute on function public.ai_proxy_take_slot(uuid, text, int, int, int) from public, anon, authenticated;
grant execute on function public.ai_proxy_take_slot(uuid, text, int, int, int) to service_role;

-- ---------------------------------------------------------------------------------------------
-- M7: the reported account comes from the subject, not the caller. Capped at 20 a day across
-- subjects, detail capped at 1000 characters.
-- ---------------------------------------------------------------------------------------------
create or replace function public.report_content(p_subject_type text, p_subject_id uuid, p_reported_id uuid, p_reason text, p_detail text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_reported uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  v_reported := case p_subject_type
    when 'profile' then (select id from public.profiles where id = p_subject_id)
    when 'post' then (select author_id from public.posts where id = p_subject_id)
    when 'comment' then (select author_id from public.post_replies where id = p_subject_id)
    when 'photo' then (select author_id from public.post_media where id = p_subject_id)
    when 'message' then (select sender_id from public.messages where id = p_subject_id)
    else null
  end;

  -- p_reported_id is kept in the signature for older clients, but only as a cross-check.
  if v_reported is null or (p_reported_id is not null and p_reported_id <> v_reported) then
    raise exception 'That can''t be reported';
  end if;

  if v_reported = v_uid then
    raise exception 'Cannot report your own content';
  end if;

  if exists (
    select 1 from public.user_reports
    where reporter_id = v_uid
      and subject_type = p_subject_type
      and subject_id = p_subject_id
      and created_at >= now() - interval '1 day'
  ) then
    raise exception 'You have already reported this today';
  end if;

  if (select count(*) from public.user_reports
      where reporter_id = v_uid and created_at >= now() - interval '1 day') >= 20 then
    raise exception 'You''ve sent a lot of reports today, we''ll get through them. Try again tomorrow.';
  end if;

  insert into public.user_reports (reporter_id, reported_id, subject_type, subject_id, reason, detail)
  values (v_uid, v_reported, p_subject_type, p_subject_id, p_reason, left(nullif(trim(p_detail), ''), 1000))
  returning id into v_id;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- L2: venues created from Google Places, at most 10 a day per user. Places venues never reach
-- the SEO directory (venue_seo_directory joins venue_profiles, which only curated venues have).
-- ---------------------------------------------------------------------------------------------
alter table public.venues add column if not exists created_by uuid;

create or replace function public.upsert_places_venue(p_name text, p_suburb text, p_state text, p_address text, p_lat double precision, p_lng double precision, p_google_place_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_id uuid;
begin
  select id into v_id from public.venues where google_place_id = p_google_place_id;
  if v_id is not null then
    return v_id;
  end if;

  if auth.uid() is not null and (
    select count(*) from public.venues
    where created_by = auth.uid() and created_at >= now() - interval '1 day'
  ) >= 10 then
    raise exception 'You''ve added a lot of new venues today, try again tomorrow.';
  end if;

  if coalesce(trim(p_name), '') = '' or length(p_name) > 200 or coalesce(trim(p_google_place_id), '') = '' then
    raise exception 'That venue can''t be added';
  end if;

  insert into public.venues (name, suburb, state, address, location, google_place_id, source, created_by)
  values (
    left(trim(p_name), 200), left(p_suburb, 100), left(p_state, 10), left(p_address, 300),
    extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326),
    p_google_place_id, 'places', auth.uid()
  )
  on conflict (google_place_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.venues where google_place_id = p_google_place_id;
  end if;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- M6: deletion scrubs every personal column, leaves the tombstone players_only, drops the
-- moderation/AI/web-signup trail, and hands back the chat photo paths for the edge function to
-- remove. Messages stay (other people's conversation) under "Deleted user".
-- ---------------------------------------------------------------------------------------------
create or replace function public.delete_account(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cancelled uuid[];
  v_confirmation_paths text[];
  v_chat_paths text[];
  v_email text;
begin
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Profile not found';
  end if;

  select email into v_email from auth.users where id = p_profile_id;

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

  select coalesce(array_agg(o.name), '{}') into v_chat_paths
  from storage.objects o
  where o.bucket_id = 'chat-media' and (storage.foldername(o.name))[2] = p_profile_id::text;

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
  delete from public.moderation_flags where author_id = p_profile_id;
  delete from public.ai_proxy_classify_calls where profile_id = p_profile_id;
  delete from public.ai_proxy_parse_calls where profile_id = p_profile_id;
  if v_email is not null then
    delete from public.web_signups where lower(email) = lower(v_email);
  end if;

  -- Image messages keep their row (the thread still reads), but the photo is gone.
  update public.messages set image_path = null where sender_id = p_profile_id and image_path is not null;

  update public.profiles
  set display_name = 'Deleted user',
      photo_path = null,
      avatar_key = null,
      home_suburb = null,
      home_venue_id = null,
      about_you = null,
      usual_nights = '{}',
      referred_by = null,
      referral_code = 'deleted-' || replace(p_profile_id::text, '-', ''),
      referral_priority_credits = 0,
      reliability_score = 100,
      profile_visibility = 'players_only',
      show_suburb = false,
      distance_units = 'km',
      timezone = 'Australia/Sydney',
      follower_count = 0,
      following_count = 0,
      deleted_at = now()
  where id = p_profile_id;

  return jsonb_build_object(
    'cancelled_game_ids', to_jsonb(v_cancelled),
    'confirmation_paths', to_jsonb(v_confirmation_paths),
    'chat_media_paths', to_jsonb(v_chat_paths)
  );
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- L11: pin search_path on the invoker functions the linter flags. extensions for PostGIS.
-- ---------------------------------------------------------------------------------------------
alter function public.achievement_week_streak(uuid) set search_path = public, extensions;
alter function public.venue_detail(uuid) set search_path = public, extensions;
alter function public.time_in_window(time, time, time) set search_path = public, extensions;
alter function public.profiles_set_referral_code() set search_path = public, extensions;
alter function public.profile_private_touch_updated_at() set search_path = public, extensions;
alter function public.default_game_format() set search_path = public, extensions;
alter function public.venues_directory(text, text, integer, boolean, boolean, text[], integer, integer, double precision, double precision) set search_path = public, extensions;
alter function public.venue_upcoming_games(uuid, integer) set search_path = public, extensions;
alter function public.assert_no_public_definer_execute() set search_path = public, extensions;
alter function public.profiles_guard_photo_path() set search_path = public, extensions;
alter function public.generate_referral_code() set search_path = public, extensions;
alter function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, integer, text, boolean, text[]) set search_path = public, extensions;
alter function public.venues_near(double precision, double precision, double precision) set search_path = public, extensions;
alter function public.notification_prefs_touch_updated_at() set search_path = public, extensions;
