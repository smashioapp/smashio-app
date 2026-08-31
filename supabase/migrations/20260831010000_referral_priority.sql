-- gtm-plan.md G7 / §4.6: referrals were invisible — attribution landed in profiles.referred_by
-- (20260815000300_profile_referred_by.sql) but nothing counted it or rewarded it. Reward is
-- priority waitlist: each successful referral banks one credit, spent automatically the first
-- time that referrer lands on a full game's waitlist, jumping them ahead of the existing FIFO
-- queue (not straight to approved — this is still a queue, just a shorter one).

alter table public.profiles
  add column referral_priority_credits int not null default 0
  check (referral_priority_credits >= 0);

-- Fires once per referral: referred_by starts null and is set exactly once (session.tsx's
-- .is("referred_by", null) guard), so this can't double-credit a referrer.
create function public.grant_referral_priority_credit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set referral_priority_credits = referral_priority_credits + 1
  where id = new.referred_by;
  return new;
end;
$$;

create trigger profiles_grant_referral_credit
  after update of referred_by on public.profiles
  for each row
  when (old.referred_by is null and new.referred_by is not null)
  execute function public.grant_referral_priority_credit();

-- Marks a waitlisted row as queue-jumping. Set once at insert time by request_to_join and never
-- flipped afterwards — the credit is spent the moment it's used, not held against future games.
alter table public.game_players
  add column priority_waitlist boolean not null default false;

-- Widened to spend a referral credit (if any, and only on an actual waitlist landing) and stamp
-- the row so promotion and position-in-queue both honour it.
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
begin
  select status into v_existing_status
  from public.game_players
  where game_id = p_game_id and profile_id = auth.uid();

  v_will_land := v_existing_status is null or v_existing_status in ('rejected', 'left', 'removed');
  v_status := case when public.open_spots(p_game_id) > 0 then 'requested' else 'waitlisted' end;

  if v_status = 'waitlisted' and v_will_land then
    update public.profiles
    set referral_priority_credits = referral_priority_credits - 1
    where id = auth.uid() and referral_priority_credits > 0
    returning referral_priority_credits into v_spent;

    if v_spent is not null then
      v_priority := true;
    end if;
  end if;

  insert into public.game_players (game_id, profile_id, status, requested_at, decided_at, priority_waitlist)
  values (p_game_id, auth.uid(), v_status, now(), null, v_priority)
  on conflict (game_id, profile_id) do update
    set status = v_status, requested_at = now(), decided_at = null, priority_waitlist = v_priority
    where public.game_players.status in ('rejected', 'left', 'removed');
end;
$$;

-- Promotion now honours priority_waitlist ahead of arrival order.
create or replace function public.promote_waitlist()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_next_profile uuid;
begin
  if old.status = 'approved' and new.status in ('left', 'removed') and public.open_spots(new.game_id) > 0 then
    select profile_id into v_next_profile
    from public.game_players
    where game_id = new.game_id and status = 'waitlisted'
    order by priority_waitlist desc, requested_at asc
    limit 1
    for update skip locked;

    if v_next_profile is not null then
      update public.game_players
      set status = 'approved', decided_at = now()
      where game_id = new.game_id and profile_id = v_next_profile;
    end if;
  end if;

  return new;
end;
$$;

-- Position now reflects the same priority_waitlist-first ordering promotion consumes.
create or replace function public.waitlist_position(p_game_id uuid)
returns int
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_requested_at timestamptz;
  v_priority boolean;
begin
  select requested_at, priority_waitlist into v_requested_at, v_priority
  from public.game_players
  where game_id = p_game_id and profile_id = auth.uid() and status = 'waitlisted';

  if v_requested_at is null then
    return null;
  end if;

  return (
    select count(*)::int + 1
    from public.game_players
    where game_id = p_game_id and status = 'waitlisted'
      and (
        (priority_waitlist and not v_priority)
        or (priority_waitlist = v_priority and requested_at < v_requested_at)
      )
  );
end;
$$;
