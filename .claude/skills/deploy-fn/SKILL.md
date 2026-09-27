---
name: deploy-fn
description: Deploy a Supabase Edge Function (ai-proxy, push-dispatch, delete-account, purge-confirmations) to the hosted project and check its logs. Use only when the user asks to deploy.
argument-hint: "<function-name>"
disable-model-invocation: true
---
# Deploy an Edge Function (hosted, outward-facing)

Functions live in `supabase/functions/`: `ai-proxy`, `push-dispatch`, `delete-account`, `purge-confirmations`. Argument must be one of these; if missing or unknown, ask.

1. **Confirm target.** This hits the hosted production project. State function name + `git status` of `supabase/functions/<name>` (uncommitted changes?) and get a clear yes before deploying.
2. **JWT mode.** `supabase/config.toml` sets `verify_jwt` per function (some are false and check `auth.getUser()` in the body). The deploy must not change that; do not pass `--no-verify-jwt` unless config.toml already says false.
3. **Deploy.**
   ```bash
   supabase functions deploy <name>
   ```
4. **Check logs** right after. Use the Supabase MCP `get_edge_function` (confirm new version number) and `query_logs` (service `edge-function`) or the dashboard. Look for boot errors, missing secrets (`GEMINI_API_KEY` for ai-proxy), 4xx/5xx on first calls.
5. **Report** the new version number (record it, e.g. "push-dispatch v16") and any errors. If the function change depends on a migration, confirm the migration is already on hosted first.

Secrets: never print them. Set with `supabase secrets set`, only if the user asks.
