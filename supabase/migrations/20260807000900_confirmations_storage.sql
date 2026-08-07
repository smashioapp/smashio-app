-- Slice 3: booking-confirmation uploads. Private bucket, path convention {game_id}/filename
-- so ownership is a lookup against games.organizer_id — same shape as the avatars policy.
-- Reviewer read (for a future non-organizer verifier role) isn't built yet; organizer-only for now.
insert into storage.buckets (id, name, public) values ('confirmations', 'confirmations', false);

create policy "organizer manages own confirmations" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'confirmations'
    and exists (
      select 1 from public.games g
      where g.id::text = (storage.foldername(name))[1] and g.organizer_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'confirmations'
    and exists (
      select 1 from public.games g
      where g.id::text = (storage.foldername(name))[1] and g.organizer_id = auth.uid()
    )
  );
