-- player_seo(uuid) (20260910080000, website-plan W10) was created with only
-- `grant execute ... to anon, authenticated` and no matching revoke from PUBLIC, so it kept the
-- default PUBLIC execute grant. CI's assert_no_public_definer_execute() step has failed on every
-- push to main since 2026-09-10 because of it.
--
-- Why the bare grant didn't restrict it: 20260910070000_rpc_exposure_regression_guard.sql ran
-- `alter default privileges for role postgres in schema public revoke execute on functions from public`.
-- A per-schema default ACL can only add to the global defaults, it cannot take away a privilege the
-- global default grants, and PUBLIC execute on functions is a global default. So that statement is
-- a no-op for PUBLIC; functions postgres creates in public still get it. Until that is fixed, every
-- new security definer function needs its own explicit revoke.
--
-- The intended surface is unchanged: website/api/player/[id].js calls this anonymously through
-- callRpc (publishable key), and the function is aggregate-only and profile_visibility-gated.
revoke execute on function public.player_seo(uuid) from public;
grant execute on function public.player_seo(uuid) to anon, authenticated;
