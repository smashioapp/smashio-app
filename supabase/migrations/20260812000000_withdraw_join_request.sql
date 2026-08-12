-- Widen leave_game so a requester can withdraw a pending request, not just leave once approved.
-- Same function, same grant — a player only ever acts on their own row either way.
create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.game_players
  set status = 'left', decided_at = now()
  where game_id = p_game_id and profile_id = auth.uid() and status in ('requested', 'approved');
end;
$$;
