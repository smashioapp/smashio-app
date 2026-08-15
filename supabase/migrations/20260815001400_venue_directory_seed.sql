-- A2 (venues-plan.md §6): generated ingest for 12 of the raw CSV's 15
-- venues (3 withheld pending human cluster review — see the comment block at
-- the end of this file). Regenerate with: node scripts/venues/normalize.mjs && node
-- scripts/venues/geocode.mjs && node scripts/venues/match.mjs && node scripts/venues/emit-sql.mjs
--
-- Every profile row here is data_source='csv', confidence='low' — none of this is operator-
-- verified yet (§3's verification rule). A6 upgrades confidence per-field as it's re-checked.

-- Slug backfill: every existing venue without one yet, so future ingest runs can match on slug
-- instead of relying on google_place_id (fixes the NULL-place_id duplicate risk in §1.2).
-- Uniqueness suffix handled by appending a short id fragment on collision.
do $$
declare
  v record;
  v_slug text;
  v_suffix int;
begin
  for v in select id, name from public.venues where slug is null loop
    v_slug := lower(regexp_replace(regexp_replace(v.name, '\([^)]*\)', '', 'g'), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
    v_suffix := 0;
    while exists (select 1 from public.venues where slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end and id <> v.id) loop
      v_suffix := v_suffix + 1;
    end loop;
    update public.venues set slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end where id = v.id;
  end loop;
end $$;


-- Matched: "BadmintonWorx Botany" -> existing venue "BadmintonWorx - Botany" (47a05773-8cef-4c8e-bb17-bbde0a39ec6e). Not touching
-- venues.name/address/location/google_place_id — curated data only.

insert into public.venue_profiles (
  venue_id, courts_badminton, courts_total, dedicated, surface, bookability,
  booking_platform, booking_url, access_notes, summary, data_source, confidence
) values (
  '47a05773-8cef-4c8e-bb17-bbde0a39ec6e', 14, 14, true, 'mat', 'public',
  'Online (BadmintonWorx Website / App)', null, null, null, 'csv', 'low'
)
on conflict (venue_id) do update set
  courts_badminton = excluded.courts_badminton,
  courts_total = excluded.courts_total,
  dedicated = excluded.dedicated,
  surface = excluded.surface,
  bookability = excluded.bookability,
  booking_platform = excluded.booking_platform,
  booking_url = excluded.booking_url,
  access_notes = excluded.access_notes,
  summary = excluded.summary,
  data_source = excluded.data_source,
  confidence = excluded.confidence,
  updated_at = now();

delete from public.venue_amenities where venue_id = '47a05773-8cef-4c8e-bb17-bbde0a39ec6e';
delete from public.venue_pricing_bands where venue_id = '47a05773-8cef-4c8e-bb17-bbde0a39ec6e';
insert into public.venue_amenities (venue_id, amenity_slug, availability, note) values
  ('47a05773-8cef-4c8e-bb17-bbde0a39ec6e', 'toilets', 'yes', null),
  ('47a05773-8cef-4c8e-bb17-bbde0a39ec6e', 'parking', 'yes', 'On-site parking spaces'),
  ('47a05773-8cef-4c8e-bb17-bbde0a39ec6e', 'drinking_water', 'yes', null),
  ('47a05773-8cef-4c8e-bb17-bbde0a39ec6e', 'racquet_hire', 'yes', null),
  ('47a05773-8cef-4c8e-bb17-bbde0a39ec6e', 'shuttle_retail', 'yes', 'Pro Shop sales available'),
  ('47a05773-8cef-4c8e-bb17-bbde0a39ec6e', 'stringing', 'yes', 'Full Pro-Shop service on site');
insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes) values
  ('47a05773-8cef-4c8e-bb17-bbde0a39ec6e', 'Off-peak', array[1,2,3,4,5,6,7], null, null, 4200, 'court_hour', 'Varies by peak/off-peak');

-- New venues: each is one statement — a venues insert feeding its profile/amenity/pricing
-- inserts via CTEs referencing the returned id, so venue + curated data land atomically. Upsert
-- on slug so a re-run of this generated file is idempotent.

-- New: "Sydney Olympic Park Sports Halls"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Sydney Olympic Park Sports Halls', 'Sydney Olympic Park', 'NSW', 'Grand Parade, Sydney Olympic Park NSW 2127',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0649008, -33.8447036), 4326), 'ChIJTbnXJ7ekEmsRrkWq1jmH2WI', 'partner', 'sydney-olympic-park-sports-halls')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 12, 12, false, 'synthetic', 'public', 'Online (Sydney Olympic Park Portal)', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', 'Paid on-site / P3 car park'),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'yes', null),
    ('shuttle_retail', 'yes', 'Retail purchase available at reception'),
    ('stringing', 'no', 'Pro shop nearby in SOP')
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3700, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Five Dock Leisure Centre (FDLC)"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Five Dock Leisure Centre (FDLC)', 'Five Dock', 'NSW', 'William St, Five Dock NSW 2046',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1181809, -33.8684504), 4326), 'ChIJfftkY626EmsRMH7oiDuxzsc', 'partner', 'five-dock-leisure-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 8, 8, false, null, 'public', 'Online (FDLC Website)', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', 'Free center parking'),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'no', 'Available for retail purchase at front desk'),
    ('racquet_retail', 'yes', 'Available for retail purchase at front desk'),
    ('shuttle_hire', 'no', 'Retail purchase at front desk'),
    ('shuttle_retail', 'yes', 'Retail purchase at front desk'),
    ('stringing', 'no', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Off-peak', array[1,2,3,4,5,6,7], 2950, 'court_hour', 'Off-peak Mon-Fri 6am-4pm'),
    ('Peak', array[1,2,3,4,5,6,7], 3950, 'court_hour', 'Peak Mon-Fri 4-10pm, Sat-Sun')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Concord Oval Recreation Centre"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Concord Oval Recreation Centre', 'Concord', 'NSW', '8 Gipps St, Concord NSW 2137',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1092018, -33.8672485), 4326), 'ChIJmf0QyxO7EmsRPW8YHcShDzg', 'partner', 'concord-oval-recreation-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 2, 8, false, null, 'public', 'Online (City of Canada Bay / FDLC Portal)', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', 'On-site precinct parking'),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'no', 'Retail purchase at front desk'),
    ('racquet_retail', 'yes', 'Retail purchase at front desk'),
    ('shuttle_hire', 'no', 'Retail purchase at front desk'),
    ('shuttle_retail', 'yes', 'Retail purchase at front desk'),
    ('stringing', 'no', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Off-peak', array[1,2,3,4,5,6,7], 2950, 'court_hour', 'Off-peak'),
    ('Peak', array[1,2,3,4,5,6,7], 3950, 'court_hour', 'Peak')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "UNSW Fitness & Aquatic Centre (FAC)"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('UNSW Fitness & Aquatic Centre (FAC)', 'Kensington', 'NSW', 'Fitness and Aquatic Centre (B5), Gate 2, High St, UNSW Sydney, Kensington NSW 2033',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.2265342, -33.9154941), 4326), 'ChIJDdkXWouxEmsRRnJ9dxHVtec', 'partner', 'unsw-fitness-aquatic-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 6, 6, false, null, 'public', 'Online (UNSW FAC Portal) / Phone / In-person', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', 'University paid parking nearby'),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'yes', null),
    ('shuttle_retail', 'yes', 'Sale available at front desk'),
    ('stringing', 'no', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 2800, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Ryde Community Sports Centre (The Y)"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Ryde Community Sports Centre (The Y)', 'Ryde', 'NSW', 'ELS Hall Park, Kent Rd, North Ryde NSW 2113',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1126687, -33.7874985), 4326), 'ChIJt925qN6lEmsR3X6wGOiMGn8', 'partner', 'ryde-community-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 6, 6, false, null, 'public', 'Online (YMCA NSW Portal) / Phone', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', 'ELS Hall Park free parking lot'),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'yes', null),
    ('shuttle_retail', 'yes', 'Sale available at desk'),
    ('stringing', 'no', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Casual', array[1,2,3,4,5,6,7], 3700, 'court_hour', 'Casual'),
    ('Peak', array[1,2,3,4,5,6,7], 5200, 'court_hour', 'Peak/Corporate')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "The Badminton Club Wetherill Park"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('The Badminton Club Wetherill Park', 'Wetherill Park', 'NSW', '196 Newton Rd, Wetherill Park NSW 2164',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8822222, -33.8380556), 4326), 'ChIJAzUz7iKXEmsRmL_g7ECyjss', 'partner', 'the-badminton-club-wetherill-park')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 10, 10, true, null, 'public', 'Online (The Badminton Club Website)', null, 'Dedicated 24/7 automated badminton venue with keycode PIN door entry.', null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', 'On-site warehouse parking'),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'no', null),
    ('stringing', 'no', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Off-peak', array[1,2,3,4,5,6,7], 2900, 'court_hour', 'Off-peak'),
    ('Peak', array[1,2,3,4,5,6,7], 3600, 'court_hour', 'Peak')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "NBC South Granville (National Badminton Centre)"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC South Granville (National Badminton Centre)', 'South Granville', 'NSW', '3F/62 Ferndell St, South Granville NSW 2142',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0070459, -33.8688999), 4326), 'ChIJjwsYQnm9EmsReMZxw1cZ8J8', 'partner', 'nbc-south-granville')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 16, 16, true, null, 'public', 'Online (NBC Portal)', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', 'On-site facility parking'),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'yes', null),
    ('shuttle_retail', 'yes', 'Pro Shop sales available'),
    ('stringing', 'yes', 'On-site Pro Shop and restringing')
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Off-peak', array[1,2,3,4,5,6,7], 3800, 'court_hour', 'Varies by peak/off-peak')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "NBC Silverwater (National Badminton Centre)"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC Silverwater (National Badminton Centre)', 'Silverwater', 'NSW', '2b/172 Silverwater Rd, Silverwater NSW 2128',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.048935, -33.8297323), 4326), 'ChIJVY2vV6CkEmsRojlIPBszEEY', 'partner', 'nbc-silverwater')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 12, 12, true, 'mat', 'public', 'Online (NBC Portal)', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', null),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'yes', null),
    ('shuttle_retail', 'yes', 'Pro Shop sales available'),
    ('stringing', 'yes', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 4000, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Hurstville Aquatic Leisure Centre / Stadium"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Hurstville Aquatic Leisure Centre / Stadium', 'Hurstville', 'NSW', 'King Georges Rd &, Forest Rd, Hurstville NSW 2221',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0912935, -33.962871), 4326), 'ChIJ-yzuE_DxtAERJLpF-aISBqM', 'partner', 'hurstville-aquatic-leisure-centre-stadium')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 6, 6, false, null, 'public', 'Online / Phone (BlueFit Hurstville)', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', null),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'no', null),
    ('shuttle_retail', 'yes', 'Front desk sales'),
    ('stringing', 'no', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3800, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "The Y Epping (Epping YMCA)"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('The Y Epping (Epping YMCA)', 'Epping', 'NSW', '15 Ward St, Epping NSW 2121',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0683579, -33.7716269), 4326), 'ChIJYyRffKCmEmsRBhA3eTkbx6U', 'partner', 'the-y-epping')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 4, 4, false, null, 'public', 'Online (YMCA NSW) / Phone', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', 'Street and local lot'),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'yes', null),
    ('shuttle_retail', 'yes', 'Desk sales available'),
    ('stringing', 'no', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3800, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Oran Park Leisure Centre"

with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Oran Park Leisure Centre', 'Oran Park', 'NSW', '74 Central Ave, Oran Park NSW 2570',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.7442833, -33.9982816), 4326), 'ChIJr4-HFgDzEmsRrh_7lybob4s', 'partner', 'oran-park-leisure-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, 4, 4, false, null, 'public', 'Online / Phone (Camden Council)', null, null, null, 'csv', 'low'
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
),
del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
),
ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values
    ('toilets', 'yes', null),
    ('parking', 'yes', null),
    ('drinking_water', 'yes', null),
    ('racquet_hire', 'yes', '$2.40 per racquet'),
    ('shuttle_hire', 'yes', '$2.40 per shuttle purchase'),
    ('shuttle_retail', 'yes', '$2.40 per shuttle purchase'),
    ('stringing', 'no', null)
  ) as x(slug, availability, note)
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Peak', array[1,2,3,4,5,6,7], 2950, 'court_hour', 'Peak community'),
    ('Casual per person', array[1,2,3,4,5,6,7], 640, 'person_hour', 'Casual per person')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

/* WITHHELD pending human review (A2 pre-flight gate, venues-plan.md §6):
  - Alpha Badminton Centre (Rookwood / Lidcombe): ambiguous: trigram/distance signals disagree
      vs "Alpha Badminton Centre" (c1537a10-4c08-4c9f-a205-f60c286f7e85) trigram=0.72 dist=526m
  - Willoughby Leisure Centre: ambiguous: trigram/distance signals disagree
      vs "Willoughby Leisure Centre" (74efcd17-7f16-4e56-8467-4586fff4cfdc) trigram=1.00 dist=943m
  - PCYC Auburn: ambiguous: trigram/distance signals disagree
      vs "PCYC Auburn" (09b00aa1-de45-4b75-b0d3-cf45c84bef1c) trigram=1.00 dist=1157m
*/
