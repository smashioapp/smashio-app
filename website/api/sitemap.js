// Dynamic sitemap (gtm-plan.md G11) — replaces the static 5-url sitemap.xml with one that
// includes every indexable venue page plus the /sydney hub. Rewritten from /sitemap.xml so the
// URL crawlers already know about keeps working. Club pages (social-plan.md C0) joined in the same
// way — only club_seo_directory rows with indexable=true, same thin-page rule as venues.
const { callRpc } = require("./_venue-lib");

const STATIC_URLS = [
  { loc: "https://smashio.com.au/", changefreq: "weekly", priority: "1.0" },
  { loc: "https://smashio.com.au/sydney", changefreq: "weekly", priority: "0.9" },
  { loc: "https://smashio.com.au/support.html", changefreq: "monthly", priority: "0.5" },
  { loc: "https://smashio.com.au/terms.html", changefreq: "monthly", priority: "0.3" },
  { loc: "https://smashio.com.au/privacy.html", changefreq: "monthly", priority: "0.3" },
  { loc: "https://smashio.com.au/delete-account.html", changefreq: "monthly", priority: "0.3" },
];

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

  const urls = [...STATIC_URLS, ...venueUrls, ...clubUrls]
    .map((u) => `  <url>\n    <loc>${xmlEsc(u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n");

  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
};
