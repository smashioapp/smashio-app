-- social-plan.md B2 (§13.6 step 6, last): the composer. Text only —
-- `looking_for_players` first, then plain `text` (§13.1). RPC, not a plain client insert,
-- because `point` needs ST_MakePoint from the venue's own location (same reason set_home_point
-- exists, 20260815000200) and because centralising the insert keeps the venue-lookup and
-- payload shape in one place instead of trusting the client to build both consistently.
--
-- The pre-publish classification (§10 item 4) happens client-side against ai-proxy's `classify`
-- mode *before* this RPC is ever called — a post is never visible to anyone before it's cleared,
-- since nothing is written until this call happens. posts_rate_limit (B5) still applies: this
-- function is security definer but the trigger fires regardless of the calling role.
create function public.create_post(
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
