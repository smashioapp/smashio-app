-- image-moderation-plan.md I1 + I2: the shared image classifier plumbing, then chat photos.
--
-- I1: moderation_flags goes general (subject + storage path + confidence), the dashboard queue
-- view carries the new columns, a one-row moderation_config holds the confidence threshold so it
-- can move without a deploy (§6), ai_proxy_classify_calls learns to count image calls, and
-- classify_images() is the synchronous Postgres -> ai-proxy call that create_post and
-- set_avatar_photo use (same shape as classify_post_text, 20260901070000).
--
-- I2: messages.moderation_status, a 50/day chat photo limit, an AFTER INSERT trigger that fires
-- ai-proxy classify_image through pg_net (fire and forget, like notify_push), and the non-sender
-- select policies (messages + chat-media storage) that hide a removed photo.
--
-- resolve_media_flag() and the orphan sweep need post_media, so they land in
-- 20260925000200_avatar_moderation.sql, after every subject table exists.

-- ---------------------------------------------------------------------------------------------
-- 1. moderation_config: one row, service role only. ai-proxy reads the threshold per request.
-- ---------------------------------------------------------------------------------------------

create table public.moderation_config (
  id boolean primary key default true check (id),
  image_confidence_threshold numeric not null default 0.8
    check (image_confidence_threshold > 0 and image_confidence_threshold <= 1),
  chat_photos_per_day int not null default 50 check (chat_photos_per_day > 0),
  updated_at timestamptz not null default now()
);

insert into public.moderation_config default values;

alter table public.moderation_config enable row level security;
revoke all on public.moderation_config from anon, authenticated;
grant all on public.moderation_config to service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. moderation_flags: text becomes nullable and every row says what it's attached to. Existing
-- rows are all post text flags, so the 'post' default is correct for them.
-- ---------------------------------------------------------------------------------------------

alter table public.moderation_flags
  alter column text drop not null,
  add column subject_type text not null default 'post'
    check (subject_type in ('post', 'post_media', 'message', 'avatar')),
  add column subject_id uuid,
  add column storage_bucket text,
  add column storage_path text,
  add column confidence numeric;

create index moderation_flags_subject_idx on public.moderation_flags(subject_type, subject_id);
create index moderation_flags_storage_path_idx on public.moderation_flags(storage_path) where storage_path is not null;

-- Same first nine columns as before (create or replace view can only append), plus the three a
-- reviewer needs to open the image in the dashboard storage browser.
create or replace view public.moderation_queue as
  select
    'report'::text as source,
    ur.id,
    ur.subject_type,
    ur.subject_id,
    ur.reported_id as author_id,
    ur.reason,
    ur.detail,
    ur.status,
    ur.created_at,
    null::text as storage_bucket,
    null::text as storage_path,
    null::numeric as confidence
  from public.user_reports ur
  where ur.status = 'open'
  union all
  select
    'ai_flag'::text as source,
    mf.id,
    mf.subject_type,
    mf.subject_id,
    mf.author_id,
    coalesce(mf.category, mf.reason) as reason,
    mf.text as detail,
    mf.status,
    mf.created_at,
    mf.storage_bucket,
    mf.storage_path,
    mf.confidence
  from public.moderation_flags mf
  where mf.status = 'open'
  order by created_at desc;

revoke all on public.moderation_queue from anon, authenticated;
grant select on public.moderation_queue to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. ai_proxy_classify_calls counts image calls too (§3 rate limit, and Gemini spend).
-- ---------------------------------------------------------------------------------------------

alter table public.ai_proxy_classify_calls
  add column kind text not null default 'text' check (kind in ('text', 'image'));

-- ---------------------------------------------------------------------------------------------
-- 4. Where Postgres reaches ai-proxy. Same override pattern as push_dispatch_url: the hosted URL
-- by default, a Vault 'ai_proxy_url' secret to point a local stack at `supabase functions serve`.
-- ---------------------------------------------------------------------------------------------

create function public.ai_proxy_url()
returns text
language sql
stable
security definer set search_path = public, vault
as $$
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'ai_proxy_url' limit 1),
    'https://ajbsvsfwjfeofvjuhzrw.supabase.co/functions/v1/ai-proxy'
  );
$$;

revoke execute on function public.ai_proxy_url() from public, anon, authenticated;

-- classify_post_text: body unchanged except the URL now comes from ai_proxy_url(), so a local
-- stack can exercise the post text filter end to end.
create or replace function public.classify_post_text(p_author_id uuid, p_text text)
returns boolean
language plpgsql
security definer set search_path = public, extensions, vault
as $$
declare
  v_key text;
  v_response extensions.http_response;
  v_body jsonb;
begin
  if coalesce(trim(p_text), '') = '' then
    return false;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'ai_proxy_service_key' limit 1;
  if v_key is null then
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
    insert into public.moderation_flags (author_id, text, reason) values (p_author_id, p_text, 'classify_unreachable');
    return false;
  end;

  if v_response.status is distinct from 200 then
    insert into public.moderation_flags (author_id, text, reason) values (p_author_id, p_text, 'classify_unreachable');
    return false;
  end if;

  v_body := v_response.content::jsonb;
  return coalesce((v_body->>'flagged')::boolean, false);
end;
$$;

revoke all on function public.classify_post_text(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. classify_images(): the synchronous call for feed photos and avatars. Returns ai-proxy's
-- response body ({ images: [...], text: {...} | null }), or NULL when ai-proxy couldn't be
-- reached, in which case the caller applies its own surface's timeout rule (§2: feed drops the
-- photos, avatars refuse the upload). ai-proxy writes the flag rows for rejected and timed-out
-- images itself, so they survive a caller that raises and rolls back.
--
-- Deviation from §1's "10 s Postgres timeout": hosted `authenticated` runs with
-- statement_timeout = 8s, and this call happens inside create_post / set_avatar_photo, i.e. inside
-- that one statement. 10 s could never be reached. ai-proxy classifies the post text and every
-- image in parallel (4 s Gemini budget each), so one 7 s round trip covers what the plan
-- sequenced as two calls.
-- ---------------------------------------------------------------------------------------------

create function public.classify_images(
  p_author_id uuid,
  p_bucket text,
  p_paths text[],
  p_subject_type text,
  p_subject_id uuid default null,
  p_text text default null
)
returns jsonb
language plpgsql
security definer set search_path = public, extensions, vault
as $$
declare
  v_key text;
  v_response extensions.http_response;
  v_reason text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'ai_proxy_service_key' limit 1;

  if v_key is null then
    v_reason := 'classify_unconfigured';
  else
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '7000');
    begin
      select * into v_response from extensions.http((
        'POST',
        public.ai_proxy_url(),
        array[extensions.http_header('x-service-key', v_key)],
        'application/json',
        jsonb_build_object(
          'mode', 'classify_image',
          'bucket', p_bucket,
          'paths', to_jsonb(p_paths),
          'author_id', p_author_id,
          'subject_type', p_subject_type,
          'subject_id', p_subject_id,
          'text', p_text
        )::text
      )::extensions.http_request);
      if v_response.status is distinct from 200 then
        v_reason := 'classify_unreachable';
      end if;
    exception when others then
      v_reason := 'classify_unreachable';
    end;
  end if;

  if v_reason is not null then
    insert into public.moderation_flags (author_id, text, reason, subject_type, subject_id, storage_bucket, storage_path)
    select p_author_id, p_text, v_reason,
           case p_subject_type when 'post' then 'post_media' else p_subject_type end,
           p_subject_id, p_bucket, path
    from unnest(p_paths) as path;
    return null;
  end if;

  return v_response.content::jsonb;
end;
$$;

revoke all on function public.classify_images(uuid, text, text[], text, uuid, text) from public, anon, authenticated;

-- =============================================================================================
-- I2: chat photos, asynchronous (§3)
-- =============================================================================================

alter table public.messages
  add column moderation_status text not null default 'unchecked'
    check (moderation_status in ('unchecked', 'clean', 'review', 'removed'));

create index messages_image_path_idx on public.messages(image_path) where image_path is not null;
create index messages_sender_images_idx on public.messages(sender_id, created_at desc) where kind = 'image';

-- 50 photos/day/sender (moderation_config.chat_photos_per_day). Counted off messages rather than
-- ai_proxy_classify_calls: this is a send limit, and the send is what gets refused. Also caps
-- Gemini spend from a looping client, since every image insert fires one classify call.
create function public.chat_photo_rate_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit int;
  v_recent int;
begin
  -- Only the classifier's write-back (service role) ever moves this off 'unchecked'. Clients have
  -- no update grant on messages, so insert is the one place a client could set it.
  new.moderation_status := 'unchecked';

  if new.kind <> 'image' then
    return new;
  end if;

  -- The count below keys off created_at, which a client could otherwise backdate on insert.
  new.created_at := now();

  select chat_photos_per_day into v_limit from public.moderation_config limit 1;

  select count(*) into v_recent
  from public.messages
  where sender_id = new.sender_id and kind = 'image' and created_at >= now() - interval '1 day';

  if v_recent >= coalesce(v_limit, 50) then
    raise exception 'That''s a lot of photos today, try again tomorrow.';
  end if;

  return new;
end;
$$;

revoke execute on function public.chat_photo_rate_limit() from public, anon, authenticated;

create trigger messages_chat_photo_rate_limit
  before insert on public.messages
  for each row execute function public.chat_photo_rate_limit();

-- Fire and forget: the send never waits on Gemini (owner, 2026-09-25). ai-proxy writes the
-- verdict back onto the row with the service client. No key configured = no-op, same as
-- notify_push, so a fresh local/CI db doesn't fail sends on a secret nobody has set.
create function public.trigger_classify_chat_photo()
returns trigger
language plpgsql
security definer set search_path = public, vault
as $$
declare
  v_key text;
begin
  if new.kind <> 'image' or new.image_path is null or new.sender_id is null then
    return new;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'ai_proxy_service_key' limit 1;
  if v_key is null then
    return new;
  end if;

  perform net.http_post(
    url := public.ai_proxy_url(),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-service-key', v_key),
    body := jsonb_build_object(
      'mode', 'classify_image',
      'bucket', 'chat-media',
      'paths', jsonb_build_array(new.image_path),
      'author_id', new.sender_id,
      'subject_type', 'message',
      'subject_id', new.id
    ),
    -- pg_net's 5 s default is tight for a 4 s Gemini budget plus download and cold start; a
    -- dropped connection could cut the function off before its write-back.
    timeout_milliseconds := 15000
  );
  return new;
end;
$$;

revoke execute on function public.trigger_classify_chat_photo() from public, anon, authenticated;

create trigger messages_classify_chat_photo
  after insert on public.messages
  for each row execute function public.trigger_classify_chat_photo();

-- A removed photo disappears for everyone except its sender (§3 step 4), host included. The
-- sender keeps the row so their client can show "Photo removed".
drop policy "messages readable by organizer and approved players" on public.messages;

create policy "messages readable by organizer and approved players" on public.messages
  for select to authenticated using (
    (
      public.is_approved_player(game_id, auth.uid())
      or exists (select 1 from public.games g where g.id = messages.game_id and g.organizer_id = auth.uid())
    )
    and (
      approval_status = 'approved'
      or sender_id = auth.uid()
      or exists (select 1 from public.games g where g.id = messages.game_id and g.organizer_id = auth.uid())
    )
    and (moderation_status <> 'removed' or sender_id = auth.uid())
  );

-- The storage side of the same rule, so a client that already holds the path can't mint a fresh
-- signed URL for a removed photo. That includes the sender, whose client shows "Photo removed"
-- rather than the photo. Security definer because the messages row is invisible to most of the
-- readers it's checked for. Signed URLs minted before the removal stay valid until they expire
-- (1 h), which is the accepted gap: those readers had already loaded the photo.
create function public.chat_media_is_removed(p_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.messages m
    where m.image_path = p_name and m.moderation_status = 'removed'
  );
$$;

revoke execute on function public.chat_media_is_removed(text) from public, anon;
grant execute on function public.chat_media_is_removed(text) to authenticated;

drop policy "chat media readable by organizer and approved players" on storage.objects;

create policy "chat media readable by organizer and approved players" on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media'
    and (
      public.is_approved_player(((storage.foldername(name))[1])::uuid, auth.uid())
      or exists (
        select 1 from public.games g
        where g.id = ((storage.foldername(name))[1])::uuid and g.organizer_id = auth.uid()
      )
    )
    and not public.chat_media_is_removed(name)
  );
