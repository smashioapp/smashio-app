-- website-plan.md W4 — email capture (closes gtm-plan G15). §"P0/T3" pattern followed: no direct
-- anon insert. RLS is enabled with zero policies, so the table is unreachable from PostgREST
-- entirely; the only write path is the security-definer RPC below, which runs as the function
-- owner and therefore bypasses RLS on purpose. Turnstile and double opt-in (DEC7) need a
-- third-party account nobody has opened yet, so this ships plumbing only: a honeypot field is
-- enough to stop the dumbest bots, and `confirmed` sits ready for the day double opt-in exists.

create table public.web_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  suburb text,
  source text not null default 'footer',
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index web_signups_email_unique_idx on public.web_signups (lower(email));

alter table public.web_signups enable row level security;
-- No policies: PostgREST/anon/authenticated have zero direct access. The web_signup() RPC below
-- is the only write path, and nothing reads this table back to a client.

create or replace function public.web_signup(
  p_email text,
  p_suburb text default null,
  p_source text default 'footer',
  p_honeypot text default ''
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
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

-- New functions default to EXECUTE for PUBLIC (the same class of leak fixed in
-- 20260910000000_link_only_visibility.sql's feed_home cleanup) — revoke it before granting the
-- narrower set this actually needs.
revoke execute on function public.web_signup(text, text, text, text) from public;
grant execute on function public.web_signup(text, text, text, text) to anon, authenticated;
