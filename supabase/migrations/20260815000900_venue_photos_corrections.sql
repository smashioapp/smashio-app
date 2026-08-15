-- A5 (venues-plan.md §4.5, §5.4): venue photo uploads (moderated, same UGC problem as the feed —
-- see social-plan.md §7) and the "something wrong here?" correction report.

create table public.venue_photos (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  storage_path text not null,
  credit text,
  uploader_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  ordinal int not null default 0,
  created_at timestamptz not null default now()
);

create index venue_photos_venue_id_idx on public.venue_photos (venue_id);

create table public.venue_corrections (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  field text not null,
  suggested_value text,
  note text,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create index venue_corrections_venue_id_idx on public.venue_corrections (venue_id);

alter table public.venue_photos enable row level security;
alter table public.venue_corrections enable row level security;

create policy "venue_photos approved readable" on public.venue_photos
  for select to authenticated using (status = 'approved');

create policy "venue_photos self insert" on public.venue_photos
  for insert to authenticated with check (uploader_id = auth.uid());

create policy "venue_corrections self insert" on public.venue_corrections
  for insert to authenticated with check (reporter_id = auth.uid());

create policy "venue_corrections self read" on public.venue_corrections
  for select to authenticated using (reporter_id = auth.uid());

grant select, insert on public.venue_photos to authenticated;
grant select, insert on public.venue_corrections to authenticated;

-- Client can't be trusted to send status='pending' itself — force it server-side regardless of
-- what the insert payload carries, same reasoning as chat_v2's forced-sender-id triggers.
create function public.force_venue_photo_pending()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.status := 'pending';
  return new;
end;
$$;

create trigger venue_photos_force_pending
  before insert on public.venue_photos
  for each row execute function public.force_venue_photo_pending();

-- Storage: path convention {venue_id}/{uploader_id}/{filename}, mirroring chat-media's
-- two-segment folder check. Bucket is private — read is gated through the approved-only table
-- policy above via a join, not a public bucket, so a pending/rejected photo isn't fetchable by
-- guessing its path.
insert into storage.buckets (id, name, public) values ('venue-photos', 'venue-photos', false);

create policy "venue photos readable when approved or own" on storage.objects
  for select to authenticated using (
    bucket_id = 'venue-photos'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or exists (
        select 1 from public.venue_photos vp
        where vp.storage_path = name and vp.status = 'approved'
      )
    )
  );

create policy "venue photos insert by uploader" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'venue-photos' and (storage.foldername(name))[2] = auth.uid()::text
  );

-- §5.4: report_venue_correction. security definer so RLS on venue_corrections (self-insert-only)
-- still holds while this adds a rate limit RLS can't express (10/user/day).
create function public.report_venue_correction(
  p_venue_id uuid,
  p_field text,
  p_suggested_value text,
  p_note text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_today_count int;
  v_id uuid;
begin
  select count(*) into v_today_count
  from public.venue_corrections
  where reporter_id = auth.uid() and created_at >= now() - interval '1 day';

  if v_today_count >= 10 then
    raise exception 'Daily correction report limit reached';
  end if;

  insert into public.venue_corrections (venue_id, reporter_id, field, suggested_value, note)
  values (p_venue_id, auth.uid(), p_field, p_suggested_value, p_note)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.report_venue_correction(uuid, text, text, text) to authenticated;
