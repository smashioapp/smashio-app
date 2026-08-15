-- A6 (venues-plan.md §3): P1 non-chain enrichment pass 2 — the 8 dedicated badminton
-- centres not part of any operator chain (ATC, Ace, Pro1, Roketto, Yennora, KBC Camellia, APX
-- Thornleigh, A1 Campbelltown), researched 2026-08-15 via WebSearch/WebFetch against each
-- operator's own site (badmintoncourt.au directory used only where the operator's own site
-- didn't carry the field). None of these existed as venues before — surfaced only by the §3
-- Places sweep, not the original 15-row CSV.
-- Regenerate with: node scripts/venues/enrich-p1-nonchain.mjs


-- New: "ATC Badminton Centre" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('ATC Badminton Centre', 'Alexandria', 'NSW', 'Unit A/27 Hiles St, Alexandria NSW 2015',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1995121, -33.9035108), 4326), 'ChIJfd37zq6lEmsRx30HcY_cJgw', 'partner', 'atc-badminton-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 8, 8, true, null, 'public', 'ATC Booking (yepbooking)', 'https://australia-badminton-development-centre.yepbooking.com.au/', null, '+61 426 013 302', '{"mon":[["10:00","23:00"]],"tue":[["10:00","23:00"]],"wed":[["10:00","23:00"]],"thu":[["10:00","23:00"]],"fri":[["10:00","23:00"]],"sat":[["10:00","23:00"]],"sun":[["10:00","23:00"]]}'::jsonb, null, 'operator', 'https://atcbadminton.com.au/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Ace Badminton Sydney" (confidence: low)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Ace Badminton Sydney', 'Silverwater', 'NSW', 'Slough Ave, Silverwater NSW 2128',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0506814, -33.8306985), 4326), 'ChIJFY4q1b2lEmsROUxFkDHbtsk', 'partner', 'ace-badminton-sydney')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, true, null, 'public', null, null, 'https://www.facebook.com/acebadmintonsydney/', null, null, 'No operator website found. Contact via Facebook to confirm hours before visiting.', 'operator', 'https://www.badmintoncourt.au/sydney/venue/ace-badminton-sydney', 'low', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Pro1 Badminton Centre" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Pro1 Badminton Centre', 'Bankstown Aerodrome', 'NSW', '1/361 Milperra Rd, Bankstown Aerodrome NSW 2200',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9895127, -33.9277697), 4326), 'ChIJneCks1C_EmsRR1BYfq3pvp8', 'partner', 'pro1-badminton-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 14, 14, true, null, 'public', 'Pro1 Booking Portal', 'https://booking.pro1badminton.com.au/secure/customer/booking/v1/public/show', null, '+61 406 725 935', null, '24/7 self-access via emailed pin-code; staffed for racquet hire Mon-Fri 4-10pm, Sat-Sun 10am-10pm.', 'operator', 'https://pro1badminton.com.au/what-we-offer/badminton-court-hire/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
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
    ('Off-peak', array[1,2,3,4,5], 3000, 'court_hour', 'Mon-Fri 6am-4pm'),
    ('Peak', array[1,2,3,4,5,6,7], 3600, 'court_hour', 'All other times & public holidays')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Roketto Badminton" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Roketto Badminton', 'Lidcombe', 'NSW', '22 Carter St, Lidcombe NSW 2141',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0574872, -33.8512096), 4326), 'ChIJ7Ui-lPC7EmsRfVJrKReUFQY', 'partner', 'roketto-badminton')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, true, null, 'public', 'Roketto Booking (Sportlogic)', 'https://roketto.sportlogic.net.au/secure/customer/login', null, null, '{"mon":[["09:00","23:00"]],"tue":[["09:00","23:00"]],"wed":[["09:00","23:00"]],"thu":[["09:00","23:00"]],"fri":[["09:00","23:00"]],"sat":[["07:00","23:00"]],"sun":[["07:00","23:00"]]}'::jsonb, null, 'operator', 'https://www.roketto.com.au/playing.html', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Yennora Badminton Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Yennora Badminton Centre', 'Yennora', 'NSW', 'Unit 7B/26 Nelson Rd, Yennora NSW 2161',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.968913, -33.8649468), 4326), 'ChIJ5TlUO5e9EmsRwxA-9MYhmgA', 'partner', 'yennora-badminton-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 12, 12, true, null, 'public', 'Yennora Badminton Centre Booking (yepbooking)', 'https://badmintoncentre-yennora.yepbooking.com.au/', null, '0451 861 885', '{"mon":[["10:00","23:00"]],"tue":[["10:00","23:00"]],"wed":[["10:00","23:00"]],"thu":[["10:00","23:00"]],"fri":[["10:00","23:00"]],"sat":[["10:00","23:00"]],"sun":[["10:00","23:00"]]}'::jsonb, null, 'operator', 'https://www.badmintoncourt.au/sydney/venue/badmintonworx-yennora', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
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
    ('Off-peak', array[1,2,3,4,5], 2900, 'court_hour', '10am-5pm weekdays'),
    ('Peak', array[1,2,3,4,5,6,7], 3200, 'court_hour', 'After 5pm weekdays and all weekend')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "KBC Badminton Camellia" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('KBC Badminton Camellia', 'Camellia', 'NSW', 'Unit 7/175-179 James Ruse Dr, Camellia NSW 2142',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.023357, -33.8176039), 4326), 'ChIJcxF59uWjEmsRg1tFSBnODcU', 'partner', 'kbc-badminton-camellia')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, true, null, 'public', 'KBC NSW Booking (yepbooking)', 'https://kbcnsw.yepbooking.com.au', null, null, null, 'Operator site lists specific social-session times (Mon/Thu/Sat/Sun) rather than full opening hours — confirm via the booking site before visiting.', 'operator', 'https://www.kbcbadminton.com.au/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
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
    ('Member', array[1,2,3,4,5,6,7], 1800, 'person_session', 'Member session price'),
    ('Non-member', array[1,2,3,4,5,6,7], 2200, 'person_session', 'Non-member session price')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "APX Badminton Courts" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('APX Badminton Courts', 'Thornleigh', 'NSW', 'Unit 2 & 3/35E Sefton Rd, Thornleigh NSW 2120',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0788132, -33.7213992), 4326), 'ChIJ6TuPxQCnEmsRV8rpeLC7v3Y', 'partner', 'apx-badminton-courts')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, true, null, 'public', 'APX Booking (Sportlogic)', 'https://apxbadminton.sportlogic.net.au/secure/customer/booking/v1/public/venues', null, '+61 422 993 262', null, null, 'operator', 'https://apxbadminton.com.au/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
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
    ('Weekday', array[1,2,3,4,5], 3800, 'court_hour', '$25-38 per court depending on time slot'),
    ('Weekend', array[6,7], 4000, 'court_hour', '$36-40 per court depending on time slot')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "A1 Badminton Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('A1 Badminton Centre', 'Campbelltown', 'NSW', '11 Mount Erin Rd, Campbelltown NSW 2560',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8039305, -34.0596733), 4326), 'ChIJdSkiVOXvEmsR4kRyznNfpK4', 'partner', 'a1-badminton-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 10, 10, true, null, 'public', 'A1 Badminton Booking Portal', 'https://booking.a1badminton.com.au/secure/customer/booking/v1/public/show', null, '0416 592 150', '{"mon":[["07:00","23:00"]],"tue":[["07:00","23:00"]],"wed":[["07:00","23:00"]],"thu":[["07:00","23:00"]],"fri":[["07:00","23:00"]],"sat":[["07:00","23:00"]],"sun":[["07:00","23:00"]]}'::jsonb, null, 'operator', 'https://a1badminton.com.au/book-court/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
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
    ('Morning', array[1,2,3,4,5], 1600, 'court_hour', 'Mon-Fri 7am-4pm'),
    ('Afternoon/Evening', array[1,2,3,4,5], 2600, 'court_hour', 'Mon-Fri 4pm-10pm'),
    ('Late', array[1,2,3,4,5], 2000, 'court_hour', 'Mon-Fri 10pm-11pm'),
    ('Weekend/Public Holiday', array[6,7], 2600, 'court_hour', 'Sat-Sun & public holidays')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;
