-- Slice 1: profiles, one row per auth user, created automatically on signup.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  photo_path text,
  home_suburb text,
  home_point extensions.geography(Point, 4326),
  reliability_score numeric not null default 100,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Public read of display fields — discover/game rosters need to show other players.
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles insert own row" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles update own row" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

-- Auto-create the profile row at signup so the client only ever updates, never inserts.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
