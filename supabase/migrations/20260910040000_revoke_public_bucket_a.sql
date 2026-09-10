-- ---------------------------------------------------------------------------------------------
-- RPC exposure plan (docs/rpc-exposure-plan.md), step B2: bucket A.
--
-- These already carry an explicit grant to anon, so revoking PUBLIC changes nothing about who can
-- call them — it just removes a redundant grant and puts the intended anon surface in one list.
-- Cross-checked against every anon caller in the repo: website/api/* calls the *_seo_* and
-- post_preview/game_preview functions, ui/lib/queries/games.ts calls nearby_games_public and
-- game_preview in the signed-out state.
--
-- games_seo_at_venue, games_seo_feed and city_seo_stats aren't in the original 12-name list in
-- rpc-exposure-plan.md §2 — they landed in 20260910010000_games_seo_feed.sql, written the same day
-- as the plan, already correctly anon-granted but with the same unrevoked PUBLIC grant. Belong here.
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.claimed_reserved_count(uuid) from public;
revoke execute on function public.club_seo_detail(text) from public;
revoke execute on function public.club_seo_directory() from public;
revoke execute on function public.decline_reserved_spot(text) from public;
revoke execute on function public.game_preview(uuid) from public;
revoke execute on function public.nearby_games_public(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, integer, text, text[]) from public;
revoke execute on function public.open_rateable_count(uuid) from public;
revoke execute on function public.open_spots(uuid) from public;
revoke execute on function public.post_preview(uuid) from public;
revoke execute on function public.preview_reserved_spot_invite(text) from public;
revoke execute on function public.venue_seo_detail(text) from public;
revoke execute on function public.venue_seo_directory() from public;

revoke execute on function public.games_seo_at_venue(text, integer) from public;
revoke execute on function public.games_seo_feed(text, timestamptz, timestamptz, integer) from public;
revoke execute on function public.city_seo_stats() from public;
