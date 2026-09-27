// website-plan.md W7 support endpoint. Turns a browser-supplied lat/lng into one of our tracked
// suburbs, server-side, so the near-me page never ships an API key or a third party's rate limits
// to the client. Uses OpenStreetMap's Nominatim (no key needed) rather than inventing a hardcoded
// suburb-centroid table — guessing coordinates for ~30 suburbs by hand risks being quietly wrong
// in a way nobody would notice; a real reverse-geocode does not. Nominatim's usage policy wants a
// descriptive User-Agent and roughly one request per second — the crude in-memory bucket below is
// enough for a single serverless instance under real (low, click-triggered) traffic; it resets on
// cold start, which is fine, it only needs to smooth bursts, not enforce a hard cap.
const { callRpc } = require("./_venue-lib");

let lastCallAt = 0;
const cache = new Map();
const ALLOWED_ORIGINS = new Set(["https://smashio.com.au", "https://www.smashio.com.au"]);

function slugify(suburb) {
  return String(suburb).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ slug: null });
  }

  // Same-site only (L7): this is a helper for our own near-me page, not an open Nominatim proxy.
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ slug: null });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  // Rounded to ~1 km: we only need the suburb, and it makes identical lookups cacheable.
  const lat = Math.round(Number(body.lat) * 100) / 100;
  const lng = Math.round(Number(body.lng) * 100) / 100;
  // Tracked suburbs are all in Australia; anything else can't match, so don't spend a lookup on it.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -44 || lat > -10 || lng < 112 || lng > 154) {
    return res.status(400).json({ slug: null });
  }

  const cacheKey = `${lat},${lng}`;
  if (cache.has(cacheKey)) return res.status(200).json({ slug: cache.get(cacheKey) });

  const sinceLastCall = Date.now() - lastCallAt;
  if (sinceLastCall < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - sinceLastCall));
  }
  lastCallAt = Date.now();

  let suburbGuess = null;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      { headers: { "User-Agent": "SmashioWebsite/1.0 (hello@smashio.com.au)" } }
    );
    if (r.ok) {
      const data = await r.json();
      const addr = data && data.address ? data.address : {};
      suburbGuess = addr.suburb || addr.city_district || addr.neighbourhood || addr.town || addr.city || null;
    }
  } catch {
    // Nominatim unreachable — fall through, the client shows the manual list.
  }

  if (!suburbGuess) {
    cache.set(cacheKey, null);
    return res.status(200).json({ slug: null });
  }

  let venues = [];
  try {
    venues = await callRpc("venue_seo_directory", {});
  } catch {
    venues = [];
  }
  const tracked = [...new Set(venues.map((v) => v.suburb).filter(Boolean))];
  const match = tracked.find((s) => s.toLowerCase() === String(suburbGuess).toLowerCase());

  const slug = match ? slugify(match) : null;
  if (cache.size > 5000) cache.clear();
  cache.set(cacheKey, slug);
  return res.status(200).json({ slug });
};
