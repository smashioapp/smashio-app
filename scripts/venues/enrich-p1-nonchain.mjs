// venues-plan.md §3/§6 (A6 P1 pass 2): hand-researched enrichment for the 8 non-chain dedicated
// P1 leads (ATC, Ace, Pro1, Roketto, Yennora, KBC Camellia, APX Thornleigh, A1 Campbelltown),
// gathered via WebSearch/WebFetch against each operator's own site 2026-08-15. None existed as
// `venues` rows before this — they were never in the original 15-row CSV, only surfaced by the
// §3 Places sweep — so every row here is a new venue insert, not a correction.
//
// Confidence notes (per §3's rule — high only if every stored field traces to the operator's own
// site with a URL):
//   - ATC, Pro1, APX: high — every field stored (courts/hours/price/booking/phone) came straight
//     off the operator's own domain. Fields the operator didn't publish (e.g. ATC/APX price,
//     Pro1/APX exact hours) are left null rather than guessed.
//   - Roketto, Yennora, A1, KBC: medium — at least one material field (Roketto: phone conflicted
//     across two fetches of the same page, dropped; Yennora: official site is a construction
//     placeholder, courts/hours/price came from the badmintoncourt.au directory; A1: court count
//     came from the directory, not a1badminton.com.au itself; KBC: official site only, but see
//     the hours note below).
//   - Ace: low — no operator website exists at all, only a third-party directory listing and a
//     Facebook page. Nothing here is operator-confirmed.
//
// Dropped rather than stored (same rule that dropped NBC Seven Hills/Olympic Park's hours in the
// P1 chain pass): KBC's own site lists session times only for Mon/Thu/Sat/Sun with Tue/Wed/Fri
// entirely absent — reads as club social-session slots, not the venue's actual opening hours, so
// opening_hours is left null with an access_note instead of storing a hole-riddled schedule.
//
// Usage: node scripts/venues/enrich-p1-nonchain.mjs
// Output: supabase/migrations/<timestamp>_p1_nonchain_enrichment.sql — review before pushing.

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

const ALL_DAY = (open, close) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [[open, close]]]));

const NEW_VENUES = [
  {
    name: "ATC Badminton Centre",
    suburb: "Alexandria",
    state: "NSW",
    address: "Unit A/27 Hiles St, Alexandria NSW 2015",
    lat: -33.9035108,
    lng: 151.1995121,
    place_id: "ChIJfd37zq6lEmsRx30HcY_cJgw",
    courts_badminton: 8,
    courts_total: 8,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "ATC Booking (yepbooking)",
    booking_url: "https://australia-badminton-development-centre.yepbooking.com.au/",
    phone: "+61 426 013 302",
    opening_hours: ALL_DAY("10:00", "23:00"),
    access_notes: null,
    price_bands: [],
    data_source: "operator",
    source_url: "https://atcbadminton.com.au/",
    confidence: "high",
  },
  {
    name: "Ace Badminton Sydney",
    suburb: "Silverwater",
    state: "NSW",
    address: "Slough Ave, Silverwater NSW 2128",
    lat: -33.8306985,
    lng: 151.0506814,
    place_id: "ChIJFY4q1b2lEmsROUxFkDHbtsk",
    courts_badminton: null,
    courts_total: null,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: null,
    booking_url: null,
    website_url: "https://www.facebook.com/acebadmintonsydney/",
    phone: null,
    opening_hours: null, // "open 24 hours" is a single unverified third-party claim, no operator site to confirm — dropped
    access_notes: "No operator website found. Contact via Facebook to confirm hours before visiting.",
    price_bands: [],
    data_source: "operator",
    source_url: "https://www.badmintoncourt.au/sydney/venue/ace-badminton-sydney",
    confidence: "low",
  },
  {
    name: "Pro1 Badminton Centre",
    suburb: "Bankstown Aerodrome",
    state: "NSW",
    address: "1/361 Milperra Rd, Bankstown Aerodrome NSW 2200",
    lat: -33.9277697,
    lng: 150.9895127,
    place_id: "ChIJneCks1C_EmsRR1BYfq3pvp8",
    courts_badminton: 14,
    courts_total: 14,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "Pro1 Booking Portal",
    booking_url: "https://booking.pro1badminton.com.au/secure/customer/booking/v1/public/show",
    phone: "+61 406 725 935",
    opening_hours: null, // self-access is 24/7 via emailed pin, but exact daily open/close not published — see access_notes
    access_notes: "24/7 self-access via emailed pin-code; staffed for racquet hire Mon-Fri 4-10pm, Sat-Sun 10am-10pm.",
    price_bands: [
      { label: "Off-peak", days: [1, 2, 3, 4, 5], cents: 3000, unit: "court_hour", notes: "Mon-Fri 6am-4pm" },
      { label: "Peak", days: [1, 2, 3, 4, 5, 6, 7], cents: 3600, unit: "court_hour", notes: "All other times & public holidays" },
    ],
    data_source: "operator",
    source_url: "https://pro1badminton.com.au/what-we-offer/badminton-court-hire/",
    confidence: "high",
  },
  {
    name: "Roketto Badminton",
    suburb: "Lidcombe",
    state: "NSW",
    address: "22 Carter St, Lidcombe NSW 2141",
    lat: -33.8512096,
    lng: 151.0574872,
    place_id: "ChIJ7Ui-lPC7EmsRfVJrKReUFQY",
    courts_badminton: null,
    courts_total: null,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "Roketto Booking (Sportlogic)",
    booking_url: "https://roketto.sportlogic.net.au/secure/customer/login",
    phone: null, // two fetches of roketto.com.au's own page returned different numbers (0287365478 vs 0287056478) — dropped rather than guess which
    opening_hours: { ...ALL_DAY("09:00", "23:00"), sat: [["07:00", "23:00"]], sun: [["07:00", "23:00"]] },
    access_notes: null,
    price_bands: [],
    data_source: "operator",
    source_url: "https://www.roketto.com.au/playing.html",
    confidence: "medium",
  },
  {
    name: "Yennora Badminton Centre",
    suburb: "Yennora",
    state: "NSW",
    address: "Unit 7B/26 Nelson Rd, Yennora NSW 2161",
    lat: -33.8649468,
    lng: 150.968913,
    place_id: "ChIJ5TlUO5e9EmsRwxA-9MYhmgA",
    courts_badminton: 12,
    courts_total: 12,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "Yennora Badminton Centre Booking (yepbooking)",
    booking_url: "https://badmintoncentre-yennora.yepbooking.com.au/",
    phone: "0451 861 885",
    opening_hours: ALL_DAY("10:00", "23:00"),
    access_notes: null,
    price_bands: [
      { label: "Off-peak", days: [1, 2, 3, 4, 5], cents: 2900, unit: "court_hour", notes: "10am-5pm weekdays" },
      { label: "Peak", days: [1, 2, 3, 4, 5, 6, 7], cents: 3200, unit: "court_hour", notes: "After 5pm weekdays and all weekend" },
    ],
    data_source: "operator",
    source_url: "https://www.badmintoncourt.au/sydney/venue/badmintonworx-yennora",
    confidence: "medium", // operator's own site (yennorabadmintoncentre.com) is a construction placeholder — courts/hours/price sourced from the badmintoncourt.au directory instead
  },
  {
    name: "KBC Badminton Camellia",
    suburb: "Camellia",
    state: "NSW",
    address: "Unit 7/175-179 James Ruse Dr, Camellia NSW 2142",
    lat: -33.8176039,
    lng: 151.023357,
    place_id: "ChIJcxF59uWjEmsRg1tFSBnODcU",
    courts_badminton: null,
    courts_total: null,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "KBC NSW Booking (yepbooking)",
    booking_url: "https://kbcnsw.yepbooking.com.au",
    phone: null, // only a WeChat ID was published, not a phone number
    opening_hours: null, // operator site lists session slots for Mon/Thu/Sat/Sun only, Tue/Wed/Fri entirely absent — reads as club social slots, not full opening hours, dropped
    access_notes: "Operator site lists specific social-session times (Mon/Thu/Sat/Sun) rather than full opening hours — confirm via the booking site before visiting.",
    price_bands: [
      { label: "Member", days: [1, 2, 3, 4, 5, 6, 7], cents: 1800, unit: "person_session", notes: "Member session price" },
      { label: "Non-member", days: [1, 2, 3, 4, 5, 6, 7], cents: 2200, unit: "person_session", notes: "Non-member session price" },
    ],
    data_source: "operator",
    source_url: "https://www.kbcbadminton.com.au/",
    confidence: "medium",
  },
  {
    name: "APX Badminton Courts",
    suburb: "Thornleigh",
    state: "NSW",
    address: "Unit 2 & 3/35E Sefton Rd, Thornleigh NSW 2120",
    lat: -33.7213992,
    lng: 151.0788132,
    place_id: "ChIJ6TuPxQCnEmsRV8rpeLC7v3Y",
    courts_badminton: null,
    courts_total: null,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "APX Booking (Sportlogic)",
    booking_url: "https://apxbadminton.sportlogic.net.au/secure/customer/booking/v1/public/venues",
    phone: "+61 422 993 262",
    opening_hours: null, // "operates 7am-10pm" was inferred from the pricing table's time slots, not a published hours statement — dropped
    access_notes: null,
    price_bands: [
      { label: "Weekday", days: [1, 2, 3, 4, 5], cents: 3800, unit: "court_hour", notes: "$25-38 per court depending on time slot" },
      { label: "Weekend", days: [6, 7], cents: 4000, unit: "court_hour", notes: "$36-40 per court depending on time slot" },
    ],
    data_source: "operator",
    source_url: "https://apxbadminton.com.au/",
    confidence: "high",
  },
  {
    name: "A1 Badminton Centre",
    suburb: "Campbelltown",
    state: "NSW",
    address: "11 Mount Erin Rd, Campbelltown NSW 2560",
    lat: -34.0596733,
    lng: 150.8039305,
    place_id: "ChIJdSkiVOXvEmsR4kRyznNfpK4",
    courts_badminton: 10, // from the badmintoncourt.au directory — a1badminton.com.au's own booking page didn't state a court count
    courts_total: 10,
    dedicated: true,
    surface: null,
    bookability: "public",
    booking_platform: "A1 Badminton Booking Portal",
    booking_url: "https://booking.a1badminton.com.au/secure/customer/booking/v1/public/show",
    phone: "0416 592 150",
    opening_hours: ALL_DAY("07:00", "23:00"),
    access_notes: null,
    price_bands: [
      { label: "Morning", days: [1, 2, 3, 4, 5], cents: 1600, unit: "court_hour", notes: "Mon-Fri 7am-4pm" },
      { label: "Afternoon/Evening", days: [1, 2, 3, 4, 5], cents: 2600, unit: "court_hour", notes: "Mon-Fri 4pm-10pm" },
      { label: "Late", days: [1, 2, 3, 4, 5], cents: 2000, unit: "court_hour", notes: "Mon-Fri 10pm-11pm" },
      { label: "Weekend/Public Holiday", days: [6, 7], cents: 2600, unit: "court_hour", notes: "Sat-Sun & public holidays" },
    ],
    data_source: "operator",
    source_url: "https://a1badminton.com.au/book-court/",
    confidence: "medium", // court count is directory-sourced, not confirmed on the operator's own booking page
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
sections.push(`-- A6 (venues-plan.md §3): P1 non-chain enrichment pass 2 — the 8 dedicated badminton
-- centres not part of any operator chain (ATC, Ace, Pro1, Roketto, Yennora, KBC Camellia, APX
-- Thornleigh, A1 Campbelltown), researched 2026-08-15 via WebSearch/WebFetch against each
-- operator's own site (badmintoncourt.au directory used only where the operator's own site
-- didn't carry the field). None of these existed as venues before — surfaced only by the §3
-- Places sweep, not the original 15-row CSV.
-- Regenerate with: node scripts/venues/enrich-p1-nonchain.mjs
`);

for (const r of NEW_VENUES) sections.push(newVenueStatement(r));

const ts = "20260815001600";
const path = resolve(MIGRATIONS, `${ts}_p1_nonchain_enrichment.sql`);
writeFileSync(path, sections.join("\n\n") + "\n");
console.log(`Wrote ${path}`);
console.log(`${NEW_VENUES.length} new venue(s).`);
