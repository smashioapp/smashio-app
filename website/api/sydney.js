// Sydney venue hub (gtm-plan.md G11) — the internal-linking page that makes the /venue/:slug
// pages a crawlable network instead of orphans. Groups venue_seo_directory by suburb; only
// venues with a slug + a profile show up there (see 20260831020000_venue_seo_pages.sql), so this
// only ever links to pages that are themselves indexable.
// Club rows (social-plan.md C0) are appended below the venue grid, linking every /club/:slug page
// — indexed or not, since it's still real internal linking for a page that resolves — grouped the
// same way by suburb, with clubs missing a hall bucketed under "No confirmed venue".
const { esc, callRpc, shell, ctaButtons } = require("./_venue-lib");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
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

  const bySuburb = new Map();
  for (const v of venues) {
    const key = v.suburb || "Sydney";
    if (!bySuburb.has(key)) bySuburb.set(key, []);
    bySuburb.get(key).push(v);
  }
  const suburbs = [...bySuburb.keys()].sort();

  const heroContent = `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F; animation:smash-pulse 1.6s ease-in-out infinite"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">${esc(venues.length)} venues tracked</span>
    </div>
    <h1 class="rise rise-2" style="margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(30px,7vw,42px); line-height:1.03; letter-spacing:-.03em">Badminton courts in Sydney</h1>
    <p class="rise rise-3" style="margin:0; max-width:52ch; font-size:14.5px; line-height:1.65; color:#96969E">Every badminton venue Smashio tracks across Sydney, with courts, opening hours and pricing. Pick one to see what's on there — or open the app to see games happening tonight.</p>
    ${ctaButtons()}`;

  const bodyContent =
    venues.length === 0
      ? ""
      : `<div class="rise rise-4" style="display:flex; flex-direction:column; gap:32px; padding-top:8px; border-top:1px solid rgba(255,255,255,.06)">
          ${suburbs
            .map(
              (suburb) => `
            <div>
              <h2 style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:15px; margin:0 0 12px; color:#F5F5F7">${esc(suburb)}</h2>
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px">
                ${bySuburb
                  .get(suburb)
                  .map(
                    (v) => `
                  <a class="venue-card" href="/venue/${esc(v.slug)}">
                    <div style="font-size:13.5px; font-weight:700; color:#F5F5F7">${esc(v.name)}</div>
                    <div style="font-size:12px; color:#7A7A82; margin-top:3px">${v.courts_total ? `${esc(v.courts_total)} courts` : "Court details"}${v.dedicated ? " · Dedicated" : ""}</div>
                  </a>`
                  )
                  .join("")}
              </div>
            </div>`
            )
            .join("")}
        </div>`;

  const clubsBySuburb = new Map();
  for (const c of clubs) {
    const key = c.hall_suburb || "No confirmed venue";
    if (!clubsBySuburb.has(key)) clubsBySuburb.set(key, []);
    clubsBySuburb.get(key).push(c);
  }
  const clubSuburbs = [...clubsBySuburb.keys()].sort((a, b) => (a === "No confirmed venue" ? 1 : b === "No confirmed venue" ? -1 : a.localeCompare(b)));

  const clubsSection =
    clubs.length === 0
      ? ""
      : `<div class="rise rise-4" style="display:flex; flex-direction:column; gap:32px; padding-top:32px; margin-top:32px; border-top:1px solid rgba(255,255,255,.06)">
          <div>
            <h2 style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:19px; margin:0 0 4px; color:#F5F5F7">Sydney badminton clubs</h2>
            <p style="margin:0; font-size:12.5px; color:#7A7A82">Pulled from Badminton NSW's club directory. Run one of these? <a href="mailto:hello@smashio.com.au?subject=Claim%20our%20club%20page">Get in touch</a> to claim your page.</p>
          </div>
          ${clubSuburbs
            .map(
              (suburb) => `
            <div>
              <h3 style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:14px; margin:0 0 12px; color:#F5F5F7">${esc(suburb)}</h3>
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px">
                ${clubsBySuburb
                  .get(suburb)
                  .map((c) => `<a class="venue-card" href="/club/${esc(c.slug)}"><div style="font-size:13.5px; font-weight:700; color:#F5F5F7">${esc(c.name)}</div></a>`)
                  .join("")}
              </div>
            </div>`
            )
            .join("")}
        </div>`;

  return res.status(200).send(shell({
    title: "Badminton Courts in Sydney | Smashio",
    description: `${venues.length} badminton venues across Sydney with courts, opening hours and pricing — find where to play and see games happening there on Smashio.`,
    canonicalUrl: "https://smashio.com.au/sydney",
    indexable: true,
    heroContent,
    bodyContent: bodyContent + clubsSection,
  }));
};
