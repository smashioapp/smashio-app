// venues-plan.md §3/§6 (A6 P1 pass 4): hand-researched enrichment for the remainder of P1's
// multi-purpose bucket (council/uni/PCYC leisure centres that hit a generic Places query, not a
// "badminton" query directly), researched 2026-08-15 via WebSearch/WebFetch against each
// operator's own site where reachable.
//
// Bucket started as 13 leads-to-enrich.csv rows. Two same-site clusters (SWEEP-FINDINGS.md) and
// one confirmed-no-badminton lead reduced that to 9 inserts:
//   - Macquarie Fields Leisure Centre (52 Fields Rd) is the pool only — no badminton anywhere on
//     the council's own site. Macquarie Fields Fitness & Indoor Sports Centre, 117m away on the
//     same council precinct, is the actual sports hall with badminton hall-hire pricing. Leisure
//     Centre lead DROPPED (not a badminton venue, was only promoted to P1 by a name-substring
//     regex match, not a real signal); Fitness & Indoor Sports Centre inserted.
//   - Curl Curl Youth and Community Centre (242 Abbott Rd) has confirmed badminton in its main
//     hall (Zest listing, operator-run booking). "Curl Curl Sports Centre" (240 Abbott Rd, 106m
//     away) and "North Curl Curl Community Centre" (cnr Abbott/Griffin Rd, 498m away) have NO
//     independent badminton confirmation — every search for either just redirects back to the
//     Youth Centre. Both DROPPED as unconfirmed/likely-duplicate rather than inserted on a guess.
//   - Macquarie University Sports Fields is confirmed outdoor-only (soccer/football grounds,
//     corner Talavera/Culloden Rd) with zero indoor/badminton component — DROPPED. Distinct
//     place_id from Macquarie University Sport and Aquatic Centre (MUSAC), which IS inserted.
//
// Confidence notes (per §3's rule):
//   - Morris Iemma, PCYC Northern Beaches: high — every stored field traces to the operator's own
//     council/PCYC site with a URL, fetched directly.
//   - Ryde Aquatic, MUSAC, North Sydney Indoor Sports, Avalon Recreation, Curl Curl Youth, Taren
//     Point, Macquarie Fields Fitness: medium — at least one field is third-party-sourced
//     (badmintoncourt.au, Zest) or a conflicting field was dropped rather than guessed (see below).
//
// Dropped rather than stored (conflicts across sources, or no source at all):
//   - Ryde Aquatic: price conflicted ($22/hr on badmintoncourt.au vs $40.50/hr on a search snippet
//     of the operator's own fee page) — dropped, access_notes says to check with the venue.
//   - MUSAC: no price found anywhere (operator's facility-hire page blocks automated fetch).
//   - North Sydney Indoor Sports Centre: court count and Sat/Sun hours conflicted between the
//     operator's own site (nsba.com.au, direct fetch, 4 courts / Sat 8-9pm / Sun 8-11pm) and a
//     third-party directory (3 courts / Sat 8-10pm / Sun closed) — operator source wins per the
//     usual rule that a direct fetch of the operator's own page outranks a third-party listing.
//   - Taren Point Youth Centre: court count conflicted between the Zest listing (3) and a
//     Facebook community post (4, unverified) — dropped, no operator-owned website exists at all
//     to break the tie.
//   - Avalon Recreation Centre: badminton is a resident-club activity (Avalon Badminton Club), not
//     on the council venue's own page at all — modelled bookability='club_only' per the "a club is
//     not a venue, but this venue only offers badminton via a club" pattern from §3. Session times
//     are club slots (Mon/Fri only), not a general venue schedule, so opening_hours is left null
//     with the slots in access_notes (same treatment as KBC Camellia in enrich-p1-nonchain.mjs).
//   - Macquarie Fields Fitness & Indoor Sports Centre: the sports hall was reported temporarily
//     closed for a flooring upgrade as of the research date — flagged in access_notes so the app
//     doesn't present it as available without a caveat.
//
// Usage: node scripts/venues/enrich-p1-multi.mjs
// Output: supabase/migrations/<timestamp>_p1_multi_enrichment.sql — review before pushing.

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");

function sqlStr(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlBool(v) {
  return v ? "true" : "false";
}
function sqlArr(vals) {
  return `array[${vals.join(",")}]`;
}
function sqlJsonb(obj) {
  return obj ? `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb` : "null";
}
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const NEW_VENUES = [
  {
    name: "Ryde Aquatic Leisure Centre",
    suburb: "Ryde",
    state: "NSW",
    address: "504 Victoria Rd, Ryde NSW 2112",
    lat: -33.8215454,
    lng: 151.1187894,
    place_id: "ChIJg5mhFp-lEmsROT32U-30_5A",
    courts_badminton: 2,
    courts_total: 2,
    dedicated: false,
    surface: null,
    bookability: "public",
    booking_platform: null,
    booking_url: null,
    website_url: "https://www.ryde.nsw.gov.au/RALC",
    phone: "(02) 8878 5111",
    opening_hours: {
      mon: [["05:30", "20:45"]], tue: [["05:30", "20:45"]], wed: [["05:30", "20:45"]], thu: [["05:30", "20:45"]],
      fri: [["05:30", "19:45"]], sat: [["06:30", "17:45"]], sun: [["07:30", "17:45"]],
    },
    access_notes: "Court hire price conflicts between sources ($22/hr vs $40.50/hr) — confirm current rate with the centre before visiting.",
    price_bands: [],
    data_source: "operator",
    source_url: "https://www.badmintoncourt.au/sydney/venue/ryde-aquatic-leisure-centre",
    confidence: "medium",
  },
  {
    name: "Macquarie University Sport and Aquatic Centre",
    suburb: "Macquarie Park",
    state: "NSW",
    address: "10 Gymnasium Rd, Macquarie Park NSW 2113",
    lat: -33.7726454,
    lng: 151.1107321,
    place_id: "ChIJQ3nR5HGmEmsRjJEXjU7CV3o",
    courts_badminton: null,
    courts_total: null,
    dedicated: false,
    surface: null,
    bookability: "public",
    booking_platform: "Jonas Leisure",
    booking_url: "https://musac.jonasleisure.com.au/Booking/Book",
    website_url: "https://sport.mq.edu.au/facility-hire/courts",
    phone: "(02) 9850 7636",
    opening_hours: null,
    access_notes: null,
    price_bands: [],
    data_source: "operator",
    source_url: "https://sport.mq.edu.au/facility-hire",
    confidence: "medium",
  },
  {
    name: "Morris Iemma Indoor Sports Centre",
    suburb: "Riverwood",
    state: "NSW",
    address: "150 Belmore Rd North, Riverwood NSW 2210",
    lat: -33.9437712,
    lng: 151.0544488,
    place_id: "ChIJoTm4NjS5EmsR3cvGe4fjpaQ",
    courts_badminton: null,
    courts_total: 2,
    dedicated: false,
    surface: null,
    bookability: "public",
    booking_platform: "Council booking form",
    booking_url: "https://cbcity.snapforms.com.au/form/morris-iemma-casual-hire",
    phone: "(02) 9153 0441",
    opening_hours: null,
    access_notes: "Also splits into 4 half-courts via motorised curtain. Off-peak Mon-Fri 9am-4pm, peak Mon-Fri 4-10pm and all weekends/school holidays — call ahead to check availability.",
    price_bands: [
      { label: "Casual — Peak, full court", days: [1, 2, 3, 4, 5, 6, 7], cents: 8500, unit: "court_hour", notes: "Mon-Fri 4-10pm, weekends, school holidays" },
      { label: "Casual — Off-peak, full court", days: [1, 2, 3, 4, 5], cents: 4900, unit: "court_hour", notes: "Mon-Fri 9am-4pm" },
      { label: "Casual — Peak, half court", days: [1, 2, 3, 4, 5, 6, 7], cents: 5100, unit: "court_hour", notes: "Mon-Fri 4-10pm, weekends, school holidays" },
      { label: "Casual — Off-peak, half court", days: [1, 2, 3, 4, 5], cents: 4000, unit: "court_hour", notes: "Mon-Fri 9am-4pm" },
    ],
    data_source: "operator",
    source_url: "https://www.cbcity.nsw.gov.au/sport-and-recreation/morris-iemma-indoor-sports-centre-miisc/miisc-fees-and-charges",
    confidence: "high",
  },
  {
    name: "North Sydney Indoor Sports Centre",
    suburb: "Crows Nest",
    state: "NSW",
    address: "Level 5/36 Hume St, Crows Nest NSW 2065",
    lat: -33.8245658,
    lng: 151.1995239,
    place_id: "ChIJN1iVocKuEmsRURriAmRDd_k",
    courts_badminton: null,
    courts_total: 4,
    dedicated: false,
    surface: null,
    bookability: "public",
    booking_platform: "Jonas Leisure",
    booking_url: "https://nsba.jonasleisure.com.au",
    website_url: "https://www.nsba.com.au/court-hire",
    phone: "(02) 9906 7877",
    opening_hours: {
      mon: [["07:00", "23:00"]], tue: [["07:00", "23:00"]], wed: [["07:00", "23:00"]], thu: [["07:00", "23:00"]], fri: [["07:00", "23:00"]],
      sat: [["08:00", "21:00"]], sun: [["08:00", "23:00"]],
    },
    access_notes: null,
    price_bands: [{ label: "Casual", days: [1, 2, 3, 4, 5, 6, 7], cents: 4500, unit: "court_hour", notes: null }],
    data_source: "operator",
    source_url: "https://www.nsba.com.au/court-hire",
    confidence: "medium",
  },
  {
    name: "PCYC Northern Beaches",
    suburb: "Dee Why",
    state: "NSW",
    address: "40 Kingsway, Dee Why NSW 2099",
    lat: -33.7503059,
    lng: 151.2862588,
    place_id: "ChIJa9f9koOqEmsRLbEogDqynQM",
    courts_badminton: null,
    courts_total: 2,
    dedicated: false,
    surface: null,
    bookability: "public",
    booking_platform: null,
    booking_url: "https://secure.activecarrot.com/public/facility/index/1000/1195",
    website_url: "https://www.pcycnsw.org.au/northern-beaches/activities/badminton",
    phone: "(02) 9196 9100",
    opening_hours: {
      mon: [["09:00", "22:00"]], tue: [["09:00", "22:00"]], wed: [["09:00", "22:00"]], thu: [["09:00", "22:00"]], fri: [["09:00", "22:00"]],
      sat: [["09:00", "18:00"]], sun: [["09:00", "15:00"]],
    },
    access_notes: "Fri 8-10pm social badminton session requires an annual PCYC membership; private court hire (no membership) bookable by phone.",
    price_bands: [
      { label: "Private court hire", days: [1, 2, 3, 4, 5, 6, 7], cents: 5000, unit: "court_hour", notes: "Equipment included; book by phone" },
      { label: "Friday social session", days: [5], cents: 1300, unit: "person_session", notes: "8-10pm, requires PCYC membership" },
    ],
    data_source: "operator",
    source_url: "https://www.pcycnsw.org.au/northern-beaches/activities/court-hire",
    confidence: "high",
  },
  {
    name: "Avalon Recreation Centre",
    suburb: "Avalon Beach",
    state: "NSW",
    address: "59 Old Barrenjoey Rd, Avalon Beach NSW 2107",
    lat: -33.6356359,
    lng: 151.3294526,
    place_id: "ChIJc7nl-9SscmsRbK3lsE3rrPk",
    courts_badminton: null,
    courts_total: null,
    dedicated: false,
    surface: null,
    bookability: "club_only",
    booking_platform: null,
    booking_url: null,
    website_url: "https://www.avalonbadminton.com/",
    phone: null,
    opening_hours: null,
    access_notes: "Badminton hosted by Avalon Badminton Club, not the venue directly — not on the council's own venue page. Club sessions Mon 7:30-10pm, Fri 7:30-9:30pm. Contact the club (Brian, 0415 476 308) before coming for the first time. Casual $15/session; regulars need Sydney Central Badminton membership.",
    price_bands: [],
    data_source: "partner",
    source_url: "https://www.avalonbadminton.com/",
    confidence: "medium",
  },
  {
    name: "Curl Curl Youth and Community Centre",
    suburb: "North Curl Curl",
    state: "NSW",
    address: "242 Abbott Rd, North Curl Curl NSW 2099",
    lat: -33.7660048,
    lng: 151.2893618,
    place_id: "ChIJ8Z-HLI2qEmsRXHtO2t5UJPM",
    courts_badminton: null,
    courts_total: null,
    dedicated: false,
    surface: null,
    bookability: "public",
    booking_platform: "Zest",
    booking_url: "https://www.zestapp.com.au/venues/curl-curl-youth-and-community-centre/ddbac8f2-6b5e-4a05-a416-db0d50057184",
    website_url: null,
    phone: null,
    opening_hours: null,
    access_notes: "Price on enquiry via the venue's Zest booking listing. \"Curl Curl Sports Centre\" (240 Abbott Rd, ~100m away) and \"North Curl Curl Community Centre\" have no independent badminton confirmation and are likely the same site or a nearby precinct name — not modelled as separate venues.",
    price_bands: [],
    data_source: "operator",
    source_url: "https://www.zestapp.com.au/venues/curl-curl-youth-and-community-centre/ddbac8f2-6b5e-4a05-a416-db0d50057184",
    confidence: "medium",
  },
  {
    name: "Taren Point Youth Centre",
    suburb: "Taren Point",
    state: "NSW",
    address: "135 Taren Point Rd, Taren Point NSW 2229",
    lat: -34.0214162,
    lng: 151.1209775,
    place_id: "ChIJtX4WqFe5EmsR0xwtljgpkW4",
    courts_badminton: null,
    courts_total: null,
    dedicated: false,
    surface: null,
    bookability: "public",
    booking_platform: "Zest",
    booking_url: "https://www.zestapp.com.au/venues/taren-point-youth-centre/55f8aad7-3b62-471d-9e2f-10529545ebe2",
    website_url: null,
    phone: null,
    opening_hours: null,
    access_notes: "Court count conflicts across sources (3 vs 4) — not stored. No operator-owned website found; booking is via Zest only.",
    price_bands: [{ label: "Court hire", days: [1, 2, 3, 4, 5, 6, 7], cents: 2600, unit: "court_hour", notes: null }],
    data_source: "operator",
    source_url: "https://www.zestapp.com.au/venues/taren-point-youth-centre/55f8aad7-3b62-471d-9e2f-10529545ebe2",
    confidence: "medium",
  },
  {
    name: "Macquarie Fields Fitness & Indoor Sports Centre",
    suburb: "Macquarie Fields",
    state: "NSW",
    address: "52 Fields Rd, Macquarie Fields NSW 2564",
    lat: -33.9958311,
    lng: 150.8817004,
    place_id: "ChIJIQuf8zvrEmsRXKaJVjGpZkQ",
    courts_badminton: null,
    courts_total: null,
    dedicated: false,
    surface: null,
    bookability: "public",
    booking_platform: null,
    booking_url: null,
    website_url: "https://www.campbelltown.nsw.gov.au/Services-and-Facilities/Facilities-for-Hire/Macquarie-Fields-Fitness-Centre-Sports-Hall-Hire",
    phone: null,
    opening_hours: null,
    access_notes: "Sports hall was reported temporarily closed for a flooring upgrade as of the research date (2026-08-15) — confirm reopening before visiting. \"Macquarie Fields Leisure Centre\" (same council precinct) is the pool only, no badminton, not modelled as a separate venue.",
    price_bands: [
      { label: "Casual, full court", days: [1, 2, 3, 4, 5, 6, 7], cents: 10300, unit: "court_hour", notes: null },
      { label: "Casual, half court", days: [1, 2, 3, 4, 5, 6, 7], cents: 6450, unit: "court_hour", notes: null },
      { label: "Permanent hirer, full court", days: [1, 2, 3, 4, 5, 6, 7], cents: 9400, unit: "court_hour", notes: null },
      { label: "Permanent hirer, half court", days: [1, 2, 3, 4, 5, 6, 7], cents: 5300, unit: "court_hour", notes: null },
    ],
    data_source: "operator",
    source_url: "https://www.campbelltown.nsw.gov.au/Services-and-Facilities/Facilities-for-Hire/Macquarie-Fields-Fitness-Centre-Sports-Hall-Hire",
    confidence: "medium",
  },
];

function newVenueStatement(r) {
  const slug = slugify(r.name);
  const ctes = [
    `ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values (${sqlStr(r.name)}, ${sqlStr(r.suburb)}, ${sqlStr(r.state)}, ${sqlStr(r.address)},
    extensions.ST_SetSRID(extensions.ST_MakePoint(${r.lng}, ${r.lat}), 4326), ${sqlStr(r.place_id)}, 'partner', ${sqlStr(slug)})
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
)`,
    `prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, website_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, ${r.courts_badminton ?? "null"}, ${r.courts_total ?? "null"}, ${sqlBool(r.dedicated)}, ${sqlStr(r.surface)}, ${sqlStr(r.bookability)}, ${sqlStr(r.booking_platform)}, ${sqlStr(r.booking_url)}, ${sqlStr(r.website_url ?? null)}, ${sqlStr(r.phone)}, ${sqlJsonb(r.opening_hours)}, ${sqlStr(r.access_notes)}, ${sqlStr(r.data_source)}, ${sqlStr(r.source_url)}, ${sqlStr(r.confidence)}, now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, website_url = excluded.website_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)`,
  ];
  if (r.price_bands.length > 0) {
    ctes.push(`del_pricing as (
  delete from public.venue_pricing_bands where venue_id = (select id from ins) returning venue_id
)`);
    ctes.push(`ins_pricing as (
  insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes)
  select ins.id, x.label, x.days, null, null, x.cents, x.unit, x.notes
  from ins, del_pricing, (values\n${r.price_bands.map((b) => `    (${sqlStr(b.label)}, ${sqlArr(b.days)}, ${b.cents}, ${sqlStr(b.unit)}, ${sqlStr(b.notes)})`).join(",\n")}\n  ) as x(label, days, cents, unit, notes)
  returning venue_id
)`);
  }
  return `-- New: "${r.name}" (confidence: ${r.confidence})\nwith ${ctes.join(",\n")}\nselect id from ins;`;
}

const sections = [];
sections.push(`-- A6 (venues-plan.md §3): P1 multi-purpose bucket enrichment pass 4 — 9 of the 13
-- leads (council/uni/PCYC leisure centres), researched 2026-08-15 via WebSearch/WebFetch against
-- each operator's own site where reachable. 4 leads dropped: Macquarie Fields Leisure Centre (pool
-- only, no badminton), Curl Curl Sports Centre + North Curl Curl Community Centre (unconfirmed,
-- likely same site as Curl Curl Youth and Community Centre), Macquarie University Sports Fields
-- (outdoor fields only, no badminton). "Sydney Badminton" (same site as Hurstville Boys HS) was
-- already skipped in the dedicated bucket per enrich-p1-halls.mjs.
-- Regenerate with: node scripts/venues/enrich-p1-multi.mjs
`);

for (const r of NEW_VENUES) sections.push(newVenueStatement(r));

const ts = "20260815002200";
const path = resolve(MIGRATIONS, `${ts}_p1_multi_enrichment.sql`);
writeFileSync(path, sections.join("\n\n") + "\n");
console.log(`Wrote ${path}`);
console.log(`${NEW_VENUES.length} new venue(s).`);
