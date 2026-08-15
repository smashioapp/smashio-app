-- A6 (venues-plan.md §3): P1 school/community hall enrichment — the 9 halls from
-- Badminton NSW's affiliated-club directory (data/venues/clubs-badminton-nsw.json), geocoded
-- 2026-08-15 via a single live Places Text Search per hall. bookability='club_only' throughout:
-- these are club-hired gyms, never individually bookable.
-- Regenerate with: node scripts/venues/enrich-p1-halls.mjs


-- New: "Muirfield High School" (confidence: medium, place: Barclay Rd, North Rocks NSW 2151)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Muirfield High School', 'North Rocks', 'NSW', 'Barclay Rd, North Rocks NSW 2151',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.0217256, -33.7650495), 4326), 'ChIJv89RkNujEmsRs48l1k9Fu8I', 'partner', 'muirfield-high-school')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, 'Club-hired hall, not individually bookable. Badminton hosted by: Epping BC, Friendly BC, North Western BC, Shuttlebugs. Contact the club to join a session.', 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Epping Boys High School" (confidence: medium, place: 213 Vimiera Rd, Marsfield NSW 2122)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Epping Boys High School', 'Marsfield', 'NSW', '213 Vimiera Rd, Marsfield NSW 2122',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.09906, -33.7697715), 4326), 'ChIJTQ6onrOnEmsRlc2witzPCtI', 'partner', 'epping-boys-high-school')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, 'Club-hired hall, not individually bookable. Badminton hosted by: Australian Badminton Academy, World Chinese Badminton Federation Aus. Contact the club to join a session.', 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Hurstville Boys High School" (confidence: medium, place: Kenwyn St, Hurstville NSW 2220)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Hurstville Boys High School', 'Hurstville', 'NSW', 'Kenwyn St, Hurstville NSW 2220',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1105186, -33.9620984), 4326), 'ChIJf4xwLpS5EmsRQzoalySo4L4', 'partner', 'hurstville-boys-high-school')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, 'Club-hired hall, not individually bookable. Badminton hosted by: Badminton Magic, Sydney Badminton. Contact the club to join a session. Same site as Sydney Badminton (P1 lead, ChIJG-lGd6C5EmsREnQVFvvpUZQ) — do not also insert that lead as a separate venue.', 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Dulwich Hill High School Hall" (confidence: medium, place: 9 Seaview St, Dulwich Hill NSW 2203)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Dulwich Hill High School Hall', 'Dulwich Hill', 'NSW', '9 Seaview St, Dulwich Hill NSW 2203',
    extensions.ST_SetSRID(extensions.ST_MakePoint(151.1439415, -33.9039496), 4326), 'ChIJIXVeYHewEmsRSfY0r81Cyvc', 'partner', 'dulwich-hill-high-school-hall')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, 'Club-hired hall, not individually bookable. Badminton hosted by: Dulwich Hill BC, Zealcon BC. Contact the club to join a session.', 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Baulkham Hills High School Gymnasium" (confidence: medium, place: 419A Windsor Rd, Baulkham Hills NSW 2153)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Baulkham Hills High School Gymnasium', 'Baulkham Hills', 'NSW', '419A Windsor Rd, Baulkham Hills NSW 2153',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9904016, -33.7520348), 4326), 'ChIJd6xgjoehEmsRHfoHriBGXdU', 'partner', 'baulkham-hills-high-school-gymnasium')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, 'Club-hired hall, not individually bookable. Badminton hosted by: KBC NSW, Shuttlebugs. Contact the club to join a session.', 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Castle Hill High School" (confidence: medium, place: 76-100 Castle St, Castle Hill NSW 2154)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Castle Hill High School', 'Castle Hill', 'NSW', '76-100 Castle St, Castle Hill NSW 2154',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.9995421, -33.726554), 4326), 'ChIJX2cLDwqhEmsR_cz3-zLs6SE', 'partner', 'castle-hill-high-school')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, 'Club-hired hall, not individually bookable. Badminton hosted by: Hills Highlights Badminton. Contact the club to join a session.', 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Erskine Park High School" (confidence: medium, place: 78/82 Swallow Dr, Erskine Park NSW 2759)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Erskine Park High School', 'Erskine Park', 'NSW', '78/82 Swallow Dr, Erskine Park NSW 2759',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.8034635, -33.8080554), 4326), 'ChIJixKWU2aQEmsRsf5m2fWOP7Q', 'partner', 'erskine-park-high-school')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, 'Club-hired hall, not individually bookable. Badminton hosted by: Erskine Park BC. Contact the club to join a session.', 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- New: "Glenbrook Public School" (confidence: medium, place: 6/14 Woodville St, Glenbrook NSW 2773)
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values ('Glenbrook Public School', 'Glenbrook', 'NSW', '6/14 Woodville St, Glenbrook NSW 2773',
    extensions.ST_SetSRID(extensions.ST_MakePoint(150.6170773, -33.7659089), 4326), 'ChIJx0mG0VqIEmsR4O50fmZDmaw', 'partner', 'glenbrook-public-school')
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, 'Club-hired hall, not individually bookable. Badminton hosted by: Shuttle Shufflers. Contact the club to join a session.', 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;

-- UNSW Badminton Club plays "above the Unigym" per Badminton NSW's directory, a space Places
-- has no distinct listing for (see enrich-p1-halls.mjs). Appending to the existing FAC venue's
-- access_notes rather than inserting a duplicate at the same place_id.
update public.venue_profiles
set access_notes = coalesce(access_notes || ' ', '') || 'UNSW Badminton Club also plays here (in the Unigym space above the FAC) — contact the club to join a session.',
    updated_at = now()
where venue_id = (select id from public.venues where slug = 'unsw-fitness-aquatic-centre');
