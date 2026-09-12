-- Security audit 2026-09-11, H3: the update grant on public.games was table-wide, so
-- 'games update own' (row-level: organizer_id = auth.uid()) let a host PATCH verification_status
-- (or any other column, e.g. organizer_id) straight over REST with no receipt and no Edge
-- Function involved. Narrow the grant to the columns a host actually edits from the app
-- (ui/lib/queries/games.ts useUpdateGame + the cancel mutation), and add a trigger as a second
-- line of defence so a future column added to this grant list can't reopen the hole.

-- The app itself creates games through public.create_game_with_spots (security definer, runs as
-- postgres, unaffected by grants on authenticated), but supabase/tests/games_rls_test.sql exercises
-- a direct table insert as a supported path in its own right, so narrow rather than revoke: an
-- insert grant this wide let a caller `POST /rest/v1/games` a row with verification_status already
-- 'verified', skipping the whole receipt-upload flow entirely (same class of bug as the update
-- grant below, just at creation time instead of after).
revoke insert on public.games from authenticated;

grant insert (
  sport_id, venue_id, organizer_id, starts_at, ends_at, court_label, skill_tier_id,
  skill_tier_max_id, max_players, courts_booked, duration_minutes, cost_per_player_cents,
  reserved_spots, format_id, visibility, auto_approve, shuttles, notes, cover_key
) on public.games to authenticated;

revoke update on public.games from authenticated;

grant update (
  starts_at, ends_at, court_label, skill_tier_id, skill_tier_max_id,
  max_players, courts_booked, duration_minutes, cost_per_player_cents,
  reserved_spots, format_id, visibility, auto_approve, shuttles, notes, status
) on public.games to authenticated;

-- Belt-and-braces: even if a later migration widens the grant again, these columns only ever
-- move via a security definer / service-role path (create_game_with_spots at insert time, the
-- ai-proxy verification flow for verification_status) and must never move on a client-originated
-- update.
create or replace function public.protect_games_system_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Blocklist the two PostgREST-facing roles rather than allowlisting service_role: keeps this
  -- safe against any future internal caller that isn't literally service_role (e.g. a postgres-run
  -- cron job), while still stopping every client-originated update.
  if coalesce(current_setting('role', true), '') in ('authenticated', 'anon') then
    new.verification_status := old.verification_status;
    new.organizer_id := old.organizer_id;
    new.sport_id := old.sport_id;
    new.venue_id := old.venue_id;
  end if;
  return new;
end;
$$;

create trigger games_protect_system_columns
  before update on public.games
  for each row execute function public.protect_games_system_columns();
