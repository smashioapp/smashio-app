-- Host flow plan (docs/host-flow-plan.md), P0. Same pg_cron -> pg_net -> edge function pattern
-- as dispatch_game_reminders (20260808000500_push_dispatch.sql): a plpgsql wrapper reads the
-- shared secret from Vault (inserted live, never committed) and no-ops if it isn't configured
-- yet, so a fresh local/CI database doesn't hard-fail on a secret nobody has set.
create or replace function public.trigger_purge_confirmations(p_type text)
returns void
language plpgsql
security definer set search_path = public, vault
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'purge_confirmations_key' limit 1;
  if v_key is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://ajbsvsfwjfeofvjuhzrw.supabase.co/functions/v1/purge-confirmations',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('type', p_type)
  );
end;
$$;

-- Orphan sweep, hourly: a host who bailed mid-wizard leaves nothing behind after 24h.
select cron.schedule('purge-orphan-confirmations', '17 * * * *', $$select public.trigger_purge_confirmations('orphan');$$);

-- Retention purge, daily: receipts carry the host's full name, email, sometimes card last-4 and
-- a home address — holding them forever past the game they verified isn't defensible. 7-day
-- tail after game completion leaves room for disputes.
select cron.schedule('purge-retention-confirmations', '29 3 * * *', $$select public.trigger_purge_confirmations('retention');$$);
