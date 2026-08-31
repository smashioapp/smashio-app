-- Two bugs found in testing (social-plan.md B2/B1):
--
-- 1. A text post with no venue got no `point` at all, so feed_home's location arm never
--    matched it (ST_DWithin needs a non-null point on both sides) and it was only ever visible
--    to the author's own followers. Since a fresh poster follows nobody and has no followers yet,
--    their own post never showed up in their own feed. Fix: fall back to the author's
--    home_point (same source Discover/nearby_games already use) when there's no venue.
--
-- 2. `question` is a valid posts.kind (posts_feed.sql's check constraint already allows it) but
--    create_post's own guard only accepted 'text'/'looking_for_players', so the composer's
--    "Ask a question" type (replacing plain "Text", per product ask) would raise
--    'Unsupported post kind'. Fix: accept 'question' here too.
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
  if p_kind not in ('text', 'question', 'looking_for_players') then
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
    select home_point into v_point from public.profiles where id = auth.uid();
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
