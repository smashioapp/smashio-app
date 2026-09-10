-- ---------------------------------------------------------------------------------------------
-- RPC exposure plan (docs/rpc-exposure-plan.md), step B4: bucket D.
--
-- 9 functions granted to authenticated with no internal guard at all (confirmed: none reference
-- auth.uid()). Decided per function, cross-checked against every anon caller in the repo (none
-- touch any of these nine) — all nine stay authenticated-only, no anon grant added:
--
--   - approved_player_count, waitlist_count: computed counts, low-severity anon reach, but nothing
--     needs it anon.
--   - blocked_between, can_rate_in_game, is_approved_player: reveal a relationship between two
--     arbitrary user/game ids — an anon caller could probe who blocked whom or who's approved in a
--     game. Deliberately kept authenticated-only.
--   - notification_unread_count, peer_skill_vote, rating_summary: personal/game data, no anon use.
--   - upsert_places_venue: a security definer WRITE with no auth.uid() check — today anyone with
--     the anon key can insert/overwrite venues. Revoking PUBLIC closes that off entirely (only
--     authenticated can reach it now). It still has no internal ownership guard once authenticated,
--     which is a real gap, but adding one is a venues-plan.md decision, not this migration's — see
--     rpc-exposure-plan.md §8 "Not doing".
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.approved_player_count(uuid) from public;
revoke execute on function public.blocked_between(uuid, uuid) from public;
revoke execute on function public.can_rate_in_game(uuid, uuid) from public;
revoke execute on function public.is_approved_player(uuid, uuid) from public;
revoke execute on function public.notification_unread_count(uuid) from public;
revoke execute on function public.peer_skill_vote(uuid, text) from public;
revoke execute on function public.rating_summary(uuid, text) from public;
revoke execute on function public.upsert_places_venue(text, text, text, text, double precision, double precision, text) from public;
revoke execute on function public.waitlist_count(uuid) from public;
