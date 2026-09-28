-- fill-the-spot P1.3 (F16): reach preview before publishing.
--
-- "About 20 players near MUSAC get pinged." Aggregate only: a count rounded down to a multiple of
-- 5 (never lower than 5 when anyone qualifies, 0 when nobody does), never identities. Mirrors the
-- default ring of spot_open_recipients (10 km, tier inside the range, alerts on, not blocked) but
-- ignores the per-player quiet hours and 2/day cap, which are about timing, not who could be told.

create function public.spot_reach_estimate(
  p_venue_id uuid,
  p_tier_min_id uuid,
  p_tier_max_id uuid
)
returns int
language plpgsql
stable
security definer set search_path = public, extensions
as $$
declare
  v_me uuid := auth.uid();
  v_min int;
  v_max int;
  v_sport uuid;
  v_loc extensions.geography;
  v_count int;
begin
  if v_me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select st.ordinal, st.sport_id into v_min, v_sport from public.skill_tiers st where st.id = p_tier_min_id;
  select st.ordinal into v_max from public.skill_tiers st where st.id = coalesce(p_tier_max_id, p_tier_min_id);
  select v.location into v_loc from public.venues v where v.id = p_venue_id;

  if v_min is null or v_max is null or v_loc is null then
    return 0;
  end if;

  select count(*) into v_count
  from (
    select pp.profile_id
    from public.profile_private pp
    join public.profile_sports ps on ps.profile_id = pp.profile_id and ps.sport_id = v_sport
    join public.skill_tiers pst on pst.id = ps.skill_tier_id
    where pp.home_point is not null
      and extensions.ST_DWithin(pp.home_point, v_loc, 10000)
      and pst.ordinal between v_min and v_max
    union
    select ga.profile_id
    from public.game_alerts ga
    where ga.sport_id = v_sport
      and extensions.ST_DWithin(
            v_loc,
            extensions.ST_SetSRID(extensions.ST_MakePoint(ga.center_lng, ga.center_lat), 4326)::extensions.geography,
            ga.radius_m
          )
      and (
        ga.tier_slugs is null
        or exists (
          select 1 from public.skill_tiers t
          where t.sport_id = v_sport and t.slug = any(ga.tier_slugs) and t.ordinal between v_min and v_max
        )
      )
  ) c
  join public.profiles p on p.id = c.profile_id
  where p.deleted_at is null
    and c.profile_id <> v_me
    and not public.blocked_between(v_me, c.profile_id)
    and public.notification_pref_enabled(c.profile_id, 'alerts');

  if v_count = 0 then
    return 0;
  end if;
  return greatest(5, (v_count / 5) * 5);
end;
$$;

grant execute on function public.spot_reach_estimate(uuid, uuid, uuid) to authenticated;
