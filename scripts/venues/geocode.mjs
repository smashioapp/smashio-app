// venues-plan.md §6 — resolve place_id + lat/lng per normalized record. §2's legal rule: Places
// is a resolver, not a source — cache place_id indefinitely, don't cache other Places content.
//
// Checks the A0 sweep's already-paid-for results first (data/venues/leads-to-enrich.csv +
// leads.json — every CSV venue turns out to already be in that 332-venue queue), and only calls
// the live Text Search API for a name it can't find there. Falls back to a local
// .geocode-cache.json (place_id only) across runs so a repeat run never re-spends on a resolved name.
//
// Usage: node scripts/venues/geocode.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = resolve(ROOT, "data/venues");
const PIPELINE = resolve(DATA, ".pipeline");
const CACHE_PATH = resolve(DATA, ".geocode-cache.json");

function readApiKey() {
  const envPath = resolve(ROOT, "ui/.env");
  if (!existsSync(envPath)) throw new Error("ui/.env missing — can't read EXPO_PUBLIC_GOOGLE_MAPS_API_KEY");
  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.startsWith("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="));
  const key = line?.split("=")[1]?.trim();
  if (!key) throw new Error("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY missing from ui/.env");
  return key;
}

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
      } else field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeNameForMatch(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Loose containment match, not exact — "Five Dock Leisure Centre (FDLC)" (CSV) vs
// "Five Dock Leisure Centre" (sweep queue) shouldn't need identical strings.
function loadSweepQueue() {
  const leadsPath = resolve(DATA, "leads-to-enrich.csv");
  if (!existsSync(leadsPath)) return [];
  const rows = parseCsv(readFileSync(leadsPath, "utf8"));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return rows.slice(1).map((r) => ({
    name: r[idx.name],
    address: r[idx.address],
    lat: parseFloat(r[idx.lat]),
    lng: parseFloat(r[idx.lng]),
    place_id: r[idx.place_id] || null,
  }));
}

function findInSweepQueue(queue, name) {
  const norm = normalizeNameForMatch(name);
  const tokens = norm.split(" ").filter((t) => t.length > 2);
  let best = null;
  let bestScore = 0;
  for (const lead of queue) {
    if (!lead.place_id) continue;
    const leadNorm = normalizeNameForMatch(lead.name);
    const leadTokens = new Set(leadNorm.split(" ").filter((t) => t.length > 2));
    const overlap = tokens.filter((t) => leadTokens.has(t)).length;
    const score = overlap / Math.max(tokens.length, 1);
    if (score > bestScore) {
      bestScore = score;
      best = lead;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

// Legacy Text Search endpoint, matching places-sweep.mjs exactly — the key is restricted to the
// iOS bundle (com.smashio.app), and the newer places.googleapis.com/v1 endpoint's
// X-Goog-Api-Key header doesn't satisfy that restriction the way X-Ios-Bundle-Identifier does.
async function textSearch(apiKey, query) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&region=au&key=${apiKey}`;
  const res = await fetch(url, { headers: { "X-Ios-Bundle-Identifier": "com.smashio.app" } });
  const json = await res.json();
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(`Places textsearch ${json.status}: ${json.error_message ?? "(no message)"}`);
  }
  const top = json.results?.[0];
  if (!top) return null;
  return { id: top.place_id, location: { latitude: top.geometry.location.lat, longitude: top.geometry.location.lng }, formattedAddress: top.formatted_address };
}

async function run() {
  const records = JSON.parse(readFileSync(resolve(PIPELINE, "normalized.json"), "utf8"));
  const sweepQueue = loadSweepQueue();
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {};

  let fromSweep = 0;
  let fromCache = 0;
  let fromLiveApi = 0;
  let unresolved = 0;
  const apiKeyNeeded = records.some((r) => !cache[r.name] && !findInSweepQueue(sweepQueue, r.name));
  const apiKey = apiKeyNeeded ? readApiKey() : null;

  const geocoded = [];
  for (const record of records) {
    const sweepMatch = findInSweepQueue(sweepQueue, record.name);
    if (sweepMatch) {
      fromSweep++;
      geocoded.push({ ...record, place_id: sweepMatch.place_id, lat: sweepMatch.lat, lng: sweepMatch.lng, resolved_address: sweepMatch.address });
      continue;
    }
    if (cache[record.name]) {
      fromCache++;
      geocoded.push({ ...record, ...cache[record.name] });
      continue;
    }
    const query = `${record.name}, ${record.address || `${record.suburb}, ${record.state}`}`;
    console.log(`Live geocode (not in sweep queue or cache): ${query}`);
    const place = await textSearch(apiKey, query);
    if (!place) {
      unresolved++;
      console.log(`  UNRESOLVED: ${record.name}`);
      geocoded.push({ ...record, place_id: null, lat: null, lng: null, resolved_address: null });
      continue;
    }
    fromLiveApi++;
    const resolved = {
      place_id: place.id,
      lat: place.location.latitude,
      lng: place.location.longitude,
      resolved_address: place.formattedAddress,
    };
    cache[record.name] = resolved;
    geocoded.push({ ...record, ...resolved });
  }

  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  writeFileSync(resolve(PIPELINE, "geocoded.json"), JSON.stringify(geocoded, null, 2));
  console.log(
    `\nGeocoded ${geocoded.length}: ${fromSweep} reused from sweep queue (free), ${fromCache} from local cache, ${fromLiveApi} live API calls, ${unresolved} unresolved.`
  );
  if (unresolved > 0) console.log("Unresolved records need a manual place_id before match.mjs can run cleanly.");
}

run();
