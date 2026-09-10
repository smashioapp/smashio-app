// website-plan.md W7 — the literal-query page ("badminton near me"). Pattern lifted from It's
// Crowded (§2.3): answer the search string directly. No coordinates ship on any anon RPC (§5.5
// T2), so "near me" can't rank venues by distance server-side — instead the page always renders a
// full, real suburb list (never templated emptiness, §2.4) and layers an optional "use my
// location" button on top that resolves the browser's coordinates to one of our tracked suburbs
// via /api/geocode and redirects there. Denied/unsupported/no-match all fall back to the same
// list that was already on the page, so the page is never broken, only less convenient.
const { esc, callRpc, shell, ctaButtons } = require("./_venue-lib");

function slugify(suburb) {
  return String(suburb).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");

  let venues = [];
  try {
    venues = await callRpc("venue_seo_directory", {});
  } catch {
    venues = [];
  }

  const suburbs = [...new Set(venues.map((v) => v.suburb).filter(Boolean))].sort();

  const heroContent = `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F; animation:smash-pulse 1.6s ease-in-out infinite"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">${esc(venues.length)} venues tracked</span>
    </div>
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(30px,7vw,42px); line-height:1.03; letter-spacing:-.03em">Badminton near me</h1>
    <p class="rise rise-3" style="margin:0; max-width:52ch; font-size:14.5px; line-height:1.65; color:#96969E">Find your suburb below, or let your browser pick it for you.</p>
    <button id="smashio-locate-btn" class="rise rise-3 btn btn-primary" style="width:auto; padding:12px 22px">
      <ion-icon name="locate-outline" style="font-size:18px"></ion-icon>
      <span class="btn-main" style="font-size:14px">Use my location</span>
    </button>
    <p id="smashio-locate-msg" class="rise rise-3" style="margin:0; font-size:12.5px; color:#7A7A82; min-height:1.2em"></p>
    ${ctaButtons()}`;

  const bodyContent =
    suburbs.length === 0
      ? ""
      : `<div class="rise rise-4" style="display:flex; flex-direction:column; gap:12px; padding-top:32px; margin-top:32px; border-top:1px solid rgba(255,255,255,.06)">
          <h2 style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15px; margin:0; color:#F5F5F7">Pick your suburb</h2>
          <div style="display:flex; flex-wrap:wrap; gap:8px">
            ${suburbs.map((s) => `<a class="chip" href="/sydney/${esc(slugify(s))}">${esc(s)}</a>`).join("")}
          </div>
        </div>
        <script>
        (function () {
          var btn = document.getElementById("smashio-locate-btn");
          var msg = document.getElementById("smashio-locate-msg");
          if (!btn || !navigator.geolocation) { if (btn) btn.style.display = "none"; return; }
          btn.addEventListener("click", function () {
            btn.disabled = true;
            msg.textContent = "Finding your suburb...";
            navigator.geolocation.getCurrentPosition(
              function (pos) {
                fetch("/api/geocode", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                })
                  .then(function (r) { return r.json(); })
                  .then(function (data) {
                    if (data.slug) {
                      window.location.href = "/sydney/" + data.slug;
                    } else {
                      btn.disabled = false;
                      msg.textContent = "Couldn't match that to a suburb we track, pick one below.";
                    }
                  })
                  .catch(function () {
                    btn.disabled = false;
                    msg.textContent = "That didn't work, pick your suburb below.";
                  });
              },
              function () {
                btn.disabled = false;
                msg.textContent = "Location blocked, pick your suburb below.";
              },
              { timeout: 8000 }
            );
          });
        })();
        </script>`;

  return res.status(200).send(shell({
    title: "Badminton Near Me | Smashio",
    description: "Find badminton courts and games happening near you in Sydney, sorted by suburb, live from the Smashio app.",
    canonicalUrl: "https://smashio.com.au/badminton-near-me",
    indexable: suburbs.length > 0,
    heroContent,
    bodyContent,
  }));
};
