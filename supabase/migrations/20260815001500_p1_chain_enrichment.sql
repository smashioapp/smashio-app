-- A6 (venues-plan.md §3): P1 operator-chain enrichment (NBC, Alpha, BadmintonWorx, The
-- Badminton Club) researched 2026-08-15 via WebSearch/WebFetch against each operator's own site
-- and, where that didn't carry hours/pricing, the badmintoncourt.au directory. Not phone-verified.
-- Regenerate with: node scripts/venues/enrich-p1-chains.mjs
--
-- Resolves the Alpha cluster A2 withheld (see 20260815001400's WITHHELD comment): three
-- confirmed distinct addresses/phones inserted as new venues; the legacy ambiguous
-- "Alpha Badminton Centre" seed row is deliberately left untouched, same treatment as the
-- still-unresolved NBC Homebush (has a live published game against it).


-- Correction: "The Badminton Club Wetherill Park" — courts_total was wrong in the CSV ingest, corrected against the operator's own site.
insert into public.venue_profiles (venue_id, courts_badminton, courts_total, phone, opening_hours, booking_url, data_source, source_url, confidence, verified_at, dedicated, bookability)
values ('33bfff0a-b8e2-464b-a2d4-1b323670a1b4', 7, 7, '1300 754 078', '{"mon":[["05:00","24:00"]],"tue":[["05:00","24:00"]],"wed":[["05:00","24:00"]],"thu":[["05:00","24:00"]],"fri":[["05:00","24:00"]],"sat":[["05:00","24:00"]],"sun":[["05:00","24:00"]]}'::jsonb, 'https://www.thebadmintonclub.com.au/wetherillpark', 'operator', 'https://www.thebadmintonclub.com.au/', 'high', now(), true, 'public')
on conflict (venue_id) do update set
  courts_badminton = excluded.courts_badminton,
  courts_total = excluded.courts_total,
  phone = excluded.phone,
  opening_hours = excluded.opening_hours,
  booking_url = excluded.booking_url,
  data_source = excluded.data_source,
  source_url = excluded.source_url,
  confidence = excluded.confidence,
  verified_at = excluded.verified_at,
  updated_at = now();

-- New: "NBC Castle Hill" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC Castle Hill', 'Castle Hill', 'NSW', '3/16 Anella Ave, Castle Hill NSW 2154',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9815431, -33.7260298), 4326), 'ChIJd_tBQrWhEmsRW8Nq72llcAg', 'partner', 'nbc-castle-hill')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 11, 11, true, null, 'public', 'NBC Portal (yepbooking)', 'https://nbc.yepbooking.com.au/', '+61 434 888 356', '{"mon":[["10:00","22:00"]],"tue":[["10:00","22:00"]],"wed":[["10:00","22:00"]],"thu":[["10:00","22:00"]],"fri":[["10:00","22:00"]],"sat":[["07:00","22:00"]],"sun":[["07:00","22:00"]]}'::jsonb, null, 'operator', 'https://www.badmintoncourt.au/sydney/venue/nbc-castle-hill', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3600, 'court_hour', '$26-36 per court')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "NBC Alexandria" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC Alexandria', 'Alexandria', 'NSW', '8/190 Bourke Rd, Alexandria NSW 2015',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1922155, -33.9172237), 4326), 'ChIJVUbjh4axEmsRpz899gd2EV4', 'partner', 'nbc-alexandria')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 18, 18, true, null, 'public', 'NBC Portal (yepbooking)', 'https://nbc.yepbooking.com.au/', '+61 411 139 588', '{"mon":[["10:00","23:00"]],"tue":[["10:00","23:00"]],"wed":[["10:00","23:00"]],"thu":[["10:00","23:00"]],"fri":[["10:00","23:00"]],"sat":[["07:00","22:00"]],"sun":[]}'::jsonb, null, 'operator', 'https://www.badmintoncourt.au/sydney/venue/nbc-alexandria', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3700, 'court_hour', '$31-37 per court')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "NBC MQ Park" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC MQ Park', 'Macquarie Park', 'NSW', '396 Lane Cove Rd, Macquarie Park NSW 2113',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1271299, -33.7847245), 4326), 'ChIJ-bXf7SenEmsRzh-VaRPrkrI', 'partner', 'nbc-mq-park')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 8, 8, true, null, 'public', 'NBC Portal (yepbooking)', 'https://nbc.yepbooking.com.au/', '+61 428 862 917', '{"mon":[["10:00","23:00"]],"tue":[["10:00","23:00"]],"wed":[["10:00","23:00"]],"thu":[["10:00","23:00"]],"fri":[["10:00","23:00"]],"sat":[["07:00","22:00"]],"sun":[["07:00","22:00"]]}'::jsonb, null, 'operator', 'https://nbcbadminton.com.au/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "NBC Seven Hills" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC Seven Hills', 'Seven Hills', 'NSW', '3/17 Stanton Rd, Seven Hills NSW 2147',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9532, -33.770613), 4326), 'ChIJWSXGbZ2YEmsRkzBgkueJ-U4', 'partner', 'nbc-seven-hills')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 7, 7, true, 'synthetic', 'public', 'NBC Portal (yepbooking)', 'https://nbc.yepbooking.com.au/', '+61 422 018 309', null, null, 'operator', 'https://www.badmintoncourt.au/sydney/venue/nbc-seven-hills', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3600, 'court_hour', '$26-36 per court')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "NBC Olympic Park" (confidence: low)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC Olympic Park', 'Sydney Olympic Park', 'NSW', '5 Parkview Dr, Sydney Olympic Park NSW 2127',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0736833, -33.8451824), 4326), 'ChIJESV9XwClEmsRCMmPsbDv_dw', 'partner', 'nbc-olympic-park')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, true, null, 'public', 'NBC Portal (yepbooking)', 'https://nbc.yepbooking.com.au/', '+61 424 762 610', null, null, 'operator', 'https://nbcbadminton.com.au/', 'low', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "BadmintonWorx Norwest" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('BadmintonWorx Norwest', 'Norwest', 'NSW', '2/2 Inglewood Pl, Norwest NSW 2153',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9589456, -33.7358585), 4326), 'ChIJOT66Z7ShEmsRbPyVWTMOx24', 'partner', 'badmintonworx-norwest')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 15, 15, true, null, 'public', 'BadmintonWorx Website / App (yepbooking)', 'https://badmintonworx-norwest.yepbooking.com.au/', '1300 223 646', '{"mon":[["10:00","23:00"]],"tue":[["10:00","23:00"]],"wed":[["10:00","23:00"]],"thu":[["10:00","23:00"]],"fri":[["10:00","23:00"]],"sat":[["07:00","23:00"]],"sun":[["07:00","22:00"]]}'::jsonb, null, 'operator', 'https://www.badmintoncourt.au/sydney/venue/badmintonworx-norwest', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3700, 'court_hour', '$25-37 per court')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "The Badminton Club Prestons" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('The Badminton Club Prestons', 'Prestons', 'NSW', '276 Kurrajong Rd (entrance via Kookaburra Rd N), Prestons NSW 2170',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8588757, -33.9405539), 4326), 'ChIJ9_8ZCN-TEmsREngUTgXkXPo', 'partner', 'the-badminton-club-prestons')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 10, 10, true, null, 'public', 'The Badminton Club Website', 'https://www.thebadmintonclub.com.au/prestons', '1300 754 078', '{"mon":[["05:00","24:00"]],"tue":[["05:00","24:00"]],"wed":[["05:00","24:00"]],"thu":[["05:00","24:00"]],"fri":[["05:00","24:00"]],"sat":[["05:00","24:00"]],"sun":[["05:00","24:00"]]}'::jsonb, 'Automated keycode entry, open every day including public holidays.', 'operator', 'https://www.thebadmintonclub.com.au/prestons', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Alpha Badminton Centre - Egerton St" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Alpha Badminton Centre - Egerton St', 'Silverwater', 'NSW', '46 Egerton St, Silverwater NSW 2128',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.045578, -33.8344459), 4326), 'ChIJmZXOtWWjEmsRUqvI1ikzW68', 'partner', 'alpha-badminton-centre-egerton-st')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 22, 22, true, null, 'public', 'Alpha Badminton Website (yepbooking)', 'https://alphabadminton.yepbooking.com.au/', '0475 698 888', '{"mon":[["09:00","23:00"]],"tue":[["09:00","23:00"]],"wed":[["09:00","23:00"]],"thu":[["09:00","23:00"]],"fri":[["09:00","23:00"]],"sat":[["07:00","23:00"]],"sun":[["08:00","23:00"]]}'::jsonb, 'One of three distinct Alpha Badminton sites (Egerton St / Auburn / Slough Ave) — the CSV''s single ambiguous ''Alpha Badminton Centre'' row is a different, unresolved legacy entry and was deliberately left untouched (venues-plan.md §1 finding #2, SWEEP-FINDINGS.md).', 'operator', 'https://alphabadminton.com.au/pages/contact-us', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3700, 'court_hour', '$15-37 per court')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Alpha Badminton Centre - Auburn" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Alpha Badminton Centre - Auburn', 'Auburn', 'NSW', 'Unit 6, Building 2/161 Manchester Rd, Auburn NSW 2144',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0186699, -33.8451057), 4326), 'ChIJ9Sc_6Z-9EmsRROJA1EId_tY', 'partner', 'alpha-badminton-centre-auburn')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 22, 22, true, null, 'public', 'Alpha Badminton Website (yepbooking)', 'https://alphabadminton.yepbooking.com.au/', '0460 758 888', '{"mon":[["09:00","23:00"]],"tue":[["09:00","23:00"]],"wed":[["09:00","23:00"]],"thu":[["09:00","23:00"]],"fri":[["09:00","23:00"]],"sat":[["07:00","23:00"]],"sun":[["07:00","23:00"]]}'::jsonb, 'One of three distinct Alpha Badminton sites (Egerton St / Auburn / Slough Ave) — see Egerton St''s note.', 'operator', 'https://alphabadminton.com.au/pages/contact-us', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Alpha Badminton Centre - Slough Ave" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Alpha Badminton Centre - Slough Ave', 'Silverwater', 'NSW', '47/2 Slough Ave, Silverwater NSW 2128',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.050033, -33.8308452), 4326), 'ChIJIxduAK2kEmsRVgEvHX6cBi0', 'partner', 'alpha-badminton-centre-slough-ave')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 13, 13, true, null, 'public', 'Alpha Badminton Website (yepbooking)', 'https://alphabadminton.yepbooking.com.au/', '0482 478 888', '{"mon":[["17:00","23:00"]],"tue":[["17:00","23:00"]],"wed":[["17:00","23:00"]],"thu":[["17:00","23:00"]],"fri":[["17:00","23:00"]],"sat":[["07:00","23:00"]],"sun":[["08:00","23:00"]]}'::jsonb, 'One of three distinct Alpha Badminton sites (Egerton St / Auburn / Slough Ave) — see Egerton St''s note. This is also the site the sweep found within 250m of Ace Badminton Sydney and NBC Silverwater (three separate operators, not one venue — SWEEP-FINDINGS.md).', 'operator', 'https://alphabadminton.com.au/pages/contact-us', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Standard', array[1,2,3,4,5,6,7], 3700, 'court_hour', '$15-37 per court')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;
