-- ---------------------------------------------------------------------------------------------
-- RPC exposure plan (docs/rpc-exposure-plan.md), step B3: bucket C.
--
-- 42 functions granted to authenticated that also check auth.uid() (directly, or via
-- assert_is_organizer / is_approved_player / blocked_between / can_post_in_chat) before doing
-- anything. Called as anon, auth.uid() is null and each one raises or returns nothing today — the
-- PUBLIC grant currently buys an anon caller nothing but a confirmed guard error. Verified by
-- reading pg_get_functiondef for all 42: every one references a guard. Revoking PUBLIC just
-- removes the redundant surface; authenticated behaviour is unchanged.
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.accept_reply(uuid, uuid) from public;
revoke execute on function public.add_reserved_spot(uuid, text) from public;
revoke execute on function public.approve_chat_photo(uuid) from public;
revoke execute on function public.assert_is_organizer(uuid) from public;
revoke execute on function public.can_post_in_chat(uuid, uuid) from public;
revoke execute on function public.chat_threads() from public;
revoke execute on function public.claim_reserved_spot(text) from public;
revoke execute on function public.close_chat(uuid) from public;
revoke execute on function public.create_game_with_spots(uuid, uuid, uuid, timestamptz, integer, integer, integer, integer, text, uuid, uuid, text, boolean, text, text, text, jsonb) from public;
revoke execute on function public.create_post(text, text, uuid, timestamptz, text, integer) from public;
revoke execute on function public.create_reply(uuid, text) from public;
revoke execute on function public.create_reserved_spot_invite(uuid) from public;
revoke execute on function public.decide_join_request(uuid, uuid, boolean) from public;
revoke execute on function public.delete_message(uuid) from public;
revoke execute on function public.followers_of(uuid) from public;
revoke execute on function public.following_of(uuid) from public;
revoke execute on function public.invite_to_reserved_spot(uuid, uuid) from public;
revoke execute on function public.leave_game(uuid) from public;
revoke execute on function public.list_replies(uuid) from public;
revoke execute on function public.mark_attendance(uuid, uuid[]) from public;
revoke execute on function public.my_reacted_post_ids(uuid[]) from public;
revoke execute on function public.player_card(uuid) from public;
revoke execute on function public.post_game_roster(uuid) from public;
revoke execute on function public.recent_coplayers(uuid) from public;
revoke execute on function public.remove_player(uuid, uuid) from public;
revoke execute on function public.remove_reserved_spot(uuid) from public;
revoke execute on function public.rename_reserved_spot(uuid, text) from public;
revoke execute on function public.report_content(text, uuid, uuid, text, text) from public;
revoke execute on function public.report_user(uuid, text, text, uuid) from public;
revoke execute on function public.report_venue_correction(uuid, text, text, text) from public;
revoke execute on function public.request_to_join(uuid) from public;
revoke execute on function public.respond_to_game_invite(uuid, boolean) from public;
revoke execute on function public.send_chat_reply(uuid, uuid, text) from public;
revoke execute on function public.set_chat_broadcast_settings(uuid, timestamptz, boolean) from public;
revoke execute on function public.set_chat_mode(uuid, text) from public;
revoke execute on function public.set_home_point(double precision, double precision) from public;
revoke execute on function public.set_player_chat_mute(uuid, uuid, boolean) from public;
revoke execute on function public.set_reserved_spot_expiry(uuid, numeric, boolean) from public;
revoke execute on function public.suggested_players_to_follow(double precision, double precision, double precision, integer) from public;
revoke execute on function public.toggle_message_reaction(uuid, text) from public;
revoke execute on function public.toggle_reaction(uuid) from public;
revoke execute on function public.waitlist_position(uuid) from public;
