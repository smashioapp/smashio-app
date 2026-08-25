-- Chat list cover art (avatars-plan.md P4, cheap partial unpark): chat_threads() carries
-- games.cover_key so the messages tab can render a distinct cover instead of the same
-- ShuttlecockGlyph on every row.

drop function if exists public.chat_threads();

create function public.chat_threads()
returns table (
  game_id uuid,
  venue_name text,
  starts_at timestamptz,
  game_status text,
  chat_closed_at timestamptz,
  last_message_body text,
  last_message_kind text,
  last_message_sender_name text,
  last_message_sender_is_me boolean,
  last_message_at timestamptz,
  unread_count int,
  cover_key text
)
language sql stable security definer set search_path = public as $$
  with my_games as (
    select gp.game_id from public.game_players gp
    where gp.profile_id = auth.uid() and gp.status = 'approved'
    union
    select g.id from public.games g where g.organizer_id = auth.uid()
  ),
  last_msg as (
    select distinct on (m.game_id) m.game_id, m.body, m.kind, m.sender_id, m.created_at
    from public.messages m
    where m.game_id in (select game_id from my_games) and m.deleted_at is null
    order by m.game_id, m.created_at desc
  ),
  unread as (
    select m.game_id, count(*)::int as unread_count
    from public.messages m
    left join public.message_reads mr on mr.game_id = m.game_id and mr.profile_id = auth.uid()
    where m.game_id in (select game_id from my_games)
      and m.deleted_at is null
      and m.sender_id is distinct from auth.uid()
      and m.kind is distinct from 'system'
      and (mr.last_read_at is null or m.created_at > mr.last_read_at)
    group by m.game_id
  )
  select
    g.id,
    v.name,
    g.starts_at,
    g.status,
    g.chat_closed_at,
    lm.body,
    lm.kind,
    coalesce(sp.display_name, 'Player'),
    lm.sender_id = auth.uid(),
    lm.created_at,
    coalesce(u.unread_count, 0),
    g.cover_key
  from my_games mg
  join public.games g on g.id = mg.game_id
  join public.venues v on v.id = g.venue_id
  left join last_msg lm on lm.game_id = g.id
  left join public.profiles sp on sp.id = lm.sender_id
  left join unread u on u.game_id = g.id
  order by coalesce(lm.created_at, g.created_at) desc;
$$;

grant execute on function public.chat_threads() to authenticated;
