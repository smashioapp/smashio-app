-- Profile & Settings v3 (docs/design-brief.md Prompt 8/8a). Edit profile v3 asks for the
-- three fields a host actually reads before approving someone (about you, usual nights, home
-- venue) and a referral code the invite screen can show instead of a bare share link.

-- ---------------------------------------------------------------------------
-- 1. Edit profile v3 fields
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column about_you text,
  add column usual_nights text[] not null default '{}',
  add column home_venue_id uuid references public.venues(id) on delete set null;

alter table public.profiles
  add constraint profiles_about_you_length check (about_you is null or char_length(about_you) <= 240);

comment on column public.profiles.usual_nights is
  'Self-declared, a subset of {mon,tue,wed,thu,fri,sat,sun} — shown on the player card as "usually plays Thu evenings", not derived from game history.';

-- ---------------------------------------------------------------------------
-- 2. Referral code
-- ---------------------------------------------------------------------------
-- One short code per profile, generated once and never reused (loop guards the birthday-paradox
-- collision, astronomically unlikely at this table size but cheap to guard). Backfilled for
-- existing rows so nobody signed up before this migration is left without one.
alter table public.profiles
  add column referral_code text unique;

create function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I — avoids misread-aloud codes
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end;
$$;

update public.profiles set referral_code = public.generate_referral_code() where referral_code is null;

alter table public.profiles alter column referral_code set not null;

create function public.profiles_set_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end;
$$;

create trigger profiles_set_referral_code
  before insert on public.profiles
  for each row execute function public.profiles_set_referral_code();

-- ---------------------------------------------------------------------------
-- 3. player_card — carry the three new fields through
-- ---------------------------------------------------------------------------
-- Body carried over from 20260901010000 (the latest definition — follower/following counts,
-- host/player rating dimensions, peer skill vote) with about_you/usual_nights/home_venue added.
-- Home venue name only, never lat/lng — same "text, not a pin" rule as home_suburb.
drop function if exists public.player_card(uuid);

create function public.player_card(target_id uuid)
returns table (
  id uuid,
  display_name text,
  photo_path text,
  home_suburb text,
  member_since timestamptz,
  games_played int,
  games_hosted int,
  reliability_score numeric,
  reliability_band text,
  rating_avg numeric,
  rating_count int,
  host_rating_avg numeric,
  host_rating_count int,
  games_together int,
  badge_counts jsonb,
  host_badge_counts jsonb,
  peer_skill_label text,
  peer_skill_votes int,
  sports jsonb,
  restricted boolean,
  avatar_key text,
  follower_count int,
  following_count int,
  is_following boolean,
  about_you text,
  usual_nights text[],
  home_venue_name text
)
language sql
stable
security definer set search_path = public
as $fn$
  with base as (
    select p.*, auth.uid() as vid
    from public.profiles p
    where p.id = target_id
      and p.deleted_at is null
      and not public.blocked_between(auth.uid(), p.id)
  ),
  computed as (
    select
      b.*,
      case
        when b.vid is null or b.vid = b.id then null
        else (
          select count(distinct g.id)::int
          from public.games g
          where g.status = 'completed'
            and (public.is_approved_player(g.id, b.id) or g.organizer_id = b.id)
            and (public.is_approved_player(g.id, b.vid) or g.organizer_id = b.vid)
        )
      end as games_together_calc
    from base b
  ),
  gated as (
    select
      c.*,
      (
        c.vid is not null
        and c.vid <> c.id
        and c.profile_visibility = 'players_only'
        and coalesce(c.games_together_calc, 0) = 0
        and not exists (
          select 1
          from public.games g
          join public.game_players gp on gp.game_id = g.id
          where g.organizer_id = c.vid
            and gp.profile_id = c.id
            and gp.status in ('requested', 'approved')
        )
      ) as is_restricted
    from computed c
  )
  select
    g.id,
    g.display_name,
    g.photo_path,
    case when g.show_suburb or g.vid = g.id then g.home_suburb else null end as home_suburb,
    g.created_at as member_since,
    (
      select count(*)::int from public.game_players gp
      join public.games gm on gm.id = gp.game_id
      where gp.profile_id = g.id and gp.status = 'approved' and gm.status = 'completed'
    ) as games_played,
    (
      select count(*)::int from public.games gm
      where gm.organizer_id = g.id and gm.status = 'completed'
    ) as games_hosted,
    case when g.is_restricted then null else g.reliability_score end as reliability_score,
    case
      when g.is_restricted then null
      when g.reliability_score >= 90 then 'Excellent'
      when g.reliability_score >= 75 then 'Good'
      when g.reliability_score >= 50 then 'Fair'
      else 'Needs work'
    end as reliability_band,
    case when g.is_restricted then null
         else (select avg(stars)::numeric(3, 2) from public.ratings where ratee_id = g.id and dimension = 'player') end as rating_avg,
    case when g.is_restricted then null
         else (select count(*)::int from public.ratings where ratee_id = g.id and dimension = 'player') end as rating_count,
    case when g.is_restricted then null
         else (select avg(stars)::numeric(3, 2) from public.ratings where ratee_id = g.id and dimension = 'host') end as host_rating_avg,
    case when g.is_restricted then null
         else (select count(*)::int from public.ratings where ratee_id = g.id and dimension = 'host') end as host_rating_count,
    g.games_together_calc as games_together,
    case when g.is_restricted then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb)
      from (
        select tag, count(*) as n from public.rating_tags where ratee_id = g.id and dimension = 'player' group by tag
      ) counted
    ) end as badge_counts,
    case when g.is_restricted then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb)
      from (
        select tag, count(*) as n from public.rating_tags where ratee_id = g.id and dimension = 'host' group by tag
      ) counted
    ) end as host_badge_counts,
    case when g.is_restricted then null else (select v.tier_label from public.peer_skill_vote(g.id) v) end as peer_skill_label,
    case when g.is_restricted then null else (select v.vote_count from public.peer_skill_vote(g.id) v) end as peer_skill_votes,
    (
      select coalesce(jsonb_agg(jsonb_build_object('sport_slug', s.slug, 'tier_label', st.label, 'tier_ordinal', st.ordinal) order by s.slug), '[]'::jsonb)
      from public.profile_sports ps
      join public.sports s on s.id = ps.sport_id
      join public.skill_tiers st on st.id = ps.skill_tier_id
      where ps.profile_id = g.id
    ) as sports,
    g.is_restricted as restricted,
    g.avatar_key,
    g.follower_count,
    g.following_count,
    case when g.vid is null then false else exists (
      select 1 from public.follows f where f.follower_id = g.vid and f.followee_id = g.id
    ) end as is_following,
    g.about_you,
    g.usual_nights,
    (select v.name from public.venues v where v.id = g.home_venue_id) as home_venue_name
  from gated g;
$fn$;

grant execute on function public.player_card(uuid) to authenticated;
