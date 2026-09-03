-- security-review finding: `grant execute ... to service_role` in the previous migration is
-- additive, it doesn't remove the default PUBLIC execute grant every new function gets. So
-- sweep_reserved_spot_holds() was callable by anon via /rest/v1/rpc/sweep_reserved_spot_holds —
-- anyone with the (public) anon key could force an early release + nudge-spam sweep across every
-- game on demand. It has no auth check inside it (it's meant to run from cron only), so PUBLIC
-- must be revoked explicitly, not just left ungranted to authenticated.
revoke execute on function public.sweep_reserved_spot_holds() from public;
