-- image-moderation-plan.md I3 (social-plan B3's post_media): up to 4 photos on
-- looking_for_players and question posts (IM3), classified synchronously inside create_post so a
-- direct RPC call can't skip it (same enforcement rule as the text filter, 20260901070000).

-- ---------------------------------------------------------------------------------------------
-- 1. post-media bucket: private, 5 MB, JPEG only (the composer re-encodes through imagePrep,
-- which also strips EXIF/GPS). Path {author_id}/{uuid}.jpg.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 5242880, array['image/jpeg']);

-- ---------------------------------------------------------------------------------------------
-- 2. post_media: social-plan §5.3's draft plus the classifier's verdict. Only create_post and
-- resolve_media_flag write it (both security definer); clients read through RLS.
-- ---------------------------------------------------------------------------------------------

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  width int,
  height int,
  ordinal int not null default 0 check (ordinal between 0 and 3),
  media_status text not null check (media_status in ('visible', 'review', 'rejected')),
  classifier_category text,
  classifier_confidence numeric,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index post_media_post_idx on public.post_media(post_id, ordinal);

alter table public.post_media enable row level security;

-- The author sees every row on their own post, including a rejected one, so their card can say
-- "One photo was removed". The image itself stays unreachable for rejected rows (storage policy
-- below). Everyone else sees visible rows on a post they can read.
create policy "post_media readable with its post" on public.post_media
  for select to authenticated using (
    exists (
      select 1 from public.posts p
      where p.id = post_media.post_id
        and p.status = 'visible'
        and not public.blocked_between(auth.uid(), p.author_id)
    )
    and (media_status = 'visible' or author_id = auth.uid())
  );

revoke all on public.post_media from anon, authenticated;
grant select on public.post_media to authenticated;
grant all on public.post_media to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Storage policies. Insert own folder only. No update policy, so a classified object can't be
-- overwritten in place. Select mirrors post_media's RLS through a security definer helper (same
-- shape as chat-media's is_approved_player): visible photos on a readable post, the author's own
-- review photos, and the author's own not-yet-attached uploads.
-- ---------------------------------------------------------------------------------------------

create function public.can_read_post_media(p_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.post_media pm where pm.storage_path = p_name) then
      exists (
        select 1
        from public.post_media pm
        join public.posts p on p.id = pm.post_id
        where pm.storage_path = p_name
          and p.status = 'visible'
          and not public.blocked_between(auth.uid(), p.author_id)
          and (pm.media_status = 'visible' or (pm.media_status = 'review' and pm.author_id = auth.uid()))
      )
    else split_part(p_name, '/', 1) = auth.uid()::text
  end;
$$;

revoke execute on function public.can_read_post_media(text) from public, anon;
grant execute on function public.can_read_post_media(text) to authenticated;

create policy "post media insert own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post media readable with its post" on storage.objects
  for select to authenticated using (
    bucket_id = 'post-media'
    and public.can_read_post_media(name)
  );

-- ---------------------------------------------------------------------------------------------
-- 4. create_post gains p_media_paths and returns jsonb, so the composer can tell the author when
-- photos were dropped (IM2). Signature change = drop and recreate, then re-grant.
-- ---------------------------------------------------------------------------------------------

drop function public.create_post(text, text, uuid, timestamptz, text, int);

create function public.create_post(
  p_kind text,
  p_body text default null,
  p_venue_id uuid default null,
  p_starts_at timestamptz default null,
  p_skill_tier_label text default null,
  p_max_players int default null,
  p_media_paths text[] default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
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
    select home_point into v_point from public.profile_private where profile_id = v_uid;
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
$$;

revoke execute on function public.create_post(text, text, uuid, timestamptz, text, int, text[]) from public, anon;
grant execute on function public.create_post(text, text, uuid, timestamptz, text, int, text[]) to authenticated;
