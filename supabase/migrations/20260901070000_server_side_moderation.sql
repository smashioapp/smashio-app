-- social-plan.md §10/B5 gap found in testing: create_post's pre-publish classify call lived
-- entirely in the client (useCreatePost calling ai-proxy before the RPC). Anyone with a signed-in
-- session could call create_post directly (curl, a modified client) and skip classification
-- completely — the RPC never checked. This moves the check into create_post itself, so it can't
-- be skipped by going around the app. Same shared-secret pattern as push_dispatch_key
-- (20260808000500) — ai-proxy's classify mode now also accepts a server-to-server call
-- authenticated by `ai_proxy_service_key` instead of a user JWT.

create extension if not exists http with schema extensions;

-- Synchronous call to ai-proxy's classify mode. Fails OPEN on any transport problem (secret not
-- configured yet, network error, non-200, timeout) — same rule as the function's own internal
-- Gemini timeout: never silently eat a post, always leave a moderation_flags trail so a human
-- can review what went unclassified.
--
-- Timeout is 8s, not ai-proxy's own 2s — ai-proxy's 2s budget is just the Gemini call; the total
-- round trip also pays for function cold start and network hops on top of that. A Postgres
-- timeout close to ai-proxy's internal one raced it: Postgres gave up and failed a post open at
-- ~3s while ai-proxy's real (flagged) answer was still landing a moment later, publishing content
-- Gemini had already flagged. Found in testing (a "buy followers" spam post fail-open'd, then a
-- moderation_flags row for the same text showed up 3s later, correctly flagged, too late).
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
      'https://ajbsvsfwjfeofvjuhzrw.supabase.co/functions/v1/ai-proxy',
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
  if p_kind not in ('text', 'looking_for_players') then
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
