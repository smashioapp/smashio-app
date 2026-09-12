-- Security audit 2026-09-11, H5: `profile_visibility = 'players_only'` was honoured only inside
-- player_card() and nowhere else. The base `profiles` table's select policy is `using (true)`, so
-- a direct `GET /rest/v1/profiles?select=*` (or any REST/PostgREST call that isn't player_card)
-- fully exposes a players_only user's row to any signed-in stranger, including reliability_score,
-- which player_card is specifically built to withhold from someone who hasn't played with them.
--
-- Fix folds the setting into the row-select policy itself, so it can't be bypassed by querying a
-- different way. A players_only row is now visible only to: the owner, anyone who shares a game
-- with them (co-approved players, or a host/requester pair — same relationship player_card already
-- exempts via its is_restricted check), or anyone at all if they currently have a published public
-- game (hosting is opt-in publicity: the whole point of listing a game is to be found by strangers,
-- so a host's own advertisement stays visible regardless of their players_only setting).
--
-- Known, accepted regressions (surfaced and confirmed before writing this): a players_only profile
-- who hasn't played with you and isn't currently hosting a public game won't show up in the
-- reserved-spot invite search (ui/lib/queries/reservedSpots.ts player_search) or in your referred-
-- friends list (ui/lib/queries/profile.ts) until a shared game exists. Both only ever exposed
-- id/display_name/photo_path, never reputation, but they go through the base table, not player_card,
-- so they're subject to the same policy as everything else querying `profiles` directly.
--
-- security definer + no reference back to profiles inside its body, so calling it from the profiles
-- policy can't recurse into profiles' own RLS.
create function public.shares_a_game_with(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select a is not null and b is not null and (
    a = b
    or exists (
      select 1 from public.games g
      join public.game_players gp on gp.game_id = g.id
      where g.organizer_id = a and gp.profile_id = b and gp.status in ('requested', 'approved')
    )
    or exists (
      select 1 from public.games g
      join public.game_players gp on gp.game_id = g.id
      where g.organizer_id = b and gp.profile_id = a and gp.status in ('requested', 'approved')
    )
    or exists (
      select 1 from public.game_players gp1
      join public.game_players gp2 on gp2.game_id = gp1.game_id
      where gp1.profile_id = a and gp1.status = 'approved'
        and gp2.profile_id = b and gp2.status = 'approved'
    )
  );
$$;

grant execute on function public.shares_a_game_with(uuid, uuid) to authenticated;

drop policy "profiles readable by authenticated" on public.profiles;

create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or profile_visibility = 'everyone'
    or public.shares_a_game_with(id, auth.uid())
    or exists (
      select 1 from public.games g
      where g.organizer_id = profiles.id
        and g.status = 'published'
        and g.visibility = 'public'
    )
  );
