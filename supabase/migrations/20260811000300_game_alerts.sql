-- Discover plan D5: the retention primitive. A saved watch on (sport, level, radius) — when a
-- new published game lands inside it, the organizer's insert fires a push straight to whoever
-- was stranded. Mirrors push_tokens' self-only RLS shape.
create table public.game_alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete cascade,
  -- null = any level, matching nearby_games' own tier_slugs null-means-any convention.
  tier_slugs text[],
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m double precision not null,
  created_at timestamptz not null default now()
);

create index game_alerts_sport_id_idx on public.game_alerts (sport_id);

alter table public.game_alerts enable row level security;

create policy "game_alerts self read" on public.game_alerts
  for select to authenticated using (profile_id = auth.uid());

create policy "game_alerts self insert" on public.game_alerts
  for insert to authenticated with check (profile_id = auth.uid());

create policy "game_alerts self delete" on public.game_alerts
  for delete to authenticated using (profile_id = auth.uid());

grant select, insert, delete on public.game_alerts to authenticated;

-- New game posted: find every alert it falls inside (sport + level + radius) and push once per
-- matching profile, batched into a single notify_push call. Organizer excluded — they don't need
-- an alert about the game they just made.
create or replace function public.trigger_notify_game_alerts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_venue_location extensions.geography;
  v_tier_slug text;
  v_profile_ids uuid[];
begin
  if new.status <> 'published' then
    return new;
  end if;

  select v.location into v_venue_location from public.venues v where v.id = new.venue_id;
  select st.slug into v_tier_slug from public.skill_tiers st where st.id = new.skill_tier_id;

  select array_agg(ga.profile_id) into v_profile_ids
  from public.game_alerts ga
  where ga.sport_id = new.sport_id
    and ga.profile_id is distinct from new.organizer_id
    and (ga.tier_slugs is null or v_tier_slug = any(ga.tier_slugs))
    and extensions.ST_DWithin(
          v_venue_location,
          extensions.ST_SetSRID(extensions.ST_MakePoint(ga.center_lng, ga.center_lat), 4326)::extensions.geography,
          ga.radius_m
        );

  if v_profile_ids is not null and array_length(v_profile_ids, 1) > 0 then
    perform public.notify_push(jsonb_build_object(
      'type', 'alert_match',
      'game_id', new.id,
      'profile_ids', to_jsonb(v_profile_ids)
    ));
  end if;

  return new;
end;
$$;

create trigger games_notify_alerts
  after insert on public.games
  for each row execute function public.trigger_notify_game_alerts();
