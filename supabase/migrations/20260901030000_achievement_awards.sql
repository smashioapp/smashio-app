-- social-plan.md B0.5 (§13.6 step 2): §4's "Ravi hit 10 games hosted" system post needs an
-- award event to fire on, and §0.1 corrected the assumption that achievements were already
-- computed — ui/lib/achievements.ts is a pure client-side check(ctx), no table, no awarded-at,
-- no server event. This is that table. Server becomes the single source of truth (§17.1);
-- ui/lib/achievements.ts keeps its labels/icons but renders awarded rows, not a live check().

create table public.achievement_awards (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  awarded_at timestamptz not null default now(),
  primary key (profile_id, achievement_id)
);

create index achievement_awards_profile_idx on public.achievement_awards(profile_id);

alter table public.achievement_awards enable row level security;
create policy "achievement_awards self read" on public.achievement_awards for select to authenticated using (profile_id = auth.uid());
grant select on public.achievement_awards to authenticated;
-- No insert/update/delete policy for authenticated — awards are written only by
-- recompute_achievements, security definer, triggered off real events below.

-- Mirrors ui/lib/format.ts computeWeekStreak: distinct Monday-of-week buckets, counted back from
-- the most recent one as long as they're unbroken, and only if the most recent bucket is this
-- week or last week. date_trunc('week', ...) is Postgres's own Monday-start bucket, same as
-- mondayOfWeek() there.
create function public.achievement_week_streak(p_profile_id uuid)
returns int
language sql
stable
as $$
  with weeks as (
    select distinct date_trunc('week', g.starts_at)::date as wk
    from public.games g
    where g.status = 'completed' and g.organizer_id = p_profile_id
    union
    select distinct date_trunc('week', g.starts_at)::date as wk
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    where gp.profile_id = p_profile_id and gp.status = 'approved' and g.status = 'completed'
  ),
  latest as (
    select max(wk) as wk from weeks
  ),
  ranked as (
    select w.wk, row_number() over (order by w.wk desc) as rn
    from weeks w
  )
  select case
    when (select wk from latest) is null then 0
    when (select wk from latest) < date_trunc('week', now())::date - interval '7 days' then 0
    else (
      select count(*)::int from ranked r
      where r.wk = (select wk from latest) - (r.rn - 1) * interval '7 days'
    )
  end;
$$;

create function public.recompute_achievements(p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_played int;
  v_hosted int;
  v_venues int;
  v_streak int;
  v_five_star boolean;
begin
  select count(*) into v_played
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  where gp.profile_id = p_profile_id and gp.status = 'approved' and g.status = 'completed';

  select count(*) into v_hosted
  from public.games g
  where g.organizer_id = p_profile_id and g.status = 'completed';

  select count(distinct venue_id) into v_venues
  from (
    select g.venue_id from public.games g where g.organizer_id = p_profile_id and g.status = 'completed'
    union
    select g.venue_id from public.game_players gp join public.games g on g.id = gp.game_id
    where gp.profile_id = p_profile_id and gp.status = 'approved' and g.status = 'completed'
  ) v
  where v.venue_id is not null;

  v_streak := public.achievement_week_streak(p_profile_id);

  select exists(select 1 from public.ratings where ratee_id = p_profile_id and stars = 5) into v_five_star;

  insert into public.achievement_awards (profile_id, achievement_id)
  select p_profile_id, x.achievement_id
  from (values
    ('first_game', v_played >= 1),
    ('first_hosted', v_hosted >= 1),
    ('played_10', v_played >= 10),
    ('played_25', v_played >= 25),
    ('played_50', v_played >= 50),
    ('streak_4', v_streak >= 4),
    ('venues_5', v_venues >= 5),
    ('five_star', v_five_star)
  ) as x(achievement_id, earned)
  where x.earned
  on conflict (profile_id, achievement_id) do nothing;
end;
$$;

-- Fires on the two events that can newly earn an achievement: a game completing (played/hosted/
-- venue/streak counts) and a 5-star rating landing. Recomputing for every approved player on a
-- completed game, not just the organizer, is what makes played_10/25/50 and streak_4 fire for
-- attendees, not only hosts.
create function public.achievement_award_on_game_completed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.recompute_achievements(new.organizer_id);
    perform public.recompute_achievements(gp.profile_id)
      from public.game_players gp
      where gp.game_id = new.id and gp.status = 'approved';
  end if;
  return new;
end;
$$;

create trigger achievement_award_on_game_completed
  after update on public.games
  for each row execute function public.achievement_award_on_game_completed();

create function public.achievement_award_on_rating()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.stars = 5 then
    perform public.recompute_achievements(new.ratee_id);
  end if;
  return new;
end;
$$;

create trigger achievement_award_on_rating
  after insert on public.ratings
  for each row execute function public.achievement_award_on_rating();

-- Backfill (§13's "server-side achievement awards table + backfill") — every profile that has
-- ever completed a game or hosted one, so day-one trophy cases aren't all empty for existing
-- beta players.
do $$
declare
  r record;
begin
  for r in
    select distinct id from public.profiles p
    where p.deleted_at is null
      and (
        exists (select 1 from public.games g where g.organizer_id = p.id and g.status = 'completed')
        or exists (
          select 1 from public.game_players gp join public.games g on g.id = gp.game_id
          where gp.profile_id = p.id and gp.status = 'approved' and g.status = 'completed'
        )
      )
  loop
    perform public.recompute_achievements(r.id);
  end loop;
end;
$$;
