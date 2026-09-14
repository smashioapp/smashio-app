-- M6 (security-audit-2026-09-11.md): two separate holes.
--
-- 1. web_signup() was granted to `anon`, but the "client never gets a direct insert path" claim
--    in subscribe.js's own header comment was never actually true: the anon/publishable key is
--    public by construction (it ships in the mobile app bundle and is hardcoded in
--    website/api/_venue-lib.js), so anyone holding it could call the RPC over PostgREST directly,
--    skipping the honeypot and any rate limit subscribe.js adds. Fix: only service_role may call
--    it now. website/api/subscribe.js switches to a service-role key held in a Vercel env var
--    (SUPABASE_SERVICE_ROLE_KEY, not yet set — see PR notes) instead of the shared anon key every
--    other website RPC still legitimately uses for public reads.
-- 2. No rate limit anywhere in front of the endpoint, and every accepted submission fires a
--    Resend email to hello@smashio.com.au — a script cycling through addresses is a mail-flood
--    amplifier pointed at the inbox and burns Resend quota. In-memory limiting doesn't work here
--    (Vercel functions are stateless per-instance — geocode.js's lastCallAt bucket has the same
--    gap), so this counts attempts in Postgres, keyed on IP, and checks it before the honeypot
--    check so a flood of honeypot-tripped requests still gets capped.

create table public.web_signup_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);

create index web_signup_attempts_ip_idx on public.web_signup_attempts(ip, created_at desc);

alter table public.web_signup_attempts enable row level security;
revoke all on public.web_signup_attempts from anon, authenticated;
grant all on public.web_signup_attempts to service_role;

create function public.prune_web_signup_attempts()
returns void
language sql
security definer set search_path = public
as $$
  delete from public.web_signup_attempts where created_at < now() - interval '1 day';
$$;

revoke all on function public.prune_web_signup_attempts() from public;
grant execute on function public.prune_web_signup_attempts() to service_role;

select cron.schedule('prune-web-signup-attempts', '23 4 * * *', $$select public.prune_web_signup_attempts();$$);

create or replace function public.web_signup(
  p_email text,
  p_suburb text default null,
  p_source text default 'footer',
  p_honeypot text default '',
  p_ip text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_recent int;
begin
  if p_ip is not null then
    insert into public.web_signup_attempts (ip) values (p_ip);

    select count(*) into v_recent
    from public.web_signup_attempts
    where ip = p_ip and created_at >= now() - interval '1 hour';

    if v_recent > 5 then
      raise exception 'Too many signups from this address, try again later';
    end if;
  end if;

  -- Honeypot: a real visitor never fills this hidden field. Return silently rather than raising,
  -- so a bot gets no signal that it tripped anything.
  if p_honeypot is not null and length(trim(p_honeypot)) > 0 then
    return;
  end if;

  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  insert into public.web_signups (email, suburb, source)
  values (lower(trim(p_email)), nullif(trim(coalesce(p_suburb, '')), ''), coalesce(nullif(trim(p_source), ''), 'footer'))
  on conflict (lower(email)) do update
    set suburb = coalesce(excluded.suburb, public.web_signups.suburb);
end;
$$;

-- Drop the old 4-arg overload outright rather than leave it stripped of grants but still present
-- (the feed_home 7-arg overload in 20260910000000_link_only_visibility.sql shows why a stray
-- overload left lying around is worth avoiding on its own).
drop function if exists public.web_signup(text, text, text, text);

revoke execute on function public.web_signup(text, text, text, text, text) from public;
grant execute on function public.web_signup(text, text, text, text, text) to service_role;
