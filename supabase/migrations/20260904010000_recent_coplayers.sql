-- design-brief.md Prompt 7a's "Invite from last game" quick-invite chip (game detail redesign,
-- artboard 13, host UPCOMING page). The host picks someone who's played with them before instead
-- of typing a name-prefix search from scratch. Organizer-only, security definer so it can read
-- across the host's own past games' rosters without opening game_players' RLS to cross-game reads.
create function public.recent_coplayers(p_game_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  avatar_key text,
  photo_path text,
  last_played_at timestamptz
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_organizer_id uuid;
begin
  select organizer_id into v_organizer_id from public.games where id = p_game_id;

  if v_organizer_id is null then
    raise exception 'Game not found';
  end if;
  if v_organizer_id <> auth.uid() then
    raise exception 'Only the organizer can look up past players';
  end if;

  return query
  select * from (
    select distinct on (gp.profile_id)
      gp.profile_id,
      p.display_name,
      p.avatar_key,
      p.photo_path,
      g.starts_at as last_played_at
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    join public.profiles p on p.id = gp.profile_id
    where g.organizer_id = v_organizer_id
      and g.id <> p_game_id
      and gp.status = 'approved'
      and p.deleted_at is null
      and gp.profile_id not in (
        select profile_id from public.game_players
        where game_id = p_game_id and status in ('requested', 'invited', 'approved', 'waitlisted')
      )
      and gp.profile_id not in (
        select invited_profile_id from public.game_reserved_spots
        where game_id = p_game_id and invited_profile_id is not null
        union
        select claimed_by from public.game_reserved_spots
        where game_id = p_game_id and claimed_by is not null
      )
    order by gp.profile_id, g.starts_at desc
  ) recent
  order by recent.last_played_at desc
  limit 8;
end;
$$;

grant execute on function public.recent_coplayers(uuid) to authenticated;
