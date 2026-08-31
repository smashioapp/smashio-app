// Server-rendered per-game landing page for shared /game/:id links (gtm-plan.md G3).
// Crawlers (WhatsApp/iMessage/Facebook/Slack link previews) don't execute JS, so the old
// rewrite straight to index.html always showed the generic homepage: no venue, no time, same
// image for every game. This is a single Vercel serverless function — no bundler, no build step,
// matching the rest of website/ — that renders real OG tags per game at request time, styled to
// match index.html's dark/lime brand rather than the plain venue.html/player.html card.
//
// SUPABASE_ANON_KEY below is the *publishable* anon key, the same one already shipped inside the
// app bundle (ui/.env.production). Safe to embed: it's public by design, and access is actually
// gated by game_preview's own security-definer scoping (single known id, no PII, see
// supabase/migrations/20260820000100_game_preview_anon.sql).
const SUPABASE_URL = "https://ajbsvsfwjfeofvjuhzrw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VsirTXudBTJT4kNF4deNkw_hVl54eBx";

const TESTFLIGHT_URL = "https://testflight.apple.com/join/cJMZQmbn";
const ANDROID_BETA_MAILTO =
  "mailto:hello@smashio.com.au?subject=Android%20beta%20-%20add%20me&body=Hi%20Smashio%2C%20please%20add%20me%20to%20the%20Android%20beta.%20My%20Google%20account%20email%20is%3A";

// Same four tiers as index.html's "Four honest skill tiers" card (#features).
const TIER_COLORS = {
  beginner: "#6FCBFF",
  intermediate: "#35D6A6",
  advanced: "#FFB648",
  pro: "#C08CFF",
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtWhen(startsAt) {
  const d = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" }).format(d);
  const time = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Sydney" }).format(d);
  return `${day} · ${time}`;
}

// Mirrors the homepage's countdown chips (#features: green "In 3h 20m", red "In 42m").
function countdownChip(startsAt) {
  const diffMs = new Date(startsAt).getTime() - Date.now();
  if (diffMs <= 0) return { label: "Already underway or finished", bg: "rgba(255,255,255,.06)", fg: "#7A7A82" };
  const mins = Math.round(diffMs / 60000);
  const urgent = mins < 60;
  const label = mins < 60 ? `Starts in ${mins}m` : `Starts in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return urgent
    ? { label, bg: "rgba(255,103,103,.16)", fg: "#FF6767" }
    : { label, bg: "rgba(214,255,63,.14)", fg: "#D6FF3F" };
}

function tierColor(label) {
  const key = String(label || "").toLowerCase();
  return TIER_COLORS[key] || "#D6FF3F";
}

// Shared head block + brand chrome (header/footer/background) — only the hero content differs
// between a real game and the not-found fallback.
function shell({ title, ogTitle, ogDescription, ogUrl, heroContent }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="robots" content="noindex" />
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png" />
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
<meta property="og:type" content="website" />
${ogUrl ? `<meta property="og:url" content="${esc(ogUrl)}" />` : ""}
<meta property="og:title" content="${esc(ogTitle)}" />
<meta property="og:description" content="${esc(ogDescription)}" />
<meta property="og:image" content="https://smashio.com.au/assets/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(ogTitle)}" />
<meta name="twitter:description" content="${esc(ogDescription)}" />
<meta name="twitter:image" content="https://smashio.com.au/assets/og-image.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
<script type="module" src="https://unpkg.com/ionicons@7.4.0/dist/ionicons/ionicons.esm.js"></script>
<style>
  html { scroll-behavior: smooth; }
  body { margin: 0; background: #0A0A0B; color: #F5F5F7; font-family: Manrope, system-ui, sans-serif; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
  a { color: #D6FF3F; text-decoration: none; }
  a:hover { color: #EBFF7A; }
  ::selection { background: #D6FF3F; color: #0A0A0B; }

  @keyframes smash-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
  @keyframes smash-drift { 0% { transform: translateY(0); } 100% { transform: translateY(-10px); } }
  @keyframes smash-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: .001s !important; animation-iteration-count: 1 !important; }
  }

  .rise { opacity: 0; animation: smash-in .6s cubic-bezier(.16,1,.3,1) forwards; }
  .rise-1 { animation-delay: .02s; }
  .rise-2 { animation-delay: .10s; }
  .rise-3 { animation-delay: .18s; }
  .rise-4 { animation-delay: .26s; }
  .rise-5 { animation-delay: .34s; }

  .btn { display:flex; align-items:center; justify-content:center; gap:11px; background:#141416; border:1px solid rgba(255,255,255,.10); padding:12px 20px 12px 17px; border-radius:14px; color:#F5F5F7; width:100%; box-sizing:border-box; transition: transform .18s ease, border-color .18s ease; }
  .btn:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.22); }
  .btn-primary { background: linear-gradient(135deg,#EBFF7A,#AEE62A); color:#0A0A0B; box-shadow: 0 0 34px rgba(214,255,63,.22); border-color: transparent; }
  .btn-primary:hover { border-color: transparent; }
  .btn-label { display:flex; flex-direction:column; align-items:flex-start; line-height:1.15; }
  .btn-eyebrow { font-size:9.5px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#7A7A82; }
  .btn-primary .btn-eyebrow { color: rgba(10,10,11,.6); }
  .btn-main { font-size:16px; font-weight:800; letter-spacing:-.01em; }

  .stat { background:#141416; border:1px solid rgba(255,255,255,.08); color:#F5F5F7; font-size:12.5px; font-weight:800; padding:9px 14px; border-radius:100px; display:flex; align-items:center; gap:6px; }

  .nav-link { display: none; }
  @media (min-width: 640px) { .nav-link { display: inline-flex; } }
</style>
</head>
<body>

<div style="background:#0A0A0B; min-height:100vh; display:flex; flex-direction:column">

<header style="position:sticky; top:0; z-index:50; backdrop-filter:blur(18px); background:rgba(10,10,11,.72); border-bottom:1px solid rgba(255,255,255,.06)">
  <div style="max-width:720px; margin:0 auto; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px">
    <a href="/" style="display:flex; align-items:center; gap:9px; color:#F5F5F7">
      <img src="/assets/smashio-logo.png" alt="Smashio" style="width:30px; height:30px; object-fit:contain" />
      <span style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:19px; letter-spacing:-.02em">Smashio</span>
    </a>
    <a href="/" class="nav-link" style="align-items:center; color:#96969E; font-size:13px; font-weight:600">Back to smashio.com.au</a>
  </div>
</header>

<section style="position:relative; flex:1; overflow:hidden">
  <div style="position:absolute; inset:0; pointer-events:none">
    <svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMin slice" style="position:absolute; inset:0; width:100%; height:100%">
      <defs>
        <radialGradient id="bloomVolt" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#D6FF3F" stop-opacity="0.24" />
          <stop offset="0.5" stop-color="#D6FF3F" stop-opacity="0.06" />
          <stop offset="1" stop-color="#D6FF3F" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="bloomCool" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#35D6A6" stop-opacity="0.14" />
          <stop offset="0.5" stop-color="#35D6A6" stop-opacity="0.04" />
          <stop offset="1" stop-color="#35D6A6" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="650" cy="30" rx="520" ry="260" fill="url(#bloomVolt)" />
      <ellipse cx="60" cy="420" rx="460" ry="260" fill="url(#bloomCool)" />
    </svg>
  </div>

  <div style="position:relative; max-width:560px; margin:0 auto; padding:64px 20px 56px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:22px">
    ${heroContent}
  </div>
</section>

<footer style="border-top:1px solid rgba(255,255,255,.06)">
  <div style="max-width:560px; margin:0 auto; padding:22px 20px; display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; font-size:12px; color:#5C5C64">
    <span>© 2026 Smashio. Made in Sydney.</span>
    <a href="/privacy.html" style="color:#5C5C64; font-size:12px">Privacy</a>
  </div>
</footer>

</div>

</body>
</html>`;
}

function ctaButtons() {
  return `
    <div class="rise rise-4" style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; width:100%">
      <a class="btn btn-primary" href="${TESTFLIGHT_URL}" target="_blank" rel="noopener">
        <ion-icon name="logo-apple" style="font-size:24px"></ion-icon>
        <span class="btn-label"><span class="btn-eyebrow">Join the</span><span class="btn-main">TestFlight beta</span></span>
      </a>
      <a class="btn" href="${ANDROID_BETA_MAILTO}">
        <ion-icon name="logo-google-playstore" style="font-size:22px; color:#F5F5F7"></ion-icon>
        <span class="btn-label"><span class="btn-eyebrow">Android · email us</span><span class="btn-main">Ask for the beta</span></span>
      </a>
    </div>
    <div class="rise rise-5" style="display:flex; align-items:center; gap:14px; background:rgba(20,20,22,.7); border:1px solid rgba(255,255,255,.07); padding:12px 18px 12px 12px; border-radius:18px; margin-top:6px">
      <div style="background:#0A0A0B; border:1px solid rgba(214,255,63,.25); border-radius:12px; padding:7px; line-height:0">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&amp;margin=0&amp;data=https%3A%2F%2Ftestflight.apple.com%2Fjoin%2FcJMZQmbn&amp;bgcolor=0A0A0B&amp;color=D6FF3F" alt="Scan to join the Smashio TestFlight beta" style="width:56px; height:56px; display:block" />
      </div>
      <div style="text-align:left">
        <div style="font-size:12.5px; font-weight:800; color:#F5F5F7">Scan to join the iOS beta</div>
        <div style="font-size:11.5px; color:#7A7A82; margin-top:2px">TestFlight · iPhone and iPad</div>
      </div>
    </div>
    <p class="rise rise-5" style="margin:0; font-size:12px; color:#5C5C64">Private beta. iPhone testers join through TestFlight; Android testers are added in batches.</p>`;
}

function notFoundHero({ heading, body }) {
  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F; animation:smash-pulse 1.6s ease-in-out infinite"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Shared game link</span>
    </div>
    <img src="/assets/smashio-logo.png" alt="" class="rise rise-2" style="width:48px; height:48px; object-fit:contain; animation-name:smash-in, smash-drift; animation-duration:.6s, 3.4s; animation-timing-function:cubic-bezier(.16,1,.3,1), ease-in-out; animation-iteration-count:1, infinite; animation-direction:normal, alternate; animation-delay:.10s, .7s; animation-fill-mode:forwards, none" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(28px,7vw,38px); line-height:1.05; letter-spacing:-.03em; text-wrap:balance">${esc(heading)}</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:15px; line-height:1.6; color:#96969E">${esc(body)}</p>
    ${ctaButtons()}`;
}

function gameHero(preview) {
  const when = fmtWhen(preview.starts_at);
  const chip = countdownChip(preview.starts_at);
  const cost = preview.cost_per_player_cents != null ? `$${(preview.cost_per_player_cents / 100).toFixed(0)}` : null;
  const tier = tierColor(preview.skill_tier_label);

  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F; animation:smash-pulse 1.6s ease-in-out infinite"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Badminton · ${esc(preview.venue_suburb)}</span>
    </div>

    <span class="rise rise-2" style="background:${chip.bg}; color:${chip.fg}; font-size:10.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; padding:5px 12px; border-radius:100px">${esc(chip.label)}</span>

    <h1 class="rise rise-2" style="margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(32px,8vw,46px); line-height:1.02; letter-spacing:-.035em; text-wrap:balance">${esc(preview.venue_name)}</h1>

    <div class="rise rise-2" style="display:flex; align-items:center; gap:6px; color:#96969E; font-size:14px; font-weight:600">
      <ion-icon name="calendar-outline" style="font-size:15px; color:#7A7A82"></ion-icon>
      <span>${esc(when)}</span>
      <span style="color:#3A3A40">·</span>
      <ion-icon name="location-outline" style="font-size:15px; color:#7A7A82"></ion-icon>
      <span>${esc(preview.venue_suburb)}</span>
    </div>

    <div class="rise rise-3" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center">
      ${cost ? `<span class="stat"><ion-icon name="pricetag-outline" style="font-size:14px; color:#D6FF3F"></ion-icon><span style="color:#D6FF3F">${esc(cost)}</span>&nbsp;/ player</span>` : ""}
      <span class="stat"><ion-icon name="people-outline" style="font-size:14px; color:#96969E"></ion-icon>Up to ${esc(preview.max_players)}</span>
      <span class="stat"><ion-icon name="podium-outline" style="font-size:14px; color:${tier}"></ion-icon><span style="color:${tier}">${esc(preview.skill_tier_label)}</span></span>
    </div>

    <p class="rise rise-3" style="margin:6px 0 0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">Log in or create an account to see who's playing, chat, and join in.</p>

    ${ctaButtons()}`;
}

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || "";
  const canonicalUrl = `https://smashio.com.au/game/${id}`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  // Not a real game id shape — don't bother calling the RPC.
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
    return res.status(404).send(shell({
      title: "Smashio - Game not found",
      ogTitle: "Open this game in Smashio",
      ogDescription: "Smashio finds badminton games happening near you tonight in Sydney.",
      heroContent: notFoundHero({
        heading: "Game not found",
        body: "This link doesn't point to a real game. Install Smashio to find one nearby instead.",
      }),
    }));
  }

  let preview = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/game_preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_game_id: id }),
    });
    if (r.ok) {
      const rows = await r.json();
      preview = Array.isArray(rows) ? rows[0] : rows;
    }
  } catch {
    // Supabase unreachable — fall through to the generic card below rather than 500ing a share link.
  }

  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");

  if (!preview || preview.status === "cancelled") {
    return res.status(200).send(shell({
      title: "Smashio - Game not found",
      ogTitle: "Open this game in Smashio",
      ogDescription: "This game isn't available anymore. Smashio finds badminton games happening near you tonight in Sydney.",
      ogUrl: canonicalUrl,
      heroContent: notFoundHero({
        heading: "This game isn't available anymore",
        body: "It may have been cancelled or already happened. Install Smashio to find another game nearby.",
      }),
    }));
  }

  const when = fmtWhen(preview.starts_at);
  const cost = preview.cost_per_player_cents != null ? `$${(preview.cost_per_player_cents / 100).toFixed(0)}` : null;
  const ogTitle = `Badminton at ${preview.venue_name}`;
  const ogDescription = `${when} · ${preview.venue_suburb} · ${preview.skill_tier_label}${cost ? ` · ${cost}/player` : ""}. Join on Smashio.`;

  return res.status(200).send(shell({
    title: `Smashio - Badminton at ${preview.venue_name}`,
    ogTitle,
    ogDescription,
    ogUrl: canonicalUrl,
    heroContent: gameHero(preview),
  }));
};
