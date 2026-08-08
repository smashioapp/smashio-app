-- Slice 8: push. One row per device registration; a user can hold multiple (phone + tablet).
-- Self-only RLS — no other client ever reads another profile's tokens, only push-dispatch
-- (service role, bypasses RLS) fans out to them.
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  unique (profile_id, expo_token)
);

create index push_tokens_profile_id_idx on public.push_tokens (profile_id);

alter table public.push_tokens enable row level security;

create policy "push_tokens self read" on public.push_tokens
  for select to authenticated using (profile_id = auth.uid());

create policy "push_tokens self upsert" on public.push_tokens
  for insert to authenticated with check (profile_id = auth.uid());

create policy "push_tokens self update" on public.push_tokens
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "push_tokens self delete" on public.push_tokens
  for delete to authenticated using (profile_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;
