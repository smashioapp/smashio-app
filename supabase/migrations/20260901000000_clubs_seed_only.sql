-- social-plan.md C0 (§13.3): clubs, seed-only. Cheap way out of the §17 decision-4 circularity —
-- full clubs are gated on liquidity, but the host recruiting that *creates* liquidity is the thing
-- clubs would help most. Ships standalone, ahead of the feed release (§13.6 ship 1).
--
-- Explicitly not here: club_members, games.club_id, any in-app club screen, feed_club, the claim
-- flow. Those are C1 (§13.4).
--
-- Source: data/venues/clubs-badminton-nsw.json, Badminton NSW's affiliated-club directory, swept
-- 2026-08-15. §13.3 originally said "56-row seed" — the source file actually yields 41 distinct
-- clubs plus 2 rows where the directory names a venue but no club (PCYC Northern Beaches, MUSAC),
-- 43 total; the doc has been corrected. Sydney only — data/venues/clubs-badminton-nsw.json's
-- excluded_regional[] (Central Coast, Blue Mountains, etc.) is not seeded.
--
-- No FK to public.venues: SWEEP-FINDINGS.md warns venue matching must never merge on proximity
-- alone, and several hall names here are themselves unverified against the Places sweep (see the
-- per-row source_note). hall_name/hall_suburb stay free text; a real venue_id link is C1 work once
-- someone has actually confirmed each site.
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  hall_name text,
  hall_suburb text,
  session_note text,
  source_note text,
  source_url text not null default 'https://www.badmintonnsw.org.au/affiliated-clubs/',
  last_checked_at date not null default '2026-08-15',
  created_at timestamptz not null default now()
);

alter table public.clubs enable row level security;

-- Read-only to clients, same shape as venues/amenity_types — seed/admin (service role) only until
-- C1's claim flow adds a write path.
create policy "clubs readable by authenticated" on public.clubs
  for select to authenticated using (true);

grant select on public.clubs to authenticated;

insert into public.clubs (name, slug, hall_name, hall_suburb, source_note, session_note) values
  ('ACE Badminton', 'ace-badminton', 'Victor Badminton Centre', 'Silverwater', 'Also listed at Botany by Sydney Shuttles — two sites, or a stale listing. Verify both. Also listed at North Ryde RSL Youth Centre, North Ryde.', null),
  ('Sydney Shuttles Badminton Club', 'sydney-shuttles-badminton-club', 'Victor Badminton Centre', 'Botany', 'Possible confusion with BadmintonWorx Botany. Verify.', null),
  ('Aussie Sydney Badminton Club', 'aussie-sydney-badminton-club', 'Morris Iemma Indoor Sports Centre', 'Riverwood', 'Also listed at Taren Point Youth and Badminton Centre, Taren Point.', null),
  ('Badminton Magic', 'badminton-magic', 'Taren Point Youth and Badminton Centre', 'Taren Point', 'Places found ''Taren Point Youth Centre'' — same site, confirm naming. Also listed at Hurstville Boys High School, Hurstville.', null),
  ('Taren Point Saturday Morning BC', 'taren-point-saturday-morning-bc', 'Taren Point Youth and Badminton Centre', 'Taren Point', 'Places found ''Taren Point Youth Centre'' — same site, confirm naming.', null),
  ('Australian Badminton Academy', 'australian-badminton-academy', 'Ryde Aquatic Leisure Centre', 'Ryde', 'Also listed at Epping Boys High School, Eastwood.', null),
  ('Hills Start', 'hills-start', 'Hills Start Sports Education Centre', 'Bella Vista', 'Daily 15:00-22:00 — reads like a bookable venue, not just a club slot.', 'Daily 15:00-22:00'),
  ('KBC NSW', 'kbc-nsw', 'KBC NSW Hornsby', 'Hornsby', 'Places found ''Phoenix Badminton'' at Hornsby and ''KBC Badminton Pty Ltd'' at Camellia. Three-way check. Also listed at Baulkham Hills High School Gymnasium, Baulkham Hills.', null),
  ('Curl Curl Badminton Players Club', 'curl-curl-badminton-players-club', 'Curl Curl Sports Centre', 'North Curl Curl', 'Places found ''Curl Curl Youth and Community Centre'' — likely same.', null),
  ('Avalon Badminton Club', 'avalon-badminton-club', 'Avalon Recreation Centre', 'Avalon Beach', null, null),
  ('Macarthur Badminton Club', 'macarthur-badminton-club', 'Macquarie Fields Leisure Centre', 'Macquarie Fields', 'Places found ''Macquarie Fields Fitness & Indoor Sports Centre''.', null),
  ('Dash Badminton', 'dash-badminton', 'The Brickpit Stadium', 'Thornleigh', 'Places found ''Thornleigh Brickpit Basketball Sports Stadium'' + ''DASH Badminton'' + ''APX Badminton Courts'' all at Thornleigh. Untangle.', null),
  ('PCYC Northern Beaches', 'pcyc-northern-beaches', 'PCYC Northern Beaches', 'Dee Why', 'From web search, not the club list. 40 Kingsway, Dee Why NSW 2099.', null),
  ('Macquarie University Sport & Aquatic Centre (MUSAC)', 'macquarie-university-sport-aquatic-centre-musac', 'Macquarie University Sport & Aquatic Centre (MUSAC)', 'North Ryde', 'In our own seed.sql; the Places sweep missed it and the club list does not name it. Verify it still offers badminton.', null),
  ('Epping BC', 'epping-bc', 'Muirfield High School', 'North Rocks', 'Four clubs — the densest hall in Sydney and invisible to every commercial directory.', null),
  ('Friendly BC', 'friendly-bc', 'Muirfield High School', 'North Rocks', 'Four clubs — the densest hall in Sydney and invisible to every commercial directory.', null),
  ('North Western BC', 'north-western-bc', 'Muirfield High School', 'North Rocks', 'Four clubs — the densest hall in Sydney and invisible to every commercial directory.', null),
  ('Shuttlebugs', 'shuttlebugs', 'Muirfield High School', 'North Rocks', 'Four clubs — the densest hall in Sydney and invisible to every commercial directory. Also listed at Baulkham Hills High School Gymnasium, Baulkham Hills.', null),
  ('World Chinese Badminton Federation Aus', 'world-chinese-badminton-federation-aus', 'Epping Boys High School', 'Eastwood', null, null),
  ('Sydney Badminton', 'sydney-badminton', 'Hurstville Boys High School', 'Hurstville', null, null),
  ('Dulwich Hill BC', 'dulwich-hill-bc', 'Dulwich Hill High School Hall', 'Dulwich Hill', null, null),
  ('Zealcon BC', 'zealcon-bc', 'Dulwich Hill High School Hall', 'Dulwich Hill', null, null),
  ('Hills Highlights Badminton', 'hills-highlights-badminton', 'Castle Hill High School', 'Castle Hill', null, null),
  ('Erskine Park BC', 'erskine-park-bc', 'Erskine Park High School', 'Erskine Park', null, null),
  ('Shuttle Shufflers', 'shuttle-shufflers', 'Glenbrook Public School', 'Glenbrook', null, null),
  ('UNSW Badminton Club', 'unsw-badminton-club', 'UNSW Gymnasium', 'Kensington', 'Distinct from the UNSW Fitness & Aquatic Centre in the source CSV — the club plays above the Unigym.', null),
  ('Australia Badminton Sydney Association', 'australia-badminton-sydney-association', null, null, null, null),
  ('BISA United', 'bisa-united', null, null, null, null),
  ('Castle Hill RSL Badminton Club', 'castle-hill-rsl-badminton-club', null, null, null, null),
  ('Golden Girls', 'golden-girls', null, null, null, null),
  ('Inner-West Badminton Club', 'inner-west-badminton-club', null, null, null, null),
  ('Maxima', 'maxima', null, null, null, null),
  ('Northern Beaches Badminton Club (Cromer)', 'northern-beaches-badminton-club-cromer', null, null, null, null),
  ('Old Monks Minto', 'old-monks-minto', null, null, null, null),
  ('Omega Sports Club (Riverstone)', 'omega-sports-club-riverstone', null, null, null, null),
  ('Raket Badminton Academy', 'raket-badminton-academy', null, null, null, null),
  ('Smash Monster', 'smash-monster', null, null, null, null),
  ('Smashing Baddies', 'smashing-baddies', null, null, null, null),
  ('Sutherland Shire Thai Badminton Club', 'sutherland-shire-thai-badminton-club', null, null, null, null),
  ('The International French School Badminton Club of Sydney', 'the-international-french-school-badminton-club-of-sydney', null, null, null, null),
  ('The Ponds Badminton Club', 'the-ponds-badminton-club', null, null, null, null),
  ('Wahroonga Badminton Club', 'wahroonga-badminton-club', null, null, null, null),
  ('WentiBoyz Badminton Club', 'wentiboyz-badminton-club', null, null, null, null);

-- Anon-safe SEO RPCs, same pattern as venue_seo_detail/venue_seo_directory
-- (20260831020000_venue_seo_pages.sql). security definer: clubs is select-to-authenticated only
-- and a crawler is never authenticated.
--
-- indexable here means "has a real hall" (hall_name is not null) — the honest bar given what this
-- data actually supports. §13.3's "named hall and session times" was written assuming the source
-- had structured session times throughout; it only does for one club (Hills Start). Gating on
-- session_note too would leave 1 indexable page out of 43, which defeats the point of seeding the
-- directory at all. A hall is still a real, checkable fact; a bare club name with no location is
-- not, so those 17 stay noindex.
create function public.club_seo_detail(p_slug text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'name', c.name,
    'hall_name', c.hall_name,
    'hall_suburb', c.hall_suburb,
    'session_note', c.session_note,
    'source_note', c.source_note,
    'source_url', c.source_url,
    'last_checked_at', c.last_checked_at,
    'indexable', c.hall_name is not null
  )
  from public.clubs c
  where c.slug = p_slug;
$$;

grant execute on function public.club_seo_detail(text) to anon, authenticated;

create function public.club_seo_directory()
returns table (
  slug text,
  name text,
  hall_suburb text,
  indexable boolean
)
language sql
stable
security definer set search_path = public
as $$
  select c.slug, c.name, c.hall_suburb, c.hall_name is not null as indexable
  from public.clubs c
  order by coalesce(c.hall_suburb, 'zzz'), c.name;
$$;

grant execute on function public.club_seo_directory() to anon, authenticated;
