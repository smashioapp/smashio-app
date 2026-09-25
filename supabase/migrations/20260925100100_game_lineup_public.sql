-- Short-a-player UX plan U3, decision D-U2 (docs/short-a-player-ux-plan.md §5): show a signed-in
-- player who's already in a game before they join it. RLS on game_players only lets the organiser
-- and approved members read the roster, so a non-member saw "1 in · 5 open" for a game that was
-- nearly full (F5) and had no way to judge the people (F13). U0 fixed the count with anonymous
-- "Joined" slots; this fills in who they are.
--
-- Per approved player, and only what the join decision needs (message house §2.2, "real level,
-- real players"):
--   first name, avatar (key and photo path), voted level once at least 3 co-players have voted
--   (the same PEER_LEVEL_MIN_VOTES rule the app applies to peer_skill_vote), and a turns-up
--   percentage once they have 3 completed games behind it (TURNS_UP_MIN_GAMES).
--
-- What it keeps out:
--   - anyone blocked either way with the viewer (blocked_between, as player_card does);
--   - anyone with profile_visibility = 'players_only' who hasn't played with the viewer. Those
--     rows are simply omitted and the app draws them as the anonymous "Joined" slots it already
--     pads from approved_count, so the count stays right and nothing leaks;
--   - individual rating rows: aggregate-only reads, as post-game-plan set for ratee-side reads.
--
-- authenticated only. No anon grant: website-plan §5.4 keeps player identities off anonymous
-- surfaces, and the guest game teaser (game_preview) stays identity-free.
--
-- security definer because it has to read game_players past its RLS. It never returns a row for
-- a game the viewer can't otherwise resolve: cancelled/link-only games are still resolvable by
-- id (that's what the link is for, see 20260910000000), so the only filter is the game existing.

create function public.game_lineup_public(p_game_id uuid)
returns table (
  profile_id uuid,
  first_name text,
  avatar_key text,
  photo_path text,
  voted_level text,
  voted_level_votes int,
  turns_up_pct int
)
language sql
stable
security definer set search_path = public
as $$
  select
    p.id as profile_id,
    split_part(trim(p.display_name), ' ', 1) as first_name,
    p.avatar_key,
    p.photo_path,
    case when v.vote_count >= 3 then v.tier_label end as voted_level,
    case when v.vote_count >= 3 then v.vote_count end as voted_level_votes,
    case
      when (
        (select count(*) from public.game_players gp2 join public.games g2 on g2.id = gp2.game_id
          where gp2.profile_id = p.id and gp2.status = 'approved' and g2.status = 'completed')
        + (select count(*) from public.games g3 where g3.organizer_id = p.id and g3.status = 'completed')
      ) >= 3
        then round(greatest(0, least(100, p.reliability_score)))::int
    end as turns_up_pct
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  join public.profiles p on p.id = gp.profile_id
  left join lateral public.peer_skill_vote(p.id) v on true
  where gp.game_id = p_game_id
    and gp.status = 'approved'
    and auth.uid() is not null
    and p.deleted_at is null
    and not public.blocked_between(auth.uid(), p.id)
    and (
      p.id = auth.uid()
      or g.organizer_id = auth.uid()
      or p.profile_visibility = 'everyone'
      or exists (
        select 1 from public.games pg
        where pg.status = 'completed'
          and (public.is_approved_player(pg.id, p.id) or pg.organizer_id = p.id)
          and (public.is_approved_player(pg.id, auth.uid()) or pg.organizer_id = auth.uid())
      )
    )
  order by coalesce(gp.decided_at, gp.requested_at) asc;
$$;

revoke execute on function public.game_lineup_public(uuid) from public;
grant execute on function public.game_lineup_public(uuid) to authenticated;
