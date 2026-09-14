// The Map moment (home-redesign-plan.md §3.3, H6): a single brand-styled dark static map of
// Sydney with a pin for every tracked venue. Proxied through our own function rather than pointing
// an <img> straight at Google so GOOGLE_MAPS_STATIC_API_KEY never appears in page source (the key
// is HTTP-referrer restricted to smashio.com.au, but there's no reason to hand it out when a
// same-origin proxy is free) and so the rendered tile is cached at the edge instead of re-billed
// per pageview — venue locations change rarely, per §5's cost-check note.
const { callRpc } = require("./_venue-lib");

// Same cloud-styled dark Map ID the app's Discover map uses (docs/map-plan.md), so the web tile
// and the in-app map read as the same product.
const MAP_ID = "65180cd85350fca689a8eb06";

module.exports = async function handler(req, res) {
  const apiKey = process.env.GOOGLE_MAPS_STATIC_API_KEY;
  if (!apiKey) {
    res.status(404).end();
    return;
  }

  let venues = [];
  try {
    venues = await callRpc("venue_seo_directory", {});
  } catch {
    venues = [];
  }

  const points = venues.filter((v) => typeof v.lat === "number" && typeof v.lng === "number").map((v) => `${v.lat},${v.lng}`);

  if (points.length === 0) {
    res.status(404).end();
    return;
  }

  const params = new URLSearchParams({
    size: "1280x480",
    scale: "1",
    map_id: MAP_ID,
    key: apiKey,
  });
  // One markers param, tiny lime pins, no label — Static Maps auto-fits center/zoom to the points
  // given, so there's no Sydney-specific center/zoom to hand-tune or for a new suburb to outgrow.
  params.append("markers", `size:tiny|color:0xD6FF3F|${points.join("|")}`);

  const upstream = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`);
  if (!upstream.ok) {
    res.status(502).end();
    return;
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000");
  res.status(200).send(buf);
};
