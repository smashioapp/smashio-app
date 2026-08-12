-- In-app account deletion (Play User Data policy / App Store 5.1.1(v)). The web half of the
-- requirement is website/delete-account.html; this is the server side of the in-app half.
--
-- Deleting the auth user must NOT take the profiles row with it. games.organizer_id,
-- messages.sender_id and game_confirmations.uploaded_by all reference profiles with no ON
-- DELETE action, and games_public inner-joins profiles — so a cascading profile delete would
-- either fail outright on the first hosted game, or (if every FK were widened) vanish finished
-- games out of every other player's history. Instead the auth.users FK goes and a deleted
-- account leaves a scrubbed tombstone profile: no name, no photo, no suburb, no score. That is
-- exactly what the published policy promises — messages "shown against a deleted user", past
-- games kept "without your name attached".
alter table public.profiles drop constraint profiles_id_fkey;

alter table public.profiles add column deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set by delete_account. The row is a tombstone from here on — the auth user is gone and the '
  'identity fields are scrubbed; it survives only to keep other players'' games and chat readable.';

-- Nothing links profiles to auth.users any more, so a re-fired signup trigger (or an id that
-- comes back via a restore) must not error out the auth insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Everything the deletion touches inside Postgres, in one transaction. Storage objects and the
-- auth.users row are the edge function's job (service role only) — it calls this first, then
-- clears the buckets, then deletes the auth user last so a failure never strands a locked-out
-- user with their data intact. Re-runnable: a second call on an already-scrubbed profile is a
-- no-op that returns empty arrays.
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

  -- Upcoming hosted games are cancelled, not blocked. Blocking would mean an active host can
  -- never delete (there is always a next game), and the cancellation is what the joined players
  -- need anyway — games_notify_change fires the game_cancelled push off this transition, with
  -- the organiser excluded. Games already under way or finished stay put; they're history now.
  with cancelled as (
    update public.games
    set status = 'cancelled'
    where organizer_id = p_profile_id
      and status = 'published'
      and starts_at > now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_cancelled from cancelled;

  -- Booking-confirmation screenshots are the user's own venue receipt — their name and email are
  -- usually on the image — so the rows go and the caller removes the objects. The game keeps
  -- whatever verification_status it earned: that's the other players' record, not this user's data.
  with removed as (
    delete from public.game_confirmations
    where uploaded_by = p_profile_id
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_confirmation_paths from removed;

  -- Ratings *received* go with the account (published policy). Ratings *given* stay so other
  -- players keep their score, pointed at the tombstone — unlinked from any identity.
  delete from public.ratings where ratee_id = p_profile_id;

  -- Join requests, spots in upcoming games, and the games-history link, all in one table.
  delete from public.game_players where profile_id = p_profile_id;

  delete from public.message_reads where profile_id = p_profile_id;
  delete from public.push_tokens where profile_id = p_profile_id;
  delete from public.game_alerts where profile_id = p_profile_id;
  delete from public.profile_sports where profile_id = p_profile_id;

  update public.profiles
  set display_name = 'Deleted user',
      photo_path = null,
      home_suburb = null,
      home_point = null,
      reliability_score = 100,
      deleted_at = now()
  where id = p_profile_id;

  return jsonb_build_object(
    'cancelled_game_ids', to_jsonb(v_cancelled),
    'confirmation_paths', to_jsonb(v_confirmation_paths)
  );
end;
$$;

-- No client ever calls this — the edge function verifies the JWT and passes its own user's id.
revoke all on function public.delete_account(uuid) from public;
revoke all on function public.delete_account(uuid) from anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
