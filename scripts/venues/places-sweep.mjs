// venues-plan.md §3 axis 1 — Places discovery sweep over a Greater Sydney grid.
//
// ToS note (venues-plan.md §2): this is a DISCOVERY tool. The only fields we are
// permitted to keep indefinitely are place_id and coordinates. Names/addresses in the
// output file are a transient research aid for the manual enrichment pass and must not
// become the app's stored venue data — that comes from operators (§3).
//
// Usage: node scripts/venues/places-sweep.mjs [--pass=1|2] [--dry]
//   pass 1 — "badminton" queries, high precision, finds dedicated centres + clubs
//   pass 2 — generic multi-purpose venue queries, low precision, needs manual triage
//
// Key is the iOS-bundle-restricted EXPO_PUBLIC_GOOGLE_MAPS_API_KEY from ui/.env, so the
// bundle header must be sent exactly as ui/lib/places.ts does.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "data/venues");

function loadKey() {
  const envPath = resolve(ROOT, "ui/.env");
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="));
  const key = line?.split("=")[1]?.trim();
  if (!key) throw new Error("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY missing from ui/.env");
  return key;
}

// Greater Sydney bounding box: Palm Beach/Hornsby in the north down to Campbelltown/
// Sutherland in the south, coast to Penrith/Camden in the west.
const BBOX = { latMin: -34.15, latMax: -33.55, lngMin: 150.65, lngMax: 151.35 };

// ~10 km cells with an 8 km search radius, so adjacent cells overlap and nothing falls
// between them. 1 deg lat ~= 111 km; 1 deg lng ~= 92.5 km at -34.
const CELL_LAT = 0.09;
const CELL_LNG = 0.108;
const RADIUS_M = 8000;

const PASS_1_QUERIES = ["badminton"];
const PASS_2_QUERIES = ["leisure centre", "recreation centre", "sports stadium", "PCYC", "indoor sports centre"];
// Pass 2's queries are far less precise, so run them on a coarser grid to control cost.
const PASS_2_STRIDE = 2;

function grid(stride = 1) {
  const cells = [];
  let i = 0;
  for (let lat = BBOX.latMin; lat <= BBOX.latMax; lat += CELL_LAT, i++) {
    let j = 0;
    for (let lng = BBOX.lngMin; lng <= BBOX.lngMax; lng += CELL_LNG, j++) {
      if (i % stride === 0 && j % stride === 0) cells.push({ lat: +lat.toFixed(4), lng: +lng.toFixed(4) });
    }
  }
  return cells;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let requestCount = 0;

async function textSearch(key, query, cell, pageToken) {
  const params = pageToken
    ? `pagetoken=${pageToken}`
    : `query=${encodeURIComponent(query)}&location=${cell.lat},${cell.lng}&radius=${RADIUS_M}&region=au`;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}&key=${key}`;
  const res = await fetch(url, { headers: { "X-Ios-Bundle-Identifier": "com.smashio.app" } });
  requestCount++;
  const json = await res.json();
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(`Places textsearch ${json.status}: ${json.error_message ?? "(no message)"}`);
  }
  return json;
}

// A next_page_token is not valid the instant it is issued and Google documents no fixed
// delay, so a fixed sleep loses the race on some cells. Back off and retry; give up on the
// page rather than the whole sweep — one missing third page is not worth restarting 50 cells.
async function pagedSearch(key, query, cell, token) {
  for (const wait of [2000, 3000, 5000]) {
    await sleep(wait);
    try {
      return await textSearch(key, query, cell, token);
    } catch (e) {
      if (!e.message.includes("INVALID_REQUEST")) throw e;
    }
  }
  return null;
}

async function run() {
  const pass = process.argv.includes("--pass=2") ? 2 : 1;
  const dry = process.argv.includes("--dry");
  const queries = pass === 1 ? PASS_1_QUERIES : PASS_2_QUERIES;
  const cells = grid(pass === 1 ? 1 : PASS_2_STRIDE);

  console.log(`pass ${pass}: ${queries.length} quer(ies) x ${cells.length} cells = ${queries.length * cells.length} seed requests (+ pagination)`);
  if (dry) return;

  const key = loadKey();
  const byPlaceId = new Map();

  for (const query of queries) {
    for (const cell of cells) {
      let token = null;
      for (let page = 0; page < 3; page++) {
        const json = page === 0 ? await textSearch(key, query, cell, null) : await pagedSearch(key, query, cell, token);
        if (!json) break;
        for (const r of json.results ?? []) {
          const existing = byPlaceId.get(r.place_id);
          if (existing) {
            existing.matchedQueries.add(query);
            continue;
          }
          byPlaceId.set(r.place_id, {
            placeId: r.place_id,
            name: r.name,
            address: r.formatted_address,
            lat: r.geometry?.location?.lat,
            lng: r.geometry?.location?.lng,
            types: r.types ?? [],
            businessStatus: r.business_status ?? null,
            userRatingsTotal: r.user_ratings_total ?? 0,
            matchedQueries: new Set([query]),
          });
        }
        token = json.next_page_token ?? null;
        if (!token) break;
      }
      process.stdout.write(".");
    }
    process.stdout.write("\n");
  }

  const rows = [...byPlaceId.values()]
    .map((r) => ({ ...r, matchedQueries: [...r.matchedQueries] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const out = resolve(OUT_DIR, `places-sweep-pass${pass}.json`);
  writeFileSync(out, JSON.stringify({ pass, bbox: BBOX, cells: cells.length, requests: requestCount, rows }, null, 2));
  console.log(`\n${rows.length} unique places, ${requestCount} requests -> ${out}`);
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
