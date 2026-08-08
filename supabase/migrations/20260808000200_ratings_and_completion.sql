-- Slice 6: post-game. Auto-complete cron, ratings, reliability placeholder.

create table public.ratings (
  game_id uuid not null references public.games(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique (game_id, rater_id, ratee_id)
);

create index ratings_ratee_id_idx on public.ratings (ratee_id);

alter table public.ratings enable row level security;

-- Reuses is_approved_player from slice 4 so this doesn't self-reference game_players either.
create policy "ratings insert self as rater, co-player only, game completed" on public.ratings
  for insert to authenticated
  with check (
    rater_id = auth.uid()
    and rater_id <> ratee_id
    and exists (select 1 from public.games g where g.id = ratings.game_id and g.status = 'completed')
    and public.is_approved_player(ratings.game_id, auth.uid())
    and public.is_approved_player(ratings.game_id, ratee_id)
  );

create policy "ratings readable by rater and ratee" on public.ratings
  for select to authenticated using (rater_id = auth.uid() or ratee_id = auth.uid());

grant select, insert on public.ratings to authenticated;

-- Hourly: games past ends_at flip to completed, unlocking the rating flow client-side. No
-- client-side status transition to 'completed' exists per the games RLS — this cron is the
-- only writer.
create index games_status_ends_at_idx on public.games (status, ends_at);

create extension if not exists pg_cron;

create or replace function public.complete_past_games()
returns void
language sql
security definer set search_path = public
as $$
  update public.games set status = 'completed' where status = 'published' and ends_at < now();
$$;

select cron.schedule('complete-past-games', '0 * * * *', $$select public.complete_past_games();$$);

-- Nightly: placeholder reliability formula, isolated in one function so it can change
-- without touching anything else per backend-plan.md's open question. Current formula:
-- 100 minus 5 per late leave (approved -> left recorded after the game already started),
-- floored at 0. No-show/rating signal folds in once that data exists.
create or replace function public.recompute_reliability_scores()
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles p
  set reliability_score = greatest(0, 100 - 5 * coalesce(late_leaves.n, 0))
  from (
    select gp.profile_id, count(*) as n
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    where gp.status = 'left' and gp.decided_at > g.starts_at
    group by gp.profile_id
  ) late_leaves
  where p.id = late_leaves.profile_id;

  update public.profiles p
  set reliability_score = 100
  where reliability_score <> 100
    and not exists (
      select 1 from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.profile_id = p.id and gp.status = 'left' and gp.decided_at > g.starts_at
    );
$$;

select cron.schedule('recompute-reliability', '0 3 * * *', $$select public.recompute_reliability_scores();$$);
