-- Slice 9: real game_confirmations table, replaces the boolean-flip from Slice 3.
-- Written by the ai-proxy edge function (service role), which verifies the caller is the
-- game's organizer before inserting — so no client-facing insert policy is needed here,
-- only read, matching the storage bucket's organizer-only stance (see confirmations_storage).
create table public.game_confirmations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references public.profiles(id),
  parsed jsonb,
  review_status text not null default 'pending' check (review_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);

create index game_confirmations_game_id_idx on public.game_confirmations (game_id);

alter table public.game_confirmations enable row level security;

create policy "organizer reads own game confirmations" on public.game_confirmations
  for select to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = game_confirmations.game_id and g.organizer_id = auth.uid()
    )
  );

grant select on public.game_confirmations to authenticated;
