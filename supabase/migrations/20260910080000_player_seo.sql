-- website-plan.md W10 — replaces the player.html stub with a real share-target page. §5.4's PII
-- line is stricter here than anywhere else on the site: display names, handles, avatars and
-- photos are NEVER on an anonymous page, so this RPC cannot just be a trimmed player_card
-- (20260815000100, authenticated-only, returns display_name/photo_path/reliability/ratings).
--
-- What it returns instead is aggregate-only and anonymous by construction: sport slugs, a
-- completed-games count, and the year (not date) the account was created. No name, no photo, no
-- reliability score, no rating, no games_together. profile_visibility gates even that: a
-- 'players_only' profile is for other signed-in players, not anonymous web traffic, so the web
-- card gets the generic "this is a Smashio player" copy with no stats at all.
create or replace function public.player_seo(p_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select case
    when p.id is null then null
    when p.profile_visibility = 'players_only' then jsonb_build_object('exists', true, 'visible', false)
    else jsonb_build_object(
      'exists', true,
      'visible', true,
      'member_since_year', extract(year from p.created_at)::int,
      'games_played', (
        select count(*)::int from public.game_players gp
        join public.games g on g.id = gp.game_id
        where gp.profile_id = p.id and gp.status = 'approved' and g.status = 'completed'
      ),
      'sports', (
        select coalesce(jsonb_agg(distinct s.name order by s.name), '[]'::jsonb)
        from public.profile_sports ps
        join public.sports s on s.id = ps.sport_id
        where ps.profile_id = p.id
      )
    )
  end
  from public.profiles p
  where p.id = p_id and p.deleted_at is null;
$$;

grant execute on function public.player_seo(uuid) to anon, authenticated;
