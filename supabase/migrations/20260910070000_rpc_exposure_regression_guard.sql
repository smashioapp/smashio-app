-- ---------------------------------------------------------------------------------------------
-- RPC exposure plan (docs/rpc-exposure-plan.md), step B5: stop the pattern recurring.
--
-- Buckets A-D (20260910030000 through 20260910060000) closed every security definer function that
-- still held the default PUBLIC execute grant. This is the third time that grant has had to be
-- found and revoked as a one-off (sweep_reserved_spot_holds, feed_home, then the other 93). A
-- fourth requires two things: nothing can create a new PUBLIC-executable definer function without
-- the build failing, and no future migration should get the grant in the first place.
--
-- 1. alter default privileges: the migration role (postgres, both locally and hosted) stops
--    getting a PUBLIC execute grant on functions it creates from here on. A migration that grants
--    only `to authenticated` now actually restricts to authenticated, no separate revoke needed.
-- 2. assert_no_public_definer_execute(): raises with the offending function list if any security
--    definer, non-trigger function in public is still PUBLIC-executable. CI calls this after
--    `supabase db reset` (.github/workflows/ci.yml db-reset job) so a regression fails the build
--    instead of shipping.
-- ---------------------------------------------------------------------------------------------

alter default privileges for role postgres in schema public revoke execute on functions from public;

create or replace function public.assert_no_public_definer_execute()
returns void
language plpgsql
as $$
declare
  offenders text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by 1)
  into offenders
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (
      p.proacl is null
      or exists (
        select 1 from aclexplode(p.proacl) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
    );

  if offenders is not null then
    raise exception 'security definer function(s) still PUBLIC-executable: %. Add an explicit grant plus a matching revoke execute ... from public (see docs/rpc-exposure-plan.md).', offenders;
  end if;
end;
$$;

revoke execute on function public.assert_no_public_definer_execute() from public;
grant execute on function public.assert_no_public_definer_execute() to postgres;

select public.assert_no_public_definer_execute();
