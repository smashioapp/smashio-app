-- M4 (security-audit-2026-09-11.md): checkRateLimits() only guards the parse/legacy branch of
-- ai-proxy. The client-facing classify branch (mode: 'classify' with a user JWT, distinct from
-- the server-to-server path create_post already uses) returned before it, so any authenticated
-- caller could loop classify calls to burn Gemini quota and, on every timeout/error, flood
-- moderation_flags with their own text (fail-open by design, per that table's own comment).
--
-- service_role only, same shape as moderation_flags — the edge function is the sole reader/writer.
create table public.ai_proxy_classify_calls (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_proxy_classify_calls_profile_idx on public.ai_proxy_classify_calls(profile_id, created_at desc);

alter table public.ai_proxy_classify_calls enable row level security;
revoke all on public.ai_proxy_classify_calls from anon, authenticated;
grant all on public.ai_proxy_classify_calls to service_role;

-- Old rows are pure rate-limit bookkeeping, not an audit trail worth keeping — purge-confirmations
-- already runs on a schedule for the analogous game_confirmations cleanup, but a lightweight
-- self-trimming function keeps this table from growing unbounded without adding a second cron.
create function public.prune_ai_proxy_classify_calls()
returns void
language sql
security definer set search_path = public
as $$
  delete from public.ai_proxy_classify_calls where created_at < now() - interval '1 day';
$$;

revoke all on function public.prune_ai_proxy_classify_calls() from public;
grant execute on function public.prune_ai_proxy_classify_calls() to service_role;

select cron.schedule('prune-ai-proxy-classify-calls', '11 4 * * *', $$select public.prune_ai_proxy_classify_calls();$$);
