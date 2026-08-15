// venues-plan.md §3 — turn raw sweep hits into a triaged lead list for manual enrichment.
//
// Classification is deliberately conservative: this script only sorts leads into buckets and
// never asserts a venue HAS badminton courts. Only the manual pass (operator site / phone)
// promotes a lead to confidence 'medium'/'high' per §3's verification rule.
//
// Usage: node scripts/venues/triage.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = resolve(ROOT, "data/venues");

// Retail/stringing businesses match "badminton" strongly but have no courts. They are still
// worth keeping — they populate the `stringing` / `pro_shop` amenity story in venues-plan.md
// §4.3 — so they go to their own bucket rather than the bin.
const SERVICE_ONLY = /stringing|restring|racquet restringing|pro racquet|decathlon|\bstore\b/i;

// Sports that share "indoor sports centre" phrasing but are not badminton suppliers.
const OTHER_SPORT = /tennis|squash|basketball|bowling|amusement|golf|cricket|netball only|soccer|futsal centre/i;

// Licensed clubs / pubs: "Sports Club" in NSW usually means a bar with poker machines.
const LICENSED_CLUB = /sports club|bowling club|rsl|leagues club/i;

// Operator families worth grouping — §3 axis 2. Matching the chain lets one operator
// conversation cover many venues.
const CHAINS = [
  [/^NBC\b|National Badminton Centre/i, "NBC"],
  [/BadmintonWorx/i, "BadmintonWorx"],
  [/^Alpha\b/i, "Alpha Badminton"],
  [/The Badminton Club/i, "The Badminton Club"],
  [/PCYC/i, "PCYC NSW"],
  [/\bThe Y\b|YMCA/i, "YMCA NSW"],
  [/PlayPoint/i, "PlayPoint"],
  [/Sydney Sports Club/i, "Sydney Sports Club"],
  [/UNSW|Sydney Uni|Macquarie|UTS|Western Sydney Uni/i, "University"],
  [/Leisure Centre|Recreation Centre|Community Centre|Youth Centre|Aquatic/i, "Council / leisure"],
];

function chainOf(name) {
  for (const [re, label] of CHAINS) if (re.test(name)) return label;
  return null;
}

function bucketOf(r) {
  const named = /badminton/i.test(r.name);
  if (SERVICE_ONLY.test(r.name)) return "service"; // stringing / retail, no courts
  if (named) return "dedicated"; // name asserts badminton — highest prior
  if (LICENSED_CLUB.test(r.name) && !/sports complex|indoor/i.test(r.name)) return "unlikely";
  if (OTHER_SPORT.test(r.name)) return "unlikely";
  return "multi"; // multi-purpose venue that surfaced on a badminton query — needs checking
}

// Text Search treats `location`+`radius` as a bias, not a filter, so edge cells pull in results
// from Newcastle and the Central Coast. Re-apply the bbox to the returned coordinates.
const BBOX = { latMin: -34.15, latMax: -33.55, lngMin: 150.65, lngMax: 151.35 };
const inSydney = (r) =>
  r.lat >= BBOX.latMin && r.lat <= BBOX.latMax && r.lng >= BBOX.lngMin && r.lng <= BBOX.lngMax;

// Venue names the Badminton NSW club directory says host badminton (clubs-badminton-nsw.json).
// A corroborating second source outranks a raw Places hit, so these get promoted.
const CLUB_CORROBORATED = [
  /morris iemma/i, /taren point/i, /ryde aquatic/i, /north ryde rsl/i, /hills start/i,
  /curl curl/i, /avalon rec/i, /macquarie fields/i, /brickpit/i, /north sydney indoor/i,
  /victor badminton/i, /musac|macquarie university sport/i, /pcyc northern beaches/i,
];

function load(pass) {
  const p = resolve(DATA, `places-sweep-pass${pass}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).rows : [];
}

// Enrichment is manual and slow (§3), so the lead list has to be ordered by expected yield,
// not just bucketed. P4 is parked, not discarded — a later signal can promote it.
function priorityOf(r) {
  if (r.bucket === "dedicated") return "P1";
  if (r.bucket === "service") return "P3";
  if (r.bucket === "unlikely") return "P4";
  if (CLUB_CORROBORATED.some((re) => re.test(r.name))) return "P1";
  if (r.badmintonQueryHit) return "P2";
  return "P4";
}

const byId = new Map();
for (const pass of [1, 2]) {
  for (const r of load(pass)) {
    const prev = byId.get(r.placeId);
    if (prev) {
      prev.passes.push(pass);
      prev.matchedQueries = [...new Set([...prev.matchedQueries, ...r.matchedQueries])];
      continue;
    }
    byId.set(r.placeId, { ...r, passes: [pass] });
  }
}

const all = [...byId.values()].map((r) => ({
  ...r,
  bucket: bucketOf(r),
  chain: chainOf(r.name),
  // Pass 1 is the "badminton" query — a hit there is a much stronger signal than a pass-2 hit.
  badmintonQueryHit: r.passes.includes(1),
}));

const outOfArea = all.filter((r) => !inSydney(r));
const rows = all.filter(inSydney).map((r) => ({ ...r, priority: priorityOf(r) }));

const order = { dedicated: 0, multi: 1, service: 2, unlikely: 3 };
rows.sort(
  (a, b) =>
    a.priority.localeCompare(b.priority) ||
    order[a.bucket] - order[b.bucket] ||
    (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0)
);

const counts = rows.reduce((acc, r) => ((acc[r.bucket] = (acc[r.bucket] ?? 0) + 1), acc), {});
const prio = rows.reduce((acc, r) => ((acc[r.priority] = (acc[r.priority] ?? 0) + 1), acc), {});
console.log("buckets:", counts, "| in-area total", rows.length, "| dropped out-of-area", outOfArea.length);
console.log("priority:", prio, "-> P1+P2 is the manual enrichment queue");

const chains = rows
  .filter((r) => r.chain && r.bucket !== "unlikely")
  .reduce((acc, r) => ((acc[r.chain] = (acc[r.chain] ?? 0) + 1), acc), {});
console.log("chains:", chains);

writeFileSync(resolve(DATA, "leads.json"), JSON.stringify({ counts, rows }, null, 2));

// CSV for the manual enrichment pass — the columns a researcher fills in per §3's checklist.
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const header = [
  "priority", "bucket", "chain", "name", "address", "lat", "lng", "place_id", "ratings", "badminton_query_hit",
  "has_badminton_courts", "courts_badminton", "courts_total", "dedicated", "surface",
  "booking_url", "website", "phone", "opening_hours", "price_notes", "source_url", "verified_on", "notes",
].join(",");
const lines = rows.map((r) =>
  [r.priority, r.bucket, r.chain ?? "", r.name, r.address, r.lat, r.lng, r.placeId, r.userRatingsTotal, r.badmintonQueryHit,
    "", "", "", "", "", "", "", "", "", "", "", "", ""].map(esc).join(",")
);
writeFileSync(resolve(DATA, "leads-to-enrich.csv"), [header, ...lines].join("\n"));
console.log(`-> ${resolve(DATA, "leads.json")}\n-> ${resolve(DATA, "leads-to-enrich.csv")}`);
