-- A6 (venues-plan.md §3): P2 enrichment pass. See data/venues/leads-to-enrich.csv (P2
-- rows) and the header comment in this script for the full stale-queue reconciliation.
-- Regenerate with: node scripts/venues/enrich-p2.mjs
--
-- Skipped (confirmed no badminton, or exact duplicate of a row inserted/updated below):
--   - Marie Bashir Mosman Sports Centre: no_badminton — council site: single court configured for netball/basketball/indoor hockey/futsal only
--   - South Eveleigh Sports Courts: no_badminton — operator lists basketball/tennis/futsal only
--   - Entertainment Park: no_badminton — indoor go-kart/bowling/mini-golf/arcade complex
--   - Doohan Oval: no_badminton — outdoor tennis/netball/basketball/football reserve
--   - Warriewood Valley Sports Court: no_badminton — outdoor netball/basketball hard courts
--   - Quaycentre: no_badminton — gymnastics/basketball/indoor soccer/netball/volleyball venue; badminton is the separate Sports Halls venue (already enriched)
--   - St Marys Indoor Sports & Recreation: no_badminton — cricket/netball/soccer/touch football/dodgeball only
--   - St Clair Leisure Centre: no_badminton — basketball-oriented hall, no badminton found anywhere
--   - EZBOX Sports Eastwood: no_badminton — retail equipment store, not a venue with courts
--   - Penrith Indoor Sports and Recreation: no_badminton — indoor cricket/netball/soccer only
--   - Camellia Indoor Sports Centre: no_badminton — basketball/volleyball/futsal/netball/pickleball only; confirmed NOT the same as KBC Camellia
--   - Balmoral Rd Sports Complex: no_badminton — outdoor AFL/soccer/cricket fields + tennis + ball courts
--   - Johnny Warren Indoor Sports Centre: duplicate — same stadium as Hurstville Aquatic Leisure Centre (same address/phone/website)
--   - Alpha Slough / Alpha Badminton Centre - Slough Ave: duplicate — already inserted in the P1 chain pass (20260815001500)
--   - Bankstown City Sports Complex: no_badminton — outdoor netball/basketball/cricket park
--   - Pittwater Sports Centre: no_badminton — kids sport/fitness/physio/church/cafe complex


-- New: "Blacktown Leisure Centre Stanhope" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Blacktown Leisure Centre Stanhope', 'Stanhope Gardens', 'NSW', 'Stanhope Pkwy & Sentry Dr, Stanhope Gardens NSW 2768',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9213557, -33.7195019), 4326), 'ChIJB9jAkDyfEmsRfOWgUKpFJHI', 'partner', 'blacktown-leisure-centre-stanhope')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 4, false, 'synthetic', 'public', null, 'ActiveCarrot', 'https://secure.activecarrot.com/public/facility/browse/1102/1279', 'https://www.blacktownaquaticandsports.com.au/About/Our-venues/Blacktown-Leisure-Centre-Stanhope', '02 9421 2600', '{"mon":[["06:00","21:00"]],"tue":[["06:00","21:00"]],"wed":[["06:00","21:00"]],"thu":[["06:00","21:00"]],"fri":[["06:00","21:00"]],"sat":[["08:00","17:00"]],"sun":[["08:00","17:00"]]}'::jsonb, 'Stadium is 4 multi-use indoor courts shared between badminton, pickleball, squash and other sports; book via ActiveCarrot portal or phone.', 'operator', 'https://www.blacktownaquaticandsports.com.au/About/Our-venues/Blacktown-Leisure-Centre-Stanhope', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Court hire', array[1,2,3,4,5,6,7], 3900, 'court_hour', '~$39/hr, approximate — cross-checked against a secondary listing')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Menai Indoor Sports Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Menai Indoor Sports Centre', 'Menai', 'NSW', '98-150 Allison Cres, Menai NSW 2234',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0152149, -34.0119326), 4326), 'ChIJrfhTYprAEmsR2ieIjiFYZbw', 'partner', 'menai-indoor-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 4, false, 'synthetic', 'public', null, 'Attekus / Sutherland Shire Council online booking', 'https://sutherland.bookable.net.au/venues/314/menai-indoor-sports-centre', 'https://www.sutherlandshire.nsw.gov.au/Outdoors/Leisure-Centres/Centres/Menai-Indoor-Sports-Centre', '(02) 9532 0444', '{"mon":[["09:00","22:00"]],"tue":[["09:00","22:00"]],"wed":[["09:00","22:00"]],"thu":[["09:00","22:00"]],"fri":[["09:00","22:00"]],"sat":[["08:30","15:30"]],"sun":[]}'::jsonb, '4 multi-purpose courts hosting badminton alongside basketball, netball, indoor soccer, volleyball, gymnastics, martial arts and dance programs. Sunday availability is by request rather than fixed public hours.', 'operator', 'https://www.sutherlandshireaustralia.com.au/5122/menai-indoor-sports-centre/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Willoughby Leisure Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Willoughby Leisure Centre', 'Willoughby', 'NSW', '2 Small St, Willoughby NSW 2068',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.2037048, -33.8115509), 4326), 'ChIJWQFBVDypEmsRW7A__buPlw8', 'partner', 'willoughby-leisure-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 4, false, 'synthetic', 'public', null, 'ActiveCarrot', 'https://secure.activecarrot.com/public/facility/overlay/1242/1454', 'https://www.willoughbyleisure.com.au/Facilities-and-opening-hours/Sports-Hall', '02 9958 5799', '{"mon":[["06:00","22:00"]],"tue":[["06:00","22:00"]],"wed":[["06:00","22:00"]],"thu":[["06:00","22:00"]],"fri":[["06:00","22:00"]],"sat":[["07:00","19:00"]],"sun":[["07:00","19:00"]]}'::jsonb, '4 mixed-purpose sports hall courts. Home of the Willoughby Badminton Association (club sessions Sat/Sun afternoons, visitors welcome) alongside general public casual hire.', 'operator', 'https://www.willoughbyleisure.com.au/Facilities-and-opening-hours/Sports-Hall', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Court hire', array[1,2,3,4,5,6,7], 3000, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Ultimo Community Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Ultimo Community Centre', 'Ultimo', 'NSW', '40 William Henry St corner Bulwara Rd, Ultimo NSW 2007',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.198002, -33.877977), 4326), 'ChIJ64EYny-uEmsRxaJRkE5K53o', 'partner', 'ultimo-community-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 1, false, 'other', 'public', null, null, null, 'https://www.cityofsydney.nsw.gov.au/sports-facilities/outdoor-court-ultimo-community-centre', '02 9298 3111', '{"mon":[["10:00","20:00"]],"tue":[["10:00","20:00"]],"wed":[["10:00","20:00"]],"thu":[["10:00","20:00"]],"fri":[["10:00","20:00"]],"sat":[["10:00","16:00"]],"sun":[["10:00","16:00"]]}'::jsonb, 'Single multi-purpose indoor court suitable for basketball, volleyball, badminton, indoor soccer, futsal and pickleball. Equipment for purchase/hire on site. Closed public holidays.', 'operator', 'https://www.cityofsydney.nsw.gov.au/sports-facilities/outdoor-court-ultimo-community-centre', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Indoor court hire - standard', array[1,2,3,4,5,6,7], 3100, 'court_hour', null),
    ('Indoor court hire - concession', array[1,2,3,4,5,6,7], 2200, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Perry Park Recreation Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Perry Park Recreation Centre', 'Alexandria', 'NSW', '1B Maddox St, Alexandria NSW 2015',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1958329, -33.9080236), 4326), 'ChIJ12D1kXqxEmsRkZcv5ozfotI', 'partner', 'perry-park-recreation-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 4, false, 'other', 'public', null, null, null, 'https://www.cityofsydney.nsw.gov.au/community-centres/perry-park-recreation-centre', '02 9265 9182', '{"mon":[["10:00","23:00"]],"tue":[["10:00","23:00"]],"wed":[["10:00","23:00"]],"thu":[["10:00","23:00"]],"fri":[["10:00","22:00"]],"sat":[["08:00","20:30"]],"sun":[["09:00","20:00"]]}'::jsonb, '4 multipurpose indoor courts shared across basketball, netball, volleyball, badminton and futsal. City of Sydney-operated. Change facilities, showers, kiosk, free WiFi on site.', 'operator', 'https://www.cityofsydney.nsw.gov.au/community-centres/perry-park-recreation-centre', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "PCYC Hawkesbury" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('PCYC Hawkesbury', 'South Windsor', 'NSW', '16 Stewart St, South Windsor NSW 2756',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8042255, -33.6270853), 4326), 'ChIJeTEF_ledEmsRFWh0ShgkD7k', 'partner', 'pcyc-hawkesbury')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 6, false, 'other', 'public', null, null, null, 'https://www.pcycnsw.org.au/hawkesbury/', '(02) 4505 5070', '{"mon":[["06:00","21:30"]],"tue":[["06:00","21:30"]],"wed":[["06:00","21:30"]],"thu":[["06:00","21:30"]],"fri":[["06:00","21:30"]],"sat":[["08:00","16:00"]],"sun":[["10:00","16:00"]]}'::jsonb, 'Six-court indoor stadium shared across futsal, netball, basketball, volleyball and badminton. Casual court hire; bring own equipment. Booking by phone/email (hawkesbury@pcycnsw.org.au).', 'operator', 'https://www.pcycnsw.org.au/sports-recreation/badminton/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Casual badminton court hire', array[1,2,3,4,5,6,7], 4000, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "JS Sports Arena" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('JS Sports Arena', 'Smeaton Grange', 'NSW', '75 Anderson Rd, Smeaton Grange NSW 2567',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.7611892, -34.0340635), 4326), 'ChIJL-zc1UvxEmsRtIg6tlEhDd8', 'partner', 'js-sports-arena')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 11, 11, true, 'timber', 'public', null, 'SportLogic', 'https://jssportsarena.sportlogic.net.au/secure/customer/home', 'https://jssportsarena.com.au/', '+61 490 135 009', null, 'Dedicated indoor badminton/pickleball facility, sprung wooden floors, BWF-approved mats. 11 total courts split between badminton and pickleball (split not published). Racket hire ($5) and stringing available.', 'operator', 'https://jssportsarena.com.au/rates.html', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Weekday off-peak', array[1,2,3,4,5], 2500, 'court_hour', '6am-6pm'),
    ('Weekday peak', array[1,2,3,4,5], 3400, 'court_hour', '6pm-10pm'),
    ('Weekend peak', array[6,7], 3400, 'court_hour', '6am-12pm'),
    ('Weekend off-peak', array[6,7], 2800, 'court_hour', '12pm-10pm'),
    ('Late night (all days)', array[1,2,3,4,5,6,7], 2800, 'court_hour', '10pm onwards')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Bernie Mullane Sports Complex" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Bernie Mullane Sports Complex', 'Kellyville', 'NSW', '10 Marella Ave, Kellyville NSW 2155',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9679784, -33.7037593), 4326), 'ChIJL4mHYdehEmsRaAYnlLTOppQ', 'partner', 'bernie-mullane-sports-complex')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 6, 6, false, 'timber', 'public', null, null, null, 'https://berniemullane.com.au/', '02 8824 3522', '{"mon":[["08:00","22:00"]],"tue":[["08:00","22:00"]],"wed":[["08:00","22:00"]],"thu":[["08:00","22:00"]],"fri":[["08:00","22:00"]],"sat":[["08:00","21:00"]],"sun":[["08:00","21:00"]]}'::jsonb, 'Multi-purpose indoor courts (basketball/futsal/badminton) with sprung wooden flooring, run by The Hills Shire Council. Badminton nets/line-marking provided on request, not a dedicated venue.', 'operator', 'https://berniemullane.com.au/about/opening-hours/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "KGV Recreation Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('KGV Recreation Centre', 'The Rocks', 'NSW', '15 Cumberland St, The Rocks NSW 2000',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.206611, -33.8596386), 4326), 'ChIJSytgJF2uEmsRVZ0iEjbLdfE', 'partner', 'kgv-recreation-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 6, null, false, null, 'public', null, 'City of Sydney online booking / What''s On', 'https://whatson.cityofsydney.nsw.gov.au/events/kgv-casual-badminton', 'https://www.cityofsydney.nsw.gov.au/community-centres/king-george-v-kgv-recreation-centre', '02 9265 9868', null, 'Run by City of Sydney. Confirmed program is a scheduled casual/social badminton session (Tue 7-9am, all levels) — general facility hours for other court-hire not published.', 'operator', 'https://whatson.cityofsydney.nsw.gov.au/events/kgv-casual-badminton', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Casual badminton session (adult)', array[2], 650, 'person_session', 'Tuesdays 7-9am')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Robyn Webster Sports Centre" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Robyn Webster Sports Centre', 'Tempe', 'NSW', 'Holbeach Ave, Tempe NSW 2044',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1607025, -33.9314439), 4326), 'ChIJ3ab8c5KwEmsRbAKv5gT7ypo', 'partner', 'robyn-webster-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 8, null, false, 'timber', 'public', null, 'PerfectMind', 'https://innerwest.perfectmind.com/40526/Reports/BookMe4?widgetId=e9a6c34e-79ed-45bd-a585-c4d3641b30ea', 'https://www.innerwest.nsw.gov.au/indoor-sporting-centres/robyn-webster-sports-centre', '(02) 9392 5515', null, 'Jointly managed: Inner West Council weekdays 8am-4pm, Sat 8am-12pm, Wed 4pm-10:30pm; Sydney Uni Sport (SUSF) manages other times (phone (02) 9351 4978). Sprung timber floor, 8 badminton courts alongside volleyball/futsal/netball.', 'operator', 'https://www.innerwest.nsw.gov.au/indoor-sporting-centres/robyn-webster-sports-centre', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Gameday ANZ" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Gameday ANZ', 'Riverstone', 'NSW', '10 Edward St, Riverstone NSW 2765',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8567018, -33.6659678), 4326), 'ChIJn9PbE1adEmsRYEgFGOs3iXQ', 'partner', 'gameday-anz')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'public', null, 'Sportlogic', 'https://gamedayanz.sportlogic.net.au', 'https://www.gamedayanz.com.au/', '0410 466 760', null, 'Operator confirms indoor courts for badminton, pickleball and basketball under one roof. Court count, surface, hours and per-hour pricing not published — only bulk court-hire credit packages.', 'operator', 'https://www.gamedayanz.com.au/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Riverstone Sports Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Riverstone Sports Centre', 'Grantham Farm', 'NSW', '15 Hamilton St cnr Garfield Rd E, Grantham Farm NSW 2765',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.870869, -33.673848), 4326), 'ChIJeTh2bXueEmsREPTy-Wh9AQ8', 'partner', 'riverstone-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'club_only', 'Let''s Badminton club — Dinesh 0421 445 060', 'Skedda', null, 'https://rivochurch.com/rsc/badminton/', '02 9627 5148', '{"mon":[],"tue":[["06:00","07:00"]],"wed":[],"thu":[["06:00","07:00"]],"fri":[],"sat":[["06:00","07:00"]],"sun":[["06:00","07:00"]]}'::jsonb, 'Club-hired hall — badminton run by the ''Let''s Badminton'' club, not open to public drop-in. New players need a reference from an existing player or admin skill-assessment (24-48hr approval). Sessions Tue/Thu/Sat/Sun. Book via letsbadminton.skedda.com.', 'operator', 'https://rivochurch.com/rsc/badminton/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Sydney Uni Sport" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Sydney Uni Sport', 'Darlington', 'NSW', 'Cnr Codrington St and Darlington Ln, Darlington NSW 2008',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1917502, -33.8911668), 4326), 'ChIJ1Tf4v9OxEmsR4MXiVIiMqSM', 'partner', 'sydney-uni-sport')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 6, null, false, 'other', 'members_only', null, null, 'https://susf.com.au/online-bookings/', 'https://susf.com.au/sports-aquatic-centre/', '(02) 9351 4978', '{"mon":[["05:30","22:00"]],"tue":[["05:30","22:00"]],"wed":[["05:30","22:00"]],"thu":[["05:30","22:00"]],"fri":[["05:30","22:00"]],"sat":[["06:00","20:00"]],"sun":[["07:00","22:00"]]}'::jsonb, 'Sports & Aquatic Centre (SAC) building. Online booking restricted to active SUSF Annual Members; casual bookings go through phone. Distinct building from Robyn Webster Sports Centre and The Arena (both also SUSF-managed, both separate directory rows).', 'operator', 'https://susf.com.au/squash-tennis-courts/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "PlayPoint Seven Hills" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('PlayPoint Seven Hills', 'Seven Hills', 'NSW', '2/6 Boden Rd, Seven Hills NSW 2147',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.960008, -33.7739475), 4326), 'ChIJPdk_6eGjEmsRO7uheBpaLDA', 'partner', 'playpoint-seven-hills')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 8, 8, true, 'mat', 'public', null, 'HelloClub', 'https://playpoint.helloclub.com', 'https://playpoint.com.au/badminton/', '1800 903 600', '{"mon":[["00:00","23:59"]],"tue":[["00:00","23:59"]],"wed":[["00:00","23:59"]],"thu":[["00:00","23:59"]],"fri":[["00:00","23:59"]],"sat":[["00:00","23:59"]],"sun":[["00:00","23:59"]]}'::jsonb, '8 dedicated badminton courts, Taraflex Evolution mats over sprung floor. 24hr access. Social/beginner sessions Thu & Fri 8-10pm.', 'operator', 'https://playpoint.com.au/rates/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Off-peak court hire', array[1,2,3,4,5], 2900, 'court_hour', '6am-4pm weekdays'),
    ('Peak court hire', array[1,2,3,4,5], 3700, 'court_hour', '4pm-10pm weekdays'),
    ('Weekend off-peak', array[6,7], 2900, 'court_hour', '12pm-10pm'),
    ('Weekend peak', array[6,7], 3700, 'court_hour', '6am-12pm'),
    ('Overnight court hire', array[1,2,3,4,5,6,7], 2300, 'court_hour', '10pm-6am'),
    ('Social beginner badminton', array[4,5], 1400, 'person_hour', 'Doubles social session 8-10pm, approx $14/person')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "PlayPoint Blacktown" (confidence: low)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('PlayPoint Blacktown', 'Blacktown', 'NSW', '2A Bessemer St, Blacktown NSW 2148',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9126907, -33.7570441), 4326), 'ChIJzYAqVx-ZEmsRjSV1t1Ty37M', 'partner', 'playpoint-blacktown')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, 'mat', 'public', null, 'HelloClub', 'https://playpoint.helloclub.com', 'https://playpoint.com.au/badminton/', '1800 903 600', '{"mon":[["00:00","23:59"]],"tue":[["00:00","23:59"]],"wed":[["00:00","23:59"]],"thu":[["00:00","23:59"]],"fri":[["00:00","23:59"]],"sat":[["00:00","23:59"]],"sun":[["00:00","23:59"]]}'::jsonb, 'PlayPoint''s generic badminton page confirms badminton at this venue (24hr access, HelloClub booking) but doesn''t break out per-location court count or pricing.', 'partner', 'https://playpoint.com.au/badminton/', 'low', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "PCYC Marrickville" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('PCYC Marrickville', 'Marrickville', 'NSW', '531 Illawarra Rd, Marrickville NSW 2204',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1451878, -33.9196796), 4326), 'ChIJZ3am64OwEmsRb9BekLPkryU', 'partner', 'pcyc-marrickville')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 4, 3, false, 'other', 'public', null, 'ActiveCarrot', 'https://secure.activecarrot.com/public/facility/browse/138/1068', 'https://www.pcycnsw.org.au/marrickville/', '(02) 9559 7722', '{"mon":[["11:00","14:00"]],"tue":[["10:00","13:30"]],"wed":[["11:00","14:00"]],"thu":[["20:00","22:00"]],"fri":[["20:00","22:00"]],"sun":[["20:00","22:00"]]}'::jsonb, '3 multi-purpose indoor courts (Debbie & Abbey Borgia Community Recreation Centre); Court 3 lines out to 4 full-size badminton courts. Hours shown are badminton-specific casual/social program times, not full facility hours. 18+ only for these sessions.', 'operator', 'https://www.pcycnsw.org.au/marrickville/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Casual badminton session', array[1,2,3,4,5,7], 550, 'person_session', null),
    ('10-session pass', array[1,2,3,4,5,7], 4300, 'person_session', '$43 for 10 passes')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Star Smash Sports" (confidence: low)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Star Smash Sports', 'Marsden Park', 'NSW', 'Unit 2A/311 South St, Marsden Park NSW 2765',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8257979, -33.7102619), 4326), 'ChIJAXPCsymbEmsRVCjMoPq2llc', 'partner', 'star-smash-sports')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'public', null, 'YepBooking', 'https://starsmashsports.yepbooking.com.au/', null, '0428 030 151', null, 'Multi-sport indoor facility (badminton, pickleball, indoor cricket, soccer, table tennis; badminton coaching via Sydney Siders Academy). Court count, pricing and hours not confirmed — no working marketing site found.', 'operator', 'https://starsmashsports.yepbooking.com.au/', 'low', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Michael Clarke Recreation Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Michael Clarke Recreation Centre', 'Carnes Hill', 'NSW', '2 Margaret Dawson Dr, Carnes Hill NSW 2171',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8460716, -33.93557), 4326), 'ChIJwTaN52iTEmsRhUpdG3HiBeA', 'partner', 'michael-clarke-recreation-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 8, 2, false, null, 'public', null, null, 'https://www.michaelclarkecentre.com.au/sports/court-hire/', 'https://www.michaelclarkecentre.com.au/', '+61 2 8760 4800', '{"mon":[["05:00","22:00"]],"tue":[["05:00","22:00"]],"wed":[["05:00","22:00"]],"thu":[["05:00","22:00"]],"fri":[["05:00","22:00"]],"sat":[["07:00","18:30"]],"sun":[["07:00","18:30"]]}'::jsonb, 'Council-operated (Liverpool City Council / Belgravia Leisure) double-court indoor hall used for basketball, badminton, volleyball, futsal; lines down to 8 badminton (quarter-court) layouts.', 'operator', 'https://www.michaelclarkecentre.com.au/sports/court-hire/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Casual court hire (badminton)', array[1,2,3,4,5,6,7], 8570, 'court_hour', '1-hour minimum; separate ~$8.20 casual entry fee may also apply')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Northern Beaches Indoor Sports Centre" (confidence: low)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Northern Beaches Indoor Sports Centre', 'Warriewood', 'NSW', 'Jacksons Rd, Warriewood NSW 2102',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.2959431, -33.6988838), 4326), 'ChIJIQAFSuRUDWsROJcIHPVoA6U', 'partner', 'northern-beaches-indoor-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'unknown', null, null, null, 'https://www.indoorsports.net.au/', '+61 2 9913 2688', null, 'Non-profit-run multipurpose sports halls primarily for basketball/netball/volleyball/indoor soccer; badminton listed only as an activity the halls ''can accommodate'', no dedicated court count/hours/pricing found. Do not confuse with the separate PCYC Northern Beaches (Dee Why).', 'operator', 'https://www.indoorsports.net.au/facility/index.shtml', 'low', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "The Arena Sports Centre (A30)" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('The Arena Sports Centre (A30)', 'Camperdown', 'NSW', 'Western Ave, Camperdown NSW 2050',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1862343, -33.8876006), 4326), 'ChIJZTOIRSuwEmsRqiBFxSraUYw', 'partner', 'the-arena-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'public', null, 'Sydney Uni Sport & Fitness online bookings', 'https://susf.com.au/online-bookings/', 'https://susf.com.au/the-arena/', '+61 2 9351 4978', '{"mon":[["06:30","22:00"]],"tue":[["06:30","22:00"]],"wed":[["06:30","22:00"]],"thu":[["06:30","22:00"]],"fri":[["06:30","22:00"]],"sat":[["08:00","17:00"]],"sun":[]}'::jsonb, 'University of Sydney (SUSF) facility; badminton and squash share multipurpose courts inside the Arena gym complex. Distinct building from Sydney Uni Sport (SAC) and Robyn Webster Sports Centre.', 'operator', 'https://susf.com.au/files/2022/05/18811_SYDUNI_2022-Brochures_Price-Cards_DL_Seperate_08.pdf', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Badminton off-peak', array[1,2,3,4,5], 2000, 'court_hour', 'From SUSF''s price card; may be stale'),
    ('Badminton peak', array[1,2,3,4,5,6], 3500, 'court_hour', 'From SUSF''s price card; may be stale')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- New: "Peter Forsyth Auditorium" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Peter Forsyth Auditorium', 'Glebe', 'NSW', 'Francis Street Corner, Franklyn St, Glebe NSW 2037',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.192711, -33.8831372), 4326), 'ChIJcc5FPSquEmsRZ2bdpm1UR_0', 'partner', 'peter-forsyth-auditorium')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 1, false, 'other', 'public', null, 'City of Sydney Spaces for Hire', 'https://www.cityofsydney.nsw.gov.au/sports-facilities/peter-forsyth-auditorium', 'https://www.cityofsydney.nsw.gov.au/sports-facilities/peter-forsyth-auditorium', null, '{"mon":[["07:00","23:59"]],"tue":[["07:00","23:59"]],"wed":[["07:00","23:59"]],"thu":[["07:00","23:59"]],"fri":[["07:00","23:59"]],"sat":[["07:00","23:59"]],"sun":[["07:00","23:59"]]}'::jsonb, 'City of Sydney-owned unstaffed community venue; single full-size carpeted multipurpose court hired as a whole (not per badminton court) for basketball, netball, volleyball, futsal and badminton — hirer sets up nets/lines themselves.', 'operator', 'https://www.cityofsydney.nsw.gov.au/sports-facilities/peter-forsyth-auditorium', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Weekday before 5pm', array[1,2,3,4,5], 7150, 'court_hour', 'Whole-venue rate, not per-court'),
    ('Weekday after 5pm / weekend / public holiday', array[1,2,3,4,5,6,7], 7800, 'court_hour', 'Whole-venue rate; community groups get 50% discount')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- Upgrade existing: "NBC Silverwater" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC Silverwater', 'Silverwater', 'NSW', '2b/172 Silverwater Rd, Silverwater NSW 2128',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.048935, -33.8297323), 4326), 'ChIJVY2vV6CkEmsRojlIPBszEEY', 'partner', 'nbc-silverwater')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 6, 6, true, 'mat', 'public', null, 'yepbooking', 'https://nbc.yepbooking.com.au/', 'https://nbcbadminton.com.au/', null, null, 'Purpose-built badminton hall, part of NBC''s 7-site Sydney network, 3-layer sprung timber floor with mat overlay. Confirmed casual/social sessions: Wed/Fri/Sun 8-11pm (Intermediate-Advanced). Full daily hours and general court-hire pricing not published.', 'operator', 'https://nbc.yepbooking.com.au/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- Upgrade existing: "Oran Park Leisure Centre" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Oran Park Leisure Centre', 'Oran Park', 'NSW', '74 Central Ave, Oran Park NSW 2570',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.7442833, -33.9982816), 4326), 'ChIJr4-HFgDzEmsRrh_7lybob4s', 'partner', 'oran-park-leisure-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 4, false, 'synthetic', 'public', null, 'ActiveCarrot', 'https://secure.activecarrot.com/login?site=1483', 'https://oranparkleisurecentre.com.au/stadium-2/', '(02) 4648 4831', '{"mon":[["05:30","21:00"]],"tue":[["05:30","21:00"]],"wed":[["05:30","21:00"]],"thu":[["05:30","21:00"]],"fri":[["05:30","21:00"]],"sat":[["07:00","17:00"]],"sun":[["07:00","17:00"]]}'::jsonb, 'Opened Oct 2024; 4-court multi-purpose stadium (run by Bluefit under Camden Council) shared with basketball and other sports. Equipment rental $2.50 each.', 'operator', 'https://oranparkleisurecentre.com.au/stadium-2/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Community peak', array[1,2,3,4,5], 2550, 'court_hour', null),
    ('Community off-peak', array[1,2,3,4,5], 2200, 'court_hour', null),
    ('Commercial peak', array[1,2,3,4,5,6,7], 3050, 'court_hour', null),
    ('Commercial off-peak', array[1,2,3,4,5,6,7], 2700, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- Upgrade existing: "Five Dock Leisure Centre" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Five Dock Leisure Centre', 'Five Dock', 'NSW', 'William St, Five Dock NSW 2046',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1181809, -33.8684504), 4326), 'ChIJfftkY626EmsRMH7oiDuxzsc', 'partner', 'five-dock-leisure-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 8, 8, true, 'synthetic', 'public', null, 'PlaySport / operator online booking', 'https://www.fdlc.com.au/indoor-sports/book-court/badminton', 'https://www.fdlc.com.au/', '9911 6300', '{"mon":[["09:00","20:00"]],"tue":[["09:00","22:00"]],"wed":[["09:00","20:00"]],"thu":[["09:00","22:00"]],"fri":[["09:00","20:00"]],"sat":[["08:00","18:00"]],"sun":[["09:00","13:30"]]}'::jsonb, 'Run by City of Canada Bay; 8 dedicated badminton courts, casual hourly hire up to 4 weeks ahead, 48hr cancellation policy, no cash on-site.', 'operator', 'https://www.fdlc.com.au/indoor-sports/book-court/badminton', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Peak', array[1,2,3,4,5,6,7], 3950, 'court_hour', 'Mon-Fri 4-10pm, all day Sat & Sun'),
    ('Off-peak', array[1,2,3,4,5], 2950, 'court_hour', 'Mon-Fri 6am-4pm')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- Upgrade existing: "Sydney Olympic Park Sports Halls" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Sydney Olympic Park Sports Halls', 'Sydney Olympic Park', 'NSW', 'Grand Parade, Sydney Olympic Park NSW 2127',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0649008, -33.8447036), 4326), 'ChIJTbnXJ7ekEmsRrkWq1jmH2WI', 'partner', 'sydney-olympic-park-sports-halls')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 12, 12, false, 'synthetic', 'public', null, 'Active Carrot', 'https://secure.activecarrot.com/public/facility/browse/487/924', 'https://www.sydneyolympicpark.nsw.gov.au/things-to-see-and-do/badminton', '02 9714 7600', '{"mon":[["16:00","22:00"]],"tue":[["12:00","22:00"]],"wed":[["12:00","22:00"]],"thu":[["12:00","22:00"]],"fri":[["16:00","22:00"]],"sat":[["08:00","21:00"]],"sun":[["08:00","21:00"]]}'::jsonb, '12 badminton courts on synthetic Pulastic floor. Also used for basketball, volleyball, table tennis, pickleball, indoor soccer. Closed public holidays; parking fees apply.', 'operator', 'https://www.sydneyolympicpark.com.au/sports-halls/venue-information', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Badminton court hire', array[1,2,3,4,5,6,7], 3700, 'court_hour', null)
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- Upgrade existing: "The Y NSW Epping" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('The Y NSW Epping', 'Epping', 'NSW', '15 Ward St, Epping NSW 2121',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0683579, -33.7716269), 4326), 'ChIJYyRffKCmEmsRBhA3eTkbx6U', 'partner', 'the-y-epping')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, null, false, null, 'public', null, 'PerfectGym', 'https://theynsw.perfectgym.com.au', 'https://www.ymcansw.org.au/centres/epping-ymca/court-hire/', '02 9869 8966', '{"mon":[["05:30","22:00"]],"tue":[["05:30","22:00"]],"wed":[["05:30","22:00"]],"thu":[["05:30","22:00"]],"fri":[["05:30","22:00"]],"sat":[["07:00","20:00"]],"sun":[["07:00","18:00"]]}'::jsonb, 'Mixed-purpose multi-sport courts plus organised social badminton nights Mon-Thu. Equipment provided. Exact court count/surface not published.', 'operator', 'https://www.ymcansw.org.au/centres/epping-ymca/court-hire/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Permanent court hire', array[1,2,3,4,5,6,7], 3500, 'court_hour', 'Recurring/permanent booking rate'),
    ('Casual court hire', array[1,2,3,4,5,6,7], 4000, 'court_hour', 'One-off casual booking rate'),
    ('Social badminton session', array[1,2,3,4], 1200, 'person_session', 'Organised social nights Mon-Thu')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- Upgrade existing: "Hurstville Aquatic Leisure Centre" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Hurstville Aquatic Leisure Centre', 'Hurstville', 'NSW', 'King Georges Rd & Forest Rd, Hurstville NSW 2221',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0912935, -33.962871), 4326), 'ChIJ-yzuE_DxtAERJLpF-aISBqM', 'partner', 'hurstville-aquatic-leisure-centre-stadium')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 3, 3, false, null, 'public', null, null, null, 'https://hurstvilleaquatic.com.au/stadium/', '(02) 9585 9600', '{"mon":[["09:00","22:30"]],"tue":[["09:00","22:30"]],"wed":[["09:00","22:30"]],"thu":[["09:00","22:30"]],"fri":[["09:00","22:30"]],"sat":[["09:00","20:00"]],"sun":[["09:00","20:00"]]}'::jsonb, 'Stadium has 3 multi-purpose indoor courts with dividing nets; badminton set up on request. Bookings by phone or email stadium@hurstvilleaquatic.com.au. Also officially named ''The Johnny Warren Indoor Sports Centre'' — same stadium, same place_id as a separate Places listing; not inserted as a duplicate row.', 'operator', 'https://hurstvilleaquatic.com.au/stadium/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Court hire', array[1,2,3,4,5,6,7], 3400, 'court_hour', 'Figure from a secondary directory, not confirmed on operator''s own site — indicative only')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;

-- Upgrade existing: "The Y NSW Ryde Community Sports Centre" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('The Y NSW Ryde Community Sports Centre', 'North Ryde', 'NSW', 'ELS Hall Park, Kent Rd, North Ryde NSW 2113',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1126687, -33.7874985), 4326), 'ChIJt925qN6lEmsR3X6wGOiMGn8', 'partner', 'ryde-community-sports-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, null, 2, false, null, 'unknown', null, 'Gamz (formerly SportFix/Fixi)', 'https://gamzapp.com/RydeCommunitySportsCentre', 'https://www.ymcansw.org.au/centres/ryde-community-sports-centre/', '02 9878 2223', null, 'Y NSW''s own sports-services page lists this as a badminton location (separate badminton contact line 02 8006 8509). 2 multi-purpose indoor courts (basketball/netball/soccer/badminton/volleyball) — unclear how many are badminton-marked at any time.', 'operator', 'https://www.ymcansw.org.au/find-your-y/services/sports/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- Upgrade existing: "NBC Granville" (confidence: medium)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('NBC Granville', 'South Granville', 'NSW', '3F/62 Ferndell St, South Granville NSW 2142',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0070459, -33.8688999), 4326), 'ChIJjwsYQnm9EmsReMZxw1cZ8J8', 'partner', 'nbc-south-granville')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 14, 14, true, null, 'public', null, 'yepbooking', 'https://nbc.yepbooking.com.au/', 'https://nbcbadminton.com.au/', null, null, 'One of NBC''s 7 Sydney sites; NBC was Sydney''s first facility fitted out exclusively for badminton (est. 2013). Books via the shared nbc.yepbooking.com.au platform. Per-site hours/phone/price not published by the operator; secondary sources conflict, so left blank rather than guessed.', 'operator', 'https://nbcbadminton.com.au/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- Upgrade existing: "UNSW Fitness & Aquatic Centre (FAC)" (confidence: high)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('UNSW Fitness & Aquatic Centre (FAC)', 'Kensington', 'NSW', 'Fitness and Aquatic Centre (B5), Gate 2, High St, UNSW Sydney, Kensington NSW 2033',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.2265342, -33.9154941), 4326), 'ChIJDdkXWouxEmsRRnJ9dxHVtec', 'partner', 'unsw-fitness-aquatic-centre')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, club_contact, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, 6, null, false, null, 'public', null, 'PerfectGym', 'https://unswfac.perfectgym.com.au/ClientPortal2/#/FacilityBooking?clubId=1&zoneTypeId=15', 'https://unswfac.com.au/facilities/badminton-courts/', '(02) 9662 5112', '{"mon":[["06:00","22:00"]],"tue":[["06:00","22:00"]],"wed":[["06:00","22:00"]],"thu":[["06:00","22:00"]],"fri":[["06:00","22:00"]],"sat":[["07:00","19:00"]],"sun":[["07:00","19:00"]]}'::jsonb, '6 mixed-purpose indoor courts hireable for badminton, open to students, staff and the wider public (not members-only). Bookable in person, by phone, or via the PerfectGym portal. UNSW Badminton Club also plays here (in the Unigym space above the FAC) — see existing access_notes addendum from the P1 halls pass.', 'operator', 'https://unswfac.com.au/facilities/badminton-courts/', 'high', now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, club_contact = excluded.club_contact,
    booking_platform = excluded.booking_platform, booking_url = excluded.booking_url, website_url = excluded.website_url,
    phone = excluded.phone, opening_hours = excluded.opening_hours, access_notes = excluded.access_notes,
    data_source = excluded.data_source, source_url = excluded.source_url, confidence = excluded.confidence,
    verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
),
del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
),
ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values
    ('Court hire', array[1,2,3,4,5,6,7], 2800, 'court_hour', 'Flat rate, no peak/off-peak tiers found')
  ) as x(label, days, cents, unit, notes)
  returning venue_id
)
select id from ins;
