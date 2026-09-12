-- The default-privileges revoke added by 20260910070000_rpc_exposure_regression_guard.sql only
-- self-checks (assert_no_public_definer_execute) at the moment that migration's own body runs —
-- i.e. on a full `supabase db reset` replay. A later migration's `supabase db push` against the
-- hosted project never re-runs that assertion, so shares_a_game_with()
-- (20260912000200_profile_visibility_rls.sql) went out PUBLIC-executable regardless, caught by
-- `get_advisors` after the push rather than at push time. Belt-and-braces per that guard's own
-- documented rule: pair any grant with an explicit revoke from public, don't rely on the default
-- privileges timing alone.
revoke execute on function public.shares_a_game_with(uuid, uuid) from public;
