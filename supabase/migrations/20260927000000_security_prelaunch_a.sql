-- Pre-launch security review 2026-09-27, phase 1 (docs/security-audit-2026-09-27.md, local only).
-- Serves gtm-strategy.md §13 launch readiness: nothing here changes a product rule, it closes
-- direct-REST paths that skipped the rules the RPCs already enforce.
--
--   H1  posts.point leaked the author's exact home_point
--   H2  suggested_players_to_follow could pin down a home by shrinking the radius
--   H3  posts / post_replies writable over REST, skipping moderation
--   H5  game_players insertable over REST, skipping request_to_join
--   H6  hosts could PATCH games.status to anything (fake 'completed' farms ratings/badges)
--   M3  post_preview served removed posts and players_only names to anyone with the id
--   M5  four storage buckets had no size or type limit on hosted
--   M8  hosts could swap a receipt after it verified the game

-- ---------------------------------------------------------------------------------------------
-- Shared: snap a point to a ~1 km grid (0.01 deg: ~1.1 km N-S, ~0.9 km E-W at Sydney's latitude).
-- Used wherever a point derived from someone's home ends up readable by other people.
-- ---------------------------------------------------------------------------------------------
create or replace function public.coarse_point(p extensions.geography)
returns extensions.geography
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null else
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(
        round(extensions.ST_X(p::extensions.geometry)::numeric, 2)::double precision,
        round(extensions.ST_Y(p::extensions.geometry)::numeric, 2)::double precision
      ),
      4326
    )::extensions.geography
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- M4: moderation circuit breaker. Text classification fails open so one Gemini blip doesn't eat
-- a post. But if someone drains the quota (or Gemini is down) every post would publish
-- unchecked. Once 10 timeout/error/unreachable flags have landed in 10 minutes, posting pauses instead.
-- ---------------------------------------------------------------------------------------------
create or replace function public.moderation_breaker_tripped()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 10
  from public.moderation_flags
  where reason in ('classify_timeout', 'classify_error', 'classify_unreachable')
    and created_at >= now() - interval '10 minutes';
$$;
revoke execute on function public.moderation_breaker_tripped() from public;

create or replace function public.classify_post_text(p_author_id uuid, p_text text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
declare
  v_key text;
  v_response extensions.http_response;
  v_body jsonb;
  v_degraded boolean := false;
begin
  if coalesce(trim(p_text), '') = '' then
    return false;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'ai_proxy_service_key' limit 1;
  if v_key is null then
    -- Unconfigured is a deploy problem (local stacks have no vault key), not quota drain.
    insert into public.moderation_flags (author_id, text, reason) values (p_author_id, p_text, 'classify_unconfigured');
    return false;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  begin
    select * into v_response from extensions.http((
      'POST',
      public.ai_proxy_url(),
      array[extensions.http_header('x-service-key', v_key)],
      'application/json',
      jsonb_build_object('mode', 'classify', 'text', p_text, 'author_id', p_author_id)::text
    )::extensions.http_request);
  exception when others then
    v_degraded := true;
  end;

  if v_degraded or v_response.status is distinct from 200 then
    perform public.moderation_breaker_check();
    insert into public.moderation_flags (author_id, text, reason) values (p_author_id, p_text, 'classify_unreachable');
    return false;
  end if;

  v_body := v_response.content::jsonb;
  -- ai-proxy failed open (Gemini timeout/error) and already wrote its own flag row.
  if coalesce((v_body->>'degraded')::boolean, false) then
    perform public.moderation_breaker_check();
  end if;
  return coalesce((v_body->>'flagged')::boolean, false);
end;
$function$;

create or replace function public.moderation_breaker_check()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.moderation_breaker_tripped() then
    raise exception 'Posting''s paused for a few minutes while we sort something out, give it another go shortly.';
  end if;
end;
$$;
revoke execute on function public.moderation_breaker_check() from public;

-- ---------------------------------------------------------------------------------------------
-- H3: posts and replies only through create_post / create_reply (definer RPCs that classify).
-- Delete-own stays: removing your own post needs no moderation.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "posts insert own" on public.posts;
drop policy if exists "posts update own" on public.posts;
drop policy if exists "post_replies insert own" on public.post_replies;
drop policy if exists "post_replies update own" on public.post_replies;

revoke insert, update on public.posts from anon, authenticated;
revoke insert, update on public.post_replies from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- H1: posts.point is never readable by clients, and never finer than ~1 km for home-derived rows.
-- feed_home (definer) still reads it for the radius filter and only ever returns a distance bucket.
-- ---------------------------------------------------------------------------------------------
revoke select on public.posts from anon, authenticated;
grant select (
  id, author_id, kind, body, sport_id, venue_id, game_id, club_id, payload, accepted_answer_id,
  reply_count, reaction_count, status, created_at, edited_at, reaction_notified_count
) on public.posts to authenticated;

-- Backfill: every post without a venue took its point from the author's home.
update public.posts
set point = public.coarse_point(point)
where venue_id is null and point is not null;

create or replace function public.create_post(p_kind text, p_body text DEFAULT NULL::text, p_venue_id uuid DEFAULT NULL::uuid, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_skill_tier_label text DEFAULT NULL::text, p_max_players integer DEFAULT NULL::integer, p_media_paths text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_paths text[] := coalesce(p_media_paths, '{}');
  v_count int;
  v_result jsonb;
  v_image jsonb;
  v_outcome text;
  v_dropped int := 0;
  v_in_review int := 0;
  v_point extensions.geography;
  v_venue_name text;
  v_venue_suburb text;
  v_payload jsonb;
  v_id uuid;
  v_media_id uuid;
  i int;
begin
  if p_kind not in ('question', 'looking_for_players') then
    raise exception 'Unsupported post kind';
  end if;

  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  if coalesce(trim(p_body), '') = '' then
    raise exception 'Post needs some text';
  end if;

  -- posts_rate_limit (10/day) only fires at the insert below, after classification. Checked here
  -- too so a client looping past its limit can't keep spending Gemini calls on up to 4 photos each.
  if (select count(*) from public.posts
      where author_id = v_uid and kind <> 'system' and created_at >= now() - interval '1 day') >= 10 then
    raise exception 'You''ve hit today''s posting limit, try again tomorrow';
  end if;

  v_count := coalesce(array_length(v_paths, 1), 0);

  if v_count > 4 then
    raise exception 'You can add up to 4 photos to a post.';
  end if;

  if v_count > 0 then
    if exists (
      select 1 from unnest(v_paths) as path
      where path is null
         or path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.jpg$')
    ) then
      raise exception 'That photo can''t be attached.';
    end if;

    if (select count(distinct path) from unnest(v_paths) as path) <> v_count
       or exists (select 1 from public.post_media where storage_path = any(v_paths)) then
      raise exception 'That photo can''t be attached.';
    end if;

    if (select count(*) from storage.objects where bucket_id = 'post-media' and name = any(v_paths)) <> v_count then
      raise exception 'One of your photos didn''t finish uploading, give it another go.';
    end if;
  end if;

  if v_count = 0 then
    if public.classify_post_text(v_uid, p_body) then
      raise exception 'That doesn''t look like it fits our community guidelines, give it another go.';
    end if;
  else
    -- Text and images in one parallel ai-proxy call (see classify_images for why). NULL means
    -- ai-proxy was unreachable: IM2, only the text posts. The text is then unclassified too,
    -- which fails open with a flag row, the same rule classify_post_text has always had.
    v_result := public.classify_images(v_uid, 'post-media', v_paths, 'post', null, p_body);

    if v_result is null or coalesce((v_result->'text'->>'degraded')::boolean, false) then
      perform public.moderation_breaker_check();
    end if;

    if v_result is null then
      v_dropped := v_count;
    else
      if coalesce((v_result->'text'->>'flagged')::boolean, false) then
        raise exception 'That doesn''t look like it fits our community guidelines, give it another go.';
      end if;
      -- A post that attaches a confidently violating photo doesn't publish its text either (§2).
      if exists (select 1 from jsonb_array_elements(v_result->'images') e where e->>'outcome' = 'rejected') then
        raise exception 'That doesn''t look like it fits our community guidelines, give it another go.';
      end if;
    end if;
  end if;

  if p_venue_id is not null then
    select location, name, suburb into v_point, v_venue_name, v_venue_suburb
    from public.venues where id = p_venue_id;
  else
    -- H1: never the exact home point. ~1 km is plenty for "posts near me".
    select public.coarse_point(home_point) into v_point from public.profile_private where profile_id = v_uid;
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
  values (v_uid, p_kind, trim(p_body), p_venue_id, v_point, v_payload)
  returning id into v_id;

  if v_result is not null then
    for i in 1 .. v_count loop
      select e into v_image
      from jsonb_array_elements(v_result->'images') e
      where e->>'path' = v_paths[i]
      limit 1;

      v_outcome := v_image->>'outcome';

      -- Timed out / errored / missing from the response: dropped, not attached. ai-proxy already
      -- wrote the classify_timeout flag. The orphan sweep deletes the object.
      if v_outcome is null or v_outcome not in ('visible', 'review') then
        v_dropped := v_dropped + 1;
        continue;
      end if;

      insert into public.post_media (post_id, author_id, storage_path, ordinal, media_status, classifier_category, classifier_confidence)
      values (
        v_id, v_uid, v_paths[i], i - 1, v_outcome,
        v_image->>'category',
        (v_image->>'confidence')::numeric
      )
      returning id into v_media_id;

      if v_outcome = 'review' then
        v_in_review := v_in_review + 1;
        insert into public.moderation_flags (author_id, text, reason, category, subject_type, subject_id, storage_bucket, storage_path, confidence)
        values (v_uid, p_body, 'classifier_low_confidence', v_image->>'category', 'post_media', v_media_id, 'post-media', v_paths[i], (v_image->>'confidence')::numeric);
      end if;
    end loop;
  end if;

  return jsonb_build_object('post_id', v_id, 'photos_dropped', v_dropped, 'photos_in_review', v_in_review);
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- H2: suggestions can't be used to locate anyone. Centre snapped to ~5 km, radius floored at
-- 5 km, order is a per-day shuffle (no distance signal), players_only profiles never appear.
-- ---------------------------------------------------------------------------------------------
create or replace function public.suggested_players_to_follow(p_lat double precision, p_lng double precision, p_radius_m double precision DEFAULT 50000, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, display_name text, photo_path text, avatar_key text, home_suburb text, skill_tier_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with centre as (
    select extensions.ST_SetSRID(
      extensions.ST_MakePoint(round(p_lng::numeric / 0.05) * 0.05, round(p_lat::numeric / 0.05) * 0.05),
      4326
    )::extensions.geography as pt
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
    and p.profile_visibility = 'everyone'
    and (auth.uid() is null or p.id <> auth.uid())
    and not public.blocked_between(auth.uid(), p.id)
    and (auth.uid() is null or not exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id
    ))
    and pp.home_point is not null
    and extensions.ST_DWithin(pp.home_point, (select pt from centre), greatest(coalesce(p_radius_m, 50000), 5000))
  order by md5(p.id::text || current_date::text), p.id
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$function$;

-- ---------------------------------------------------------------------------------------------
-- H5: joins only through request_to_join (blocks, capacity, waitlist, visibility, push).
-- ---------------------------------------------------------------------------------------------
drop policy if exists "game_players insert own request" on public.game_players;
revoke insert, update on public.game_players from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- H6: clients can only cancel a published game. 'completed' is set by complete_past_games (cron,
-- runs as postgres). Times are frozen once a game has started. Same role-GUC idiom as
-- protect_games_system_columns: definer RPCs called by a user still carry role=authenticated.
-- ---------------------------------------------------------------------------------------------
create or replace function public.enforce_game_edit_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_floor int;
  v_client boolean := coalesce(current_setting('role', true), '') in ('authenticated', 'anon');
begin
  if v_client and new.status is distinct from old.status
     and not (old.status = 'published' and new.status = 'cancelled') then
    raise exception 'That game status can''t be changed from the app';
  end if;

  if old.status = 'cancelled' and new.status = 'cancelled'
     and old.chat_closed_at is distinct from new.chat_closed_at then
    return new;
  end if;

  if old.status = 'cancelled' and new.status = 'cancelled' then
    raise exception 'This game is cancelled and can no longer be edited';
  end if;

  if v_client and old.starts_at <= now()
     and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) then
    raise exception 'This game has already started, so its time can''t be changed';
  end if;

  if new.max_players <> old.max_players then
    select 1
      + public.approved_player_count(new.id)
      + greatest(0, new.reserved_spots - public.claimed_reserved_count(new.id))
    into v_floor;

    if new.max_players < v_floor then
      raise exception 'Can''t set max players below the % already committed (you, the roster, and any spots you''re holding)', v_floor;
    end if;
  end if;

  if new.starts_at <> old.starts_at and new.starts_at <= now() then
    raise exception 'Start time must be in the future';
  end if;

  if v_client and new.ends_at is distinct from old.ends_at and new.ends_at <= new.starts_at then
    raise exception 'End time must be after the start time';
  end if;

  if new.starts_at <> old.starts_at then
    new.reminded_at := null;
    new.reminded_24h_at := null;
    new.nudge_underfilled_at := null;
    new.nudge_pending_at := null;
  end if;

  return new;
end;
$function$;

-- Second guard: nothing is rateable until the game has actually ended.
create or replace function public.can_rate_in_game(p_game_id uuid, p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id
      and g.status = 'completed'
      and g.ends_at < now()
      and (
        g.organizer_id = p_profile_id
        or exists (
          select 1 from public.game_players gp
          where gp.game_id = p_game_id
            and gp.profile_id = p_profile_id
            and gp.status = 'approved'
            and coalesce(gp.attended, true)
        )
      )
  );
$function$;

-- ---------------------------------------------------------------------------------------------
-- M3: removed/hidden posts never preview; players_only and deleted authors stay anonymous;
-- a signed-in caller blocked either way gets nothing.
-- ---------------------------------------------------------------------------------------------
create or replace function public.post_preview(p_post_id uuid)
 RETURNS TABLE(id uuid, kind text, body text, author_display_name text, sport_name text, venue_name text, venue_suburb text, reply_count integer, reaction_count integer, created_at timestamp with time zone, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.kind,
    p.body,
    case
      when pr.id is null or pr.deleted_at is not null or pr.profile_visibility <> 'everyone' then 'A player'
      else split_part(coalesce(nullif(pr.display_name, ''), 'A player'), ' ', 1)
    end,
    s.name,
    v.name,
    v.suburb,
    p.reply_count,
    p.reaction_count,
    p.created_at,
    p.status
  from public.posts p
  left join public.sports s on s.id = p.sport_id
  left join public.venues v on v.id = p.venue_id
  left join public.profiles pr on pr.id = p.author_id
  where p.id = p_post_id
    and p.status = 'visible'
    and not public.blocked_between(auth.uid(), p.author_id);
$function$;

-- ---------------------------------------------------------------------------------------------
-- M5: bucket limits on hosted (config.toml only covers local). Client-side prep already
-- re-encodes photos to JPEG; the extra types cover older builds and picker edge cases.
-- ---------------------------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id in ('avatars', 'chat-media', 'venue-photos');

update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
where id = 'confirmations';

-- ---------------------------------------------------------------------------------------------
-- M8: once a receipt has verified a game (or a draft has been parsed into a confirmation row),
-- the host can read it but not overwrite or delete it.
-- ---------------------------------------------------------------------------------------------
create or replace function public.confirmation_object_locked(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.game_confirmations gc
    where gc.storage_path = p_name
      and gc.review_status = 'verified'
  )
  or exists (
    select 1 from public.games g
    where g.id::text = (storage.foldername(p_name))[1]
      and g.verification_status = 'verified'
  );
$$;
revoke execute on function public.confirmation_object_locked(text) from public;
grant execute on function public.confirmation_object_locked(text) to authenticated;

drop policy if exists "organizer manages own confirmations" on storage.objects;
drop policy if exists "authenticated manages own draft confirmations" on storage.objects;

create policy "organizer reads own confirmations" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'confirmations'
    and exists (select 1 from public.games g where g.id::text = (storage.foldername(name))[1] and g.organizer_id = auth.uid())
  );

create policy "organizer uploads own confirmations" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'confirmations'
    and exists (select 1 from public.games g where g.id::text = (storage.foldername(name))[1] and g.organizer_id = auth.uid())
    and not public.confirmation_object_locked(name)
  );

create policy "organizer replaces unverified confirmations" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'confirmations'
    and exists (select 1 from public.games g where g.id::text = (storage.foldername(name))[1] and g.organizer_id = auth.uid())
    and not public.confirmation_object_locked(name)
  )
  with check (
    bucket_id = 'confirmations'
    and exists (select 1 from public.games g where g.id::text = (storage.foldername(name))[1] and g.organizer_id = auth.uid())
    and not public.confirmation_object_locked(name)
  );

create policy "organizer deletes unverified confirmations" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'confirmations'
    and exists (select 1 from public.games g where g.id::text = (storage.foldername(name))[1] and g.organizer_id = auth.uid())
    and not public.confirmation_object_locked(name)
  );

create policy "own draft confirmations read" on storage.objects
  for select to authenticated
  using (bucket_id = 'confirmations' and (storage.foldername(name))[1] = 'drafts' and (storage.foldername(name))[2] = auth.uid()::text);

create policy "own draft confirmations upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'confirmations' and (storage.foldername(name))[1] = 'drafts' and (storage.foldername(name))[2] = auth.uid()::text);

create policy "own draft confirmations replace unverified" on storage.objects
  for update to authenticated
  using (bucket_id = 'confirmations' and (storage.foldername(name))[1] = 'drafts' and (storage.foldername(name))[2] = auth.uid()::text and not public.confirmation_object_locked(name))
  with check (bucket_id = 'confirmations' and (storage.foldername(name))[1] = 'drafts' and (storage.foldername(name))[2] = auth.uid()::text and not public.confirmation_object_locked(name));

create policy "own draft confirmations delete unverified" on storage.objects
  for delete to authenticated
  using (bucket_id = 'confirmations' and (storage.foldername(name))[1] = 'drafts' and (storage.foldername(name))[2] = auth.uid()::text and not public.confirmation_object_locked(name));
