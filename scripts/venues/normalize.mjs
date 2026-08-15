// venues-plan.md §6 — parse the raw CSV's prose cells into typed records. Everything here is
// data_source='csv', confidence='low' per §6's rule: the CSV is a skeleton, not a source, and
// nothing gets 'high' confidence until a human re-checks it against the operator (§3).
//
// Usage: node scripts/venues/normalize.mjs
// Output: data/venues/.pipeline/normalized.json (gitignored intermediate)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = resolve(ROOT, "data/venues");
const PIPELINE = resolve(DATA, ".pipeline");
const SRC = resolve(DATA, "sydney-badminton-facilities.raw.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else if (c === "\r") {
        // skip
      } else field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const warnings = [];
function warn(name, msg) {
  warnings.push(`${name}: ${msg}`);
}

// "$29.50/hr (Off-peak Mon-Fri 6am-4pm), $39.50/hr (Peak Mon-Fri 4-10pm, Sat-Sun)"
// "$29.50/hr (Peak community), $6.40/hr (Casual per person)"
// Splits on "), " boundaries (each band's own qualifier is parenthesized), then parses each band.
function parsePriceBands(name, raw) {
  if (!raw) return [];
  const parts = raw.split(/\),\s*/).map((s) => (s.endsWith(")") ? s : `${s})`));
  const bands = [];
  for (const part of parts) {
    const m = part.match(/\$([\d.]+)\s*(?:-\s*\$?([\d.]+))?\s*\/\s*(hr|person)\s*(?:\(([^)]*)\))?/i);
    if (!m) {
      warn(name, `unparseable price segment: "${part}"`);
      continue;
    }
    const lowCents = Math.round(parseFloat(m[1]) * 100);
    const highCents = m[2] ? Math.round(parseFloat(m[2]) * 100) : lowCents;
    const qualifier = (m[4] ?? "").trim();
    const isPerPerson = /person/i.test(m[3]) || /per person/i.test(qualifier);
    const isPeak = /peak/i.test(qualifier) && !/off-?peak/i.test(qualifier);
    const isOffPeak = /off-?peak/i.test(qualifier);
    const label = isPeak ? "Peak" : isOffPeak ? "Off-peak" : qualifier || "Standard";
    // Day/time extraction is best-effort — the raw qualifier string is always kept in `notes`
    // so nothing is lost if this misses a pattern (fail loud in `notes`, not silently guessed).
    const days = /sat|sun|weekend/i.test(qualifier) && !/mon-fri/i.test(qualifier) ? [6, 7] : [1, 2, 3, 4, 5, 6, 7];
    bands.push({
      label,
      days,
      starts_time: null,
      ends_time: null,
      cents: highCents, // conservative: display the higher end of a range so nothing under-quotes
      unit: isPerPerson ? "person_hour" : "court_hour",
      notes: qualifier || null,
    });
  }
  if (bands.length === 0) warn(name, `no price bands parsed from "${raw}"`);
  return bands;
}

// §2 finding #4: cells like "Yes (Paid on-site / P3 car park)" or "No (Retail purchase at front
// desk)" carry both an availability verdict and a free-text note; the racquet/shuttle columns
// additionally conflate rental-availability with a retail fact, so those two get split into
// separate amenity slugs (a "no" on hire can still be "yes" on retail).
function parseYesNo(cell) {
  const m = cell.match(/^(Yes|No)\s*(?:\((.*)\))?$/i);
  if (!m) return { availability: "unknown", note: cell || null };
  return { availability: m[1].toLowerCase() === "yes" ? "yes" : "no", note: m[2]?.trim() || null };
}

function parseRentalRetail(cell) {
  const { availability: hireAvailability, note } = parseYesNo(cell);
  // Retail is asserted whenever the note mentions purchase/sale/shop, independent of the hire verdict.
  const retailAvailable = note ? /purchase|sale|shop|desk/i.test(note) : false;
  return {
    hire: { availability: hireAvailability, note },
    retail: { availability: retailAvailable ? "yes" : "unknown", note: retailAvailable ? note : null },
  };
}

function parseSurface(comments) {
  const c = comments.toLowerCase();
  if (/synthetic/.test(c)) return "synthetic";
  if (/\bmat\b|mats\b/.test(c)) return "mat";
  if (/wood|timber/.test(c)) return "timber";
  return null;
}

function parseCourtsBadminton(courtsTotal, comments) {
  // "Badminton courts set up on Full Courts 3 and 4" — count the enumerated court refs rather
  // than trusting the raw total, which conflates "courts in the building" with badminton-bookable
  // ones (§1 finding #8).
  const m = comments.match(/set up on ([\w\s,]+?)(?:\.|$)/i);
  if (m) {
    const refs = m[1].split(/,| and /).map((s) => s.trim()).filter(Boolean);
    if (refs.length > 0) return refs.length;
  }
  return courtsTotal;
}

function normalize(row, header) {
  const get = (col) => row[header.indexOf(col)] ?? "";
  const name = get("Facility Name").trim();
  const location = get("Location").trim();
  const address = get("Full Address").trim();
  const [suburb, state] = location.split(",").map((s) => s.trim());
  const courtsTotal = parseInt(get("Number of Courts"), 10) || null;
  const comments = get("Comments").trim();
  const bookingAmount = get("Booking Amount").trim();
  const bookingPlatform = get("Booking Platform").trim();

  const racquet = parseRentalRetail(get("Racquet Rental"));
  const shuttle = parseRentalRetail(get("Shuttle Rental"));
  const washroom = parseYesNo(get("Washroom Available"));
  const parking = parseYesNo(get("Parking Available"));
  const water = parseYesNo(get("Water Available"));
  const stringing = parseYesNo(get("Stringing Services"));

  const amenities = [
    { slug: "toilets", ...washroom },
    { slug: "parking", ...parking },
    { slug: "drinking_water", ...water },
    { slug: "racquet_hire", availability: racquet.hire.availability, note: racquet.hire.note },
    { slug: "racquet_retail", availability: racquet.retail.availability, note: racquet.retail.note },
    { slug: "shuttle_hire", availability: shuttle.hire.availability, note: shuttle.hire.note },
    { slug: "shuttle_retail", availability: shuttle.retail.availability, note: shuttle.retail.note },
    { slug: "stringing", availability: stringing.availability, note: stringing.note },
  ].filter((a) => a.availability !== "unknown");

  // "24/7 automated ... keycode PIN door entry" is the one access-hours signal the CSV carries.
  const accessNotes = /24\/7/i.test(comments) ? comments : null;

  const record = {
    name,
    suburb: suburb ?? "",
    state: state ?? "NSW",
    address,
    courts_total: courtsTotal,
    courts_badminton: parseCourtsBadminton(courtsTotal, comments),
    dedicated: /dedicated/i.test(comments),
    surface: parseSurface(comments),
    booking_platform: bookingPlatform || null,
    booking_url: null, // CSV has no URLs — §1 finding #9, filled by §3 research (A6)
    price_bands: parsePriceBands(name, bookingAmount),
    price_notes: bookingAmount || null,
    amenities,
    access_notes: accessNotes,
    // venue_profiles.summary is explicitly "ours, not scraped" (venues-plan.md §4.2) — the raw
    // CSV comment isn't editorial copy, so it's left null here rather than mis-attributed as one.
    summary: null,
    raw_comment: comments || null,
    bookability: "public", // every CSV row is a commercial/council facility, not a club-hired hall
    data_source: "csv",
    confidence: "low",
  };

  if (!record.courts_total) warn(name, "no court count parsed");
  if (record.price_bands.length === 0) warn(name, "no usable price bands — booking_url/price left empty");

  return record;
}

mkdirSync(PIPELINE, { recursive: true });
const rows = parseCsv(readFileSync(SRC, "utf8")).filter((r) => r.length > 1 && r[0].trim() !== "");
const header = rows[0];
const records = rows.slice(1).map((r) => normalize(r, header));

writeFileSync(resolve(PIPELINE, "normalized.json"), JSON.stringify(records, null, 2));
console.log(`Normalized ${records.length} venues -> data/venues/.pipeline/normalized.json`);
if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
