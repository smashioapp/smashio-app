-- Slice 1: avatar uploads. Path convention is {uid}/filename so ownership is a path check.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

create policy "avatar images publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "users upload own avatar" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update own avatar" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
