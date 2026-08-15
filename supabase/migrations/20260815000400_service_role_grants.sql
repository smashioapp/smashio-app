-- Fix: service_role has no PostgREST table grants on the hosted project (found during
-- store-readiness audit, store-readiness-plan.md). service_role bypasses RLS but PostgREST
-- still enforces plain SQL grants, so every ai-proxy / push-dispatch table read via the
-- supabase-js REST client was silently 403ing in production. Local dev didn't show this because
-- `supabase start` seeds broader default grants than the hosted project ended up with.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Cover tables/sequences/functions created after this migration too, not just the ones that
-- exist today — service_role is meant to always have full access, so future migrations
-- shouldn't need to remember to grant it.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
