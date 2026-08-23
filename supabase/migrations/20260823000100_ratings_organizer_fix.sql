-- Bug found live (post-game rate submit failing for every host): is_approved_player only
-- checks game_players, but organizers never get a game_players row (confirmed 0 rows across
-- every game in prod). Hosts could never rate players, and players could never rate the host.
-- Same organizer-or-approved-player pattern already used by chat_redesign/player_card/
-- profile_settings RLS.

drop policy "ratings insert self as rater, co-player only, game completed" on public.ratings;

create policy "ratings insert self as rater, co-player only, game completed" on public.ratings
  for insert to authenticated
  with check (
    rater_id = auth.uid()
    and rater_id <> ratee_id
    and exists (select 1 from public.games g where g.id = ratings.game_id and g.status = 'completed')
    and exists (
      select 1 from public.games g
      where g.id = ratings.game_id
        and (public.is_approved_player(ratings.game_id, auth.uid()) or g.organizer_id = auth.uid())
    )
    and exists (
      select 1 from public.games g
      where g.id = ratings.game_id
        and (public.is_approved_player(ratings.game_id, ratee_id) or g.organizer_id = ratee_id)
    )
  );

drop policy "rating_tags insert self as rater, co-player only, game completed" on public.rating_tags;

create policy "rating_tags insert self as rater, co-player only, game completed" on public.rating_tags
  for insert to authenticated
  with check (
    rater_id = auth.uid()
    and rater_id <> ratee_id
    and exists (select 1 from public.games g where g.id = rating_tags.game_id and g.status = 'completed')
    and exists (
      select 1 from public.games g
      where g.id = rating_tags.game_id
        and (public.is_approved_player(rating_tags.game_id, auth.uid()) or g.organizer_id = auth.uid())
    )
    and exists (
      select 1 from public.games g
      where g.id = rating_tags.game_id
        and (public.is_approved_player(rating_tags.game_id, ratee_id) or g.organizer_id = ratee_id)
    )
  );
