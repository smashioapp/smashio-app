-- Host a Game v3, band 12 (create-game-plan.md "Holding and claiming a spot"). Two real gaps:
--
-- 1. The claim screen needs to show the host and the game BEFORE the recipient has an account
--    (band 12's signed-out landing). Today games/game_reserved_spots are both RLS-gated to
--    `authenticated`, so there is nothing for a signed-out claim link to read. A narrow,
--    security-definer preview function is the fix — it returns only what the claim screen's
--    hero needs, never the full game row, and only while the token is still a live, unclaimed
--    hold.
-- 2. respond_to_game_invite works off invited_profile_id, which a link recipient never has (they
--    were held anonymously, or invited before they had an account) — so "Can't make it, let her
--    know" (band 12) has no RPC to call. decline_reserved_spot(p_token) is that path: token-only,
--    no auth required, matching claim_reserved_spot's own token-only shape.

create or replace function public.preview_reserved_spot_invite(p_token text)
returns table (
  game_id uuid,
  host_name text,
  venue_name text,
  venue_suburb text,
  sport_name text,
  starts_at timestamptz,
  cost_per_player_cents int,
  spot_label text,
  game_status text
)
language sql
stable
security definer set search_path = public
as $$
  select g.id, p.display_name, v.name, v.suburb, s.name, g.starts_at, g.cost_per_player_cents, rs.label, g.status
  from public.game_reserved_spots rs
  join public.games g on g.id = rs.game_id
  join public.profiles p on p.id = g.organizer_id
  join public.venues v on v.id = g.venue_id
  join public.sports s on s.id = g.sport_id
  where rs.invite_token = p_token and rs.claimed_by is null;
$$;

-- anon too — this is the whole point, a signed-out visitor needs to see who and what before
-- being asked to make an account (band 12's signed-out landing).
grant execute on function public.preview_reserved_spot_invite(text) to anon, authenticated;

create or replace function public.decline_reserved_spot(p_token text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_spot_id uuid;
  v_game_id uuid;
  v_organizer uuid;
  v_label text;
begin
  select rs.id, rs.game_id, g.organizer_id, rs.label
  into v_spot_id, v_game_id, v_organizer, v_label
  from public.game_reserved_spots rs
  join public.games g on g.id = rs.game_id
  where rs.invite_token = p_token and rs.claimed_by is null
  for update of rs;

  if v_spot_id is null then
    raise exception 'That invite has already been used or was cancelled';
  end if;

  -- Hands the spot back to the host as an anonymous hold, same shape remove_reserved_spot leaves
  -- a released spot in — the row stays (capacity is unchanged), it just has no invite on it.
  update public.game_reserved_spots
  set invite_token = null, invited_profile_id = null
  where id = v_spot_id;

  perform public.enqueue_notifications(
    'spot_declined', v_game_id, null, array[v_organizer], jsonb_build_object('label', v_label), 'normal', null
  );
end;
$$;

grant execute on function public.decline_reserved_spot(text) to anon, authenticated;
