-- Fill-the-spot ultraplan P0 (docs/fill-the-spot-ultraplan.md §4 Phase P0). "Tell the truth":
-- auto_approve was stored and advertised but never enforced (F1), the break-even card invented a
-- court total from the per-player rate (F10), and the publish success screen promised a ping that
-- may never fire (F11 groundwork — the reach count itself).

-- ---------------------------------------------------------------------------------------------
-- F1. request_to_join: land straight on 'approved' when the game has an open spot and the host
-- set auto_approve. Waitlist path (no open spot) is unchanged and still spends a referral credit
-- (20260831010000_referral_priority.sql) the same way.
--
-- The status can now skip 'requested' entirely, whether this is a fresh INSERT or a reopened row
-- (a previously rejected/left/removed player re-requesting). trigger_notify_host_roster's INSERT
-- branch only ever knew about 'requested', and its UPDATE branch's "landed on approved" case fires
-- for a host's own manual approval too (where the host doesn't need telling — they just did it) and
-- for waitlist promotion (its own notification already exists) — neither trigger can tell those
-- apart from an auto-approve join just by looking at the row transition. So the host notification
-- for *this* path lives here instead, where "this was an auto-approve join" is unambiguous.
-- ---------------------------------------------------------------------------------------------

create or replace function public.request_to_join(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_existing_status text;
  v_will_land boolean;
  v_priority boolean := false;
  v_spent int;
  v_auto_approve boolean;
  v_organizer_id uuid;
  v_spots_left int;
  v_recipients uuid[];
begin
  select status into v_existing_status
  from public.game_players
  where game_id = p_game_id and profile_id = auth.uid();

  v_will_land := v_existing_status is null or v_existing_status in ('rejected', 'left', 'removed');

  if public.open_spots(p_game_id) > 0 then
    select auto_approve into v_auto_approve from public.games where id = p_game_id;
    v_status := case when coalesce(v_auto_approve, true) then 'approved' else 'requested' end;
  else
    v_status := 'waitlisted';
  end if;

  if v_status = 'waitlisted' and v_will_land then
    update public.profiles
    set referral_priority_credits = referral_priority_credits - 1
    where id = auth.uid() and referral_priority_credits > 0
    returning referral_priority_credits into v_spent;

    if v_spent is not null then
      v_priority := true;
    end if;
  end if;

  insert into public.game_players (
    game_id, profile_id, status, requested_at, decided_at, priority_waitlist
  )
  values (
    p_game_id, auth.uid(), v_status, now(),
    case when v_status = 'approved' then now() else null end,
    v_priority
  )
  on conflict (game_id, profile_id) do update
    set status = v_status,
        requested_at = now(),
        decided_at = case when v_status = 'approved' then now() else null end,
        priority_waitlist = v_priority
    where public.game_players.status in ('rejected', 'left', 'removed');

  if v_status = 'approved' and v_will_land then
    select organizer_id into v_organizer_id from public.games where id = p_game_id;

    if v_organizer_id is not null and v_organizer_id <> auth.uid() then
      select array_agg(profile_id) into v_recipients from public.push_recipients_for_host(p_game_id, 'roster_changes');
      perform public.enqueue_notifications(
        'player_joined', p_game_id, auth.uid(), v_recipients, '{}'::jsonb, 'normal', null
      );

      select s.spots_left into v_spots_left from public.push_game_summary(p_game_id) s;
      if v_spots_left = 0 then
        select array_agg(profile_id) into v_recipients from public.push_recipients_for_host(p_game_id, 'roster_changes');
        perform public.enqueue_notifications(
          'game_full', p_game_id, null, v_recipients, '{}'::jsonb, 'low', null
        );
      end if;
    end if;
  end if;
end;
$$;

-- Chat "joined" system message: previously fired only on the update path requested->approved, so
-- an auto-approve INSERT (old.status is null) never announced itself in chat, and neither did an
-- auto-approve reopen (old.status rejected/left/removed straight to approved). Widened to cover
-- every non-approved -> approved transition except waitlist promotion (waitlisted -> approved),
-- which never posted a "joined" message before this and isn't this plan's concern to add.
create or replace function public.trigger_chat_system_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles where id = new.profile_id;
  v_name := coalesce(v_name, 'A player');

  if new.status = 'approved' and old.status is distinct from 'approved' and old.status is distinct from 'waitlisted' then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.game_id, new.profile_id, 'system', 'joined', v_name || ' joined');
  elsif old.status = 'approved' and new.status = 'left' then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.game_id, new.profile_id, 'system', 'left', v_name || ' left');
  elsif old.status = 'approved' and new.status = 'removed' then
    insert into public.messages (game_id, sender_id, kind, system_event, body)
    values (new.game_id, new.profile_id, 'system', 'removed', v_name || ' was removed');
  end if;

  return new;
end;
$$;

drop trigger if exists game_players_chat_system_membership on public.game_players;

create trigger game_players_chat_system_membership
  after insert or update on public.game_players
  for each row execute function public.trigger_chat_system_membership();

-- ---------------------------------------------------------------------------------------------
-- F10. Break-even card invented a "court total" as per-player rate x max_players — cost is set
-- per-player directly by the host (ui/lib/mockData.ts's Game.cost comment), not derived from a
-- real booking total, so that multiplication has no relationship to what the court actually
-- costs. A genuine, optional total lets the card tell the truth instead of guessing.
-- ---------------------------------------------------------------------------------------------

alter table public.games add column court_cost_cents int check (court_cost_cents is null or court_cost_cents >= 0);

grant insert (court_cost_cents) on public.games to authenticated;
grant update (court_cost_cents) on public.games to authenticated;

create or replace view public.games_public
with (security_invoker = true) as
select
  g.id,
  g.sport_id,
  g.venue_id,
  v.name as venue_name,
  v.suburb as venue_suburb,
  v.location as venue_location,
  g.organizer_id,
  g.starts_at,
  g.ends_at,
  g.court_label,
  g.skill_tier_id,
  st.slug as skill_tier_slug,
  st.label as skill_tier_label,
  coalesce(g.skill_tier_max_id, g.skill_tier_id) as skill_tier_max_id,
  coalesce(stmax.label, st.label) as skill_tier_max_label,
  g.max_players,
  g.cost_per_player_cents,
  g.status,
  g.verification_status,
  g.created_at,
  public.approved_player_count(g.id) as approved_count,
  v.address as venue_address,
  extensions.ST_Y(v.location::extensions.geometry) as venue_lat,
  extensions.ST_X(v.location::extensions.geometry) as venue_lng,
  st.ordinal as skill_tier_ordinal,
  p.display_name as organizer_display_name,
  p.photo_path as organizer_photo_path,
  p.reliability_score as organizer_reliability_score,
  (select count(*) from public.games hg where hg.organizer_id = g.organizer_id and hg.status = 'completed')::int as organizer_hosted_count,
  g.courts_booked,
  g.duration_minutes,
  g.reserved_spots,
  public.claimed_reserved_count(g.id) as reserved_claimed,
  public.open_spots(g.id) as open_spots,
  p.avatar_key as organizer_avatar_key,
  g.cover_key,
  g.format_id,
  gf.slug as format_slug,
  gf.label as format_label,
  g.visibility,
  g.auto_approve,
  g.shuttles,
  g.notes,
  g.court_cost_cents
from public.games g
join public.venues v on v.id = g.venue_id
join public.skill_tiers st on st.id = g.skill_tier_id
left join public.skill_tiers stmax on stmax.id = g.skill_tier_max_id
join public.profiles p on p.id = g.organizer_id
join public.game_formats gf on gf.id = g.format_id;

grant select on public.games_public to authenticated;

-- CREATE OR REPLACE can't widen a function's argument list in place — Postgres identifies a
-- function by (name, argument types), so appending p_court_cost_cents created a second overload
-- alongside the 17-arg original instead of replacing it. Drop the old signature explicitly.
drop function if exists public.create_game_with_spots(
  uuid, uuid, uuid, timestamptz, int, int, int, int, text, uuid, uuid, text, boolean, text, text, text, jsonb
);

create function public.create_game_with_spots(
  p_sport_id uuid,
  p_venue_id uuid,
  p_skill_tier_id uuid,
  p_starts_at timestamptz,
  p_max_players int,
  p_courts_booked int,
  p_duration_minutes int,
  p_cost_per_player_cents int,
  p_court_label text default null,
  p_skill_tier_max_id uuid default null,
  p_format_id uuid default null,
  p_visibility text default 'public',
  p_auto_approve boolean default true,
  p_shuttles text default null,
  p_notes text default null,
  p_cover_key text default 'auto',
  p_spots jsonb default '[]'::jsonb,
  p_court_cost_cents int default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
  v_ends_at timestamptz;
  v_spot jsonb;
  v_spot_id uuid;
  v_format_id uuid;
begin
  v_ends_at := p_starts_at + make_interval(mins => p_duration_minutes);
  v_format_id := coalesce(p_format_id, (select id from public.game_formats where sport_id = p_sport_id and slug = 'social'));

  insert into public.games (
    sport_id, venue_id, organizer_id, starts_at, ends_at, court_label,
    skill_tier_id, skill_tier_max_id, max_players, courts_booked, duration_minutes,
    cost_per_player_cents, format_id, visibility, auto_approve, shuttles, notes, cover_key,
    court_cost_cents
  ) values (
    p_sport_id, p_venue_id, auth.uid(), p_starts_at, v_ends_at, nullif(trim(coalesce(p_court_label, '')), ''),
    p_skill_tier_id, coalesce(p_skill_tier_max_id, p_skill_tier_id), p_max_players, p_courts_booked, p_duration_minutes,
    p_cost_per_player_cents, v_format_id, p_visibility, p_auto_approve, nullif(trim(coalesce(p_shuttles, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_cover_key, 'auto'),
    p_court_cost_cents
  )
  returning id into v_game_id;

  for v_spot in select * from jsonb_array_elements(coalesce(p_spots, '[]'::jsonb))
  loop
    v_spot_id := public.add_reserved_spot(v_game_id, v_spot->>'label');
    if v_spot ? 'invited_profile_id' and (v_spot->>'invited_profile_id') is not null then
      perform public.invite_to_reserved_spot(v_spot_id, (v_spot->>'invited_profile_id')::uuid);
    end if;
  end loop;

  return v_game_id;
end;
$$;

grant execute on function public.create_game_with_spots(
  uuid, uuid, uuid, timestamptz, int, int, int, int, text, uuid, uuid, text, boolean, text, text, text, jsonb, int
) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- F11 groundwork. spot_openings (20260924000000_spot_alerts.sql) is service-side only — RLS on,
-- no policies, no grants — because it's a measurement table, not app data. The publish success
-- screen needs one honest number out of it: how many players this game's opening has reached so
-- far. games_spot_open is a deferred constraint trigger (fires at commit, after
-- create_game_with_spots has already returned), so this can't be read inside that same call —
-- the wizard calls this RPC once, right after create succeeds.
-- ---------------------------------------------------------------------------------------------

create function public.spot_open_reach(p_game_id uuid)
returns int
language sql
stable
security definer set search_path = public
as $$
  select coalesce(sum(o.recipients), 0)::int
  from public.spot_openings o
  join public.games g on g.id = o.game_id
  where o.game_id = p_game_id and g.organizer_id = auth.uid();
$$;

grant execute on function public.spot_open_reach(uuid) to authenticated;
