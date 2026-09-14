-- ---------------------------------------------------------------------------------------------
-- RPC exposure plan (docs/rpc-exposure-plan.md), B5 correction: make the default-privileges revoke
-- actually do something.
--
-- 20260910070000_rpc_exposure_regression_guard.sql ran
--   alter default privileges for role postgres in schema public revoke execute on functions from public;
-- and its header claims that from then on "a migration that grants only `to authenticated` now
-- actually restricts to authenticated". That claim is false, and the file can't be edited because
-- it is already applied locally and on the hosted project.
--
-- Why it was a no-op: a per-schema default ACL (pg_default_acl row with a real defaclnamespace) can
-- only add privileges on top of the global default for that role, it cannot take one away. PUBLIC
-- execute on functions is part of the global (built-in) default. So the IN SCHEMA revoke left the
-- schema-scoped row as {postgres=X, service_role=X} and changed nothing for PUBLIC. There was no
-- global (defaclnamespace = 0) row for postgres at all. Proof: public.player_seo(uuid), created in
-- 20260910080000 with only `grant ... to anon, authenticated`, came out with `=X/postgres` both
-- locally and on hosted, which failed CI's assert_no_public_definer_execute() from 2026-09-10 until
-- 20260914000300 revoked it per-function.
--
-- The fix is the global form (no IN SCHEMA). That writes a defaclnamespace = 0 row for postgres
-- whose ACL omits PUBLIC, which does replace the built-in default.
--
-- What this changes, for functions postgres creates from now on (existing functions keep their
-- current ACLs, nothing already applied is touched):
--
-- * New functions in public get EXECUTE for postgres (owner) and service_role (the schema default
--   from 20260815000400_service_role_grants.sql) and nobody else. anon and authenticated need an
--   explicit grant. That includes security invoker functions called from the client, and any helper
--   called inside an RLS policy expression: policy expressions run with the querying role's
--   privileges, so a policy calling a function authenticated can't execute fails every query on the
--   table with "permission denied for function". The five current policy helpers (blocked_between,
--   can_post_in_chat, can_rate_in_game, is_approved_player, shares_a_game_with) already carry
--   explicit authenticated grants, so they are unaffected.
-- * A security definer function calling another function checks privileges as its owner (postgres),
--   so internal helpers only ever called from definer functions or cron (cron.job runs as postgres)
--   still work with no grant. Trigger functions themselves are not privilege-checked when they fire,
--   but a security invoker trigger body runs as the role doing the write, so any function it calls
--   needs a grant to that role (profiles_set_referral_code() calling generate_referral_code() is the
--   live example of this shape).
-- * `create or replace function` on an existing function keeps its ACL. `drop function` then
--   `create function` (e.g. a signature change) creates a new function with the new defaults. Three
--   security invoker functions in public currently hold EXECUTE only through PUBLIC
--   (achievement_week_streak(uuid), generate_referral_code(), time_in_window(time,time,time)); if
--   one is ever dropped and recreated, re-grant whatever caller actually needs it.
-- * Other schemas: postgres creates no functions outside public today (extensions, cron, net and
--   vault functions are owned by supabase_admin, so extension installs are unaffected). A function
--   postgres creates in a new schema (e.g. a `private` helper schema) would get owner-only EXECUTE.
--   storage carries a platform schema default for postgres that adds anon/authenticated/service_role,
--   so a postgres-created function there still gets those explicitly, just not via PUBLIC.
--
-- The IN SCHEMA revoke from 20260910070000 stays in place; it is harmless. The CI assertion is
-- still the guard that matters, this just stops new migrations tripping it.
-- ---------------------------------------------------------------------------------------------

alter default privileges for role postgres revoke execute on functions from public;

-- Self-check, so a db reset fails if this ever stops working: create a probe function as postgres
-- and confirm it did not pick up a PUBLIC execute entry.
do $$
declare
  probe_acl aclitem[];
begin
  if not exists (
    select 1 from pg_default_acl
    where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f'
  ) then
    raise exception 'global default ACL for postgres functions is missing';
  end if;

  create function public.__default_acl_probe() returns void language sql security definer as 'select';
  select proacl into probe_acl from pg_proc where oid = 'public.__default_acl_probe()'::regprocedure;
  drop function public.__default_acl_probe();

  if probe_acl is null or exists (
    select 1 from aclexplode(probe_acl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'new functions still get PUBLIC execute (proacl: %)', probe_acl;
  end if;
end;
$$;
