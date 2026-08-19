-- game_players PK is (game_id, profile_id), so the client's plain insert only ever worked for a
-- true first-time request: a player who left, was rejected, or was removed hit an unrecoverable
-- unique-violation on every retry, and the UI showed the same "Hold to join" button for that
-- state as for a first-time request, with no way to distinguish the two. This RPC lets a prior
-- 'rejected'/'left'/'removed' row reopen back to 'requested'; 'requested'/'approved' rows are
-- left untouched (those states never show the join button client-side, so should never hit this).
create function public.request_to_join(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.game_players (game_id, profile_id, status, requested_at, decided_at)
  values (p_game_id, auth.uid(), 'requested', now(), null)
  on conflict (game_id, profile_id) do update
    set status = 'requested', requested_at = now(), decided_at = null
    where public.game_players.status in ('rejected', 'left', 'removed');
end;
$$;

grant execute on function public.request_to_join(uuid) to authenticated;
