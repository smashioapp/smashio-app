-- Profile plan P2: behaviour badges. rating.stars is one undimensioned 1-5 blob that can't
-- separate "strong player" from "turned up on time" — this splits that signal into a fixed,
-- cheap-to-collect vocabulary tagged alongside the existing star rating.
create table public.rating_tags (
  game_id uuid not null references public.games(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  tag text not null check (tag in ('punctual', 'good_sport', 'strong_player', 'settled_up')),
  created_at timestamptz not null default now(),
  primary key (game_id, rater_id, ratee_id, tag)
);

create index rating_tags_ratee_id_idx on public.rating_tags (ratee_id);

alter table public.rating_tags enable row level security;

-- Same shape as the ratings insert policy it rides alongside (slice 6) — one rater per
-- game/ratee pair, co-players only, game must be completed.
create policy "rating_tags insert self as rater, co-player only, game completed" on public.rating_tags
  for insert to authenticated
  with check (
    rater_id = auth.uid()
    and rater_id <> ratee_id
    and exists (select 1 from public.games g where g.id = rating_tags.game_id and g.status = 'completed')
    and public.is_approved_player(rating_tags.game_id, auth.uid())
    and public.is_approved_player(rating_tags.game_id, ratee_id)
  );

create policy "rating_tags readable by rater and ratee" on public.rating_tags
  for select to authenticated using (rater_id = auth.uid() or ratee_id = auth.uid());

-- No update/delete grant — like ratings, tags are immutable once given.
grant select, insert on public.rating_tags to authenticated;
