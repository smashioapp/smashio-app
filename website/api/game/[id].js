// Server-rendered per-game landing page for shared /game/:id links (gtm-plan.md G3).
// Crawlers (WhatsApp/iMessage/Facebook/Slack link previews) don't execute JS, so the old
// rewrite straight to index.html always showed the generic homepage: no venue, no time, same
// image for every game. This is a single Vercel serverless function — no bundler, no build step,
// matching the rest of website/ — that renders real OG tags per game at request time.
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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtWhen(startsAt) {
  const d = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" }).format(d);
  const time = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Sydney" }).format(d);
  return `${day} · ${time}`;
}

function shell({ title, ogTitle, ogDescription, ogUrl, heading, sub, stats, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="robots" content="noindex" />
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
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
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
<style>
  body { margin:0; background:#0A0A0B; color:#F5F5F7; font-family:Manrope,system-ui,sans-serif; -webkit-font-smoothing:antialiased; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; box-sizing:border-box; }
  a { color:#D6FF3F; text-decoration:none; }
  .card { max-width:420px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:16px; }
  h1 { margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:26px; letter-spacing:-.02em; }
  p { margin:0; font-size:14.5px; line-height:1.6; color:#96969E; }
  .stats { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin:2px 0 4px; }
  .stat { background:#141416; border:1px solid rgba(255,255,255,.10); padding:8px 14px; border-radius:12px; font-size:13px; font-weight:700; color:#F5F5F7; }
  .btn { display:flex; align-items:center; justify-content:center; gap:10px; background:#141416; border:1px solid rgba(255,255,255,.10); padding:12px 20px; border-radius:14px; color:#F5F5F7; font-size:14px; font-weight:700; width:100%; box-sizing:border-box; }
</style>
</head>
<body>
  <div class="card">
    <img src="/assets/smashio-logo.png" alt="Smashio" style="width:44px; height:44px; object-fit:contain" />
    <h1>${esc(heading)}</h1>
    ${sub ? `<p style="color:#D6FF3F; font-weight:700; font-size:13.5px; margin-top:-8px;">${esc(sub)}</p>` : ""}
    ${stats ? `<div class="stats">${stats}</div>` : ""}
    <p>${esc(body)}</p>
    <a class="btn" href="${TESTFLIGHT_URL}" target="_blank" rel="noopener">Join the iOS beta (TestFlight)</a>
    <a class="btn" href="${ANDROID_BETA_MAILTO}">Ask for the Android beta</a>
    <a href="/">&larr; Back to smashio.com.au</a>
  </div>
</body>
</html>`;
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
      heading: "Game not found",
      body: "This link doesn't point to a real game. Install Smashio to find one nearby instead.",
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
      heading: "This game isn't available anymore",
      body: "It may have been cancelled or already happened. Install Smashio to find another game nearby.",
    }));
  }

  const when = fmtWhen(preview.starts_at);
  const cost = preview.cost_per_player_cents != null ? `$${(preview.cost_per_player_cents / 100).toFixed(0)}` : null;
  const ogTitle = `Badminton at ${preview.venue_name}`;
  const ogDescription = `${when} · ${preview.venue_suburb} · ${preview.skill_tier_label}${cost ? ` · ${cost}/player` : ""}. Join on Smashio.`;
  const stats = [
    cost ? `<span class="stat">${esc(cost)}/player</span>` : "",
    `<span class="stat">Up to ${esc(preview.max_players)}</span>`,
    `<span class="stat">${esc(preview.skill_tier_label)}</span>`,
  ].filter(Boolean).join("");

  return res.status(200).send(shell({
    title: `Smashio - Badminton at ${preview.venue_name}`,
    ogTitle,
    ogDescription,
    ogUrl: canonicalUrl,
    heading: preview.venue_name,
    sub: `${when} · ${preview.venue_suburb}`,
    stats,
    body: "Log in or create an account in Smashio to see who's playing, chat, and join in.",
  }));
};
