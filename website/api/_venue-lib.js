// Shared chrome for the venue SEO surface (gtm-plan.md G11): the per-venue page, the /sydney
// hub, and the dynamic sitemap all need the same Supabase call and the same dark/lime shell that
// api/game/[id].js already established. Filename starts with "_" so Vercel doesn't turn this
// into a route of its own (https://vercel.com/docs/functions — files/dirs starting with "_" are
// excluded from routing).
// Env override exists for local smoke-testing against `supabase start` — production has no env
// vars set for this static site, so it always falls through to the shipped hosted-project values.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ajbsvsfwjfeofvjuhzrw.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_VsirTXudBTJT4kNF4deNkw_hVl54eBx";

const TESTFLIGHT_URL = "https://testflight.apple.com/join/cJMZQmbn";
const ANDROID_BETA_MAILTO =
  "mailto:hello@smashio.com.au?subject=Android%20beta%20-%20add%20me&body=Hi%20Smashio%2C%20please%20add%20me%20to%20the%20Android%20beta.%20My%20Google%20account%20email%20is%3A";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function callRpc(name, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${name} ${r.status}`);
  return r.json();
}

// Shared head block + brand chrome. `indexable` controls whether crawlers are told to index this
// page — real venue content is, the generic not-found/thin fallback isn't (duplicate/empty pages
// hurt more than they help). `jsonLd` is an optional object serialised as a schema.org block.
function shell({ title, description, canonicalUrl, indexable, jsonLd, heroContent, bodyContent }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="${indexable ? "index, follow" : "noindex"}" />
${canonicalUrl ? `<link rel="canonical" href="${esc(canonicalUrl)}" />` : ""}
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png" />
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
<meta property="og:type" content="website" />
${canonicalUrl ? `<meta property="og:url" content="${esc(canonicalUrl)}" />` : ""}
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="https://smashio.com.au/assets/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="https://smashio.com.au/assets/og-image.png" />
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
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
  .chip { background:#141416; border:1px solid rgba(255,255,255,.08); color:#96969E; font-size:12px; font-weight:700; padding:6px 12px; border-radius:100px; }

  .nav-link { display: none; }
  @media (min-width: 640px) { .nav-link { display: inline-flex; } }

  .venue-card { display:block; background:#141416; border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:16px 18px; text-align:left; transition: transform .18s ease, border-color .18s ease; }
  .venue-card:hover { transform: translateY(-2px); border-color: rgba(214,255,63,.3); }
</style>
</head>
<body>

<div style="background:#0A0A0B; min-height:100vh; display:flex; flex-direction:column">

<header style="position:sticky; top:0; z-index:50; backdrop-filter:blur(18px); background:rgba(10,10,11,.72); border-bottom:1px solid rgba(255,255,255,.06)">
  <div style="max-width:880px; margin:0 auto; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px">
    <a href="/" style="display:flex; align-items:center; gap:9px; color:#F5F5F7">
      <img src="/assets/smashio-logo.png" alt="Smashio" style="width:30px; height:30px; object-fit:contain" />
      <span style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:19px; letter-spacing:-.02em">Smashio</span>
    </a>
    <a href="/sydney" class="nav-link" style="align-items:center; color:#96969E; font-size:13px; font-weight:600">All Sydney venues</a>
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

  <div style="position:relative; max-width:640px; margin:0 auto; padding:56px 20px 40px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:22px">
    ${heroContent}
  </div>

  ${bodyContent ? `<div style="position:relative; max-width:640px; margin:0 auto; padding:0 20px 56px">${bodyContent}</div>` : ""}
</section>

<footer style="border-top:1px solid rgba(255,255,255,.06)">
  <div style="max-width:640px; margin:0 auto; padding:22px 20px; display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; font-size:12px; color:#5C5C64">
    <span>© 2026 Smashio. Made in Sydney.</span>
    <span style="display:flex; gap:14px">
      <a href="/sydney" style="color:#5C5C64; font-size:12px">All venues</a>
      <a href="/privacy.html" style="color:#5C5C64; font-size:12px">Privacy</a>
    </span>
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
    <p class="rise rise-5" style="margin:0; font-size:12px; color:#5C5C64">Private beta. iPhone testers join through TestFlight; Android testers are added in batches.</p>`;
}

module.exports = { esc, callRpc, shell, ctaButtons };
