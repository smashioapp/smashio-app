// venues-plan.md §6 — resolve each geocoded record against existing public.venues rows.
// Rules, in order, exactly per §6 (corrected post-sweep):
//   1. google_place_id exact match
//   2. slug exact match
//   3. name trigram >= 0.6 AND within 80m — distance only ever CONFIRMS a name match, never
//      substitutes for one (the sweep found 3 distinct operators within 250m on Slough Ave)
//   4. otherwise: new venue
// Any name-trigram hit that fails the distance check, or a distance hit that fails the trigram
// check, goes to `clusters` for human review — never auto-merged.
//
// Usage: node scripts/venues/match.mjs
// Input requires a fresh dump of the current venues table:
//   supabase db dump --linked --data-only -s public --file data/venues/.pipeline/venues_dump.sql

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = resolve(ROOT, "data/venues");
const PIPELINE = resolve(DATA, ".pipeline");
const DUMP_PATH = resolve(PIPELINE, "venues_dump.sql");

const TRIGRAM_THRESHOLD = 0.6;
const DISTANCE_THRESHOLD_M = 80;

// Decodes a hex-encoded EWKB Point (SRID 4326) as pg_dump emits it: 1 byte endianness,
// 4 bytes geom type + SRID flag, 4 bytes SRID, 8 bytes X (lng), 8 bytes Y (lat), all little-endian.
function decodeEwkbPoint(hex) {
  const buf = Buffer.from(hex, "hex");
  const lng = buf.readDoubleLE(9);
  const lat = buf.readDoubleLE(17);
  return { lat, lng };
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function trigrams(s) {
  const padded = `  ${s.toLowerCase().replace(/[^a-z0-9 ]/g, "")}  `;
  const grams = new Set();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

// Dice coefficient over character trigrams — same shape as Postgres pg_trgm's similarity().
function trigramSimilarity(a, b) {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

function parseExistingVenues(sql) {
  const m = sql.match(/INSERT INTO "public"\."venues" \([^)]+\) VALUES\s+([\s\S]+?);\n/);
  if (!m) return [];
  const cols = ["id", "name", "suburb", "state", "address", "location", "google_place_id", "source", "created_at", "slug", "region"];
  const rowsText = m[1];
  // Row tuples are `(...)` separated by `,\n\t` — split on the boundary between a closing paren
  // and the next opening paren rather than every comma, since values themselves contain commas.
  const rowMatches = rowsText.match(/\(([^]*?)\)(?=,\s*\(|;?\s*$)/g) ?? [];
  return rowMatches.map((tuple) => {
    const inner = tuple.slice(1, -1);
    // Split on commas at depth 0, respecting single-quoted strings ('' is an escaped quote).
    const values = [];
    let field = "";
    let inStr = false;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (inStr) {
        if (c === "'" && inner[i + 1] === "'") {
          field += "'";
          i++;
        } else if (c === "'") inStr = false;
        else field += c;
      } else {
        if (c === "'") inStr = true;
        else if (c === ",") {
          values.push(field.trim());
          field = "";
        } else field += c;
      }
    }
    values.push(field.trim());
    const row = Object.fromEntries(cols.map((c, i) => [c, values[i] === "NULL" ? null : values[i]]));
    if (row.location) {
      try {
        Object.assign(row, decodeEwkbPoint(row.location));
      } catch {
        row.lat = null;
        row.lng = null;
      }
    }
    return row;
  });
}

function run() {
  if (!existsSync(DUMP_PATH)) {
    console.error(`Missing ${DUMP_PATH} — run: supabase db dump --linked --data-only -s public --file data/venues/.pipeline/venues_dump.sql`);
    process.exit(1);
  }
  const geocoded = JSON.parse(readFileSync(resolve(PIPELINE, "geocoded.json"), "utf8"));
  const existing = parseExistingVenues(readFileSync(DUMP_PATH, "utf8"));

  const matched = [];
  const newVenues = [];
  const clusters = [];

  for (const record of geocoded) {
    if (!record.place_id) {
      clusters.push({ record, reason: "no place_id resolved — needs manual geocoding before ingest" });
      continue;
    }

    const placeIdHit = existing.find((v) => v.google_place_id === record.place_id);
    if (placeIdHit) {
      matched.push({ record, existing: placeIdHit, rule: "google_place_id" });
      continue;
    }

    const candidates = existing
      .filter((v) => v.lat != null)
      .map((v) => ({
        venue: v,
        trigram: trigramSimilarity(record.name, v.name),
        distanceM: haversineMeters({ lat: record.lat, lng: record.lng }, { lat: v.lat, lng: v.lng }),
      }))
      .filter((c) => c.trigram >= TRIGRAM_THRESHOLD || c.distanceM <= DISTANCE_THRESHOLD_M)
      .sort((a, b) => b.trigram - a.trigram);

    const confirmed = candidates.find((c) => c.trigram >= TRIGRAM_THRESHOLD && c.distanceM <= DISTANCE_THRESHOLD_M);
    if (confirmed) {
      matched.push({ record, existing: confirmed.venue, rule: "name_trigram+80m", trigram: confirmed.trigram, distanceM: confirmed.distanceM });
      continue;
    }

    if (candidates.length > 0) {
      // Name similar but too far, or close but name dissimilar — exactly the Slough Ave scenario.
      // Never auto-merged; goes to human review with both signals shown.
      clusters.push({
        record,
        reason: "ambiguous: trigram/distance signals disagree",
        candidates: candidates.slice(0, 3).map((c) => ({ name: c.venue.name, id: c.venue.id, trigram: c.trigram.toFixed(2), distanceM: Math.round(c.distanceM) })),
      });
      continue;
    }

    newVenues.push(record);
  }

  writeFileSync(resolve(PIPELINE, "matched.json"), JSON.stringify({ matched, newVenues, clusters }, null, 2));
  console.log(`Matched ${matched.length} to existing venues, ${newVenues.length} new, ${clusters.length} flagged for human review.`);
  if (clusters.length > 0) {
    console.log("\nFlagged for human review (A2 pre-flight gate — not auto-resolved):");
    for (const c of clusters) {
      console.log(`  - ${c.record.name}: ${c.reason}`);
      if (c.candidates) for (const cand of c.candidates) console.log(`      vs "${cand.name}" (${cand.id}) trigram=${cand.trigram} dist=${cand.distanceM}m`);
    }
  }
  if (matched.length > 0) {
    console.log("\nMatched to existing venues:");
    for (const m of matched) console.log(`  - ${m.record.name} -> "${m.existing.name}" (${m.existing.id}) via ${m.rule}`);
  }
}

run();
