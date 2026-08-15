// venues-plan.md §6 — turn match.mjs's output into an idempotent migration. Rules enforced here:
//   - Upsert venues on slug; NEVER overwrite an existing google_place_id with NULL (matched rows
//     don't touch venues.name/address/location/google_place_id at all — those stay Places-owned).
//   - Slugs get backfilled onto every existing venue that doesn't have one yet (fixes the
//     duplicate-Alpha-style bug from §1.2: NULL slugs can't be matched against).
//   - Delete-and-reinsert venue_amenities/venue_pricing_bands per venue (derived data, no diff).
//   - Every emitted profile row is data_source='csv', confidence='low', verified_at=null.
//   - Clustered/flagged records are NEVER emitted — they need a human decision first.
//
// Usage: node scripts/venues/emit-sql.mjs
// Output: supabase/migrations/<timestamp>_venue_directory_seed.sql — NOT applied automatically.
// Review it, resolve data/venues/.pipeline/matched.json's `clusters` first, then `supabase db push`.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = resolve(ROOT, "data/venues");
const PIPELINE = resolve(DATA, ".pipeline");
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

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function priceBandInsert(venueId, band) {
  return `  ('${venueId}', ${sqlStr(band.label)}, ${sqlArr(band.days)}, null, null, ${band.cents}, ${sqlStr(band.unit)}, ${sqlStr(band.notes)})`;
}

function amenityInsert(venueId, amenity) {
  return `  ('${venueId}', ${sqlStr(amenity.slug)}, ${sqlStr(amenity.availability)}, ${sqlStr(amenity.note)})`;
}

function profileUpsert(venueId, r) {
  return `insert into public.venue_profiles (
  venue_id, courts_badminton, courts_total, dedicated, surface, bookability,
  booking_platform, booking_url, access_notes, summary, data_source, confidence
) values (
  '${venueId}', ${r.courts_badminton ?? "null"}, ${r.courts_total ?? "null"}, ${sqlBool(r.dedicated)}, ${sqlStr(r.surface)}, ${sqlStr(r.bookability)},
  ${sqlStr(r.booking_platform)}, ${sqlStr(r.booking_url)}, ${sqlStr(r.access_notes)}, ${sqlStr(r.summary)}, ${sqlStr(r.data_source)}, ${sqlStr(r.confidence)}
)
on conflict (venue_id) do update set
  courts_badminton = excluded.courts_badminton,
  courts_total = excluded.courts_total,
  dedicated = excluded.dedicated,
  surface = excluded.surface,
  bookability = excluded.bookability,
  booking_platform = excluded.booking_platform,
  booking_url = excluded.booking_url,
  access_notes = excluded.access_notes,
  summary = excluded.summary,
  data_source = excluded.data_source,
  confidence = excluded.confidence,
  updated_at = now();`;
}

function derivedDataBlock(venueId, r) {
  const parts = [`delete from public.venue_amenities where venue_id = '${venueId}';`, `delete from public.venue_pricing_bands where venue_id = '${venueId}';`];
  if (r.amenities.length > 0) {
    parts.push(`insert into public.venue_amenities (venue_id, amenity_slug, availability, note) values\n${r.amenities.map((a) => amenityInsert(venueId, a)).join(",\n")};`);
  }
  if (r.price_bands.length > 0) {
    parts.push(`insert into public.venue_pricing_bands (venue_id, label, days, starts_time, ends_time, cents, unit, notes) values\n${r.price_bands.map((b) => priceBandInsert(venueId, b)).join(",\n")};`);
  }
  return parts.join("\n");
}

// One statement: venues insert -> profile/amenities/pricing CTEs all keyed off the same
// returned id, so a brand-new venue and its curated data land together or not at all.
// Data-modifying CTEs are never inlined by the planner (unlike plain SELECT CTEs), so every
// branch here actually executes even though only `ins` is referenced by name elsewhere.
function newVenueStatement(r) {
  const slug = slugify(r.name);
  const ctes = [
    `ins as (
  insert into public.venues (name, suburb, state, address, location, google_place_id, source, slug)
  values (${sqlStr(r.name)}, ${sqlStr(r.suburb)}, ${sqlStr(r.state)}, ${sqlStr(r.resolved_address ?? r.address)},
    extensions.ST_SetSRID(extensions.ST_MakePoint(${r.lng}, ${r.lat}), 4326), ${sqlStr(r.place_id)}, 'partner', ${sqlStr(slug)})
  on conflict (slug) do update set google_place_id = coalesce(public.venues.google_place_id, excluded.google_place_id)
  returning id
)`,
    `prof as (
  insert into public.venue_profiles (venue_id, courts_badminton, courts_total, dedicated, surface, bookability, booking_platform, booking_url, access_notes, summary, data_source, confidence)
  select id, ${r.courts_badminton ?? "null"}, ${r.courts_total ?? "null"}, ${sqlBool(r.dedicated)}, ${sqlStr(r.surface)}, ${sqlStr(r.bookability)}, ${sqlStr(r.booking_platform)}, ${sqlStr(r.booking_url)}, ${sqlStr(r.access_notes)}, ${sqlStr(r.summary)}, ${sqlStr(r.data_source)}, ${sqlStr(r.confidence)}
  from ins
  on conflict (venue_id) do update set
    courts_badminton = excluded.courts_badminton, courts_total = excluded.courts_total, dedicated = excluded.dedicated,
    surface = excluded.surface, bookability = excluded.bookability, booking_platform = excluded.booking_platform,
    booking_url = excluded.booking_url, access_notes = excluded.access_notes, summary = excluded.summary,
    data_source = excluded.data_source, confidence = excluded.confidence, updated_at = now()
  returning venue_id
)`,
  ];
  if (r.amenities.length > 0) {
    ctes.push(`del_amenities as (
  delete from public.venue_amenities where venue_id = (select id from ins) returning venue_id
)`);
    ctes.push(`ins_amenities as (
  -- Joining del_amenities (unused columns aside) is what forces Postgres to run the delete
  -- before this insert — sibling data-modifying CTEs have no ordering guarantee otherwise.
  insert into public.venue_amenities (venue_id, amenity_slug, availability, note)
  select ins.id, x.slug, x.availability, x.note
  from ins, del_amenities, (values\n${r.amenities.map((a) => `    (${sqlStr(a.slug)}, ${sqlStr(a.availability)}, ${sqlStr(a.note)})`).join(",\n")}\n  ) as x(slug, availability, note)
  returning venue_id
)`);
  }
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
  return `with ${ctes.join(",\n")}\nselect id from ins;`;
}

function run() {
  const matchedPath = resolve(PIPELINE, "matched.json");
  if (!existsSync(matchedPath)) {
    console.error("Missing data/venues/.pipeline/matched.json — run match.mjs first.");
    process.exit(1);
  }
  const { matched, newVenues, clusters } = JSON.parse(readFileSync(matchedPath, "utf8"));

  const sections = [];

  sections.push(`-- A2 (venues-plan.md §6): generated ingest for ${newVenues.length + matched.length} of the raw CSV's 15
-- venues (${clusters.length} withheld pending human cluster review — see the comment block at
-- the end of this file). Regenerate with: node scripts/venues/normalize.mjs && node
-- scripts/venues/geocode.mjs && node scripts/venues/match.mjs && node scripts/venues/emit-sql.mjs
--
-- Every profile row here is data_source='csv', confidence='low' — none of this is operator-
-- verified yet (§3's verification rule). A6 upgrades confidence per-field as it's re-checked.

-- Slug backfill: every existing venue without one yet, so future ingest runs can match on slug
-- instead of relying on google_place_id (fixes the NULL-place_id duplicate risk in §1.2).
-- Uniqueness suffix handled by appending a short id fragment on collision.
do $$
declare
  v record;
  v_slug text;
  v_suffix int;
begin
  for v in select id, name from public.venues where slug is null loop
    v_slug := lower(regexp_replace(regexp_replace(v.name, '\\([^)]*\\)', '', 'g'), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
    v_suffix := 0;
    while exists (select 1 from public.venues where slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end and id <> v.id) loop
      v_suffix := v_suffix + 1;
    end loop;
    update public.venues set slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end where id = v.id;
  end loop;
end $$;
`);

  for (const { record, existing } of matched) {
    sections.push(`-- Matched: "${record.name}" -> existing venue "${existing.name}" (${existing.id}). Not touching
-- venues.name/address/location/google_place_id — curated data only.`);
    sections.push(profileUpsert(existing.id, record));
    sections.push(derivedDataBlock(existing.id, record));
  }

  if (newVenues.length > 0) {
    sections.push(`-- New venues: each is one statement — a venues insert feeding its profile/amenity/pricing
-- inserts via CTEs referencing the returned id, so venue + curated data land atomically. Upsert
-- on slug so a re-run of this generated file is idempotent.`);
    for (const r of newVenues) {
      sections.push(`-- New: "${r.name}"`);
      sections.push(newVenueStatement(r));
    }
  }

  if (clusters.length > 0) {
    sections.push(`/* WITHHELD pending human review (A2 pre-flight gate, venues-plan.md §6):
${clusters.map((c) => `  - ${c.record.name}: ${c.reason}${c.candidates ? "\n" + c.candidates.map((cd) => `      vs "${cd.name}" (${cd.id}) trigram=${cd.trigram} dist=${cd.distanceM}m`).join("\n") : ""}`).join("\n")}
*/`);
  }

  const ts = "20260815001400";
  const path = resolve(MIGRATIONS, `${ts}_venue_directory_seed.sql`);
  writeFileSync(path, sections.join("\n\n") + "\n");
  console.log(`Wrote ${path}`);
  console.log(`${matched.length} matched-venue update(s), ${newVenues.length} new-venue insert(s), ${clusters.length} withheld pending human review. Still csv/low confidence throughout — review before pushing.`);
}

run();
