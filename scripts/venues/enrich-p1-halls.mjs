// venues-plan.md §3/§6 (A6 P1 pass 3): the 9 school/community halls from the Badminton NSW
// affiliated-club directory (data/venues/clubs-badminton-nsw.json's `school_and_community_halls`)
// — none of these are in leads-to-enrich.csv because Places' "badminton" query cannot find a
// school gym that hosts a weekly club night. Each one gets a single live Places Text Search call
// here (same pattern enrich-p1-chains.mjs used for The Badminton Club Prestons) to resolve
// place_id + coordinates, since a guessed centroid isn't good enough to store as a venue location.
//
// Per SWEEP-FINDINGS.md and venues-plan.md §3's "a club is not a venue" lesson: these are modelled
// as the hall, not the club. bookability='club_only' and booking_url=null throughout — an
// individual cannot turn up and hire a court, only join the listed club's session. access_notes
// carries the club names as the actual point of contact, sourced from Badminton NSW's own
// affiliated-club directory (https://www.badmintonnsw.org.au/affiliated-clubs/, captured
// 2026-08-15), which is itself the operator-equivalent source here — there is no "hall's own
// booking site" for a club-hired school gym. confidence='medium' throughout: real source with a
// URL and date, but Badminton NSW's own page warns its listings may be obsolete, and no field
// here is confirmed by the school/venue itself.
//
// Usage: node scripts/venues/enrich-p1-halls.mjs
// Output: supabase/migrations/<timestamp>_p1_halls_enrichment.sql — review before pushing.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");

function loadKey() {
  const envPath = resolve(ROOT, "ui/.env");
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="));
  const key = line?.split("=")[1]?.trim();
  if (!key) throw new Error("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY missing from ui/.env");
  return key;
}

async function textSearch(key, query) {
  const params = `query=${encodeURIComponent(query)}&region=au`;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}&key=${key}`;
  const res = await fetch(url, { headers: { "X-Ios-Bundle-Identifier": "com.smashio.app" } });
  const json = await res.json();
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(`Places textsearch ${json.status}: ${json.error_message ?? "(no message)"}`);
  }
  return json.results?.[0] ?? null;
}

function sqlStr(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlBool(v) {
  return v ? "true" : "false";
}
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HALLS = [
  { name: "Muirfield High School", suburb: "North Rocks", clubs: ["Epping BC", "Friendly BC", "North Western BC", "Shuttlebugs"] },
  // Club directory says "Eastwood" but Places resolves the school to Marsfield — Places wins (see loadKey's ToS note: address is a display string sourced fresh each geocode, not carried over from the directory).
  { name: "Epping Boys High School", suburb: "Marsfield", clubs: ["Australian Badminton Academy", "World Chinese Badminton Federation Aus"] },
  // Same site as P1 lead "Sydney Badminton" (leads-to-enrich.csv, place_id ChIJG-lGd6C5EmsREnQVFvvpUZQ, ~20m away) —
  // club-plus-host-venue duplicate per SWEEP-FINDINGS.md. This hall row is the canonical venue; "Sydney Badminton" must be SKIPPED, not separately inserted, when the P1 dedicated bucket is enriched next.
  { name: "Hurstville Boys High School", suburb: "Hurstville", clubs: ["Badminton Magic", "Sydney Badminton"], duplicateOf: "Sydney Badminton (P1 lead, ChIJG-lGd6C5EmsREnQVFvvpUZQ) — do not also insert that lead as a separate venue" },
  { name: "Dulwich Hill High School Hall", suburb: "Dulwich Hill", clubs: ["Dulwich Hill BC", "Zealcon BC"] },
  { name: "Baulkham Hills High School Gymnasium", suburb: "Baulkham Hills", clubs: ["KBC NSW", "Shuttlebugs"] },
  { name: "Castle Hill High School", suburb: "Castle Hill", clubs: ["Hills Highlights Badminton"] },
  { name: "Erskine Park High School", suburb: "Erskine Park", clubs: ["Erskine Park BC"] },
  { name: "Glenbrook Public School", suburb: "Glenbrook", clubs: ["Shuttle Shufflers"] },
  // UNSW Gymnasium deliberately excluded: its Places geocode resolves to place_id
  // ChIJDdkXWouxEmsRRnJ9dxHVtec, identical to the already-inserted "UNSW Fitness & Aquatic Centre
  // (FAC)" venue (20260815001400) — Places has no distinct listing for the actual Unigym building
  // the club plays in, and the directory explicitly warns the two are different spaces. Inserting
  // it would silently duplicate a place_id. See UNSW_FAC_NOTE below instead.
];

// The existing UNSW FAC venue (20260815001400, venue_id resolved by slug) gets an access_notes
// addendum rather than a new row — see the comment above.
const UNSW_FAC_UPDATE = `-- UNSW Badminton Club plays "above the Unigym" per Badminton NSW's directory, a space Places
-- has no distinct listing for (see enrich-p1-halls.mjs). Appending to the existing FAC venue's
-- access_notes rather than inserting a duplicate at the same place_id.
update public.venue_profiles
set access_notes = coalesce(access_notes || ' ', '') || 'UNSW Badminton Club also plays here (in the Unigym space above the FAC) — contact the club to join a session.',
    updated_at = now()
where venue_id = (select id from public.venues where slug = 'unsw-fitness-aquatic-centre');`;

function accessNotes(h) {
  const clubList = h.clubs.join(", ");
  const dup = h.duplicateOf ? ` Same site as ${h.duplicateOf}.` : "";
  return `Club-hired hall, not individually bookable. Badminton hosted by: ${clubList}. Contact the club to join a session.${dup}`;
}

function newVenueStatement(r) {
  const slug = slugify(r.name);
  return `-- New: "${r.name}" (confidence: medium, place: ${r.formattedAddress})
with ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values (${sqlStr(r.name)}, ${sqlStr(r.suburb)}, 'NSW', ${sqlStr(r.formattedAddress)},
    extensions.ST_SetSRID(extensions.ST_MakePoint(${r.lng}, ${r.lat}), 4326), ${sqlStr(r.place_id)}, 'partner', ${sqlStr(slug)})
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
),
prof as (
  insert into public.venue_profiles (venue_id, dedicated, bookability, booking_url, access_notes, data_source, source_url, confidence, verified_at)
  select id, false, 'club_only', null, ${sqlStr(accessNotes(r))}, 'partner', 'https://www.badmintonnsw.org.au/affiliated-clubs/', 'medium', now()
  from ins
  on conflict (venue_id) do update set
    dedicated = excluded.dedicated, bookability = excluded.bookability, booking_url = excluded.booking_url,
    access_notes = excluded.access_notes, data_source = excluded.data_source, source_url = excluded.source_url,
    confidence = excluded.confidence, verified_at = excluded.verified_at, updated_at = now()
  returning venue_id
)
select id from ins;`;
}

async function main() {
  const key = loadKey();
  const resolved = [];
  for (const h of HALLS) {
    const query = `${h.name}, ${h.suburb} NSW Australia`;
    const result = await textSearch(key, query);
    if (!result) {
      console.error(`NO MATCH: ${query}`);
      continue;
    }
    resolved.push({
      ...h,
      place_id: result.place_id,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    });
    console.log(`${h.name} -> ${result.formatted_address} (${result.place_id})`);
  }

  if (resolved.length !== HALLS.length) {
    console.error(`Resolved ${resolved.length}/${HALLS.length} — fix unmatched queries before emitting SQL.`);
    process.exit(1);
  }

  const sections = [];
  sections.push(`-- A6 (venues-plan.md §3): P1 school/community hall enrichment — the 9 halls from
-- Badminton NSW's affiliated-club directory (data/venues/clubs-badminton-nsw.json), geocoded
-- 2026-08-15 via a single live Places Text Search per hall. bookability='club_only' throughout:
-- these are club-hired gyms, never individually bookable.
-- Regenerate with: node scripts/venues/enrich-p1-halls.mjs
`);
  for (const r of resolved) sections.push(newVenueStatement(r));
  sections.push(UNSW_FAC_UPDATE);

  const ts = "20260815001700";
  const path = resolve(MIGRATIONS, `${ts}_p1_halls_enrichment.sql`);
  writeFileSync(path, sections.join("\n\n") + "\n");
  console.log(`\nWrote ${path}`);
  console.log(`${resolved.length} new venue(s).`);
}

main();
