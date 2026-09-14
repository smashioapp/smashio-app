-- web_signup() now reports whether it recorded a brand-new address.
--
-- website/api/subscribe.js sends two emails per signup: an internal notify to hello@smashio.com.au
-- and a confirmation to the signer. Before this, a repeat signup from an address already on the list
-- re-sent both, because the RPC returned void and the function had no way to tell. Decided
-- 2026-09-14: a repeat signup gets the same `{ ok: true }` response (the endpoint must never reveal
-- whether an address is already on the list), but no email is sent again. So the RPC returns true
-- only when it inserted a row, and subscribe.js sends only on true.
--
-- Returns false for: a repeat address (suburb still updated when a new one is supplied, same as
-- before), and a honeypot hit (still silent, no exception). Still raises for the rate limit and an
-- invalid email. Check order unchanged: rate limit first, so honeypot floods are still capped.
--
-- New-row detection uses `on conflict do nothing returning` plus FOUND rather than the
-- `returning (xmax = 0)` trick on an upsert, which leans on an undocumented system-column detail.
-- A concurrent insert of the same address loses the race cleanly: its insert does nothing, it
-- reports false, and it falls through to the suburb update.
--
-- Grants: a return type change needs drop + create, and a recreated function takes the default ACL.
-- Since 20260914000400_default_privileges_global_revoke.sql that default is postgres + service_role
-- only, which is already what 20260912000700_web_signup_hardening.sql left this function with. The
-- revoke/grant below is explicit anyway so this file doesn't depend on that default staying put.
-- Deploy order: this migration must be live before the subscribe.js that reads the boolean ships,
-- though the old subscribe.js ignores the return value so it keeps working against this one.

drop function public.web_signup(text, text, text, text, text);

create function public.web_signup(
  p_email text,
  p_suburb text default null,
  p_source text default 'footer',
  p_honeypot text default '',
  p_ip text default null
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_recent int;
  v_email text := lower(trim(p_email));
  v_suburb text := nullif(trim(coalesce(p_suburb, '')), '');
  v_inserted boolean;
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
    return false;
  end if;

  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  insert into public.web_signups (email, suburb, source)
  values (v_email, v_suburb, coalesce(nullif(trim(p_source), ''), 'footer'))
  on conflict (lower(email)) do nothing
  returning true into v_inserted;

  if found then
    return true;
  end if;

  if v_suburb is not null then
    update public.web_signups set suburb = v_suburb where lower(email) = v_email;
  end if;

  return false;
end;
$$;

revoke execute on function public.web_signup(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.web_signup(text, text, text, text, text) to service_role;
