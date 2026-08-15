// venues-plan.md §3/§6 (A6 P1 pass): hand-researched enrichment for the NBC/Alpha/BadmintonWorx/
// The Badminton Club chains, gathered 2026-08-15 via WebSearch/WebFetch against each operator's
// own site plus the badmintoncourt.au directory (used only where the operator's own site didn't
// carry hours/pricing). Not phone-verified — per §3's rule that caps at 'medium' unless every
// field traces to the operator's own site/booking system with a URL and a date; rows below are
// 'high' only where every material field did.
//
// This intentionally is NOT run through match.mjs: the Alpha cluster was withheld by A2's
// matcher (trigram-similar to the legacy ambiguous "Alpha Badminton Centre" seed row but >80m
// away, so correctly flagged rather than auto-merged). The research below IS the human
// resolution that cluster needed — three confirmed distinct addresses/phones — so it's applied
// directly as three new venues, leaving the legacy row untouched (same treatment as NBC
// Homebush: it still has a live published game against it, so it isn't touched either).
//
// Suspicious/incomplete source data was deliberately dropped rather than stored: NBC Seven Hills
// and NBC Olympic Park's scraped hours looked like scraper artifacts (a "7 courts, dedicated"
// business closed on weekdays; a fragmented multi-window schedule), and showing a wrong "closed"
// to someone deciding whether they can play tonight (§1 finding #9) is worse than showing nothing.
//
// Usage: node scripts/venues/enrich-p1-chains.mjs
// Output: supabase/migrations/<timestamp>_p1_chain_enrichment.sql — review before pushing.

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

// All-day hours shorthand for the chains that run one schedule every day.
const ALL_DAY = (open, close) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [[open, close]]]));

const NEW_VENUES = [
  {
    name: "NBC Castle Hill",
    suburb: "Castle Hill",
    state: "NSW",
    address: "3/16 Anella Ave, Castle Hill NSW 2154",
    lat: -33.7260298,
    lng: 150.9815431,
    place_id: "ChIJd_tBQrWhEmsRW8Nq72llcAg",
    courts_badminton: 11,
    courts_total: 11,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "NBC Portal (yepbooking)",
    booking_url: "https://nbc.yepbooking.com.au/",
    phone: "+61 434 888 356",
    opening_hours: { ...ALL_DAY("10:00", "22:00"), sat: [["07:00", "22:00"]], sun: [["07:00", "22:00"]] },
    access_notes: null,
    price_bands: [{ label: "Standard", days: [1, 2, 3, 4, 5, 6, 7], cents: 3600, unit: "court_hour", notes: "$26-36 per court" }],
    data_source: "operator",
    source_url: "https://www.badmintoncourt.au/sydney/venue/nbc-castle-hill",
    confidence: "medium",
  },
  {
    name: "NBC Alexandria",
    suburb: "Alexandria",
    state: "NSW",
    address: "8/190 Bourke Rd, Alexandria NSW 2015",
    lat: -33.9172237,
    lng: 151.1922155,
    place_id: "ChIJVUbjh4axEmsRpz899gd2EV4",
    courts_badminton: 18,
    courts_total: 18,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "NBC Portal (yepbooking)",
    booking_url: "https://nbc.yepbooking.com.au/",
    phone: "+61 411 139 588",
    opening_hours: { ...ALL_DAY("10:00", "23:00"), sat: [["07:00", "22:00"]], sun: [] },
    access_notes: null,
    price_bands: [{ label: "Standard", days: [1, 2, 3, 4, 5, 6, 7], cents: 3700, unit: "court_hour", notes: "$31-37 per court" }],
    data_source: "operator",
    source_url: "https://www.badmintoncourt.au/sydney/venue/nbc-alexandria",
    confidence: "medium",
  },
  {
    name: "NBC MQ Park",
    suburb: "Macquarie Park",
    state: "NSW",
    address: "396 Lane Cove Rd, Macquarie Park NSW 2113",
    lat: -33.7847245,
    lng: 151.1271299,
    place_id: "ChIJ-bXf7SenEmsRzh-VaRPrkrI",
    courts_badminton: 8,
    courts_total: 8,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "NBC Portal (yepbooking)",
    booking_url: "https://nbc.yepbooking.com.au/",
    phone: "+61 428 862 917",
    opening_hours: { ...ALL_DAY("10:00", "23:00"), sat: [["07:00", "22:00"]], sun: [["07:00", "22:00"]] },
    access_notes: null,
    price_bands: [], // no pricing found — "Pricing not listed" beats a guess
    data_source: "operator",
    source_url: "https://nbcbadminton.com.au/",
    confidence: "medium",
  },
  {
    name: "NBC Seven Hills",
    suburb: "Seven Hills",
    state: "NSW",
    address: "3/17 Stanton Rd, Seven Hills NSW 2147",
    lat: -33.770613,
    lng: 150.9532,
    place_id: "ChIJWSXGbZ2YEmsRkzBgkueJ-U4",
    courts_badminton: 7,
    courts_total: 7,
    dedicated: true,
    surface: "synthetic",
    bookability: "public",
    booking_platform: "NBC Portal (yepbooking)",
    booking_url: "https://nbc.yepbooking.com.au/",
    phone: "+61 422 018 309",
    opening_hours: null, // scraped hours looked like an artifact (weekday "closed") — dropped, not stored
    access_notes: null,
    price_bands: [{ label: "Standard", days: [1, 2, 3, 4, 5, 6, 7], cents: 3600, unit: "court_hour", notes: "$26-36 per court" }],
    data_source: "operator",
    source_url: "https://www.badmintoncourt.au/sydney/venue/nbc-seven-hills",
    confidence: "medium",
  },
  {
    name: "NBC Olympic Park",
    suburb: "Sydney Olympic Park",
    state: "NSW",
    address: "5 Parkview Dr, Sydney Olympic Park NSW 2127",
    lat: -33.8451824,
    lng: 151.0736833,
    place_id: "ChIJESV9XwClEmsRCMmPsbDv_dw",
    courts_badminton: null, // not found — left unknown rather than guessed
    courts_total: null,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "NBC Portal (yepbooking)",
    booking_url: "https://nbc.yepbooking.com.au/",
    phone: "+61 424 762 610",
    opening_hours: null, // scraped schedule was a fragmented multi-window mess — dropped
    access_notes: null,
    price_bands: [],
    data_source: "operator",
    source_url: "https://nbcbadminton.com.au/",
    confidence: "low",
  },
  {
    name: "BadmintonWorx Norwest",
    suburb: "Norwest",
    state: "NSW",
    address: "2/2 Inglewood Pl, Norwest NSW 2153",
    lat: -33.7358585,
    lng: 150.9589456,
    place_id: "ChIJOT66Z7ShEmsRbPyVWTMOx24",
    courts_badminton: 15,
    courts_total: 15,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "BadmintonWorx Website / App (yepbooking)",
    booking_url: "https://badmintonworx-norwest.yepbooking.com.au/",
    phone: "1300 223 646",
    opening_hours: { ...ALL_DAY("10:00", "23:00"), sat: [["07:00", "23:00"]], sun: [["07:00", "22:00"]] },
    access_notes: null,
    price_bands: [{ label: "Standard", days: [1, 2, 3, 4, 5, 6, 7], cents: 3700, unit: "court_hour", notes: "$25-37 per court" }],
    data_source: "operator",
    source_url: "https://www.badmintoncourt.au/sydney/venue/badmintonworx-norwest",
    confidence: "medium",
  },
  {
    name: "The Badminton Club Prestons",
    suburb: "Prestons",
    state: "NSW",
    address: "276 Kurrajong Rd (entrance via Kookaburra Rd N), Prestons NSW 2170",
    // Not in the A0 sweep queue (genuinely new discovery) — geocoded live via Places Text Search
    // (one call) since a guessed centroid isn't good enough to store as this venue's location.
    lat: -33.9405539,
    lng: 150.8588757,
    place_id: "ChIJ9_8ZCN-TEmsREngUTgXkXPo",
    courts_badminton: 10,
    courts_total: 10,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "The Badminton Club Website",
    booking_url: "https://www.thebadmintonclub.com.au/prestons",
    phone: "1300 754 078",
    opening_hours: ALL_DAY("05:00", "24:00"),
    access_notes: "Automated keycode entry, open every day including public holidays.",
    price_bands: [],
    data_source: "operator",
    source_url: "https://www.thebadmintonclub.com.au/prestons",
    confidence: "medium",
  },
  {
    name: "Alpha Badminton Centre - Egerton St",
    suburb: "Silverwater",
    state: "NSW",
    address: "46 Egerton St, Silverwater NSW 2128",
    lat: -33.8344459,
    lng: 151.045578,
    place_id: "ChIJmZXOtWWjEmsRUqvI1ikzW68",
    courts_badminton: 22,
    courts_total: 22,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "Alpha Badminton Website (yepbooking)",
    booking_url: "https://alphabadminton.yepbooking.com.au/",
    phone: "0475 698 888",
    opening_hours: { ...ALL_DAY("09:00", "23:00"), sat: [["07:00", "23:00"]], sun: [["08:00", "23:00"]] },
    access_notes: "One of three distinct Alpha Badminton sites (Egerton St / Auburn / Slough Ave) — the CSV's single ambiguous 'Alpha Badminton Centre' row is a different, unresolved legacy entry and was deliberately left untouched (venues-plan.md §1 finding #2, SWEEP-FINDINGS.md).",
    price_bands: [{ label: "Standard", days: [1, 2, 3, 4, 5, 6, 7], cents: 3700, unit: "court_hour", notes: "$15-37 per court" }],
    data_source: "operator",
    source_url: "https://alphabadminton.com.au/pages/contact-us",
    confidence: "medium",
  },
  {
    name: "Alpha Badminton Centre - Auburn",
    suburb: "Auburn",
    state: "NSW",
    address: "Unit 6, Building 2/161 Manchester Rd, Auburn NSW 2144",
    lat: -33.8451057,
    lng: 151.0186699,
    place_id: "ChIJ9Sc_6Z-9EmsRROJA1EId_tY",
    courts_badminton: 22,
    courts_total: 22,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "Alpha Badminton Website (yepbooking)",
    booking_url: "https://alphabadminton.yepbooking.com.au/",
    phone: "0460 758 888",
    opening_hours: { ...ALL_DAY("09:00", "23:00"), sat: [["07:00", "23:00"]], sun: [["07:00", "23:00"]] },
    access_notes: "One of three distinct Alpha Badminton sites (Egerton St / Auburn / Slough Ave) — see Egerton St's note.",
    price_bands: [],
    data_source: "operator",
    source_url: "https://alphabadminton.com.au/pages/contact-us",
    confidence: "medium",
  },
  {
    name: "Alpha Badminton Centre - Slough Ave",
    suburb: "Silverwater",
    state: "NSW",
    address: "47/2 Slough Ave, Silverwater NSW 2128",
    lat: -33.8308452,
    lng: 151.050033,
    place_id: "ChIJIxduAK2kEmsRVgEvHX6cBi0",
    courts_badminton: 13,
    courts_total: 13,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "Alpha Badminton Website (yepbooking)",
    booking_url: "https://alphabadminton.yepbooking.com.au/",
    phone: "0482 478 888",
    opening_hours: { ...ALL_DAY("17:00", "23:00"), sat: [["07:00", "23:00"]], sun: [["08:00", "23:00"]] },
    access_notes: "One of three distinct Alpha Badminton sites (Egerton St / Auburn / Slough Ave) — see Egerton St's note. This is also the site the sweep found within 250m of Ace Badminton Sydney and NBC Silverwater (three separate operators, not one venue — SWEEP-FINDINGS.md).",
    price_bands: [{ label: "Standard", days: [1, 2, 3, 4, 5, 6, 7], cents: 3700, unit: "court_hour", notes: "$15-37 per court" }],
    data_source: "operator",
    source_url: "https://alphabadminton.com.au/pages/contact-us",
    confidence: "medium",
  },
];

// Existing row correction: The Badminton Club Wetherill Park's own site states 7 dedicated
// courts, not the CSV's 10 (§1 finding #8-style correction — A6 catching A2's CSV-sourced error).
const PROFILE_UPDATES = [
  {
    venue_id: "33bfff0a-b8e2-464b-a2d4-1b323670a1b4", // The Badminton Club Wetherill Park (from 20260815001400)
    name: "The Badminton Club Wetherill Park",
    courts_badminton: 7,
    courts_total: 7,
    phone: "1300 754 078",
    opening_hours: ALL_DAY("05:00", "24:00"),
    booking_url: "https://www.thebadmintonclub.com.au/wetherillpark",
    data_source: "operator",
    source_url: "https://www.thebadmintonclub.com.au/",
    confidence: "high", // courts/hours/phone all confirmed on the operator's own site
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
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, phone, opening_hours, access_notes, data_source, source_url, confidence, verified_at)
  select id, ${r.courts_badminton ?? "null"}, ${r.courts_total ?? "null"}, ${sqlBool(r.dedicated)}, ${sqlStr(r.surface)}, ${sqlStr(r.bookability)}, ${sqlStr(r.booking_platform)}, ${sqlStr(r.booking_url)}, ${sqlStr(r.phone)}, ${sqlJsonb(r.opening_hours)}, ${sqlStr(r.access_notes)}, ${sqlStr(r.data_source)}, ${sqlStr(r.source_url)}, ${sqlStr(r.confidence)}, now()
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, phone = excluded.phone, opening_hours = excluded.opening_hours,
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

function profileUpdateStatement(u) {
  return `-- Correction: "${u.name}" — courts_total was wrong in the CSV ingest, corrected against the operator's own site.
insert into public.venue_profiles (venue_id, courts_badminton, courts_total, phone, opening_hours, booking_url, data_source, source_url, confidence, verified_at, dedicated, bookability)
values ('${u.venue_id}', ${u.courts_badminton}, ${u.courts_total}, ${sqlStr(u.phone)}, ${sqlJsonb(u.opening_hours)}, ${sqlStr(u.booking_url)}, ${sqlStr(u.data_source)}, ${sqlStr(u.source_url)}, ${sqlStr(u.confidence)}, now(), true, 'public')
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
  updated_at = now();`;
}

const sections = [];
sections.push(`-- A6 (venues-plan.md §3): P1 operator-chain enrichment (NBC, Alpha, BadmintonWorx, The
-- Badminton Club) researched 2026-08-15 via WebSearch/WebFetch against each operator's own site
-- and, where that didn't carry hours/pricing, the badmintoncourt.au directory. Not phone-verified.
-- Regenerate with: node scripts/venues/enrich-p1-chains.mjs
--
-- Resolves the Alpha cluster A2 withheld (see 20260815001400's WITHHELD comment): three
-- confirmed distinct addresses/phones inserted as new venues; the legacy ambiguous
-- "Alpha Badminton Centre" seed row is deliberately left untouched, same treatment as the
-- still-unresolved NBC Homebush (has a live published game against it).
`);

for (const u of PROFILE_UPDATES) sections.push(profileUpdateStatement(u));
for (const r of NEW_VENUES) sections.push(newVenueStatement(r));

const ts = "20260815001500";
const path = resolve(MIGRATIONS, `${ts}_p1_chain_enrichment.sql`);
writeFileSync(path, sections.join("\n\n") + "\n");
console.log(`Wrote ${path}`);
console.log(`${PROFILE_UPDATES.length} correction(s), ${NEW_VENUES.length} new venue(s).`);
