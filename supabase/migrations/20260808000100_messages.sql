-- Slice 5: chat. messages + message_reads, Realtime channel per game.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index messages_game_id_created_at_idx on public.messages (game_id, created_at);

alter table public.messages enable row level security;

-- Approved players AND the organizer can chat — organizer never gets a game_players row
-- (see game_players' own read policy for the same organizer-OR-approved shape).
create policy "messages readable by organizer and approved players" on public.messages
  for select to authenticated using (
    public.is_approved_player(game_id, auth.uid())
    or exists (select 1 from public.games g where g.id = messages.game_id and g.organizer_id = auth.uid())
  );

create policy "messages insert by organizer and approved players" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.is_approved_player(game_id, auth.uid())
      or exists (select 1 from public.games g where g.id = messages.game_id and g.organizer_id = auth.uid())
    )
  );

grant select, insert on public.messages to authenticated;

alter publication supabase_realtime add table public.messages;

-- Drives the unread badge on the chat tab: last_read_at per (game, profile), client upserts
-- on thread open.
create table public.message_reads (
  game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

alter table public.message_reads enable row level security;

create policy "message_reads self only" on public.message_reads
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on public.message_reads to authenticated;
