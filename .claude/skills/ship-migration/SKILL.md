---
name: ship-migration
description: Write a Supabase migration and run the local verify loop (db reset, public-definer grant assertion, gen types, tsc). Use when adding or changing anything under supabase/migrations.
argument-hint: "<short_snake_case_name>"
---
# Ship a migration (local only)

Read `.claude/rules/supabase-db.md` and the newest few files in `supabase/migrations/` first; the migrations are the source of truth for shape.

1. **Write** `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Timestamp must sort after the latest existing file. Header comment says which plan doc section it serves.
2. **Grants.** New/recreated functions are executable by nobody in `anon`/`authenticated` (global revoke, 20260914000400). Add explicit `grant execute ... to authenticated` (and `anon` only if the anon path really needs it). Helpers used in RLS policy expressions or invoker triggers need grants too. Signature change = drop + recreate + re-grant. Re-granting to `public` needs a paired `revoke ... from public`.
3. **Replay.** `supabase start` if the stack is down, then `supabase db reset`. Fix until it applies cleanly with seed.
4. **Assert.**
   ```bash
   supabase db query --local "select public.assert_no_public_definer_execute();"
   ```
   Must not raise. This is the same check CI runs.
5. **Types** (only if table/column/function shape changed). Never hand-edit:
   ```bash
   supabase gen types typescript --local > ui/lib/db.types.ts
   ```
6. **Type check.** `cd ui && npx tsc --noEmit`.
7. Report: file name, what changed, assertion result, tsc result.

Do NOT `supabase db push` or touch the hosted project. Hosted push is a separate, user-approved step, and per the short-a-player UX plan `db push` must land before the JS merge that depends on it. Say so in the report when the JS depends on the schema.
