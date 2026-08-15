-- A6 (venues-plan.md §3): P1 multi-purpose bucket enrichment pass 4 — 9 of the 13
-- leads (council/uni/PCYC leisure centres), researched 2026-08-15 via WebSearch/WebFetch against
-- each operator's own site where reachable. 4 leads dropped: Macquarie Fields Leisure Centre (pool
-- only, no badminton), Curl Curl Sports Centre + North Curl Curl Community Centre (unconfirmed,
-- likely same site as Curl Curl Youth and Community Centre), Macquarie University Sports Fields
-- (outdoor fields only, no badminton). "Sydney Badminton" (same site as Hurstville Boys HS) was
-- already skipped in the dedicated bucket per enrich-p1-halls.mjs.
-- Regenerate with: node scripts/venues/enrich-p1-multi.mjs


-- New: "Ryde Aquatic Leisure Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Ryde Aquatic Leisure Centre', 'Ryde', 'NSW', '504 Victoria Rd, Ryde NSW 2112',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1187894, -33.8215454), 4326), 'ChIJg5mhFp-lEmsROT32U-30_5A', 'partner', 'ryde-aquatic-leisure-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 2, 2, false, null, 'public', null, null, 'https://www.ryde.nsw.gov.au/RALC', '(02) 8878 5111', '{"mon":[["05:30","20:45"]],"tue":[["05:30","20:45"]],"wed":[["05:30","20:45"]],"thu":[["05:30","20:45"]],"fri":[["05:30","19:45"]],"sat":[["06:30","17:45"]],"sun":[["07:30","17:45"]]}'::jsonb, 'Court hire price conflicts between sources ($22/hr vs $40.50/hr) — confirm current rate with the centre before visiting.', 'operator', 'https://www.badmintoncourt.au/sydney/venue/ryde-aquatic-leisure-centre', 'medium', now()
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

-- New: "Macquarie University Sport and Aquatic Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Macquarie University Sport and Aquatic Centre', 'Macquarie Park', 'NSW', '10 Gymnasium Rd, Macquarie Park NSW 2113',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1107321, -33.7726454), 4326), 'ChIJQ3nR5HGmEmsRjJEXjU7CV3o', 'partner', 'macquarie-university-sport-and-aquatic-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'public', 'Jonas Leisure', 'https://musac.jonasleisure.com.au/Booking/Book', 'https://sport.mq.edu.au/facility-hire/courts', '(02) 9850 7636', null, null, 'operator', 'https://sport.mq.edu.au/facility-hire', 'medium', now()
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

-- New: "Morris Iemma Indoor Sports Centre" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Morris Iemma Indoor Sports Centre', 'Riverwood', 'NSW', '150 Belmore Rd North, Riverwood NSW 2210',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0544488, -33.9437712), 4326), 'ChIJoTm4NjS5EmsR3cvGe4fjpaQ', 'partner', 'morris-iemma-indoor-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 2, false, null, 'public', 'Council booking form', 'https://cbcity.snapforms.com.au/form/morris-iemma-casual-hire', null, '(02) 9153 0441', null, 'Also splits into 4 half-courts via motorised curtain. Off-peak Mon-Fri 9am-4pm, peak Mon-Fri 4-10pm and all weekends/school holidays — call ahead to check availability.', 'operator', 'https://www.cbcity.nsw.gov.au/sport-and-recreation/morris-iemma-indoor-sports-centre-miisc/miisc-fees-and-charges', 'high', now()
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
    ('Casual — Peak, full court', array[1,2,3,4,5,6,7], 8500, 'court_hour', 'Mon-Fri 4-10pm, weekends, school holidays'),
    ('Casual — Off-peak, full court', array[1,2,3,4,5], 4900, 'court_hour', 'Mon-Fri 9am-4pm'),
    ('Casual — Peak, half court', array[1,2,3,4,5,6,7], 5100, 'court_hour', 'Mon-Fri 4-10pm, weekends, school holidays'),
    ('Casual — Off-peak, half court', array[1,2,3,4,5], 4000, 'court_hour', 'Mon-Fri 9am-4pm')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "North Sydney Indoor Sports Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('North Sydney Indoor Sports Centre', 'Crows Nest', 'NSW', 'Level 5/36 Hume St, Crows Nest NSW 2065',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1995239, -33.8245658), 4326), 'ChIJN1iVocKuEmsRURriAmRDd_k', 'partner', 'north-sydney-indoor-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 4, false, null, 'public', 'Jonas Leisure', 'https://nsba.jonasleisure.com.au', 'https://www.nsba.com.au/court-hire', '(02) 9906 7877', '{"mon":[["07:00","23:00"]],"tue":[["07:00","23:00"]],"wed":[["07:00","23:00"]],"thu":[["07:00","23:00"]],"fri":[["07:00","23:00"]],"sat":[["08:00","21:00"]],"sun":[["08:00","23:00"]]}'::jsonb, null, 'operator', 'https://www.nsba.com.au/court-hire', 'medium', now()
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
    ('Casual', array[1,2,3,4,5,6,7], 4500, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "PCYC Northern Beaches" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('PCYC Northern Beaches', 'Dee Why', 'NSW', '40 Kingsway, Dee Why NSW 2099',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.2862588, -33.7503059), 4326), 'ChIJa9f9koOqEmsRLbEogDqynQM', 'partner', 'pcyc-northern-beaches')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 2, false, null, 'public', null, 'https://secure.activecarrot.com/public/facility/index/1000/1195', 'https://www.pcycnsw.org.au/northern-beaches/activities/badminton', '(02) 9196 9100', '{"mon":[["09:00","22:00"]],"tue":[["09:00","22:00"]],"wed":[["09:00","22:00"]],"thu":[["09:00","22:00"]],"fri":[["09:00","22:00"]],"sat":[["09:00","18:00"]],"sun":[["09:00","15:00"]]}'::jsonb, 'Fri 8-10pm social badminton session requires an annual PCYC membership; private court hire (no membership) bookable by phone.', 'operator', 'https://www.pcycnsw.org.au/northern-beaches/activities/court-hire', 'high', now()
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
    ('Private court hire', array[1,2,3,4,5,6,7], 5000, 'court_hour', 'Equipment included; book by phone'),
    ('Friday social session', array[5], 1300, 'person_session', '8-10pm, requires PCYC membership')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Avalon Recreation Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Avalon Recreation Centre', 'Avalon Beach', 'NSW', '59 Old Barrenjoey Rd, Avalon Beach NSW 2107',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.3294526, -33.6356359), 4326), 'ChIJc7nl-9SscmsRbK3lsE3rrPk', 'partner', 'avalon-recreation-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'club_only', null, null, 'https://www.avalonbadminton.com/', null, null, 'Badminton hosted by Avalon Badminton Club, not the venue directly — not on the council''s own venue page. Club sessions Mon 7:30-10pm, Fri 7:30-9:30pm. Contact the club (Brian, 0415 476 308) before coming for the first time. Casual $15/session; regulars need Sydney Central Badminton membership.', 'partner', 'https://www.avalonbadminton.com/', 'medium', now()
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

-- New: "Curl Curl Youth and Community Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Curl Curl Youth and Community Centre', 'North Curl Curl', 'NSW', '242 Abbott Rd, North Curl Curl NSW 2099',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.2893618, -33.7660048), 4326), 'ChIJ8Z-HLI2qEmsRXHtO2t5UJPM', 'partner', 'curl-curl-youth-and-community-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'public', 'Zest', 'https://www.zestapp.com.au/venues/curl-curl-youth-and-community-centre/ddbac8f2-6b5e-4a05-a416-db0d50057184', null, null, null, 'Price on enquiry via the venue''s Zest booking listing. "Curl Curl Sports Centre" (240 Abbott Rd, ~100m away) and "North Curl Curl Community Centre" have no independent badminton confirmation and are likely the same site or a nearby precinct name — not modelled as separate venues.', 'operator', 'https://www.zestapp.com.au/venues/curl-curl-youth-and-community-centre/ddbac8f2-6b5e-4a05-a416-db0d50057184', 'medium', now()
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

-- New: "Taren Point Youth Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Taren Point Youth Centre', 'Taren Point', 'NSW', '135 Taren Point Rd, Taren Point NSW 2229',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1209775, -34.0214162), 4326), 'ChIJtX4WqFe5EmsR0xwtljgpkW4', 'partner', 'taren-point-youth-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'public', 'Zest', 'https://www.zestapp.com.au/venues/taren-point-youth-centre/55f8aad7-3b62-471d-9e2f-10529545ebe2', null, null, null, 'Court count conflicts across sources (3 vs 4) — not stored. No operator-owned website found; booking is via Zest only.', 'operator', 'https://www.zestapp.com.au/venues/taren-point-youth-centre/55f8aad7-3b62-471d-9e2f-10529545ebe2', 'medium', now()
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
    ('Court hire', array[1,2,3,4,5,6,7], 2600, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Macquarie Fields Fitness & Indoor Sports Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Macquarie Fields Fitness & Indoor Sports Centre', 'Macquarie Fields', 'NSW', '52 Fields Rd, Macquarie Fields NSW 2564',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8817004, -33.9958311), 4326), 'ChIJIQuf8zvrEmsRXKaJVjGpZkQ', 'partner', 'macquarie-fields-fitness-indoor-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'public', null, null, 'https://www.campbelltown.nsw.gov.au/Services-and-Facilities/Facilities-for-Hire/Macquarie-Fields-Fitness-Centre-Sports-Hall-Hire', null, null, 'Sports hall was reported temporarily closed for a flooring upgrade as of the research date (2026-08-15) — confirm reopening before visiting. "Macquarie Fields Leisure Centre" (same council precinct) is the pool only, no badminton, not modelled as a separate venue.', 'operator', 'https://www.campbelltown.nsw.gov.au/Services-and-Facilities/Facilities-for-Hire/Macquarie-Fields-Fitness-Centre-Sports-Hall-Hire', 'medium', now()
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
    ('Casual, full court', array[1,2,3,4,5,6,7], 10300, 'court_hour', null),
    ('Casual, half court', array[1,2,3,4,5,6,7], 6450, 'court_hour', null),
    ('Permanent hirer, full court', array[1,2,3,4,5,6,7], 9400, 'court_hour', null),
    ('Permanent hirer, half court', array[1,2,3,4,5,6,7], 5300, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;
