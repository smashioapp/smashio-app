-- security-audit-2026-09-11.md L1: avatars was a public bucket with an unrestricted select
-- policy, so any profile photo was fetchable with no auth by anyone holding a user id — a leak
-- that ignored profile_visibility entirely. Go private; every read moves to a signed URL
-- (ui/lib/avatarUrls.ts), gated to signed-in users the same way the rest of the app is.
update storage.buckets set public = false where id = 'avatars';

drop policy "avatar images publicly readable" on storage.objects;

create policy "avatar images readable by authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');
