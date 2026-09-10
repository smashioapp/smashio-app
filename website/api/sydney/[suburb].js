// website-plan.md W6 — suburb-level pages, generated from the distinct suburbs already in
// venue_seo_directory rather than a new RPC (games_seo_feed already takes p_suburb, shipped in
// W2). Fixes D7: search intent sits at suburb level ("badminton Chatswood"), and until this the
// site only had one city-wide hub.
//
// Thin-page rule (DEC6, recommended threshold): a suburb needs 2+ tracked venues OR 1+ live game
// this week to index, same bar the venue/club pages already hold. Below that it still renders (a
// suburb with one venue is still a real page for that venue's visitors) but stays noindex.
const { esc, callRpc, shell, ctaButtons } = require("../_venue-lib");

function slugify(suburb) {
  return String(suburb).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function notFoundHero() {
  return `
    <img src="/assets/smashio-mark.svg" alt="" class="rise rise-1" style="width:48px; height:48px; object-fit:contain" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(26px,7vw,34px); line-height:1.1; letter-spacing:-.03em">Suburb not found</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">We don't track that suburb yet. Browse every badminton venue Smashio tracks in Sydney instead.</p>
    <a class="rise rise-3" href="/sydney" style="font-size:13.5px; font-weight:700">Browse all Sydney venues →</a>
    ${ctaButtons()}`;
}

module.exports = async function handler(req, res) {
  const slug = (req.query && req.query.suburb) || "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=900, s-maxage=900, stale-while-revalidate=86400");

  let allVenues = [];
  try {
    allVenues = await callRpc("venue_seo_directory", {});
  } catch {
    allVenues = [];
  }

  const suburbs = [...new Set(allVenues.map((v) => v.suburb).filter(Boolean))].sort();
  const suburb = suburbs.find((s) => slugify(s) === slug);

  if (!suburb) {
    return res.status(404).send(shell({
      title: "Smashio - Suburb not found",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  const venues = allVenues.filter((v) => v.suburb === suburb);

  let games = [];
  try {
    games = await callRpc("games_seo_feed", { p_suburb: suburb, p_limit: 12 });
  } catch {
    games = [];
  }

  const canonicalUrl = `https://smashio.com.au/sydney/${slugify(suburb)}`;
  const indexable = venues.length >= 2 || games.length >= 1;

  const generatedAt = new Date();
  const timeFmt = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
  const dayFmt = new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "Australia/Sydney" });

  const gamesSection =
    games.length === 0
      ? `<div class="rise rise-4" style="padding-top:8px; border-top:1px solid rgba(255,255,255,.06)">
          <h2 style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:19px; margin:0 0 6px; color:#F5F5F7">Games this week in ${esc(suburb)}</h2>
          <p style="margin:0; font-size:13px; color:#7A7A82">Nothing open right now &mdash; open the app to host one and it'll show up here.</p>
        </div>`
      : `<div class="rise rise-4" style="display:flex; flex-direction:column; gap:14px; padding-top:8px; border-top:1px solid rgba(255,255,255,.06)">
          <div>
            <h2 style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:19px; margin:0 0 4px; color:#F5F5F7">Games this week in ${esc(suburb)}</h2>
            <p style="margin:0; font-size:11.5px; color:#5C5C64">Checked ${esc(timeFmt.format(generatedAt))} &middot; live from the app</p>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:10px">
            ${games
              .map((g) => {
                const cost = g.cost_per_player_cents != null ? `$${(g.cost_per_player_cents / 100).toFixed(0)}/player` : "";
                const spots = g.open_spots === 1 ? "1 spot left" : `${g.open_spots} spots left`;
                const href = g.venue_slug ? `/venue/${esc(g.venue_slug)}` : `/sydney/${esc(slugify(suburb))}`;
                return `
                <a class="venue-card" href="${href}">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px">
                    <span style="font-size:13.5px; font-weight:700; color:#F5F5F7">${esc(g.venue_name)}</span>
                    <span style="font-size:11px; font-weight:800; color:${g.open_spots > 0 ? "#D6FF3F" : "#7A7A82"}">${esc(spots)}</span>
                  </div>
                  <div style="font-size:12px; color:#7A7A82; margin-top:3px">${esc(dayFmt.format(new Date(g.starts_at)))} ${esc(timeFmt.format(new Date(g.starts_at)))}</div>
                  <div style="font-size:11.5px; color:#5C5C64; margin-top:5px">${esc(g.skill_tier_label || "")}${g.skill_tier_label && cost ? " · " : ""}${esc(cost)}</div>
                </a>`;
              })
              .join("")}
          </div>
        </div>`;

  const venuesSection =
    venues.length === 0
      ? ""
      : `<div class="rise rise-4" style="display:flex; flex-direction:column; gap:12px; padding-top:32px; margin-top:32px; border-top:1px solid rgba(255,255,255,.06)">
          <h2 style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15px; margin:0; color:#F5F5F7">Venues in ${esc(suburb)}</h2>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px">
            ${venues
              .map(
                (v) => `
              <a class="venue-card" href="/venue/${esc(v.slug)}">
                <div style="font-size:13.5px; font-weight:700; color:#F5F5F7">${esc(v.name)}</div>
                <div style="font-size:12px; color:#7A7A82; margin-top:3px">${v.courts_total ? `${esc(v.courts_total)} courts` : "Court details"}${v.dedicated ? " · Dedicated" : ""}</div>
              </a>`
              )
              .join("")}
          </div>
        </div>`;

  const otherSuburbs = suburbs.filter((s) => s !== suburb);
  const neighboursSection =
    otherSuburbs.length === 0
      ? ""
      : `<div class="rise rise-4" style="display:flex; flex-direction:column; gap:12px; padding-top:32px; margin-top:32px; border-top:1px solid rgba(255,255,255,.06)">
          <h2 style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15px; margin:0; color:#F5F5F7">Other Sydney suburbs</h2>
          <div style="display:flex; flex-wrap:wrap; gap:8px">
            ${otherSuburbs.map((s) => `<a class="chip" href="/sydney/${esc(slugify(s))}">${esc(s)}</a>`).join("")}
          </div>
        </div>`;

  const breadcrumb = `
    <nav class="rise rise-1" aria-label="Breadcrumb" style="font-size:12px; color:#7A7A82">
      <a href="/sydney" style="color:#7A7A82; text-decoration:underline">All Sydney venues</a>
      <span style="margin:0 6px">/</span>
      <span style="color:#96969E">${esc(suburb)}</span>
    </nav>`;

  const heroContent = `
    ${breadcrumb}
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F; animation:smash-pulse 1.6s ease-in-out infinite"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">${esc(venues.length)} venue${venues.length === 1 ? "" : "s"} tracked</span>
    </div>
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(30px,7vw,42px); line-height:1.03; letter-spacing:-.03em">Badminton in ${esc(suburb)}</h1>
    <p class="rise rise-3" style="margin:0; max-width:52ch; font-size:14.5px; line-height:1.65; color:#96969E">Every badminton venue Smashio tracks in ${esc(suburb)}, plus games happening there this week. Open the app to join one or host your own.</p>
    ${ctaButtons()}`;

  return res.status(200).send(shell({
    title: `Badminton in ${suburb}, Sydney | Smashio`,
    description: `${venues.length} badminton venue${venues.length === 1 ? "" : "s"} in ${suburb}, Sydney, with courts and pricing${games.length > 0 ? `, and ${games.length} game${games.length === 1 ? "" : "s"} on this week` : ""}. Find where to play on Smashio.`,
    canonicalUrl,
    indexable,
    heroContent,
    bodyContent: gamesSection + venuesSection + neighboursSection,
    captureSuburb: suburb,
  }));
};
