// Dynamic sitemap (gtm-plan.md G11) — replaces the static 5-url sitemap.xml with one that
// includes every indexable venue page plus the /sydney hub. Rewritten from /sitemap.xml so the
// URL crawlers already know about keeps working. Club pages (social-plan.md C0) joined in the same
// way — only club_seo_directory rows with indexable=true, same thin-page rule as venues.
const { callRpc } = require("./_venue-lib");

const STATIC_URLS = [
  { loc: "https://smashio.com.au/", changefreq: "weekly", priority: "1.0" },
  { loc: "https://smashio.com.au/sydney", changefreq: "weekly", priority: "0.9" },
  { loc: "https://smashio.com.au/badminton-near-me", changefreq: "weekly", priority: "0.7" },
  { loc: "https://smashio.com.au/support.html", changefreq: "monthly", priority: "0.5" },
  { loc: "https://smashio.com.au/terms.html", changefreq: "monthly", priority: "0.3" },
  { loc: "https://smashio.com.au/privacy.html", changefreq: "monthly", priority: "0.3" },
  { loc: "https://smashio.com.au/delete-account.html", changefreq: "monthly", priority: "0.3" },
];

const GUIDE_SLUGS = ["cost-of-badminton-in-sydney", "beginners-guide-to-badminton", "where-to-play-indoor-badminton-sydney"];

function slugifySuburb(suburb) {
  return String(suburb).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function xmlEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");

  let venues = [];
  try {
    venues = await callRpc("venue_seo_directory", {});
  } catch {
    venues = [];
  }

  let clubs = [];
  try {
    clubs = await callRpc("club_seo_directory", {});
  } catch {
    clubs = [];
  }

  const venueUrls = venues.map((v) => ({
    loc: `https://smashio.com.au/venue/${v.slug}`,
    changefreq: "weekly",
    priority: "0.7",
  }));

  const clubUrls = clubs
    .filter((c) => c.indexable)
    .map((c) => ({
      loc: `https://smashio.com.au/club/${c.slug}`,
      changefreq: "monthly",
      priority: "0.5",
    }));

  // DEC6 threshold, venue-count half only (2+ tracked venues) — the live-games half of the page's
  // own indexable check is deliberately left out here so the sitemap doesn't churn as game counts
  // change hour to hour. A suburb below this bar can still rank on its own if a game pushes it
  // over the threshold at request time; it just isn't submitted to crawlers proactively.
  const bySuburb = new Map();
  for (const v of venues) {
    if (!v.suburb) continue;
    bySuburb.set(v.suburb, (bySuburb.get(v.suburb) || 0) + 1);
  }
  const suburbUrls = [...bySuburb.entries()]
    .filter(([, count]) => count >= 2)
    .map(([suburb]) => ({
      loc: `https://smashio.com.au/sydney/${slugifySuburb(suburb)}`,
      changefreq: "daily",
      priority: "0.7",
    }));

  const guideUrls = GUIDE_SLUGS.map((slug) => ({
    loc: `https://smashio.com.au/guides/${slug}`,
    changefreq: "monthly",
    priority: "0.6",
  }));

  const urls = [...STATIC_URLS, ...venueUrls, ...clubUrls, ...suburbUrls, ...guideUrls]
    .map((u) => `  <url>\n    <loc>${xmlEsc(u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n");

  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
};
