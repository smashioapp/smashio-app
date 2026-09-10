-- ---------------------------------------------------------------------------------------------
-- RPC exposure plan (docs/rpc-exposure-plan.md), step B1: bucket B.
--
-- 32 security definer functions with no grant to anon or authenticated at all — callable today
-- only because Postgres grants EXECUTE to PUBLIC on every new function, and nothing has ever
-- revoked it. 12 are cron.job dispatchers meant to run only as the postgres job owner
-- (auto_close_stale_chats, complete_past_games, the dispatch_* family, notify_push,
-- recompute_reliability_scores, trigger_purge_confirmations); the rest are internal helpers those
-- dispatchers call. Anyone holding the publishable anon key can call any of them directly today —
-- push-spam every player, force a reliability recompute, close chats out from under active games.
--
-- Two of the 32, approve_join_action and decline_join_action, are reachable only via this same
-- PUBLIC grant but are genuinely called by the app (ui/lib/notifications.ts, the notification tray
-- approve/decline buttons). A blanket revoke breaks them, so they get an explicit grant to
-- authenticated first. Both already check auth.uid() internally.
-- ---------------------------------------------------------------------------------------------

grant execute on function public.approve_join_action(uuid, uuid) to authenticated;
grant execute on function public.decline_join_action(uuid, uuid) to authenticated;

revoke execute on function public.auto_close_stale_chats() from public;
revoke execute on function public.complete_past_games() from public;
revoke execute on function public.dispatch_attendance_prompts() from public;
revoke execute on function public.dispatch_game_reminders() from public;
revoke execute on function public.dispatch_notification_retries() from public;
revoke execute on function public.dispatch_nudge_pending_requests() from public;
revoke execute on function public.dispatch_nudge_underfilled() from public;
revoke execute on function public.dispatch_post_game_prompts() from public;
revoke execute on function public.dispatch_post_reaction_digest() from public;
revoke execute on function public.recompute_reliability_scores() from public;
revoke execute on function public.notify_push(jsonb) from public;
revoke execute on function public.trigger_purge_confirmations(text) from public;

revoke execute on function public.chat_push_recipients(uuid) from public;
revoke execute on function public.delete_push_receipts(text[]) from public;
revoke execute on function public.delete_push_token(text) from public;
revoke execute on function public.enqueue_notifications(text, uuid, uuid, uuid[], jsonb, text, text) from public;
revoke execute on function public.enqueue_post_game_rate(uuid) from public;
revoke execute on function public.filter_quiet_recipients(uuid[]) from public;
revoke execute on function public.notification_pref_enabled(uuid, text) from public;
revoke execute on function public.prune_ready_receipt_batch(integer) from public;
revoke execute on function public.push_actor_name(uuid) from public;
revoke execute on function public.push_actor_summary(uuid, uuid) from public;
revoke execute on function public.push_game_summary(uuid) from public;
revoke execute on function public.push_message_summary(uuid) from public;
revoke execute on function public.push_post_game_recipients(uuid) from public;
revoke execute on function public.push_post_summary(uuid) from public;
revoke execute on function public.push_recipients_for_game(uuid, uuid, boolean, text) from public;
revoke execute on function public.push_recipients_for_host(uuid, text) from public;
revoke execute on function public.recompute_achievements(uuid) from public;
revoke execute on function public.system_close_chat(uuid, uuid) from public;

revoke execute on function public.approve_join_action(uuid, uuid) from public;
revoke execute on function public.decline_join_action(uuid, uuid) from public;
