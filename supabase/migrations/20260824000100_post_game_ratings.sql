-- post-game-plan.md D4/D5/D6/D8/D9/D12. The post-game flow as shipped in slice 6 rated one
-- undifferentiated list of `game_players` rows on one star scale. That list never contained the
-- host (organizers have no game_players row), had no idea who actually turned up, never asked
-- the single most useful question a co-player can answer ("what tier does this person really
-- play at"), and let a ratee read exactly who scored them what.
--
-- This migration adds: attendance, a host dimension on ratings/tags, explicit skill votes, and
-- aggregate-only reads.

-- ---------------------------------------------------------------------------------------------
-- Attendance (D4)
-- ---------------------------------------------------------------------------------------------

-- null = the host never told us. Not the same as "everyone showed": with attendance unmarked we
-- can't exclude anyone, so everyone rates everyone (that's the D9 fallback). false = no-show,
-- which removes them from every rating list *and* stops them rating anyone.
alter table public.game_players add column attended boolean;

-- Drives both the "you still owe us attendance" prompt and the fallback timer.
alter table public.games add column attendance_marked_at timestamptz;

-- The organizer is never in game_players, and a host who hosted turned up by definition — there
-- is no self-no-show (plan §Not doing).
create function public.mark_attendance(p_game_id uuid, p_no_shows uuid[] default '{}')
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
begin
  perform public.assert_is_organizer(p_game_id);

  select status into v_status from public.games where id = p_game_id;
  if v_status <> 'completed' then
    raise exception 'Attendance can only be marked after the game has finished';
  end if;

  update public.game_players
  set attended = not (profile_id = any(coalesce(p_no_shows, '{}'::uuid[])))
  where game_id = p_game_id and status = 'approved';

  update public.games set attendance_marked_at = now() where id = p_game_id;

  -- The host has told us who showed, so the rating prompt can go out now rather than waiting
  -- for the D9 fallback window. rate_prompted_at guards against a double send if the host
  -- re-marks later.
  if not exists (select 1 from public.games where id = p_game_id and rate_prompted_at is not null) then
    perform public.notify_push(jsonb_build_object('type', 'post_game_rate', 'game_id', p_game_id));
    update public.games set rate_prompted_at = now() where id = p_game_id;
  end if;
end;
$$;

grant execute on function public.mark_attendance(uuid, uuid[]) to authenticated;

-- Single gate for "may this person take part in this game's ratings", used on both sides of
-- every rating policy: a no-show is neither rateable nor a rater.
create function public.can_rate_in_game(p_game_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id
      and g.status = 'completed'
      and (
        g.organizer_id = p_profile_id
        or exists (
          select 1 from public.game_players gp
          where gp.game_id = p_game_id
            and gp.profile_id = p_profile_id
            and gp.status = 'approved'
            and coalesce(gp.attended, true)
        )
      )
  );
$$;

grant execute on function public.can_rate_in_game(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rating dimensions (D6)
-- ---------------------------------------------------------------------------------------------

-- A host is two things at once — the person you rallied with, and the person who booked the
-- court, priced it, and set the skill level. One star scale collapsed both, so the host's
-- organising was invisible and their play was contaminated by it. `dimension` splits them;
-- everyone still gets exactly one 'player' row per rater, and only the host also gets a 'host'
-- one. Defaults to 'player' so every existing rating keeps its meaning.
alter table public.ratings
  add column dimension text not null default 'player' check (dimension in ('player', 'host'));

alter table public.ratings drop constraint ratings_game_id_rater_id_ratee_id_key;
alter table public.ratings
  add constraint ratings_game_rater_ratee_dimension_key unique (game_id, rater_id, ratee_id, dimension);

alter table public.rating_tags
  add column dimension text not null default 'player' check (dimension in ('player', 'host'));

alter table public.rating_tags drop constraint rating_tags_pkey;
alter table public.rating_tags
  add constraint rating_tags_pkey primary key (game_id, rater_id, ratee_id, dimension, tag);

-- Host tags answer host questions. Tying the vocabulary to the dimension in one constraint stops
-- a 'punctual' host tag or an 'organised_well' player tag from ever being written.
alter table public.rating_tags drop constraint rating_tags_tag_check;
alter table public.rating_tags add constraint rating_tags_tag_check check (
  (dimension = 'player' and tag in ('punctual', 'good_sport', 'strong_player', 'settled_up'))
  or (dimension = 'host' and tag in ('organised_well', 'skill_level_accurate', 'court_as_described', 'fair_cost_split', 'responsive_in_chat'))
);

-- Rewritten around can_rate_in_game: the 20260823000100 organizer fix got the host onto the
-- roster but still had no attendance concept, and no notion of a host dimension.
drop policy "ratings insert self as rater, co-player only, game completed" on public.ratings;

create policy "ratings insert: attendee rates attendee, host dimension for host only" on public.ratings
  for insert to authenticated
  with check (
    rater_id = auth.uid()
    and rater_id <> ratee_id
    and public.can_rate_in_game(ratings.game_id, auth.uid())
    and public.can_rate_in_game(ratings.game_id, ratings.ratee_id)
    and (
      dimension = 'player'
      or exists (select 1 from public.games g where g.id = ratings.game_id and g.organizer_id = ratings.ratee_id)
    )
  );

drop policy "rating_tags insert self as rater, co-player only, game completed" on public.rating_tags;

create policy "rating_tags insert: attendee tags attendee, host dimension for host only" on public.rating_tags
  for insert to authenticated
  with check (
    rater_id = auth.uid()
    and rater_id <> ratee_id
    and public.can_rate_in_game(rating_tags.game_id, auth.uid())
    and public.can_rate_in_game(rating_tags.game_id, rating_tags.ratee_id)
    and (
      dimension = 'player'
      or exists (select 1 from public.games g where g.id = rating_tags.game_id and g.organizer_id = rating_tags.ratee_id)
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Skill votes (D5, D12)
-- ---------------------------------------------------------------------------------------------

-- The old peer-skill signal was `starsToTier` in the client: a star average bucketed into a tier.
-- A star average is not a skill statement — a 5-star rating means "great to play with", which a
-- friendly beginner earns as easily as a pro. This asks the question directly.
--
-- References skill_tiers rather than a text enum so sport stays a data concern (AGENTS.md): a
-- tier belongs to a sport, and the vote must be in the game's sport's vocabulary.
create table public.skill_votes (
  game_id uuid not null references public.games(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  skill_tier_id uuid not null references public.skill_tiers(id),
  created_at timestamptz not null default now(),
  primary key (game_id, rater_id, ratee_id)
);

create index skill_votes_ratee_id_idx on public.skill_votes (ratee_id);

alter table public.skill_votes enable row level security;

create policy "skill_votes insert: attendee votes on attendee, tier must match sport" on public.skill_votes
  for insert to authenticated
  with check (
    rater_id = auth.uid()
    and rater_id <> ratee_id
    and public.can_rate_in_game(skill_votes.game_id, auth.uid())
    and public.can_rate_in_game(skill_votes.game_id, skill_votes.ratee_id)
    and exists (
      select 1 from public.games g
      join public.skill_tiers st on st.id = skill_votes.skill_tier_id
      where g.id = skill_votes.game_id and st.sport_id = g.sport_id
    )
  );

-- Rater-only, same as the D8 lockdown below. A skill vote is the one rating a ratee would most
-- want to trace back to a name, and tracing it back is exactly what kills honest voting.
create policy "skill_votes readable by rater" on public.skill_votes
  for select to authenticated using (rater_id = auth.uid());

grant select, insert on public.skill_votes to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Aggregate-only reads (D8)
-- ---------------------------------------------------------------------------------------------

-- Was "readable by rater and ratee": a player could select their own ratings rows and see
-- exactly who gave them 2 stars. The whole model above depends on people marking a friend down
-- to Beginner honestly, which nobody does under attribution. Raters keep read on their own rows
-- (the "Rated ✓" check on the Past tab needs it); everything ratee-side goes through the
-- aggregate RPCs below.
drop policy "ratings readable by rater and ratee" on public.ratings;
create policy "ratings readable by rater" on public.ratings
  for select to authenticated using (rater_id = auth.uid());

drop policy "rating_tags readable by rater and ratee" on public.rating_tags;
create policy "rating_tags readable by rater" on public.rating_tags
  for select to authenticated using (rater_id = auth.uid());

-- Everything the profile's own rating card needs, with no rater identity anywhere in the shape.
create function public.rating_summary(p_profile_id uuid, p_dimension text default 'player')
returns table (
  rating_avg numeric,
  rating_count int,
  distribution jsonb,
  badge_counts jsonb
)
language sql
stable
security definer set search_path = public
as $$
  select
    (select avg(stars)::numeric(3, 2) from public.ratings r where r.ratee_id = p_profile_id and r.dimension = p_dimension),
    (select count(*)::int from public.ratings r where r.ratee_id = p_profile_id and r.dimension = p_dimension),
    (
      select coalesce(jsonb_object_agg(s.stars, s.n), '{}'::jsonb)
      from (
        select stars, count(*) as n
        from public.ratings r
        where r.ratee_id = p_profile_id and r.dimension = p_dimension
        group by stars
      ) s
    ),
    (
      select coalesce(jsonb_object_agg(t.tag, t.n), '{}'::jsonb)
      from (
        select tag, count(*) as n
        from public.rating_tags rt
        where rt.ratee_id = p_profile_id and rt.dimension = p_dimension
        group by tag
      ) t
    );
$$;

grant execute on function public.rating_summary(uuid, text) to authenticated;

-- Peer-perceived skill, D12: explicit votes only. One vote per rater — their most recent —
-- weighted to the last 25 games voted on, the same window the old star-derived version used.
-- Returns the winning tier by vote count, ties broken toward the higher tier (a player two
-- people call Advanced and two call Intermediate is worth pitching upward, not downward).
create function public.peer_skill_vote(p_profile_id uuid, p_sport_slug text default 'badminton')
returns table (
  tier_slug text,
  tier_label text,
  tier_ordinal int,
  vote_count int
)
language sql
stable
security definer set search_path = public
as $$
  with latest as (
    select distinct on (sv.rater_id) sv.rater_id, sv.skill_tier_id, sv.created_at
    from public.skill_votes sv
    join public.skill_tiers st on st.id = sv.skill_tier_id
    join public.sports s on s.id = st.sport_id
    where sv.ratee_id = p_profile_id and s.slug = p_sport_slug
    order by sv.rater_id, sv.created_at desc
  ),
  recent as (
    select * from latest order by created_at desc limit 25
  )
  select st.slug, st.label, st.ordinal, count(*)::int
  from recent r
  join public.skill_tiers st on st.id = r.skill_tier_id
  group by st.slug, st.label, st.ordinal
  order by count(*) desc, st.ordinal desc
  limit 1;
$$;

grant execute on function public.peer_skill_vote(uuid, text) to authenticated;

-- Two changes on top of 20260822000000's gated version (blocks / suburb gating / `restricted`),
-- which stays intact: every rating read is now dimension-scoped, so a host's organising stars
-- don't silently inflate their player average once D6 lands; and the card gains the host numbers
-- plus the peer skill vote. Return type changes, so drop first.
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
  restricted boolean
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
      -- Multi-sport ready (profile-plan.md P3): every sport this profile has a tier in, not
      -- just the single hardcoded SPORT_SLUG the rest of the client still assumes.
      select coalesce(jsonb_agg(jsonb_build_object('sport_slug', s.slug, 'tier_label', st.label, 'tier_ordinal', st.ordinal) order by s.slug), '[]'::jsonb)
      from public.profile_sports ps
      join public.sports s on s.id = ps.sport_id
      join public.skill_tiers st on st.id = ps.skill_tier_id
      where ps.profile_id = g.id
    ) as sports,
    g.is_restricted as restricted
  from gated g;
$fn$;

grant execute on function public.player_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The post-game screen's one query
-- ---------------------------------------------------------------------------------------------

-- The screen used to build its roster from a raw game_players select, which is why the host was
-- never on it. This is the whole rating surface in one round trip: who the viewer may rate, who
-- is the host, who no-showed, and what the viewer has already submitted (so a partial submit
-- can be resumed — there's no deadline, D7).
create function public.post_game_roster(p_game_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  photo_path text,
  is_host boolean,
  attended boolean,
  declared_tier_label text,
  rated_player boolean,
  rated_host boolean,
  skill_voted boolean
)
language sql
stable
security definer set search_path = public
as $$
  with g as (
    select id, organizer_id, sport_id, status, attendance_marked_at
    from public.games where id = p_game_id
  ),
  people as (
    select g.organizer_id as profile_id, true as is_host, true as attended from g
    union all
    select gp.profile_id, false, coalesce(gp.attended, true)
    from public.game_players gp, g
    where gp.game_id = g.id and gp.status = 'approved'
  )
  select
    pe.profile_id,
    pr.display_name,
    pr.photo_path,
    pe.is_host,
    pe.attended,
    (
      select st.label from public.profile_sports ps
      join public.skill_tiers st on st.id = ps.skill_tier_id
      where ps.profile_id = pe.profile_id and ps.sport_id = (select sport_id from g)
    ) as declared_tier_label,
    exists (
      select 1 from public.ratings r
      where r.game_id = p_game_id and r.rater_id = auth.uid() and r.ratee_id = pe.profile_id and r.dimension = 'player'
    ) as rated_player,
    exists (
      select 1 from public.ratings r
      where r.game_id = p_game_id and r.rater_id = auth.uid() and r.ratee_id = pe.profile_id and r.dimension = 'host'
    ) as rated_host,
    exists (
      select 1 from public.skill_votes sv
      where sv.game_id = p_game_id and sv.rater_id = auth.uid() and sv.ratee_id = pe.profile_id
    ) as skill_voted
  from people pe
  join public.profiles pr on pr.id = pe.profile_id
  where pe.profile_id <> auth.uid()
    -- The viewer must be an attendee themselves, and can only rate other attendees. With
    -- attendance unmarked everyone reads as attended, which is the D4 fallback.
    and public.can_rate_in_game(p_game_id, auth.uid())
    and pe.attended
  order by pe.is_host desc, pr.display_name;
$$;

grant execute on function public.post_game_roster(uuid) to authenticated;


-- ---------------------------------------------------------------------------------------------
-- Prompt scheduling (D9)
-- ---------------------------------------------------------------------------------------------

-- Pre-existing bug, fixed here because this migration depends on the prompt actually arriving:
-- dispatch_post_game_prompts still called notify_push with a P0-style {type, game_id} payload,
-- but push-dispatch has only accepted {ids} since notifications P2 (index.ts's request handler
-- ignores everything else). Post-game rate prompts have been silently dropped on the floor ever
-- since. Every dispatcher below goes through enqueue_notifications, which writes the inbox rows
-- and hands push-dispatch their ids.

alter table public.games add column attendance_prompted_at timestamptz;

-- How many people the viewer could rate, host included. Used for the push copy's count and to
-- suppress the prompt entirely on a game where nobody else turned up.
create function public.open_rateable_count(p_game_id uuid)
returns int
language sql
stable
security definer set search_path = public
as $fn$
  select 1 + (
    select count(*)::int from public.game_players gp
    where gp.game_id = p_game_id and gp.status = 'approved' and coalesce(gp.attended, true)
  );
$fn$;

grant execute on function public.open_rateable_count(uuid) to anon, authenticated, service_role;

-- Only attendees get asked to rate — pushing "rate your match" at someone the host just marked
-- as a no-show is the worst possible copy.
create or replace function public.push_post_game_recipients(p_game_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer set search_path = public
as $fn$
  select distinct r.profile_id
  from (
    select g.organizer_id as profile_id from public.games g where g.id = p_game_id
    union
    select gp.profile_id
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.status = 'approved'
      and coalesce(gp.attended, true)
  ) r
  where public.notification_pref_enabled(r.profile_id, 'reminders')
    and public.open_rateable_count(p_game_id) >= 2;
$fn$;

grant execute on function public.push_post_game_recipients(uuid) to service_role;

-- One helper both the cron path and mark_attendance call, so "who gets the rate prompt and what
-- does the copy say" lives in exactly one place.
create function public.enqueue_post_game_rate(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $fn$
begin
  perform public.enqueue_notifications(
    'post_game_rate',
    p_game_id,
    null,
    array(select r.profile_id from public.push_post_game_recipients(p_game_id) r),
    jsonb_build_object('rateable_count', public.open_rateable_count(p_game_id) - 1)
  );
end;
$fn$;

-- The host has told us who showed, so the rating prompt goes out immediately rather than waiting
-- for the fallback window. rate_prompted_at guards a double send if the host re-marks later.
create or replace function public.mark_attendance(p_game_id uuid, p_no_shows uuid[] default '{}')
returns void
language plpgsql
security definer set search_path = public
as $fn$
declare
  v_status text;
  v_already timestamptz;
begin
  perform public.assert_is_organizer(p_game_id);

  select status, rate_prompted_at into v_status, v_already
  from public.games where id = p_game_id for update;

  if v_status <> 'completed' then
    raise exception 'Attendance can only be marked after the game has finished';
  end if;

  update public.game_players
  set attended = not (profile_id = any(coalesce(p_no_shows, '{}'::uuid[])))
  where game_id = p_game_id and status = 'approved';

  update public.games set attendance_marked_at = now() where id = p_game_id;

  if v_already is null then
    update public.games set rate_prompted_at = now() where id = p_game_id;
    perform public.enqueue_post_game_rate(p_game_id);
  end if;
end;
$fn$;

grant execute on function public.mark_attendance(uuid, uuid[]) to authenticated;

-- Host gets asked for attendance at ends_at + 30min. One shot, and skipped entirely for a host
-- who already marked.
create function public.dispatch_attendance_prompts()
returns void
language plpgsql
security definer set search_path = public
as $fn$
declare
  r record;
begin
  for r in
    select g.id, g.organizer_id from public.games g
    where g.status = 'completed'
      and g.attendance_marked_at is null
      and g.attendance_prompted_at is null
      and g.ends_at < now() - interval '30 minutes'
      and g.ends_at > now() - interval '48 hours'
      and public.approved_player_count(g.id) >= 1
  loop
    update public.games set attendance_prompted_at = now() where id = r.id;
    perform public.enqueue_notifications(
      'post_game_attendance',
      r.id,
      null,
      case
        when public.notification_pref_enabled(r.organizer_id, 'reminders') then array[r.organizer_id]
        else '{}'::uuid[]
      end,
      jsonb_build_object('player_count', public.approved_player_count(r.id))
    );
  end loop;
end;
$fn$;

-- Every 15 minutes rather than hourly: a 30-minute window rounded to the nearest hour lands
-- anywhere from 30 to 90 minutes after the game — the difference between catching the host in
-- the car park and catching them the next morning.
select cron.schedule('dispatch-attendance-prompts', '*/15 * * * *', $cron$select public.dispatch_attendance_prompts();$cron$);

-- Fallback: the host never marked attendance, so we can't exclude anyone and everyone rates
-- everyone. Was 2 hours; now 3, to leave the attendance prompt a real window to land in.
create or replace function public.dispatch_post_game_prompts()
returns void
language plpgsql
security definer set search_path = public
as $fn$
declare
  r record;
begin
  for r in
    select g.id from public.games g
    where g.status = 'completed'
      and g.rate_prompted_at is null
      and g.ends_at < now() - interval '3 hours'
      and g.ends_at > now() - interval '48 hours'
      and public.approved_player_count(g.id) >= 1
  loop
    update public.games set rate_prompted_at = now() where id = r.id;
    perform public.enqueue_post_game_rate(r.id);
  end loop;
end;
$fn$;

-- Direct-add invite (D10) needs the invitee to actually hear about it, so the RPC from the
-- previous migration is redefined here — the invite copy is a post-game-plan concern and this
-- keeps every enqueue_notifications call site in one file.
create or replace function public.invite_to_reserved_spot(p_spot_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $fn$
declare
  v_game_id uuid;
  v_claimed_by uuid;
  v_organizer uuid;
begin
  select rs.game_id, rs.claimed_by, g.organizer_id
  into v_game_id, v_claimed_by, v_organizer
  from public.game_reserved_spots rs
  join public.games g on g.id = rs.game_id
  where rs.id = p_spot_id;

  if v_game_id is null then
    raise exception 'Reserved spot not found';
  end if;
  perform public.assert_is_organizer(v_game_id);

  if v_claimed_by is not null then
    raise exception 'That spot is already taken';
  end if;
  if p_profile_id = v_organizer then
    raise exception 'You already have a spot in this game';
  end if;
  if exists (
    select 1 from public.game_players
    where game_id = v_game_id and profile_id = p_profile_id and status in ('approved', 'invited')
  ) then
    raise exception 'That player is already on this game';
  end if;
  -- Discover already hides games across a block (nearby_games' blocked_between filter); an
  -- invite would walk straight around it.
  if public.blocked_between(v_organizer, p_profile_id) then
    raise exception 'That player can''t be invited';
  end if;

  update public.game_reserved_spots set invited_profile_id = p_profile_id where id = p_spot_id;

  insert into public.game_players (game_id, profile_id, status, requested_at, decided_at)
  values (v_game_id, p_profile_id, 'invited', now(), null)
  on conflict (game_id, profile_id) do update
    set status = 'invited', requested_at = now(), decided_at = null;

  perform public.enqueue_notifications(
    'game_invite',
    v_game_id,
    v_organizer,
    case
      when public.notification_pref_enabled(p_profile_id, 'requests') then array[p_profile_id]
      else '{}'::uuid[]
    end,
    '{}'::jsonb,
    'high'
  );
end;
$fn$;

grant execute on function public.invite_to_reserved_spot(uuid, uuid) to authenticated;
