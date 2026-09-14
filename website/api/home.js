// Home page, server-rendered (home-redesign-plan.md H2 + H4). Was a static index.html that
// fetched /api/home-feed client-side for a 3-row hero sidebar — that meant the site's single
// differentiating asset (real live game data) was invisible to Google and flashed empty on first
// paint. This renders the same data server-side into a full "Board" section (§3.2): every game in
// the next 14 days, grouped by Sydney day, every row linking to /game/:id, with a freshness
// stamp and client-side filter chips over data already in the HTML (no extra requests).
//
// Not routed through _venue-lib's shell() — that layout is a narrow centred hero built for
// venue/club/suburb pages, and forcing this page's wide two-column hero and custom sections
// (steps, stats, phone rail, install card) into it is the H3 design-pass/H5 hero-rebuild scope,
// not H2. What *is* shared here: esc/callRpc/escapeJsonLd/captureFormScript/analyticsScripts,
// removing the duplicate inline PostHog snippet and duplicate form-wiring script index.html used
// to carry (closes part of D10; the header/footer markup itself still needs the H3 pass).
//
// Replaces website/index.html (deleted) — see website/vercel.json's "/" rewrite to this function.
const { esc, callRpc, escapeJsonLd, captureFormScript, analyticsScripts } = require("./_venue-lib");

const TESTFLIGHT_URL = "https://testflight.apple.com/join/cJMZQmbn";
const SYD = "Australia/Sydney";

// The Map moment's tile (home-redesign-plan.md §3.3, H6) lives behind /api/map-tile via a
// vercel.json rewrite to /api/home?map=1, rather than its own function file — the Hobby plan caps
// deployments at 12 serverless functions and this project was already at that ceiling. Proxying
// through here (instead of pointing an <img> straight at Google) also keeps
// GOOGLE_MAPS_STATIC_API_KEY out of page source and lets the tile be edge-cached instead of
// re-billed per pageview — venue locations change rarely, per website-plan.md §5's cost-check note.
const MAP_ID = "65180cd85350fca689a8eb06"; // same cloud-styled dark Map ID the app's Discover map uses (docs/map-plan.md)

async function serveMapTile(res) {
  const apiKey = process.env.GOOGLE_MAPS_STATIC_API_KEY;
  if (!apiKey) return res.status(404).end();

  let venues = [];
  try {
    venues = await callRpc("venue_seo_directory", {});
  } catch {
    venues = [];
  }

  const points = venues.filter((v) => typeof v.lat === "number" && typeof v.lng === "number").map((v) => `${v.lat},${v.lng}`);
  if (points.length === 0) return res.status(404).end();

  const params = new URLSearchParams({ size: "1280x480", scale: "1", map_id: MAP_ID, key: apiKey });
  // One markers param, tiny lime pins, no label — Static Maps auto-fits center/zoom to the points
  // given, so there's no Sydney-specific center/zoom to hand-tune or for a new suburb to outgrow.
  params.append("markers", `size:tiny|color:0xD6FF3F|${points.join("|")}`);

  const upstream = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`);
  if (!upstream.ok) return res.status(502).end();

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000");
  res.status(200).send(buf);
}

function slugify(suburb) {
  return String(suburb).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const FAQ = [
  { q: "Is Smashio free?", a: "Yes, the app's free. You only pay the venue's own court fee, which the host sets per player when they list the game." },
  { q: "Do I need a partner to join?", a: "No. Most games on the board are open to solo players, that's the whole point, you turn up and get matched in." },
  { q: "What skill level should I pick?", a: "Be honest rather than modest. Beginner, intermediate, advanced and pro are sorted by how the game actually plays, not by ego, and everyone has a better time when the tier's right." },
  { q: "Do I need to book the court myself?", a: "No. The host has already sorted the court, you just show up at the time listed." },
  { q: "Which suburbs does Smashio cover?", a: "Sydney-wide so far, private beta. Check the board above or browse every venue we track below." },
  { q: "Is there an Android app yet?", a: "Android's on Play internal testing, invite only while we grow the allowlist. Leave your email below and we'll add you." },
  { q: "What happens if I don't show up?", a: "Hosts can mark no-shows, and it affects your reliability score, the same one other players see before they let you into their game." },
  { q: "Can I host my own game instead of joining one?", a: "Yes, set your own time, venue, skill tier and cost per player, and it lands on this board like every other game." },
];

const TIER_COLOR = { beginner: "#6FCBFF", intermediate: "#35D6A6", advanced: "#FFB648", pro: "#C08CFF" };
function tierKey(label) {
  const k = String(label || "").toLowerCase();
  for (const key of Object.keys(TIER_COLOR)) if (k.indexOf(key) !== -1) return key;
  return "other";
}
function tierColor(label) {
  return TIER_COLOR[tierKey(label)] || "#96969E";
}

function sydDateParts(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SYD, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function sydHour(d) {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: SYD, hour: "2-digit", hour12: false }).format(d), 10);
}
function sydWeekday(d) {
  // 0=Sun..6=Sat, matched against en-CA-independent short-weekday lookup below.
  return new Intl.DateTimeFormat("en-US", { timeZone: SYD, weekday: "short" }).format(d);
}
function fmtTime(d) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: SYD, hour: "numeric", minute: "2-digit" }).format(d);
}
function dayLabel(d, now) {
  const day = sydDateParts(d);
  const today = sydDateParts(now);
  const tomorrow = sydDateParts(new Date(now.getTime() + 86400000));
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-AU", { timeZone: SYD, weekday: "long", day: "numeric", month: "short" }).format(d);
}

function gameRow(g, now) {
  const starts = new Date(g.starts_at);
  const wk = sydWeekday(starts);
  const isWeekend = wk === "Sat" || wk === "Sun";
  const isToday = sydDateParts(starts) === sydDateParts(now);
  const isTonight = isToday && sydHour(starts) >= 17;
  const tier = tierKey(g.skill_tier_label);
  const color = tierColor(g.skill_tier_label);
  const spots = g.open_spots === 0 ? "Full" : g.open_spots === 1 ? "1 spot left" : `${g.open_spots} spots left`;
  const cost = g.cost_per_player_cents != null ? `$${(g.cost_per_player_cents / 100).toFixed(0)}/player` : "";
  const meta = [g.skill_tier_label, g.format_label, cost].filter(Boolean).map(esc).join(" &middot; ");
  return `
    <a class="feedrow board-row" href="/game/${esc(g.id)}" data-tier="${tier}" data-tonight="${isTonight ? 1 : 0}" data-weekend="${isWeekend ? 1 : 0}" data-open-spots="${g.open_spots}" style="border-left-color:${color}">
      <span class="tierdot" style="background:${color}"></span>
      <div style="flex:1; min-width:0">
        <div style="font-weight:700; font-size:14.5px">${esc(g.venue_suburb || g.venue_name)} <span style="font-weight:600; color:var(--sec)">&middot; ${esc(g.venue_name)}</span></div>
        <div style="font-size:12.5px; color:#96969E; margin-top:2px">${esc(fmtTime(starts))}${meta ? " &middot; " + meta : ""}</div>
      </div>
      <div class="d spots-text" style="font-weight:700; font-size:14px; color:${g.open_spots === 0 ? "#7A7A82" : "#F5F5F7"}; flex-shrink:0">${esc(spots)}</div>
    </a>`;
}

function boardHtml(games, now) {
  if (games.length === 0) {
    return `
      <div class="board-empty" style="padding:28px 22px; background:var(--card); border:1px solid var(--hair); border-radius:18px; text-align:center">
        <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:17px">Nothing open this fortnight yet.</div>
        <p style="margin:8px 0 0; font-size:13.5px; color:#96969E; max-width:44ch; margin-left:auto; margin-right:auto">Private beta means a small crew so far &mdash; open the app and host one, it'll show up here the moment it's public.</p>
        <a href="/sydney" class="btn sec" style="margin-top:16px; height:44px; padding:0 20px">Browse all Sydney venues</a>
      </div>`;
  }
  const groups = new Map();
  for (const g of games) {
    const key = dayLabel(new Date(g.starts_at), now);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }
  return [...groups.entries()]
    .map(
      ([label, rows]) => `
      <div class="board-day">
        <div class="board-day-h">${esc(label)}</div>
        <div class="board-rows">${rows.map((g) => gameRow(g, now)).join("")}</div>
      </div>`
    )
    .join("");
}

function linkGridHtml(venues) {
  if (!venues.length) return "";
  const bySuburb = new Map();
  for (const v of venues) {
    const key = v.suburb || "Sydney";
    if (!bySuburb.has(key)) bySuburb.set(key, []);
    bySuburb.get(key).push(v);
  }
  return [...bySuburb.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([suburb, rows]) => `
      <div class="lg-col">
        <a class="lg-suburb" href="/sydney/${esc(slugify(suburb))}">${esc(suburb)}</a>
        ${rows.map((v) => `<a class="lg-venue" href="/venue/${esc(v.slug)}">${esc(v.name)}</a>`).join("")}
      </div>`
    )
    .join("");
}

function jsonLd(games) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Smashio",
        url: "https://smashio.com.au/",
        logo: "https://smashio.com.au/assets/apple-touch-icon.png",
      },
      {
        "@type": "WebSite",
        name: "Smashio",
        url: "https://smashio.com.au/",
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "ItemList",
        itemListElement: games.map((g, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "SportsEvent",
            name: `Badminton at ${g.venue_name}`,
            startDate: g.starts_at,
            endDate: g.ends_at,
            eventStatus: "https://schema.org/EventScheduled",
            eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
            location: {
              "@type": "Place",
              name: g.venue_name,
              address: {
                "@type": "PostalAddress",
                addressLocality: g.venue_suburb || undefined,
                addressRegion: "NSW",
                addressCountry: "AU",
              },
            },
            offers:
              g.cost_per_player_cents != null
                ? {
                    "@type": "Offer",
                    price: (g.cost_per_player_cents / 100).toFixed(2),
                    priceCurrency: "AUD",
                    availability: g.open_spots > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
                    url: `https://smashio.com.au/game/${g.id}`,
                  }
                : undefined,
            url: `https://smashio.com.au/game/${g.id}`,
          },
        })),
      },
    ],
  };
}

module.exports = async function handler(req, res) {
  if (req.query && req.query.map === "1") return serveMapTile(res);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=86400");

  const now = new Date();

  let games = [];
  try {
    games = await callRpc("games_seo_feed", { p_limit: 50 });
  } catch {
    games = [];
  }

  let stats = null;
  try {
    stats = await callRpc("city_seo_stats", {});
  } catch {
    stats = null;
  }

  let venues = [];
  try {
    venues = await callRpc("venue_seo_directory", {});
  } catch {
    venues = [];
  }

  const gamesThisWeek = stats && typeof stats.games_this_week === "number" ? stats.games_this_week : games.length;
  const venuesTracked = stats && typeof stats.venues_tracked === "number" ? stats.venues_tracked : 75;
  const suburbsCovered = stats && typeof stats.suburbs_covered === "number" ? stats.suburbs_covered : null;
  const generatedAtLabel = fmtTime(now);
  const boardBody = boardHtml(games, now);
  const linkGridBody = linkGridHtml(venues);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Smashio - Badminton in Sydney</title>
<meta name="description" content="Smashio finds badminton games happening near you tonight. Real courts, real players, sorted by skill. Join in two taps or host your own. In private beta, Sydney first." />
<link rel="canonical" href="https://smashio.com.au/" />

<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png" />
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />

<meta property="og:type" content="website" />
<meta property="og:url" content="https://smashio.com.au/" />
<meta property="og:title" content="Smashio: games are on, find one or host your own." />
<meta property="og:description" content="Smashio finds badminton games happening near you tonight. Real courts, real players, sorted by skill. In private beta, Sydney first." />
<meta property="og:image" content="https://smashio.com.au/assets/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Smashio: games are on, find one or host your own." />
<meta name="twitter:description" content="Smashio finds badminton games happening near you tonight. Real courts, real players, sorted by skill. In private beta, Sydney first." />
<meta name="twitter:image" content="https://smashio.com.au/assets/og-image.png" />
<script type="application/ld+json">${escapeJsonLd(jsonLd(games))}</script>

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
<script type="module" src="/assets/ionicons/ionicons.esm.js"></script>
<script defer src="/_vercel/insights/script.js"></script>
<script>(function(){function plat(){var ua=navigator.userAgent;if(/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))return'ios';if(/Android/.test(ua))return'android';return'desktop';}document.documentElement.setAttribute('data-platform',plat());})();</script>
<style>
  :root{--bg:#0A0A0B;--bgAlt:#0E0E10;--card:#18181C;--cardAlt:#141416;--hair:rgba(255,255,255,.08);--accent:#D6FF3F;--accent2:#AEE62A;--accent3:#9FE020;--text:#F5F5F7;--dim:#C7C7CE;--sec:#96969E;--ter:#7A7A82;--beg:#6FCBFF;--int:#35D6A6;--adv:#FFB648;--pro:#C08CFF}
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: Manrope, system-ui, sans-serif; font-weight:500; -webkit-font-smoothing: antialiased; overflow-x:hidden; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { color: #EBFF7A; }
  ::selection { background: var(--accent); color: var(--bg); }
  .d { font-family: 'Space Grotesk', sans-serif; }
  @keyframes smash-drift { 0% { transform: translateY(0); } 100% { transform: translateY(-14px); } }
  @keyframes smash-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }

  .hero-h1 { font-weight:700; font-size:clamp(44px,9vw,104px); letter-spacing:-.035em; line-height:.98; text-wrap:balance; }
  .hero-h1 .dim2 { color:var(--dim); }
  .hero-counters { display:flex; flex-wrap:wrap; gap:10px; margin-top:6px; }
  .hc { display:flex; align-items:baseline; gap:7px; padding:9px 16px; background:rgba(255,255,255,.03); border:1px solid var(--hair); border-radius:100px; font-size:12.5px; color:var(--sec); font-weight:700; }
  .hc-n { font-size:15px; color:var(--text); font-weight:700; }
  .hc-fresh { align-items:center; }

  .hero-court { position:absolute; inset:0; opacity:.16; background-image:
      linear-gradient(rgba(214,255,63,.5) 1px, transparent 1px),
      linear-gradient(90deg, rgba(214,255,63,.5) 1px, transparent 1px);
    background-size: 100% 33.33%, 20% 100%;
    background-position: center, center;
    mask-image: linear-gradient(to bottom, transparent, black 20%, black 75%, transparent);
  }
  .hero-noise { position:absolute; inset:0; opacity:.045; mix-blend-mode:overlay;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    background-size: 160px 160px;
  }

  .nav-link { display: none; }
  @media (min-width: 760px) { .nav-link { display: inline-flex; } }

  .compact-cta .l { display:none; } .compact-cta .l-default { display:inline; }
  html[data-platform] .compact-cta .l-default { display:none; }
  html[data-platform=ios] .compact-cta .l-ios { display:inline; }
  html[data-platform=android] .compact-cta .l-android { display:inline; }
  html[data-platform=desktop] .compact-cta .l-desktop { display:inline; }
  .hero-cta .s { display:none; } .hero-cta .s-default { display:flex; }
  html[data-platform] .hero-cta .s-default { display:none; }
  html[data-platform=ios] .hero-cta .s-ios { display:flex; }
  html[data-platform=android] .hero-cta .s-android { display:flex; }
  html[data-platform=desktop] .hero-cta .s-desktop { display:flex; }
  .install-cta .s { display:none; } .install-cta .s-default { display:flex; }
  html[data-platform] .install-cta .s-default { display:none; }
  html[data-platform=ios] .install-cta .s-ios { display:flex; }
  html[data-platform=android] .install-cta .s-android { display:flex; }
  html[data-platform=desktop] .install-cta .s-desktop { display:flex; }

  .betastrip { display:flex; align-items:center; justify-content:center; gap:8px; padding:9px 16px; background:var(--cardAlt); font-size:12.5px; color:var(--dim); font-weight:600; border-bottom:1px solid var(--hair); text-align:center; }
  .betastrip b { color:var(--accent3); font-weight:800; }
  .livedot { width:6px; height:6px; border-radius:50%; background:var(--accent3); box-shadow:0 0 0 3px rgba(159,224,32,.2); flex-shrink:0; display:inline-block; }

  .btn { height:50px; border-radius:100px; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-size:14.5px; font-weight:800; padding:0 22px; white-space:nowrap; border:none; cursor:pointer; font-family:inherit; }
  .btn.pri { background:linear-gradient(135deg,#EBFF7A,var(--accent2)); color:#0A0A0B; box-shadow:0 0 30px rgba(214,255,63,.2); }
  .btn.sec { background:transparent; color:var(--text); border:1.5px solid var(--hair); }
  .btn.ios { background:var(--text); color:#0A0A0B; }

  .feedrow { display:flex; align-items:center; gap:12px; padding:14px 16px; background:rgba(255,255,255,.03); border:1px solid var(--hair); border-left:3px solid var(--beg); border-radius:14px; }
  .feedrow + .feedrow { margin-top:10px; }
  .board-row { color:var(--text); transition: transform .15s ease, border-color .15s ease; }
  .board-row:hover { transform: translateY(-1px); border-color: rgba(255,255,255,.18); color:var(--text); }
  .tierdot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
  .fresh { font-size:11px; font-weight:700; color:var(--accent3); display:flex; align-items:center; gap:5px; }
  .fresh.stale { color:var(--sec); }

  .section { max-width:1180px; margin:0 auto; padding:96px 20px; }
  .section.tone { max-width:none; background:var(--bgAlt); border-top:1px solid var(--hair); border-bottom:1px solid var(--hair); }
  .section.tone > .inner { max-width:1180px; margin:0 auto; padding:96px 20px; }
  .eyebrow { font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--accent3); }
  .h2 { font-family:'Space Grotesk',sans-serif; font-weight:700; letter-spacing:-.02em; font-size:clamp(28px,5vw,40px); margin:10px 0 0; line-height:1.05; }

  .board-day { margin-top:26px; }
  .board-day:first-child { margin-top:0; }
  .board-day-h { position:sticky; top:0; z-index:5; background:var(--bg); padding:8px 0; font-size:12px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--sec); }
  .board-rows { display:flex; flex-direction:column; gap:10px; }
  .board-filters { display:flex; gap:8px; flex-wrap:wrap; }
  .board-chip { background:var(--cardAlt); border:1px solid var(--hair); color:var(--sec); font-size:12.5px; font-weight:700; padding:8px 14px; border-radius:100px; cursor:pointer; font-family:inherit; }
  .board-chip.active { background:rgba(214,255,63,.12); border-color:rgba(214,255,63,.35); color:var(--accent3); }
  .board-row[hidden] { display:none; }

  .steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; margin-top:44px; }
  .step { position:relative; background:linear-gradient(150deg,var(--card),var(--bgAlt)); border:1px solid var(--hair); border-radius:22px; padding:26px 24px 28px; overflow:hidden; }
  .step .stepno { position:absolute; right:-14px; top:-26px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:130px; line-height:1; color:rgba(255,255,255,.03); }
  .step .icon { position:relative; width:46px; height:46px; border-radius:14px; background:rgba(214,255,63,.12); display:flex; align-items:center; justify-content:center; margin-bottom:18px; }
  .step h3 { position:relative; margin:0 0 8px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:20px; letter-spacing:-.02em; }
  .step p { position:relative; margin:0; font-size:14px; line-height:1.6; color:var(--sec); }
  .step .mascot { position:relative; margin-top:16px; display:flex; align-items:flex-end; gap:10px; }
  .step .mascot img { width:52px; height:auto; flex-shrink:0; }
  .step .mascot span { font-size:12px; color:var(--ter); line-height:1.4; }

  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; margin-top:44px; }
  .stat { background:var(--card); border:1px solid var(--hair); border-radius:18px; padding:26px 22px; display:flex; flex-direction:column; gap:8px; }
  .stat .l { font-size:11px; font-weight:800; letter-spacing:.06em; color:var(--sec); text-transform:uppercase; }
  .stat .n { font-family:'Space Grotesk',sans-serif; font-size:clamp(38px,6vw,64px); font-weight:700; line-height:1; letter-spacing:-.02em; }
  .stat .sub { font-size:12.5px; color:var(--sec); }
  .tier { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:100px; font-size:11px; font-weight:700; }

  .rail { display:flex; gap:24px; margin-top:40px; overflow-x:auto; padding:20px 4px 30px; scroll-snap-type:x proximity; }
  .phoneframe { flex-shrink:0; width:190px; border-radius:36px; border:8px solid #050506; background:#050506; box-shadow:0 30px 60px rgba(0,0,0,.5); position:relative; scroll-snap-align:center; }
  .phoneframe::before { content:""; position:absolute; top:8px; left:50%; transform:translateX(-50%); width:64px; height:16px; background:#050506; border-radius:10px; z-index:2; }
  .phonescreen { border-radius:28px; overflow:hidden; aspect-ratio:9/19.3; background:repeating-linear-gradient(45deg,#1F1F24 0 8px,#141416 8px 16px); position:relative; display:flex; align-items:flex-end; }
  .phonescreen .cap { position:relative; margin:0 10px 10px; font-family:ui-monospace,monospace; font-size:9.5px; color:var(--dim); background:rgba(10,10,11,.65); padding:4px 8px; border-radius:5px; }

  .install-wrap { max-width:1180px; margin:96px auto 0; padding:0 20px; }
  .install { position:relative; border-radius:26px; overflow:hidden; padding:44px; background:linear-gradient(135deg,#1C1F10,var(--card)); border:1px solid rgba(214,255,63,.35); }
  .install-glow { position:absolute; width:700px; height:700px; left:50%; top:-260px; transform:translateX(-50%); background:radial-gradient(circle,rgba(214,255,63,.18) 0%,transparent 60%); z-index:0; pointer-events:none; }
  .installcard { position:relative; z-index:1; display:flex; justify-content:space-between; gap:36px; align-items:center; flex-wrap:wrap; }
  .badge { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:100px; background:rgba(214,255,63,.1); border:1px solid rgba(214,255,63,.25); font-size:11px; font-weight:800; color:var(--accent3); }
  input[type=email] { height:48px; border-radius:100px; background:var(--cardAlt); border:1px solid var(--hair); color:var(--text); padding:0 18px; font-size:13.5px; font-family:Manrope; }
  input[type=email]::placeholder { color:var(--ter); }

  .ftr { border-top:1px solid var(--hair); }
  .ftr-inner { max-width:1180px; margin:0 auto; padding:52px 20px 32px; display:flex; flex-wrap:wrap; gap:40px; justify-content:space-between; }
  .ftr-col { display:flex; flex-direction:column; gap:10px; }
  .ftr-col a { color:var(--sec); font-size:13.5px; font-weight:600; }
  .ftr-h { font-size:10.5px; font-weight:800; letter-spacing:.1em; color:var(--ter); text-transform:uppercase; }
  .ftr-bottom { border-top:1px solid var(--hair); }
  .ftr-bottom-inner { max-width:1180px; margin:0 auto; padding:18px 20px; display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; font-size:12px; color:var(--ter); }

  .trust { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:36px 44px; margin-top:44px; }
  .trust-item { display:flex; gap:16px; }
  .trust-item .icon { flex-shrink:0; width:40px; height:40px; border-radius:12px; background:rgba(214,255,63,.1); display:flex; align-items:center; justify-content:center; }
  .trust-item h3 { margin:0 0 6px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:16.5px; letter-spacing:-.01em; }
  .trust-item p { margin:0; font-size:13.5px; line-height:1.6; color:var(--sec); }

  .lg-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:28px 20px; margin-top:40px; }
  .lg-col { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .lg-suburb { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:14px; color:var(--text); margin-bottom:4px; }
  .lg-suburb:hover { color:var(--accent3); }
  .lg-venue { display:block; padding:5px 0; font-size:12.5px; color:var(--sec); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lg-venue:hover { color:var(--dim); }

  .faq { margin-top:40px; display:flex; flex-direction:column; gap:2px; max-width:820px; }
  .faq-item { border-bottom:1px solid var(--hair); padding:18px 0; }
  .faq-item summary { cursor:pointer; list-style:none; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15.5px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
  .faq-item summary::-webkit-details-marker { display:none; }
  .faq-item summary::after { content:"+"; color:var(--accent3); font-size:20px; flex-shrink:0; }
  .faq-item[open] summary::after { content:"\\2212"; }
  .faq-item p { margin:10px 0 0; font-size:13.5px; line-height:1.6; color:var(--sec); max-width:66ch; }

  html { scrollbar-color: #3A3A40 var(--bgAlt); scrollbar-width: thin; }
  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track { background: var(--bgAlt); }
  ::-webkit-scrollbar-thumb { background: #3A3A40; border-radius: 8px; border: 3px solid var(--bgAlt); }
  ::-webkit-scrollbar-thumb:hover { background: var(--accent3); }
</style>

</head>
<body style="margin:0">

<div style="background:#0A0A0B; overflow-x:hidden">

<div class="betastrip">
  <span class="livedot"></span>
  <span>Private beta &middot; iOS on TestFlight, Android by invite &middot; public launch Nov 2026</span>
</div>

<header style="position:sticky; top:0; z-index:50; backdrop-filter:blur(18px); background:rgba(10,10,11,.72); border-bottom:1px solid rgba(255,255,255,.06)">
  <div style="max-width:1180px; margin:0 auto; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px">
    <a href="#top" style="display:flex; align-items:center; gap:6px; color:#F5F5F7">
      <img src="/assets/smashio-mark.svg" alt="" style="width:17px; height:17px" />
      <span style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:19px; letter-spacing:-.02em">Smashio</span>
    </a>
    <nav style="display:flex; align-items:center; gap:26px">
      <a href="/sydney" class="nav-link" style="color:#96969E; font-size:13px; font-weight:600">Sydney</a>
      <a href="/sydney" class="nav-link" style="color:#96969E; font-size:13px; font-weight:600">Venues</a>
      <a href="/guides/cost-of-badminton-in-sydney" class="nav-link" style="color:#96969E; font-size:13px; font-weight:600">Guides</a>
      <a href="#install" class="btn pri compact-cta" style="height:auto; padding:9px 16px; font-size:13px">
        <span class="l l-default">Get the app</span><span class="l l-ios">Join on TestFlight</span><span class="l l-android">Request access</span><span class="l l-desktop">Get the app</span>
      </a>
    </nav>
  </div>
</header>

<section id="top" style="position:relative; overflow:hidden; border-bottom:1px solid rgba(255,255,255,.06)">
  <div style="position:absolute; inset:0; pointer-events:none; opacity:.5">
    <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice" style="position:absolute; inset:0; width:100%; height:100%">
      <defs>
        <radialGradient id="bloomVolt" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#D6FF3F" stop-opacity="0.24" /><stop offset="1" stop-color="#D6FF3F" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="600" cy="20" rx="900" ry="300" fill="url(#bloomVolt)" />
      <g fill="none" stroke="#D6FF3F" stroke-width="1.5" opacity=".3">
        <rect x="100" y="60" width="1000" height="340" />
        <line x1="600" y1="60" x2="600" y2="400" />
      </g>
    </svg>
  </div>
  <div class="hero-court" aria-hidden="true"></div>
  <div class="hero-noise" aria-hidden="true"></div>

  <div style="position:relative; max-width:1180px; margin:0 auto; padding:64px 20px 56px; display:flex; flex-direction:column; gap:22px">
    <div class="eyebrow">Live in Sydney right now</div>
    <h1 class="d hero-h1" style="margin:0">Games are on.<br /><span class="dim2">Find one, or host your own.</span></h1>
    <p style="margin:0; max-width:46ch; font-size:16px; line-height:1.6; color:#96969E">No accounts on this page, no bookings here either. See what's actually on below, right down to the open spots.</p>

    <div class="hero-cta" style="margin-top:4px">
      <div class="s s-default" style="gap:12px; flex-wrap:wrap">
        <a href="${TESTFLIGHT_URL}" target="_blank" rel="noopener" class="btn ios"><ion-icon name="logo-apple" style="font-size:20px"></ion-icon>Join on TestFlight</a>
        <a href="#board" class="btn sec">See what's on tonight</a>
      </div>
      <div class="s s-ios" style="gap:12px; flex-wrap:wrap">
        <a href="${TESTFLIGHT_URL}" target="_blank" rel="noopener" class="btn ios"><ion-icon name="logo-apple" style="font-size:20px"></ion-icon>Join on TestFlight</a>
        <a href="#board" class="btn sec">See what's on tonight</a>
      </div>
      <div class="s s-android" style="gap:12px; flex-wrap:wrap">
        <a href="#install" class="btn pri">Request Android access</a>
        <a href="#board" class="btn sec">See what's on tonight</a>
      </div>
      <div class="s s-desktop" style="gap:12px; flex-wrap:wrap">
        <a href="#install" class="btn pri">Get the app</a>
        <a href="#board" class="btn sec">See what's on tonight</a>
      </div>
    </div>

    <div class="hero-counters">
      <div class="hc"><span class="hc-n d">${esc(gamesThisWeek)}</span><span class="hc-l">games on this week</span></div>
      <div class="hc"><span class="hc-n d">${esc(venuesTracked)}</span><span class="hc-l">venues mapped</span></div>
      ${suburbsCovered != null ? `<div class="hc"><span class="hc-n d">${esc(suburbsCovered)}</span><span class="hc-l">suburbs covered</span></div>` : ""}
      <div class="hc hc-fresh"><span class="livedot"></span><span class="hc-l">Checked ${esc(generatedAtLabel)}</span></div>
    </div>
  </div>
</section>

<section id="board" class="section" style="padding-top:64px">
  <div class="eyebrow">The live board &middot; next 14 days</div>
  <h2 class="h2">What's actually on, right now.</h2>
  <div class="fresh" style="margin-top:14px"><span class="livedot"></span><span id="board-fresh-text">Checked ${esc(generatedAtLabel)}</span></div>
  ${
    games.length > 0
      ? `<div class="board-filters" style="margin-top:20px">
          <button class="board-chip active" data-filter="all">All</button>
          <button class="board-chip" data-filter="tonight">Tonight</button>
          <button class="board-chip" data-filter="weekend">This weekend</button>
          <button class="board-chip" data-filter="beginner">Beginner</button>
          <button class="board-chip" data-filter="intermediate">Intermediate</button>
          <button class="board-chip" data-filter="advanced">Advanced</button>
          <button class="board-chip" data-filter="pro">Pro</button>
        </div>`
      : ""
  }
  <div id="board-body" style="margin-top:22px" data-generated-at="${esc(now.toISOString())}">${boardBody}</div>
</section>

<section style="position:relative; overflow:hidden; border-top:1px solid var(--hair); border-bottom:1px solid var(--hair)">
  <img src="/api/map-tile" alt="Map of every Smashio badminton venue across Sydney" loading="lazy" style="display:block; width:100%; height:clamp(220px,38vw,440px); object-fit:cover; filter:saturate(1.05)" />
  <div style="position:absolute; inset:0; background:linear-gradient(0deg,rgba(10,10,11,.92) 0%,rgba(10,10,11,.15) 45%,rgba(10,10,11,.15) 100%); pointer-events:none"></div>
  <div style="position:absolute; left:0; right:0; bottom:0; padding:28px 20px; display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; max-width:1180px; margin:0 auto">
    <div>
      <div class="eyebrow">Every court, mapped</div>
      <h2 class="h2" style="font-size:clamp(22px,4vw,32px); margin-top:6px">${esc(venuesTracked)} venues${suburbsCovered != null ? ` across ${esc(suburbsCovered)} suburbs` : ""}, not a shortlist.</h2>
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap">
      <a href="/sydney" class="btn sec">Browse Sydney venues</a>
      <a href="/badminton-near-me" class="btn sec">Badminton near me</a>
    </div>
  </div>
</section>

<script>
(function () {
  var genAt = new Date(document.getElementById("board-body").getAttribute("data-generated-at")).getTime();
  var freshEl = document.getElementById("board-fresh-text");
  var freshWrap = freshEl ? freshEl.parentElement : null;
  function renderFreshness() {
    if (!freshEl || !genAt) return;
    var mins = Math.floor((Date.now() - genAt) / 60000);
    var stale = mins >= 15;
    freshWrap.classList.toggle("stale", stale);
    freshEl.textContent = mins <= 0 ? "Updated moments ago" : "Updated " + mins + " min ago";
    document.querySelectorAll(".board-row").forEach(function (row) {
      var spotsEl = row.querySelector(".spots-text");
      var open = parseInt(row.getAttribute("data-open-spots"), 10);
      if (!spotsEl) return;
      if (open === 0) { spotsEl.textContent = "Full"; return; }
      spotsEl.textContent = stale ? "Spots left" : (open === 1 ? "1 spot left" : open + " spots left");
    });
  }
  setInterval(renderFreshness, 30000);

  var chips = document.querySelectorAll(".board-chip");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      var filter = chip.getAttribute("data-filter");
      document.querySelectorAll(".board-row").forEach(function (row) {
        var show = filter === "all"
          || (filter === "tonight" && row.getAttribute("data-tonight") === "1")
          || (filter === "weekend" && row.getAttribute("data-weekend") === "1")
          || row.getAttribute("data-tier") === filter;
        row.hidden = !show;
      });
      document.querySelectorAll(".board-day").forEach(function (day) {
        var anyVisible = day.querySelectorAll(".board-row:not([hidden])").length > 0;
        day.hidden = !anyVisible;
      });
    });
  });
})();
</script>

<section id="how" class="section">
  <div class="eyebrow">Court to court in three taps</div>
  <h2 class="h2">No booking calls, no group chats to beg into.</h2>
  <div class="steps">
    <div class="step">
      <div class="icon"><ion-icon name="search" style="font-size:21px; color:#D6FF3F"></ion-icon></div>
      <h3>Find a game near you</h3>
      <p>Filter by suburb, skill tier and time. See exactly who's short a player, tonight.</p>
    </div>
    <div class="step">
      <div class="icon"><ion-icon name="add" style="font-size:24px; color:#D6FF3F"></ion-icon></div>
      <h3>Join it, or host your own</h3>
      <p>Jump into an open game, or set your own time, skill tier and cost per player.</p>
      <div class="mascot"><img src="/assets/smashimals/wombat-racquet.png" alt="" /><span>Wombat's always got a racquet spare.</span></div>
    </div>
    <div class="step">
      <div class="icon"><ion-icon name="tennisball-outline" style="font-size:21px; color:#D6FF3F"></ion-icon></div>
      <h3>Show up and play</h3>
      <p>Turn up, play, rate the session after. Your reliability score does the talking from there.</p>
    </div>
  </div>
</section>

<section class="section tone">
  <div class="inner">
    <div class="eyebrow">Built for people who actually turn up</div>
    <h2 class="h2">The honest version of a badminton meetup.</h2>
    <div class="stats">
      <div class="stat">
        <div class="l">Live this week</div>
        <div class="n">${esc(gamesThisWeek)}</div>
        <div class="sub">games across Sydney, pulled straight from the app.</div>
      </div>
      <div class="stat">
        <div class="l">Court maps &amp; directions</div>
        <div class="n">${esc(venuesTracked)}</div>
        <div class="sub">venues mapped across Sydney.</div>
      </div>
      <div class="stat">
        <div class="l">Four honest skill tiers</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px">
          <span class="tier" style="background:rgba(111,203,255,.12); color:#6FCBFF">Beginner</span>
          <span class="tier" style="background:rgba(53,214,166,.12); color:#35D6A6">Intermediate</span>
          <span class="tier" style="background:rgba(255,182,72,.12); color:#FFB648">Advanced</span>
          <span class="tier" style="background:rgba(192,140,255,.12); color:#C08CFF">Pro</span>
        </div>
        <div class="sub" style="margin-top:10px">No sandbagging, no guessing.</div>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="eyebrow">Dark, fast, and out of your way</div>
  <h2 class="h2">The app underneath all this.</h2>
  <!-- Real iPhone captures, home-redesign-plan.md H7 (website-design-brief.md §6). -->
  <div class="rail">
    <div class="phoneframe"><div class="phonescreen"><img src="/assets/screenshots/discover-list.webp" width="380" height="822" alt="Discover screen listing nearby badminton games" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" /><span class="cap">DISCOVER &middot; LIST</span></div></div>
    <div class="phoneframe"><div class="phonescreen"><img src="/assets/screenshots/discover-map.webp" width="380" height="822" alt="Discover map showing badminton games near Maroubra" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" /><span class="cap">DISCOVER &middot; MAP</span></div></div>
    <div class="phoneframe"><div class="phonescreen"><img src="/assets/screenshots/game-detail.webp" width="380" height="822" alt="Game detail screen with lineup and open spots" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" /><span class="cap">GAME DETAIL</span></div></div>
    <div class="phoneframe"><div class="phonescreen"><img src="/assets/screenshots/host-a-game.webp" width="380" height="822" alt="Host a game wizard, booking confirmation step" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" /><span class="cap">HOST A GAME</span></div></div>
    <div class="phoneframe"><div class="phonescreen"><img src="/assets/screenshots/feed.webp" width="380" height="822" alt="Feed screen with nearby game posts" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" /><span class="cap">FEED / CHAT</span></div></div>
    <div class="phoneframe"><div class="phonescreen"><img src="/assets/screenshots/profile.webp" width="380" height="822" alt="Player profile with reliability score and badges" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" /><span class="cap">PROFILE</span></div></div>
  </div>
</section>

<section class="section tone">
  <div class="inner">
    <div class="eyebrow">Why it's honest</div>
    <h2 class="h2">Built so turning up actually means something.</h2>
    <div class="trust">
      <div class="trust-item">
        <div class="icon"><ion-icon name="layers-outline" style="font-size:19px; color:#D6FF3F"></ion-icon></div>
        <div><h3>Four skill tiers, honestly defined</h3><p>Beginner, intermediate, advanced and pro aren't vibes, they're set against how the game actually plays, so you're never the only one who over or undersold themselves.</p></div>
      </div>
      <div class="trust-item">
        <div class="icon"><ion-icon name="shield-checkmark-outline" style="font-size:19px; color:#D6FF3F"></ion-icon></div>
        <div><h3>A reliability score that follows you</h3><p>Every game you show up for, and every one you don't, feeds a score other players can see before they let you into theirs.</p></div>
      </div>
      <div class="trust-item">
        <div class="icon"><ion-icon name="megaphone-outline" style="font-size:19px; color:#D6FF3F"></ion-icon></div>
        <div><h3>Real host tools, not a group chat</h3><p>Set the tier, the cost per player and the spots, reserve a seat for a mate, and see who's actually coming.</p></div>
      </div>
      <div class="trust-item">
        <div class="icon"><ion-icon name="close-circle-outline" style="font-size:19px; color:#D6FF3F"></ion-icon></div>
        <div><h3>No-shows get marked, not ignored</h3><p>A host can flag a no-show after the game, so a flaky player doesn't just quietly wreck the next five games too.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="section" id="venues">
  <div class="eyebrow">Every venue we track</div>
  <h2 class="h2">${esc(venuesTracked)} courts across Sydney, mapped by suburb.</h2>
  <div class="lg-grid">${linkGridBody}</div>
</section>

<section class="section tone">
  <div class="inner">
    <div class="eyebrow">Questions</div>
    <h2 class="h2">Before you ask.</h2>
    <div class="faq">
      ${FAQ.map(
        (f, i) => `
        <details class="faq-item"${i === 0 ? " open" : ""}>
          <summary>${esc(f.q)}</summary>
          <p>${esc(f.a)}</p>
        </details>`
      ).join("")}
    </div>
  </div>
</section>

<div class="install-wrap" id="install">
  <div class="install">
    <div class="install-glow"></div>
    <div class="installcard">
      <div style="max-width:340px">
        <div class="badge"><span class="livedot"></span>PRIVATE BETA</div>
        <div class="d" style="font-size:28px; font-weight:700; margin-top:14px">Get Smashio</div>
        <div style="font-size:14px; color:#96969E; margin-top:8px">iPhone is one tap through TestFlight. Android's invite only while we sort the allowlist, leave your email and we'll add you and email you back.</div>
        <img src="/assets/smashimals/quokka-banner.png" alt="" style="width:70px; margin-top:16px; animation:smash-drift 3.4s ease-in-out infinite alternate" />
      </div>
      <div class="install-cta">
        <div class="s s-default" style="flex-direction:column; gap:10px; width:280px">
          <a href="${TESTFLIGHT_URL}" target="_blank" rel="noopener" class="btn ios"><ion-icon name="logo-apple" style="font-size:20px"></ion-icon>Join on TestFlight</a>
          <form class="smashio-capture-form" data-source="hero_android" style="display:flex; gap:8px">
            <div style="position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
            <input type="email" name="email" required placeholder="you@email.com" aria-label="Email address" style="flex:1; min-width:0" />
            <button type="submit" class="btn sec" style="flex-shrink:0; padding:0 16px">Android</button>
          </form>
          <p class="smashio-capture-msg" style="margin:0; font-size:11px; color:#7A7A82"></p>
        </div>
        <div class="s s-ios" style="flex-direction:column; gap:10px; width:260px">
          <a href="${TESTFLIGHT_URL}" target="_blank" rel="noopener" class="btn ios"><ion-icon name="logo-apple" style="font-size:20px"></ion-icon>Join on TestFlight</a>
        </div>
        <div class="s s-android" style="flex-direction:column; gap:10px; width:280px">
          <form class="smashio-capture-form" data-source="hero_android" style="display:flex; gap:8px">
            <div style="position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
            <input type="email" name="email" required placeholder="you@email.com" aria-label="Email address" style="flex:1; min-width:0" />
            <button type="submit" class="btn pri" style="flex-shrink:0">Request</button>
          </form>
          <p class="smashio-capture-msg" style="margin:0; font-size:11px; color:#7A7A82">We'll add you and email you back, usually within a day.</p>
        </div>
        <div class="s s-desktop" style="flex-direction:column; gap:10px; width:280px">
          <form class="smashio-capture-form" data-source="get_app_android" style="display:flex; gap:8px">
            <div style="position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
            <input type="email" name="email" required placeholder="you@email.com" aria-label="Email address" style="flex:1; min-width:0" />
            <button type="submit" class="btn pri" style="flex-shrink:0">Send</button>
          </form>
          <p class="smashio-capture-msg" style="margin:0; font-size:11px; color:#7A7A82"></p>
        </div>
      </div>
    </div>
  </div>
</div>

<footer class="ftr" style="margin-top:96px">
  <div class="ftr-inner">
    <div class="ftr-col" style="max-width:280px">
      <div style="display:flex; align-items:center; gap:5px">
        <img src="/assets/smashio-mark.svg" alt="" style="width:15px; height:15px" />
        <span class="d" style="font-weight:700; font-size:17px; letter-spacing:-.02em">Smashio</span>
      </div>
      <p style="margin:0; font-size:13px; line-height:1.6; color:#7A7A82">Local badminton, organised. Private beta, Sydney first. Public launch November 2026.</p>
    </div>
    <div class="ftr-col"><div class="ftr-h">Play</div><a href="/sydney">Sydney</a><a href="/sydney">Venues</a><a href="/guides/cost-of-badminton-in-sydney">Guides</a><a href="/badminton-near-me">Badminton near me</a></div>
    <div class="ftr-col"><div class="ftr-h">Legal</div><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/support.html">Support</a><a href="/community-guidelines.html">Community guidelines</a><a href="/delete-account.html">Delete account</a></div>
    <div class="ftr-col" style="max-width:260px">
      <div class="ftr-h">Not ready yet?</div>
      <p style="margin:0; font-size:12.5px; line-height:1.5; color:#7A7A82">Leave your email and we'll ping you when there's a game near you.</p>
      <form class="smashio-capture-form" data-source="home_footer" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center">
        <div style="position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
        <input type="email" name="email" required placeholder="you@example.com" aria-label="Email address" style="flex:1; min-width:150px; font-size:12.5px" />
        <button type="submit" class="btn pri" style="height:auto; padding:10px 16px; font-size:12.5px">Notify me</button>
        <p class="smashio-capture-msg" style="width:100%; margin:0; font-size:11.5px; color:#7A7A82"></p>
      </form>
    </div>
  </div>
  <div class="ftr-bottom"><div class="ftr-bottom-inner"><span>&copy; 2026 Smashio. Sydney, Australia.</span><span>Not affiliated with any court operator, yet.</span></div></div>
</footer>

</div>

${captureFormScript()}
${analyticsScripts()}

</body>
</html>`;

  return res.status(200).send(html);
};
