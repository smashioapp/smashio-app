-- Profile plan P1: the public player card. A view can't do this — game_players is readable
-- only by a game's organizer and approved members (slice 4 RLS), so joined-game counts and
-- games-together for an arbitrary player are invisible to a security_invoker projection.
-- security definer, one round trip, live — mirrors the organizer_hosted_count precedent in
-- games_public (20260812000100) but for any profile, not just organizers.
create or replace function public.player_card(target_id uuid)
returns table (
  id uuid,
  display_name text,
  photo_path text,
  home_suburb text,
  member_since timestamptz,
  games_played int,
  games_hosted int,
  reliability_score numeric,
  reliability_band text,
  rating_avg numeric,
  rating_count int,
  games_together int,
  badge_counts jsonb,
  sports jsonb
)
language sql
stable
security definer set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.photo_path,
    p.home_suburb,
    p.created_at as member_since,
    (
      select count(*)::int from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.profile_id = p.id and gp.status = 'approved' and g.status = 'completed'
    ) as games_played,
    (
      select count(*)::int from public.games g
      where g.organizer_id = p.id and g.status = 'completed'
    ) as games_hosted,
    p.reliability_score,
    case
      when p.reliability_score >= 90 then 'Excellent'
      when p.reliability_score >= 75 then 'Good'
      when p.reliability_score >= 50 then 'Fair'
      else 'Needs work'
    end as reliability_band,
    (select avg(stars)::numeric(3, 2) from public.ratings where ratee_id = p.id) as rating_avg,
    (select count(*)::int from public.ratings where ratee_id = p.id) as rating_count,
    case
      when auth.uid() is null or auth.uid() = p.id then null
      else (
        select count(distinct g.id)::int
        from public.games g
        where g.status = 'completed'
          and (
            public.is_approved_player(g.id, p.id) or g.organizer_id = p.id
          )
          and (
            public.is_approved_player(g.id, auth.uid()) or g.organizer_id = auth.uid()
          )
      )
    end as games_together,
    (
      select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb)
      from (
        select tag, count(*) as n from public.rating_tags where ratee_id = p.id group by tag
      ) counted
    ) as badge_counts,
    (
      -- Multi-sport ready (profile-plan.md P3): every sport this profile has a tier in, not
      -- just the single hardcoded SPORT_SLUG the rest of the client still assumes.
      select coalesce(jsonb_agg(jsonb_build_object('sport_slug', s.slug, 'tier_label', st.label, 'tier_ordinal', st.ordinal) order by s.slug), '[]'::jsonb)
      from public.profile_sports ps
      join public.sports s on s.id = ps.sport_id
      join public.skill_tiers st on st.id = ps.skill_tier_id
      where ps.profile_id = p.id
    ) as sports
  from public.profiles p
  where p.id = target_id and p.deleted_at is null;
$$;

grant execute on function public.player_card(uuid) to authenticated;
