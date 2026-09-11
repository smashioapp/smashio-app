-- security-audit-2026-09-11.md L3: insert/update existed on avatars but never delete, so a user
-- replacing their photo left the old object behind indefinitely (publicly readable per L1).
create policy "users delete own avatar" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
