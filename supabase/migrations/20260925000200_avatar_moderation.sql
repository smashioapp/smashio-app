-- image-moderation-plan.md §8 Q3 (owner, 2026-09-25: yes) plus the pieces that need every
-- subject table to exist: resolve_media_flag (§4) and the orphan sweep's candidate list (§2 step 5).
--
-- Avatars: a profile photo reaches every stranger who sees a roster, so it's classified
-- synchronously before it goes live. Upload lands at a fresh {uid}/{uuid}.jpg, then
-- set_avatar_photo() classifies it and only sets profiles.photo_path on a confident clean.
--   confident clean     -> live
--   confident violating -> refused, flag row, old avatar stays
--   low confidence      -> old avatar stays, flag row queued; a reviewer's approve makes it live
--   ai-proxy unreachable -> refused ("couldn't check it"), old avatar stays. Unlike a feed post
--                           there's no text half worth publishing on its own, so fail closed.

-- ---------------------------------------------------------------------------------------------
-- 1. Nobody but a security definer function (set_avatar_photo, resolve_media_flag) points
-- photo_path at an object. Clients can still clear it (profile-edit picks a Smashimal instead).
-- ---------------------------------------------------------------------------------------------

create function public.profiles_guard_photo_path()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') and new.photo_path is not null then
    if tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path then
      raise exception 'Profile photos go through set_avatar_photo';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard_photo_path() from public, anon;
grant execute on function public.profiles_guard_photo_path() to authenticated;

create trigger profiles_guard_photo_path
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_photo_path();

-- ---------------------------------------------------------------------------------------------
-- 2. Avatar storage: reads only reach a live avatar (someone's photo_path) or your own folder, so
-- a pending or rejected upload isn't fetchable by path. No overwrite: new uploads get a new name.
-- ---------------------------------------------------------------------------------------------

create index profiles_photo_path_idx on public.profiles(photo_path) where photo_path is not null;

create function public.avatar_is_live(p_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where photo_path = p_name);
$$;

revoke execute on function public.avatar_is_live(text) from public, anon;
grant execute on function public.avatar_is_live(text) to authenticated;

drop policy "avatar images readable by authenticated" on storage.objects;

create policy "avatar images readable when live or own" on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.avatar_is_live(name)
    )
  );

-- No overwrite, and no re-upload under a live name: without the second rule a user could delete
-- their approved object (the delete policy allows it) and insert different bytes at the same
-- path, which photo_path still points at, skipping the classifier entirely.
drop policy "users update own avatar" on storage.objects;
drop policy "users upload own avatar" on storage.objects;

create policy "users upload own avatar" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.avatar_is_live(name)
  );

-- ---------------------------------------------------------------------------------------------
-- 3. set_avatar_photo
-- ---------------------------------------------------------------------------------------------

create function public.set_avatar_photo(p_path text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_previous text;
  v_result jsonb;
  v_outcome text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  if p_path is null or p_path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.jpg$') then
    raise exception 'That photo can''t be used.';
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path) then
    raise exception 'Your photo didn''t finish uploading, give it another go.';
  end if;

  select photo_path into v_previous from public.profiles where id = v_uid;

  v_result := public.classify_images(v_uid, 'avatars', array[p_path], 'avatar', v_uid, null);
  if v_result is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  v_outcome := coalesce(v_result->'images'->0->>'outcome', 'error');

  if v_outcome = 'visible' then
    update public.profiles set photo_path = p_path where id = v_uid;
    return jsonb_build_object('status', 'visible', 'previous_path', v_previous);
  elsif v_outcome in ('review', 'rejected') then
    -- ai-proxy wrote the flag row (subject avatar, subject_id = v_uid, storage_path = p_path).
    return jsonb_build_object('status', v_outcome);
  else
    return jsonb_build_object('status', 'unavailable');
  end if;
end;
$$;

revoke execute on function public.set_avatar_photo(text) from public, anon;
grant execute on function public.set_avatar_photo(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. resolve_media_flag (§4): the reviewer's one action, from the SQL editor. Service role only.
--   approve -> post_media visible / message clean / avatar made live
--   remove  -> post_media rejected / message removed / avatar never goes live (or comes down)
-- Closes every open flag on the same subject, not just this one.
-- ---------------------------------------------------------------------------------------------

create function public.resolve_media_flag(p_flag_id uuid, p_action text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_flag public.moderation_flags;
begin
  if p_action not in ('approve', 'remove') then
    raise exception 'p_action must be approve or remove';
  end if;

  select * into v_flag from public.moderation_flags where id = p_flag_id for update;
  if not found then
    raise exception 'Flag not found';
  end if;
  if v_flag.status not in ('open', 'reviewing') then
    raise exception 'Flag already resolved (%)', v_flag.status;
  end if;

  if v_flag.subject_type = 'post_media' then
    -- subject_id is null for a photo that never got attached (post refused, or dropped on
    -- timeout): nothing to flip, the flag just closes.
    if v_flag.subject_id is not null then
      update public.post_media
      set media_status = case p_action when 'approve' then 'visible' else 'rejected' end,
          decided_at = now()
      where id = v_flag.subject_id;
    end if;

  elsif v_flag.subject_type = 'message' then
    update public.messages
    set moderation_status = case p_action when 'approve' then 'clean' else 'removed' end
    where id = v_flag.subject_id;

  elsif v_flag.subject_type = 'avatar' then
    if p_action = 'approve' then
      -- Only if the author hasn't set a newer avatar since this one was flagged, and the object
      -- is still there to point at.
      update public.profiles pr
      set photo_path = v_flag.storage_path
      where pr.id = v_flag.subject_id
        and exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_flag.storage_path)
        and not exists (
          select 1 from storage.objects o
          where o.bucket_id = 'avatars' and o.name = pr.photo_path and o.created_at > v_flag.created_at
        );
    else
      update public.profiles set photo_path = null
      where id = v_flag.subject_id and photo_path = v_flag.storage_path;
    end if;

  else
    raise exception 'Not a media flag (subject_type %)', v_flag.subject_type;
  end if;

  update public.moderation_flags
  set status = case p_action when 'approve' then 'dismissed' else 'actioned' end
  where status in ('open', 'reviewing')
    and (
      id = p_flag_id
      or (subject_type = v_flag.subject_type and subject_id = v_flag.subject_id and v_flag.subject_id is not null)
      or (storage_path = v_flag.storage_path and v_flag.storage_path is not null)
    );
end;
$$;

revoke execute on function public.resolve_media_flag(uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_media_flag(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. Orphan sweep (§2 step 5). SQL can't free a storage blob, so this only lists what to delete;
-- purge-confirmations (type 'media', hourly via pg_cron) removes it through the Storage API.
--   post-media: >24 h old with no post_media row, unless a flag from the last 30 days points at
--               it (kept for the trail/appeals); or attached but rejected >30 days ago.
--   avatars:    {uid}/{uuid}.jpg uploads >24 h old that never went live, same 30-day flag carve-out.
--               Legacy {uid}/avatar.jpg names are never touched.
-- ---------------------------------------------------------------------------------------------

create function public.media_sweep_candidates(p_limit int default 500)
returns table (bucket_id text, name text)
language sql
stable
security definer set search_path = public
as $$
  (
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id = 'post-media'
      and o.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.post_media pm where pm.storage_path = o.name)
      and not exists (
        select 1 from public.moderation_flags mf
        where mf.storage_path = o.name and mf.created_at > now() - interval '30 days'
      )
    union all
    select o.bucket_id, o.name
    from storage.objects o
    join public.post_media pm on pm.storage_path = o.name
    where o.bucket_id = 'post-media'
      and pm.media_status = 'rejected'
      and pm.decided_at < now() - interval '30 days'
    union all
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id = 'avatars'
      and o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
      and o.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.profiles pr where pr.photo_path = o.name)
      and not exists (
        select 1 from public.moderation_flags mf
        where mf.storage_path = o.name and mf.status in ('open', 'reviewing')
      )
      and not exists (
        select 1 from public.moderation_flags mf
        where mf.storage_path = o.name and mf.created_at > now() - interval '30 days'
      )
  )
  limit p_limit;
$$;

revoke execute on function public.media_sweep_candidates(int) from public, anon, authenticated;
grant execute on function public.media_sweep_candidates(int) to service_role;

select cron.schedule('purge-orphan-media', '41 * * * *', $$select public.trigger_purge_confirmations('media');$$);
