-- fill-the-spot P3 (F12): the fill tracker. A host with an open spot used to see nothing while
-- they waited. This gives them three honest numbers (pinged, had a look, keen) and, once it
-- fills, how long it took. Counts only: viewers are never named to the host (ultraplan §8, D6).

-- ---------------------------------------------------------------------------------------------
-- game_views: one row per (game, viewer). Service-side only, like spot_openings: RLS on, no
-- policies, no grants. Written through record_game_view, read through game_fill_status.
-- ---------------------------------------------------------------------------------------------

create table public.game_views (
  game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

alter table public.game_views enable row level security;

create function public.record_game_view(p_game_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.game_views (game_id, profile_id)
  select g.id, auth.uid()
  from public.games g
  where g.id = p_game_id
    and auth.uid() is not null
    and g.organizer_id <> auth.uid()
  on conflict do nothing;
$$;

grant execute on function public.record_game_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- game_fill_status: organizer only.
--   pinged          players told by spot alerts so far (all rings)
--   viewed          distinct people who opened the game (host excluded)
--   keen            asked, joined or waitlisted (host excluded)
--   open_spots      what's still open right now
--   filled_seconds  publish to last approval, only once nothing is open
-- ---------------------------------------------------------------------------------------------

create function public.game_fill_status(p_game_id uuid)
returns table (pinged int, viewed int, keen int, open_spots int, filled_seconds int)
language sql
stable
security definer set search_path = public
as $$
  select
    coalesce((select sum(o.recipients) from public.spot_openings o where o.game_id = g.id), 0)::int,
    (select count(*) from public.game_views v where v.game_id = g.id)::int,
    (select count(*) from public.game_players gp
      where gp.game_id = g.id and gp.profile_id <> g.organizer_id and gp.status in ('approved', 'requested', 'waitlisted'))::int,
    public.open_spots(g.id),
    case
      when public.open_spots(g.id) = 0 then
        (select greatest(0, extract(epoch from (max(gp.decided_at) - g.created_at)))::int
         from public.game_players gp
         where gp.game_id = g.id and gp.status = 'approved' and gp.decided_at is not null)
      else null
    end
  from public.games g
  where g.id = p_game_id and g.organizer_id = auth.uid();
$$;

grant execute on function public.game_fill_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- P3.3: T-3h "still short" host nudge. One per game, only while a spot is open. Replaces the
-- generic "N spots still open" copy for the last stretch with something the host can act on
-- (the push carries a "Ping wider" action that calls find_a_sub).
-- ---------------------------------------------------------------------------------------------

alter table public.games add column still_short_nudge_at timestamptz;

create function public.dispatch_still_short()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select g.id, g.organizer_id
    from public.games g
    where g.status = 'published'
      and g.still_short_nudge_at is null
      and public.open_spots(g.id) > 0
      and g.starts_at > now() + interval '45 minutes'
      and g.starts_at <= now() + interval '3 hours'
  loop
    perform public.enqueue_notifications(
      'still_short', r.id, null, array[r.organizer_id], '{}'::jsonb, 'normal', null
    );
    update public.games set still_short_nudge_at = now() where id = r.id;
  end loop;
end;
$$;

revoke execute on function public.dispatch_still_short() from public;

select cron.schedule('dispatch-still-short', '*/15 * * * *', $$select public.dispatch_still_short();$$);
