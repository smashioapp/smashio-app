---
paths:
  - "supabase/migrations/**"
  - "supabase/functions/**"
---
# Supabase migrations / RPC exposure

- Postgres grants `EXECUTE` to `PUBLIC` on new functions. Since `20260914000400_default_privileges_global_revoke.sql`, functions created by `postgres` are executable only by `postgres` + `service_role`. So a new function is callable by **nobody** in `anon`/`authenticated` until you grant it: RPCs (incl. security invoker), helpers used in RLS policy expressions, helpers called from security invoker trigger bodies.
- Drop+recreate (signature change) resets grants to the new default.
- If creating as a different role, or re-granting to `public`, pair with `revoke execute on function ... from public`.
- CI fails `supabase db reset` if any `security definer` fn in `public` is PUBLIC-executable (`select public.assert_no_public_definer_execute();`). See [docs/rpc-exposure-plan.md](../../docs/rpc-exposure-plan.md).
- After a shape change: `supabase gen types typescript --local > ui/lib/db.types.ts`.
