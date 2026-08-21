-- Settings IA (docs/design-brief.md prompt 5, "Settings — full IA" artboard). The screen behind
-- the profile gear was six rows in three unlabelled cards; the design specifies six labelled
-- groups. Four of those groups had no server behind them at all. This adds it, in one file.
--
-- BLOCK ENFORCEMENT BOUNDARY — read before extending. A block:
--   · stops join requests in BOTH directions (request_to_join raises),
--   · hides the profile card in both directions (player_card returns no rows),
--   · hides each side's hosted games from the other's Discover (nearby_games filters).
-- It deliberately does NOT retroactively scrub messages from a game chat both parties are
-- already approved in. Removing one side of an in-flight conversation breaks the thread for the
-- other four players, who did not block anyone. Existing shared games play out; no new ones form.

-- ---------------------------------------------------------------------------
-- 1. Preference + visibility columns on profiles
-- ---------------------------------------------------------------------------
-- These three are safe on profiles, whose select policy is `using (true)` (20260807000200:15):
-- none of them is a secret. Anything sensitive goes in profile_private below instead.
alter table public.profiles
  add column profile_visibility text not null default 'everyone'
    check (profile_visibility in ('everyone', 'players_only')),
  add column show_suburb boolean not null default true,
  add column distance_units text not null default 'km'
    check (distance_units in ('km', 'mi'));

comment on column public.profiles.profile_visibility is
  'everyone = any signed-in player can open the full card. players_only = reputation is withheld '
  'unless the viewer has played with them, or is a host they have asked to play with — see player_card.';

-- ---------------------------------------------------------------------------
-- 2. profile_private — the sensitive half of a profile
-- ---------------------------------------------------------------------------
-- Phone cannot live on profiles: that table grants select on every column to every authenticated
-- user, and the brief's hard constraint is that another player never sees an email or a phone.
-- Column-level grants could express it, but only by revoking the table-wide grant every existing
-- query depends on. A self-only side table is cheaper and impossible to leak by accident.
-- No verification flow — this is a game-day contact detail, not a second auth factor, and it is
-- never returned by player_card or any other public read.
create table public.profile_private (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  updated_at timestamptz not null default now()
);

alter table public.profile_private enable row level security;
create policy "profile_private self read" on public.profile_private for select to authenticated using (profile_id = auth.uid());
create policy "profile_private self insert" on public.profile_private for insert to authenticated with check (profile_id = auth.uid());
create policy "profile_private self update" on public.profile_private for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update on public.profile_private to authenticated;

-- No generic touch_updated_at() exists (each table that needs one defines its own — see
-- notification_prefs_touch_updated_at, 20260820000300:55) so this follows the same pattern.
create function public.profile_private_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profile_private_touch_updated_at
  before update on public.profile_private
  for each row execute function public.profile_private_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Marketing consent
-- ---------------------------------------------------------------------------
-- Default FALSE, unlike the other seven categories. The Spam Act 2003 (Cth) requires consent
-- before a commercial electronic message; a promos toggle that defaults on is a legal risk, not
-- a growth lever. Nothing sends on this channel yet — consent lands before the sender, on purpose.
alter table public.notification_prefs
  add column marketing boolean not null default false;

-- ---------------------------------------------------------------------------
-- 4. blocks
-- ---------------------------------------------------------------------------
-- Shape per docs/social-plan.md §3.1. A block is stored one-directional (who pressed the button)
-- but enforced bidirectionally, so neither side can route around it by being the one to act.
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks(blocked_id);

alter table public.blocks enable row level security;
-- Select is own-row only: you can see who you blocked, never who blocked you. Surfacing the
-- reverse turns a quiet safety tool into a notification.
create policy "blocks self read" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "blocks self insert" on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks self delete" on public.blocks for delete to authenticated using (blocker_id = auth.uid());
grant select, insert, delete on public.blocks to authenticated;

-- security definer: the enforcement points below have to test both directions, and the reverse
-- direction is exactly the row RLS hides from the caller.
create function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

grant execute on function public.blocked_between(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. user_reports
-- ---------------------------------------------------------------------------
-- App Store Review Guideline 1.2 / Play UGC policy both require report + block before an app
-- carrying user-generated content ships (docs/social-plan.md §7). The chat "Report" action has
-- been an Alert with no network call since chat v2; this is what it should have been writing to.
create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'no_show', 'unsafe', 'fake_profile', 'spam', 'other')),
  detail text,
  context_game_id uuid references public.games(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint user_reports_no_self check (reporter_id <> reported_id)
);

create index user_reports_reported_idx on public.user_reports(reported_id, created_at desc);

alter table public.user_reports enable row level security;
-- No update policy: a reporter cannot reopen or re-classify their own report, and nobody but
-- service_role reads the queue.
create policy "user_reports self read" on public.user_reports for select to authenticated using (reporter_id = auth.uid());
grant select on public.user_reports to authenticated;

-- Insert goes through the RPC only, so the rate limit cannot be skipped by writing the table
-- directly. Same shape as report_venue_correction (20260815000900:90).
create function public.report_user(
  p_reported_id uuid,
  p_reason text,
  p_detail text default null,
  p_context_game_id uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_recent int;
  v_id uuid;
begin
  if p_reported_id = auth.uid() then
    raise exception 'Cannot report yourself';
  end if;

  select count(*) into v_recent
  from public.user_reports
  where reporter_id = auth.uid()
    and reported_id = p_reported_id
    and created_at >= now() - interval '1 day';

  if v_recent >= 1 then
    raise exception 'You have already reported this player today';
  end if;

  insert into public.user_reports (reporter_id, reported_id, reason, detail, context_game_id)
  values (auth.uid(), p_reported_id, p_reason, p_detail, p_context_game_id)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.report_user(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. player_card — blocks, suburb gating, visibility gating
-- ---------------------------------------------------------------------------
-- Body carried over from 20260815000100 with three changes: blocked profiles return no rows,
-- home_suburb honours show_suburb, and a new `restricted` flag nulls the reputation columns for
-- players_only profiles.
--
-- The host carve-out in `is_restricted` is load-bearing. Without it, switching yourself to
-- players_only makes you unvettable — and a host deciding a join request from a stranger is the
-- single highest-stakes read in the product, the reader this whole design leads with. Asking to
-- join someone's game is itself the consent to be read by that host.
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
  games_together int,
  badge_counts jsonb,
  sports jsonb,
  restricted boolean
)
language sql
stable
security definer set search_path = public
as $$
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
         else (select avg(stars)::numeric(3, 2) from public.ratings where ratee_id = g.id) end as rating_avg,
    case when g.is_restricted then null
         else (select count(*)::int from public.ratings where ratee_id = g.id) end as rating_count,
    g.games_together_calc as games_together,
    case when g.is_restricted then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb)
      from (
        select tag, count(*) as n from public.rating_tags where ratee_id = g.id group by tag
      ) counted
    ) end as badge_counts,
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
$$;

grant execute on function public.player_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. nearby_games — hide blocked players' games
-- ---------------------------------------------------------------------------
-- Body carried over verbatim from 20260820000000 (the 7th definition of this function) with one
-- extra predicate. Signature is unchanged, so this is a replace, not a new overload.
create or replace function public.nearby_games(
  lat double precision,
  lng double precision,
  radius_m double precision,
  sport_slug text,
  from_ts timestamptz default now(),
  to_ts timestamptz default null,
  tier_slugs text[] default null,
  has_spots_only boolean default false,
  verified_only boolean default false,
  max_cost_per_player_cents int default null,
  sort_by text default 'soonest',
  p_exclude_mine boolean default true
)
returns table (
  id uuid,
  venue_name text,
  venue_suburb text,
  venue_address text,
  venue_lat double precision,
  venue_lng double precision,
  organizer_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  court_label text,
  skill_tier_slug text,
  skill_tier_label text,
  skill_tier_ordinal int,
  max_players int,
  cost_per_player_cents int,
  status text,
  verification_status text,
  approved_count int,
  distance_m double precision,
  organizer_display_name text,
  organizer_photo_path text,
  organizer_reliability_score numeric,
  organizer_hosted_count int,
  courts_booked int,
  duration_hours int,
  reserved_spots int
)
language sql
stable
security invoker
as $$
  select
    gp.id,
    gp.venue_name,
    gp.venue_suburb,
    gp.venue_address,
    gp.venue_lat,
    gp.venue_lng,
    gp.organizer_id,
    gp.starts_at,
    gp.ends_at,
    gp.court_label,
    gp.skill_tier_slug,
    gp.skill_tier_label,
    gp.skill_tier_ordinal,
    gp.max_players,
    gp.cost_per_player_cents,
    gp.status,
    gp.verification_status,
    gp.approved_count,
    extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) as distance_m,
    p.display_name as organizer_display_name,
    p.photo_path as organizer_photo_path,
    p.reliability_score as organizer_reliability_score,
    (select count(*) from public.games hg where hg.organizer_id = gp.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
    gp.courts_booked,
    gp.duration_hours,
    gp.reserved_spots
  from public.games_public gp
  join public.sports s on s.id = gp.sport_id
  join public.profiles p on p.id = gp.organizer_id
  where s.slug = sport_slug
    and gp.status = 'published'
    and gp.starts_at >= from_ts
    and (to_ts is null or gp.starts_at <= to_ts)
    and (tier_slugs is null or gp.skill_tier_slug = any(tier_slugs))
    and (not has_spots_only or gp.approved_count + gp.reserved_spots < gp.max_players)
    and (not verified_only or gp.verification_status = 'verified')
    and (max_cost_per_player_cents is null or gp.cost_per_player_cents <= max_cost_per_player_cents)
    and extensions.ST_DWithin(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography, radius_m)
    and not public.blocked_between(auth.uid(), gp.organizer_id)
    and (
      not p_exclude_mine
      or (
        gp.organizer_id <> auth.uid()
        and not exists (
          select 1 from public.game_players mygp
          where mygp.game_id = gp.id and mygp.profile_id = auth.uid() and mygp.status = 'approved'
        )
      )
    )
  order by
    case when sort_by = 'closest' then extensions.ST_Distance(gp.venue_location, extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) end asc nulls last,
    case when sort_by = 'cheapest' then gp.cost_per_player_cents end asc nulls last,
    case when sort_by = 'most_spots' then gp.max_players - gp.approved_count - gp.reserved_spots end desc nulls last,
    gp.starts_at asc;
$$;

grant execute on function public.nearby_games(double precision, double precision, double precision, text, timestamptz, timestamptz, text[], boolean, boolean, int, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. request_to_join — refuse across a block
-- ---------------------------------------------------------------------------
-- Body carried over from 20260819000000 with the block guard in front. The message is
-- deliberately vague in both directions: telling a blocked user "X blocked you" is exactly the
-- notification blocking is supposed to avoid.
create or replace function public.request_to_join(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_organizer uuid;
begin
  select organizer_id into v_organizer from public.games where id = p_game_id;

  if v_organizer is not null and public.blocked_between(auth.uid(), v_organizer) then
    raise exception 'This game is not available to join';
  end if;

  insert into public.game_players (game_id, profile_id, status, requested_at, decided_at)
  values (p_game_id, auth.uid(), 'requested', now(), null)
  on conflict (game_id, profile_id) do update
    set status = 'requested', requested_at = now(), decided_at = null
    where public.game_players.status in ('rejected', 'left', 'removed');
end;
$$;

grant execute on function public.request_to_join(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. delete_account — cover the tables the tombstone strands
-- ---------------------------------------------------------------------------
-- profiles is scrubbed, not deleted (20260812000200), so every `on delete cascade` pointed at it
-- never fires. Each per-user table therefore needs an explicit delete here. notification_prefs,
-- chat_prefs, notifications and rating_tags were already being missed before this migration;
-- the four tables added above would have leaked the same way.
create or replace function public.delete_account(p_profile_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_cancelled uuid[];
  v_confirmation_paths text[];
begin
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Profile not found';
  end if;

  with cancelled as (
    update public.games
    set status = 'cancelled'
    where organizer_id = p_profile_id
      and status = 'published'
      and starts_at > now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_cancelled from cancelled;

  with removed as (
    delete from public.game_confirmations
    where uploaded_by = p_profile_id
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_confirmation_paths from removed;

  -- Ratings *received* go with the account (published policy). Ratings *given* stay so other
  -- players keep their score, pointed at the tombstone — unlinked from any identity. The same
  -- split applies to the behaviour badges those ratings carried.
  delete from public.ratings where ratee_id = p_profile_id;
  delete from public.rating_tags where ratee_id = p_profile_id;

  delete from public.game_players where profile_id = p_profile_id;
  delete from public.message_reads where profile_id = p_profile_id;
  delete from public.push_tokens where profile_id = p_profile_id;
  delete from public.game_alerts where profile_id = p_profile_id;
  delete from public.profile_sports where profile_id = p_profile_id;
  delete from public.notification_prefs where profile_id = p_profile_id;
  delete from public.chat_prefs where profile_id = p_profile_id;
  delete from public.notifications where profile_id = p_profile_id;
  delete from public.profile_private where profile_id = p_profile_id;

  -- Both directions: the blocks they set, and the blocks set against them. Neither side can act
  -- on a tombstone, so leaving either half only strands rows.
  delete from public.blocks where blocker_id = p_profile_id or blocked_id = p_profile_id;

  -- Reports they *filed* are their words, so they go. Reports filed *about* them stay: those
  -- belong to the players who filed them and to whatever moderation follow-up is still open.
  delete from public.user_reports where reporter_id = p_profile_id;

  update public.profiles
  set display_name = 'Deleted user',
      photo_path = null,
      home_suburb = null,
      home_point = null,
      reliability_score = 100,
      profile_visibility = 'everyone',
      show_suburb = true,
      distance_units = 'km',
      deleted_at = now()
  where id = p_profile_id;

  return jsonb_build_object(
    'cancelled_game_ids', to_jsonb(v_cancelled),
    'confirmation_paths', to_jsonb(v_confirmation_paths)
  );
end;
$$;

revoke all on function public.delete_account(uuid) from public;
revoke all on function public.delete_account(uuid) from anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
