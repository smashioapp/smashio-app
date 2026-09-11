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
<script type="module" src="https://unpkg.com/ionicons@7.4.0/dist/ionicons/ionicons.esm.js"></script>
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
  .betastrip { display:flex; align-items:center; justify-content:center; gap:6px; padding:8px 16px; background:#141416; font-size:11.5px; color:#C7C7CE; font-weight:600; border-bottom:1px solid rgba(255,255,255,.06); text-align:center; }
  .betastrip b { color:#9FE020; font-weight:800; }
  .livedot { width:6px; height:6px; border-radius:50%; background:#9FE020; box-shadow:0 0 0 3px rgba(159,224,32,.2); flex-shrink:0; display:inline-block; }
  .install-compact { display:flex; flex-direction:column; gap:10px; max-width:420px; margin:0 auto; }
  .install-compact input[type=email] { height:46px; border-radius:100px; background:#141416; border:1px solid rgba(255,255,255,.10); color:#F5F5F7; padding:0 16px; font-size:13px; font-family:Manrope; flex:1; min-width:0; }
  .install-compact input[type=email]::placeholder { color:#7A7A82; }
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
  const suburbField = suburb
    ? `<input type="hidden" name="suburb" value="${esc(suburb)}" />`
    : "";
  const placeholder = suburb ? `Tell me when a game opens in ${esc(suburb)}` : "you@example.com";
  return `
    <form id="smashio-capture-form" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center">
      <div style="position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden" aria-hidden="true">
        <label for="smashio-capture-website">Leave this field empty</label>
        <input type="text" id="smashio-capture-website" name="website" tabindex="-1" autocomplete="off" />
      </div>
      ${suburbField}
      <input type="email" name="email" required placeholder="${placeholder}" aria-label="Email address"
        style="flex:1; min-width:180px; background:#141416; border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:11px 14px; color:#F5F5F7; font-size:13px; font-family:inherit" />
      <button type="submit" class="btn btn-primary" style="width:auto; padding:11px 18px">
        <span class="btn-main" style="font-size:13px">Notify me</span>
      </button>
      <p id="smashio-capture-msg" style="width:100%; margin:0; font-size:12px; color:#7A7A82"></p>
    </form>`;
}

function captureFormScript() {
  return `<script>
(function () {
  function wire(form) {
    var msg = form.querySelector(".smashio-capture-msg, .smashio-install-msg") || document.getElementById("smashio-capture-msg");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      var website = form.website.value;
      var suburbField = form.querySelector('[name="suburb"]');
      var source = form.getAttribute("data-source") || (suburbField ? "suburb_page" : "footer");
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, website: website, suburb: suburbField ? suburbField.value : "", source: source }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          btn.disabled = false;
          if (data.ok) {
            if (msg) { msg.textContent = "Sorted, we'll add you and email you back."; msg.style.color = "#D6FF3F"; }
            form.reset();
            if (window.posthog) window.posthog.capture("web_signup", { source: source });
          } else if (msg) {
            msg.textContent = "That didn't work, mind trying again?";
            msg.style.color = "#FF6767";
          }
        })
        .catch(function () {
          btn.disabled = false;
          if (msg) { msg.textContent = "That didn't work, mind trying again?"; msg.style.color = "#FF6767"; }
        });
    });
  }
  document.querySelectorAll("#smashio-capture-form, .smashio-install-form").forEach(wire);
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
      <div class="l l-default" style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; width:100%">
        <a class="btn btn-primary" style="width:auto" href="${TESTFLIGHT_URL}" target="_blank" rel="noopener">
          <ion-icon name="logo-apple" style="font-size:22px"></ion-icon>
          <span class="btn-label"><span class="btn-eyebrow">Join the</span><span class="btn-main">TestFlight beta</span></span>
        </a>
        ${androidRequestForm()}
      </div>
      <div class="l l-ios" style="display:flex; justify-content:center; width:100%">
        <a class="btn btn-primary" style="width:auto" href="${TESTFLIGHT_URL}" target="_blank" rel="noopener">
          <ion-icon name="logo-apple" style="font-size:22px"></ion-icon>
          <span class="btn-label"><span class="btn-eyebrow">Join the</span><span class="btn-main">TestFlight beta</span></span>
        </a>
      </div>
      <div class="l l-android" style="display:flex; justify-content:center; width:100%">${androidRequestForm()}</div>
      <div class="l l-desktop" style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; width:100%">
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
  return `
    <form class="smashio-install-form" style="display:flex; gap:8px; align-items:center" data-source="install_compact_android">
      <div style="position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden" aria-hidden="true">
        <label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
      </div>
      <input type="email" name="email" required placeholder="you@email.com for Android" aria-label="Email for Android beta"
        style="height:52px; border-radius:100px; background:#141416; border:1px solid rgba(255,255,255,.10); color:#F5F5F7; padding:0 18px; font-size:13.5px; font-family:Manrope; width:200px" />
      <button type="submit" class="btn" style="width:auto; background:transparent; border:1.5px solid rgba(255,255,255,.15)">
        <span class="btn-main" style="font-size:13.5px">Request access</span>
      </button>
      <span class="smashio-install-msg" style="font-size:11px; color:#7A7A82"></span>
    </form>`;
}

module.exports = { esc, escapeJsonLd, callRpc, shell, ctaButtons, captureForm, captureFormScript, analyticsScripts };
