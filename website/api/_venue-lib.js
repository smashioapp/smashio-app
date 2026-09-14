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
// Internal test track: the opt-in link only works once the tester's Google account is on the list.
const PLAY_BETA_URL = "https://play.google.com/apps/internaltest/4701589643775421350";

// Same project ui/lib/analytics.ts writes to — a write-only key, safe to embed the same way the
// Supabase anon key above already is (website-plan.md W1). Nothing here reads the key back out.
const POSTHOG_KEY = "phc_yoGdyfhrcu6GoAMxVNb37xquGmRLumfrVbK8r4FLoST2";
const POSTHOG_HOST = "https://us.i.posthog.com";

// Turnstile site key — public by design (ships in every page's HTML). The secret key that
// verifies tokens server-side lives only in Vercel's TURNSTILE_SECRET_KEY env var (subscribe.js).
// A TURNSTILE_SITE_KEY env var overrides it (read in captureFormScript) so local testing can use
// Cloudflare's dummy keys — the real key is hostname-locked and always fails on localhost.
const TURNSTILE_SITE_KEY = "0x4AAAAAAEzfKOQc4g1Cy4MT";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// JSON.stringify escapes neither `<` nor `/`, so a value containing `</script>` closes the tag
// early and whatever follows parses as HTML (security-audit-2026-09-11.md H7).
function escapeJsonLd(obj) {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LS).join("\\u2028")
    .split(PS).join("\\u2029");
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
  // void-returning RPCs (e.g. web_signup) come back 204 No Content — .json() throws on an empty body.
  if (r.status === 204) return null;
  return r.json();
}

// web_signup() is service_role-only as of security-audit-2026-09-11.md M6: the anon key above is
// public by construction (it's hardcoded here and in the mobile app bundle), so granting it to
// anon meant anyone could call the RPC directly and skip subscribe.js's honeypot/rate-limit
// entirely. This needs SUPABASE_SERVICE_ROLE_KEY set in the Vercel project's env vars — it is not
// set yet, so until it is, signups fail closed with a clear log line rather than silently using
// the (now unauthorized) anon key.
async function callServiceRpc(name, body) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(`${name}: SUPABASE_SERVICE_ROLE_KEY not set in this environment`);
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${name} ${r.status} ${await r.text().catch(() => "")}`);
  if (r.status === 204) return null;
  return r.json();
}

// Shared head block + brand chrome. `indexable` controls whether crawlers are told to index this
// page — real venue content is, the generic not-found/thin fallback isn't (duplicate/empty pages
// hurt more than they help). `jsonLd` is an optional object serialised as a schema.org block.
function shell({ title, description, canonicalUrl, indexable, jsonLd, heroContent, bodyContent, ogType, captureSuburb }) {
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
<meta property="og:type" content="${esc(ogType || "website")}" />
${canonicalUrl ? `<meta property="og:url" content="${esc(canonicalUrl)}" />` : ""}
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="https://smashio.com.au/assets/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${esc(title)}" />
<meta property="og:site_name" content="Smashio" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="https://smashio.com.au/assets/og-image.png" />
${jsonLd ? `<script type="application/ld+json">${escapeJsonLd(jsonLd)}</script>` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
<script type="module" src="/assets/ionicons/ionicons.esm.js"></script>
<script defer src="/_vercel/insights/script.js"></script>
<style>
  html { scroll-behavior: smooth; scrollbar-color: #3A3A40 #0E0E10; scrollbar-width: thin; }
  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track { background: #0E0E10; }
  ::-webkit-scrollbar-thumb { background: #3A3A40; border-radius: 8px; border: 3px solid #0E0E10; }
  ::-webkit-scrollbar-thumb:hover { background: #9FE020; }
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

  /* v2 shared chrome (website-design-brief.md) — platform-aware CTA label, no layout shift, no JS
     required for the default (both-platforms) label to render. */
  .compact-cta .l { display:none; } .compact-cta .l-default { display:inline; }
  html[data-platform] .compact-cta .l-default { display:none; }
  html[data-platform=ios] .compact-cta .l-ios { display:inline; }
  html[data-platform=android] .compact-cta .l-android { display:inline; }
  html[data-platform=desktop] .compact-cta .l-desktop { display:inline; }

  /* cta-variant: full-size CTA button group (ctaButtons()) — separate from the .l/.compact-cta
     label swap above since these need display:flex, not inline, once shown per platform. */
  .cta-variant { display:none; }
  .cta-variant.cta-default { display:flex; }
  html[data-platform] .cta-variant.cta-default { display:none; }
  html[data-platform=ios] .cta-variant.cta-ios { display:flex; }
  html[data-platform=android] .cta-variant.cta-android { display:flex; }
  html[data-platform=desktop] .cta-variant.cta-desktop { display:flex; }
  .betastrip { display:flex; align-items:center; justify-content:center; gap:6px; padding:8px 16px; background:#141416; font-size:11.5px; color:#C7C7CE; font-weight:600; border-bottom:1px solid rgba(255,255,255,.06); text-align:center; }
  .betastrip b { color:#9FE020; font-weight:800; }
  .livedot { width:6px; height:6px; border-radius:50%; background:#9FE020; box-shadow:0 0 0 3px rgba(159,224,32,.2); flex-shrink:0; display:inline-block; }
  .install-compact { display:flex; flex-direction:column; gap:10px; max-width:420px; margin:0 auto; }
  .install-compact input[type=email] { height:46px; border-radius:100px; background:#141416; border:1px solid rgba(255,255,255,.10); color:#F5F5F7; padding:0 16px; font-size:13px; font-family:Manrope; flex:1; min-width:0; }
  .install-compact input[type=email]::placeholder { color:#7A7A82; }
${captureFormStyles()}
</style>
</head>
<body>

<script>(function(){function plat(){var ua=navigator.userAgent;if(/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))return'ios';if(/Android/.test(ua))return'android';return'desktop';}document.documentElement.setAttribute('data-platform',plat());})();</script>

<div style="background:#0A0A0B; min-height:100vh; display:flex; flex-direction:column">

<div class="betastrip">
  <span class="livedot"></span>
  <span>Private beta &middot; iOS on TestFlight, Android by invite &middot; public launch Nov 2026</span>
</div>

<header style="position:sticky; top:0; z-index:50; backdrop-filter:blur(18px); background:rgba(10,10,11,.72); border-bottom:1px solid rgba(255,255,255,.06)">
  <div style="max-width:1180px; margin:0 auto; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px">
    <a href="/" style="display:flex; align-items:center; gap:6px; color:#F5F5F7">
      <img src="/assets/smashio-mark.svg" alt="Smashio" style="width:17px; height:17px" />
      <span style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:19px; letter-spacing:-.02em">Smashio</span>
    </a>
    <nav style="display:flex; align-items:center; gap:26px">
      <a href="/sydney" class="nav-link" style="color:#96969E; font-size:13px; font-weight:600">Sydney</a>
      <a href="/sydney" class="nav-link" style="color:#96969E; font-size:13px; font-weight:600">Venues</a>
      <a href="/guides/cost-of-badminton-in-sydney" class="nav-link" style="color:#96969E; font-size:13px; font-weight:600">Guides</a>
      <a href="#install" class="compact-cta" style="background:linear-gradient(135deg,#EBFF7A,#AEE62A); color:#0A0A0B; font-size:13px; font-weight:800; padding:9px 16px; border-radius:100px">
        <span class="l l-default">Get the app</span><span class="l l-ios">Join on TestFlight</span><span class="l l-android">Request access</span><span class="l l-desktop">Get the app</span>
      </a>
    </nav>
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

<div id="install" style="border-top:1px solid rgba(255,255,255,.06); background:#0E0E10; padding:32px 20px; text-align:center">
  <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:100px; background:rgba(214,255,63,.1); border:1px solid rgba(214,255,63,.25); font-size:11px; font-weight:800; color:#9FE020; margin-bottom:16px">
    <span class="livedot"></span>PRIVATE BETA
  </div>
  ${ctaButtons()}
</div>

<footer style="border-top:1px solid rgba(255,255,255,.06)">
  <div style="max-width:640px; margin:0 auto; padding:22px 20px 14px">
    ${captureForm(captureSuburb)}
  </div>
  <div style="max-width:640px; margin:0 auto; padding:14px 20px 22px; display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; font-size:12px; color:#5C5C64; border-top:1px solid rgba(255,255,255,.06)">
    <span>© 2026 Smashio. Sydney, Australia.</span>
    <span style="display:flex; gap:14px; flex-wrap:wrap">
      <a href="/sydney" style="color:#5C5C64; font-size:12px">All venues</a>
      <a href="/guides/cost-of-badminton-in-sydney" style="color:#5C5C64; font-size:12px">Guides</a>
      <a href="/privacy.html" style="color:#5C5C64; font-size:12px">Privacy</a>
      <a href="/terms.html" style="color:#5C5C64; font-size:12px">Terms</a>
    </span>
  </div>
</footer>

</div>

${captureFormScript()}
${analyticsScripts()}

</body>
</html>`;
}

// Footer capture form (W4, gtm-plan G15). Posts to /api/subscribe rather than inserting directly
// — see that file's header for why. Honeypot field is visually hidden, not `type="hidden"`, since
// some scrapers skip hidden inputs but still fill anything visually offscreen.
// `suburb` (W6) tags a suburb-page submission with the suburb the visitor was reading about, so
// web_signup's p_suburb column (already there since W4) carries real intent instead of null.
function captureForm(suburb) {
  return requestForm({
    source: suburb ? "suburb_page" : "footer",
    label: "Notify me",
    placeholder: suburb ? `Tell me when a game opens in ${suburb}` : "you@example.com",
    suburb,
  });
}

// Signup robustness phase 2 (2026-09-14): the one email-capture component behind every form on
// the site (home install card and footer, shell footer, compact Android CTA). Markup here, styles
// in captureFormStyles() (must be in the page's <head>), behaviour in captureFormScript().
// - variant "stacked": field over a full-width button, for the 260-280px install columns
// - variant "inline": field and button share a row and wrap when narrow
// - tone "primary" (lime) | "secondary" (outline); align "center" centres wrapped rows
// Android sources get a success card with the allowlist next steps; everything else a short one.
let requestFormSeq = 0;
function requestForm({ source, label, variant = "inline", tone = "primary", align = "start", placeholder = "you@email.com", ariaLabel = "Email address", helper = "", suburb = "" }) {
  const id = `sf${++requestFormSeq}`;
  const android = source.includes("android");
  const suburbField = suburb ? `<input type="hidden" name="suburb" value="${esc(suburb)}" />` : "";
  const doneBody = android
    ? `<p class="sf-done-sub">We'll add <b data-sf-email></b> to the Android beta.</p>
      <ol class="sf-steps">
        <li><span class="sf-n">1</span><span>We add your Google account<small>Usually within a day</small></span></li>
        <li><span class="sf-n">2</span><span>You get an email with the Play link<small>Check spam if it's not there</small></span></li>
        <li><span class="sf-n">3</span><span>Tap Become a tester, then install<small>On the phone signed in to that account</small></span></li>
      </ol>`
    : `<p class="sf-done-sub">We've sent a note to <b data-sf-email></b>, and we'll ping you when there's a game near you.</p>`;
  return `
    <div class="sf sf-${variant} sf-${tone}${align === "center" ? " sf-center" : ""}" data-sf>
      <form class="sf-form" data-source="${esc(source)}" novalidate>
        <div class="sf-hp" aria-hidden="true"><label for="${id}-website">Leave this field empty</label><input type="text" id="${id}-website" name="website" tabindex="-1" autocomplete="off" /></div>
        ${suburbField}
        <input class="sf-input" id="${id}-email" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="${esc(placeholder)}" aria-label="${esc(ariaLabel)}" aria-describedby="${id}-msg" />
        <button class="sf-btn" type="submit"><span class="sf-spin" aria-hidden="true"></span><span class="sf-label" data-label="${esc(label)}">${esc(label)}</span></button>
        <span class="sf-sr" aria-live="polite"></span>
        <p class="sf-msg" id="${id}-msg" role="status" aria-live="polite" data-default="${esc(helper)}">${esc(helper)}</p>
      </form>
      <div class="sf-done" hidden>
        <div class="sf-done-top">
          <span class="sf-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#D6FF3F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
          <p class="sf-done-h" tabindex="-1">You're on the list</p>
        </div>
        ${doneBody}
        <button type="button" class="sf-again">Wrong email? Use a different one</button>
      </div>
    </div>`;
}

// Hardcoded hex rather than CSS vars: home.js defines tokens, the shell pages don't. `.sf .sf-input`
// (0,2,0) deliberately outranks home.js's global `input[type=email]` (0,1,1). The -8px margins
// cancel the form's 8px flex gap for rows that are empty (status line, Turnstile slot).
function captureFormStyles() {
  return `
  .sf { position:relative; font-family:Manrope, system-ui, sans-serif; }
  .sf [hidden] { display:none !important; }
  .sf-form { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0; }
  .sf-center .sf-form { justify-content:center; }
  .sf-center .sf-input { flex-basis:220px; }
  .sf-hp { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
  .sf-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
  .sf .sf-input { flex:1 1 140px; min-width:0; height:48px; box-sizing:border-box; margin:0; border-radius:100px; background:#141416; border:1px solid rgba(255,255,255,.12); color:#F5F5F7; padding:0 18px; font:600 14px/1 Manrope, system-ui, sans-serif; transition:border-color .15s, box-shadow .15s; }
  .sf .sf-input::placeholder { color:#7A7A82; font-weight:500; }
  .sf .sf-input:focus { outline:none; border-color:rgba(214,255,63,.6); box-shadow:0 0 0 4px rgba(214,255,63,.12); }
  .sf .sf-input[aria-invalid="true"] { border-color:#FF6767; box-shadow:0 0 0 4px rgba(255,103,103,.12); }
  .sf .sf-btn { flex:0 0 auto; height:48px; box-sizing:border-box; margin:0; border-radius:100px; padding:0 20px; display:inline-flex; align-items:center; justify-content:center; gap:8px; font:800 14px/1 Manrope, system-ui, sans-serif; white-space:nowrap; cursor:pointer; transition:filter .15s, transform .1s; }
  .sf-primary .sf-btn { background:linear-gradient(135deg,#EBFF7A,#AEE62A); color:#0A0A0B; border:0; box-shadow:0 0 30px rgba(214,255,63,.18); }
  .sf-secondary .sf-btn { background:transparent; color:#F5F5F7; border:1.5px solid rgba(255,255,255,.18); }
  .sf .sf-btn:hover { filter:brightness(1.06); }
  .sf .sf-btn:active { transform:scale(.98); }
  .sf .sf-btn:focus-visible { outline:2px solid #F5F5F7; outline-offset:3px; }
  .sf .sf-btn[aria-busy="true"] { cursor:progress; filter:saturate(.75) brightness(.92); transform:none; }
  .sf-spin { display:none; width:15px; height:15px; box-sizing:border-box; border-radius:50%; border:2.5px solid currentColor; border-right-color:transparent; opacity:.8; animation:sf-spin .7s linear infinite; }
  .sf .sf-btn[aria-busy="true"] .sf-spin { display:inline-block; }
  @keyframes sf-spin { to { transform:rotate(360deg); } }
  .sf-stacked .sf-input, .sf-stacked .sf-btn { flex:1 1 100%; height:50px; }
  .sf-msg { flex:1 1 100%; width:0; min-width:100%; margin:0; font-size:12px; line-height:1.45; color:#7A7A82; }
  .sf-msg:empty { margin-top:-8px; }
  .sf-msg[data-tone="ok"] { color:#D6FF3F; }
  .sf-msg[data-tone="warn"] { color:#FFB648; }
  .sf-msg[data-tone="bad"] { color:#FF6767; }
  .sf-done { display:flex; flex-direction:column; gap:12px; max-width:340px; text-align:left; animation:sf-rise .3s ease-out; }
  @keyframes sf-rise { from { opacity:.3; transform:translateY(6px); } to { opacity:1; transform:none; } }
  .sf-done-top { display:flex; align-items:center; gap:10px; }
  .sf-tick { flex:0 0 34px; width:34px; height:34px; box-sizing:border-box; border-radius:50%; display:grid; place-items:center; background:rgba(214,255,63,.12); border:1.5px solid #D6FF3F; }
  .sf-tick svg { width:16px; height:16px; }
  .sf-done-h { margin:0; font:700 17px/1.2 'Space Grotesk', system-ui, sans-serif; letter-spacing:-.01em; color:#F5F5F7; outline:none; }
  .sf-done-sub { margin:0; font-size:13px; line-height:1.45; color:#96969E; overflow-wrap:anywhere; }
  .sf-done-sub b { color:#F5F5F7; font-weight:700; }
  .sf-steps { list-style:none; margin:0; padding:0; border-top:1px solid rgba(255,255,255,.08); }
  .sf-steps li { display:grid; grid-template-columns:18px 1fr; gap:8px; padding:9px 0; border-bottom:1px solid rgba(255,255,255,.08); font-size:13px; line-height:1.35; color:#C7C7CE; }
  .sf-steps small { display:block; margin-top:2px; font-size:11.5px; color:#7A7A82; }
  .sf-n { font:500 11px/1.6 ui-monospace, Consolas, monospace; color:#D6FF3F; }
  .sf-again { align-self:flex-start; background:none; border:0; padding:0; color:#96969E; font:600 12.5px/1.4 Manrope, system-ui, sans-serif; text-decoration:underline; text-underline-offset:3px; cursor:pointer; }
  .sf-again:hover { color:#F5F5F7; }
  .sf-again:focus-visible { outline:2px solid #D6FF3F; outline-offset:2px; }
  @media (prefers-reduced-motion: reduce) { .sf-spin { animation-duration:2.4s; } .sf-done { animation:none; } .sf .sf-btn, .sf .sf-input { transition:none; } }`;
}

// M6 (security-audit-2026-09-11, DEC7) + signup robustness phase 1 (2026-09-14). Verified
// server-side in subscribe.js — the client-side check here only gates the UX. What phase 1 fixed:
// - every form's status line lives inside the form (now `.sf-msg`, see requestForm); the old
//   lookup missed the home page install-card forms entirely, so they never showed anything
// - each form renders its own Turnstile widget into a slot inside the form, so an interactive
//   challenge shows under the field instead of appended below the footer
// - nothing can hang: Turnstile gets an 8 s ceiling (stretched only once it asks for a tap), the
//   fetch aborts at 12 s, and a non-JSON error page falls back to its status code
// - each subscribe.js error code gets its own message instead of one generic line
function captureFormScript() {
  const siteKey = process.env.TURNSTILE_SITE_KEY || TURNSTILE_SITE_KEY;
  return `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
<script>
(function () {
  var TURNSTILE_SITE_KEY = ${JSON.stringify(siteKey)};
  var TOKEN_WAIT_MS = 8000;
  var INTERACTIVE_WAIT_MS = 60000;
  var FETCH_TIMEOUT_MS = 12000;
  var EMAIL_RE = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/;
  // Keyed by subscribe.js error codes plus two client-side ones. Only network and server failures
  // invite a straight retry: retrying a rate limit or a failed bot check never helps.
  var MESSAGES = {
    invalid_email: ["That email doesn't look right, have another look.", "bad"],
    rate_limited: ["Too many tries from this connection. Give it an hour, or email hello@smashio.com.au and we'll add you.", "warn"],
    turnstile_failed: ["We couldn't confirm you're a person. Refresh the page and give it another go.", "warn"],
    turnstile_unavailable: ["Our bot check didn't load. Refresh the page, or email hello@smashio.com.au if it keeps happening.", "warn"],
    network: ["Couldn't reach Smashio. Check your connection and have another go, your email's still there.", "bad"],
    server: ["Something's gone wrong on our end. Have another go, or email hello@smashio.com.au.", "bad"]
  };

  // The api.js tag is async, so a fast submit can beat it. Poll until it lands or the deadline.
  function whenTurnstileLoaded(deadline) {
    return new Promise(function (resolve) {
      (function check() {
        if (window.turnstile) return resolve(window.turnstile);
        if (Date.now() >= deadline) return resolve(null);
        setTimeout(check, 100);
      })();
    });
  }

  // One widget per form, rendered on first submit into a slot before the status line. Collapsed
  // (zero height, -8px margin cancelling the form's flex gap) until Cloudflare asks for a tap —
  // not display:none, so the widget still runs. width:0 + min-width:100% keeps a compact widget
  // from widening a shrink-to-fit form.
  var SLOT_COLLAPSED = "height:0; overflow:hidden; margin-top:-8px";
  var SLOT_OPEN = "height:auto; overflow:visible; margin-top:0";
  function widgetFor(form, ts) {
    if (form._turnstile) return form._turnstile;
    var w = form._turnstile = { id: null, used: false, settle: null, onInteractive: null };
    var slot = document.createElement("div");
    slot.setAttribute("data-turnstile-slot", "");
    slot.style.cssText = "flex-basis:100%; width:0; min-width:100%; " + SLOT_COLLAPSED;
    form.insertBefore(slot, form.querySelector(".sf-msg"));
    function done(token) { if (w.settle) w.settle(token || ""); }
    w.id = ts.render(slot, {
      sitekey: TURNSTILE_SITE_KEY,
      execution: "execute",
      appearance: "interaction-only",
      size: form.clientWidth < 300 ? "compact" : "normal",
      retry: "never",
      "refresh-expired": "never",
      callback: function (token) { done(token); },
      "error-callback": function () { done(""); return true; },
      "expired-callback": function () { done(""); },
      "timeout-callback": function () { done(""); },
      "unsupported-callback": function () { done(""); },
      "before-interactive-callback": function () { slot.style.cssText += "; " + SLOT_OPEN; if (w.onInteractive) w.onInteractive(); },
      "after-interactive-callback": function () { slot.style.cssText += "; " + SLOT_COLLAPSED; }
    });
    return w;
  }

  // Resolves to a token, "" when Cloudflare said no or ran out of time, or null when the Turnstile
  // script never loaded (blocked or offline). Never hangs.
  function getTurnstileToken(form) {
    var started = Date.now();
    return whenTurnstileLoaded(started + TOKEN_WAIT_MS).then(function (ts) {
      if (!ts) return null;
      return new Promise(function (resolve) {
        var w, timer;
        function arm(ms) { clearTimeout(timer); timer = setTimeout(function () { finish(""); }, ms); }
        function finish(token) {
          clearTimeout(timer);
          // Only clear the widget's hooks if they're still ours: a stale call timing out must not
          // unhook a newer call that has since taken over the same widget.
          if (w && w.settle === finish) { w.settle = null; w.onInteractive = null; }
          resolve(token);
        }
        arm(Math.max(TOKEN_WAIT_MS - (Date.now() - started), 3000));
        try {
          w = widgetFor(form, ts);
          w.settle = finish;
          w.onInteractive = function () { arm(INTERACTIVE_WAIT_MS); };
          // Tokens are single-use: clear the previous one before asking for another.
          if (w.used) ts.reset(w.id);
          w.used = true;
          ts.execute(w.id);
        } catch (err) {
          finish("");
        }
      });
    });
  }

  // A Vercel error page or proxy hiccup is HTML, not JSON: fall back to the status code.
  function readResponse(r) {
    return r.text().then(function (text) {
      var data = null;
      try { data = JSON.parse(text); } catch (err) { data = null; }
      if (!data || typeof data !== "object") data = {};
      data.status = r.status;
      return data;
    });
  }

  function errorKey(data) {
    if (data.error && MESSAGES[data.error]) return data.error;
    if (data.status === 400) return "invalid_email";
    if (data.status === 403) return "turnstile_failed";
    if (data.status === 429) return "rate_limited";
    return "server";
  }

  function wire(root) {
    var form = root.querySelector(".sf-form");
    var done = root.querySelector(".sf-done");
    var input = form.querySelector(".sf-input");
    var btn = form.querySelector(".sf-btn");
    var label = btn.querySelector(".sf-label");
    var msg = form.querySelector(".sf-msg");
    var sr = form.querySelector(".sf-sr");
    var source = form.getAttribute("data-source") || "footer";
    var suburbField = form.querySelector('[name="suburb"]');
    var busy = false;
    var warm = null;
    var shownError = null;

    function status(text, tone) {
      msg.textContent = text;
      if (tone) msg.setAttribute("data-tone", tone); else msg.removeAttribute("data-tone");
    }
    function restoreStatus() {
      shownError = null;
      status(msg.getAttribute("data-default") || "", "");
    }

    // Width is locked on the first busy state so swapping the label for spinner + "Sending"
    // doesn't make the button jump. The visual label isn't announced, so .sf-sr carries it.
    function setBusy(text) {
      if (!busy) btn.style.minWidth = btn.offsetWidth + "px";
      busy = true;
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      label.textContent = text;
      sr.textContent = text + "…";
    }
    function endBusy() {
      busy = false;
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.style.minWidth = "";
      label.textContent = label.getAttribute("data-label");
      sr.textContent = "";
    }
    // The typed email is never cleared on failure.
    function fail(key) {
      endBusy();
      shownError = key;
      status(MESSAGES[key][0], MESSAGES[key][1]);
      if (key === "invalid_email") {
        input.setAttribute("aria-invalid", "true");
        input.focus();
      }
    }
    function succeed(email) {
      endBusy();
      root.querySelectorAll("[data-sf-email]").forEach(function (el) { el.textContent = email; });
      form.hidden = true;
      done.hidden = false;
      var heading = done.querySelector(".sf-done-h");
      if (heading) heading.focus({ preventScroll: true });
      if (window.posthog) window.posthog.capture("web_signup", { source: source });
    }

    // Warm a token on focus so it's usually ready by submit. Tokens live 300 s; one older than
    // 240 s is dropped rather than risk it expiring in flight.
    input.addEventListener("focus", function () {
      if (warm || busy) return;
      warm = { at: Date.now(), promise: getTurnstileToken(form) };
    });
    function takeToken() {
      var w = warm;
      warm = null;
      if (!w || Date.now() - w.at > 240000) return getTurnstileToken(form);
      // "" means Cloudflare said no or timed out, worth one fresh try. null means the script
      // never loaded, and another 8 s wait won't change that.
      return w.promise.then(function (token) { return token === "" ? getTurnstileToken(form) : token; });
    }

    input.addEventListener("input", function () {
      if (shownError !== "invalid_email") return;
      input.removeAttribute("aria-invalid");
      restoreStatus();
    });

    root.querySelector(".sf-again").addEventListener("click", function () {
      done.hidden = true;
      form.hidden = false;
      restoreStatus();
      input.focus();
      input.select();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      var email = input.value.trim();
      if (!EMAIL_RE.test(email)) return fail("invalid_email");
      input.removeAttribute("aria-invalid");
      restoreStatus();
      setBusy("Checking");

      takeToken()
        .then(function (token) {
          if (token === null) return fail("turnstile_unavailable");
          if (!token) return fail("turnstile_failed");
          setBusy("Sending");
          var controller = typeof AbortController === "function" ? new AbortController() : null;
          var timer = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : null;
          return fetch("/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email, website: form.website.value, suburb: suburbField ? suburbField.value : "", source: source, turnstileToken: token }),
            signal: controller ? controller.signal : undefined
          })
            .then(readResponse)
            .then(function (data) {
              clearTimeout(timer);
              if (data.ok) return succeed(email);
              fail(errorKey(data));
            }, function () {
              clearTimeout(timer);
              fail("network");
            });
        })
        .catch(function () { fail("server"); });
    });
  }
  document.querySelectorAll("[data-sf]").forEach(wire);
})();
</script>`;
}

// PostHog web snippet (website-plan.md W1) plus a delegated click listener that tags every store
// badge (TestFlight/Play) so a web session ending in an install is attributable — the whole point
// of shipping this before anything else in the plan (§6, "everything after it is unmeasurable
// without it"). Autocapture/pageview off by default in the snippet's own config would be the
// safer default on most sites, but this site's entire job is the page-to-install funnel, so
// pageviews stay on and nothing else is tracked beyond this one click event.
function analyticsScripts() {
  return `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSurveysCompleted".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init("${POSTHOG_KEY}", { api_host: "${POSTHOG_HOST}", person_profiles: "identified_only" });
document.addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest("a[href]");
  if (!a) return;
  var href = a.href || "";
  var store = href.indexOf("testflight.apple.com") !== -1 ? "ios" : href.indexOf("play.google.com") !== -1 ? "android" : null;
  if (!store) return;
  posthog.capture("store_link_click", { store: store, page: location.pathname });
});
</script>`;
}

// Platform-aware install CTA (website-design-brief.md §Install block). iOS is one tap to
// TestFlight; Android is invite-only during beta so it's an email-request form, not a link — the
// asymmetry is drawn, not hidden behind two identical-looking buttons (AGENTS.md Android note).
function ctaButtons() {
  return `
    <div class="rise rise-4 compact-cta" style="display:flex; justify-content:center; width:100%">
      <div class="cta-variant cta-default" style="flex-wrap:wrap; gap:12px; justify-content:center; align-items:center; width:100%">
        <a class="btn btn-primary" style="width:auto" href="${TESTFLIGHT_URL}" target="_blank" rel="noopener">
          <ion-icon name="logo-apple" style="font-size:22px"></ion-icon>
          <span class="btn-label"><span class="btn-eyebrow">Join the</span><span class="btn-main">TestFlight beta</span></span>
        </a>
        ${androidRequestForm()}
      </div>
      <div class="cta-variant cta-ios" style="justify-content:center; width:100%">
        <a class="btn btn-primary" style="width:auto" href="${TESTFLIGHT_URL}" target="_blank" rel="noopener">
          <ion-icon name="logo-apple" style="font-size:22px"></ion-icon>
          <span class="btn-label"><span class="btn-eyebrow">Join the</span><span class="btn-main">TestFlight beta</span></span>
        </a>
      </div>
      <div class="cta-variant cta-android" style="justify-content:center; width:100%">${androidRequestForm()}</div>
      <div class="cta-variant cta-desktop" style="flex-wrap:wrap; gap:12px; justify-content:center; align-items:center; width:100%">
        <a class="btn btn-primary" style="width:auto" href="${TESTFLIGHT_URL}" target="_blank" rel="noopener">
          <ion-icon name="logo-apple" style="font-size:22px"></ion-icon>
          <span class="btn-label"><span class="btn-eyebrow">Join the</span><span class="btn-main">TestFlight beta</span></span>
        </a>
        ${androidRequestForm()}
      </div>
    </div>
    <p class="rise rise-5" style="margin:10px 0 0; font-size:12px; color:#5C5C64">Private beta. Android's invite only while we sort the allowlist, drop your email and we'll add your Google account within a day.</p>`;
}

function androidRequestForm() {
  return requestForm({
    source: "install_compact_android",
    label: "Request access",
    tone: "secondary",
    align: "center",
    placeholder: "you@gmail.com",
    ariaLabel: "Email for Android beta",
  });
}

module.exports = { esc, escapeJsonLd, callRpc, callServiceRpc, shell, ctaButtons, captureForm, requestForm, captureFormStyles, captureFormScript, analyticsScripts };
