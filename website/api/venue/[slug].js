// Server-rendered, indexable venue page (gtm-plan.md G11). Distinct from api/game/[id].js's
// noindex share-link card: this one is meant to rank for "badminton <suburb>" searches, so it
// carries real content (courts, hours, pricing, amenities) and a canonical URL, not just OG tags.
//
// The [slug] path param is misleading on purpose — it also accepts a raw venue uuid, because
// ui/app/venue/[id].tsx's shareVenue already mints https://smashio.com.au/venue/<uuid> links.
// venue_seo_detail (20260831020000) resolves either; when it resolves via uuid we still render
// the page (so that pre-existing share link gets real content) but point robots at the slug URL
// as canonical, or noindex it if the venue has no slug/profile yet (venues-plan.md's unenriched
// P2 queue) — thin/duplicate pages are worse for SEO than not indexing at all.
const { esc, callRpc, shell, ctaButtons } = require("../_venue-lib");

const DAY_LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function fmtTime(t) {
  // "HH:MM:SS" or "HH:MM" -> "9am" / "9:30am"
  const [h, m] = String(t).split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}:${String(m).padStart(2, "0")}${period}` : `${hour12}${period}`;
}

function openingHoursRows(hours) {
  if (!hours) return [];
  return DAY_ORDER.filter((d) => hours[d]).map((d) => {
    const ranges = hours[d];
    const label = !ranges || ranges.length === 0 ? "Closed" : ranges.map(([s, e]) => `${fmtTime(s)}–${fmtTime(e)}`).join(", ");
    return { day: DAY_LABELS[d], label };
  });
}

function unitLabel(unit) {
  if (unit === "court_hour") return "/court/hr";
  if (unit === "person_hour") return "/person/hr";
  return "/person";
}

function priceFrom(bands) {
  if (!bands || bands.length === 0) return null;
  const cheapest = bands.reduce((min, b) => (b.cents < min.cents ? b : min), bands[0]);
  return `From $${(cheapest.cents / 100).toFixed(0)}${unitLabel(cheapest.unit)}`;
}

function jsonLdFor(v, canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: v.name,
    url: canonicalUrl,
    address: {
      "@type": "PostalAddress",
      streetAddress: v.address || undefined,
      addressLocality: v.suburb,
      addressRegion: "NSW",
      addressCountry: "AU",
    },
    telephone: v.profile?.phone || undefined,
    sameAs: v.profile?.website_url || undefined,
  };
}

function notFoundHero() {
  return `
    <img src="/assets/smashio-logo.png" alt="" class="rise rise-1" style="width:48px; height:48px; object-fit:contain; animation-name:smash-in, smash-drift; animation-duration:.6s, 3.4s; animation-timing-function:cubic-bezier(.16,1,.3,1), ease-in-out; animation-iteration-count:1, infinite; animation-direction:normal, alternate; animation-delay:.10s, .7s; animation-fill-mode:forwards, none" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(26px,7vw,34px); line-height:1.1; letter-spacing:-.03em">Venue not found</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">This link doesn't point to a venue we know. Browse every court Smashio tracks in Sydney instead.</p>
    <a class="rise rise-3" href="/sydney" style="font-size:13.5px; font-weight:700">Browse all Sydney venues →</a>
    ${ctaButtons()}`;
}

function thinHero(v) {
  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Badminton · ${esc(v.suburb)}</span>
    </div>
    <h1 class="rise rise-2" style="margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(28px,7vw,40px); line-height:1.05; letter-spacing:-.03em">${esc(v.name)}</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">Full court details for this venue aren't in yet. Open it in the Smashio app to see what's on there.</p>
    ${ctaButtons()}`;
}

function venueHero(v) {
  const cost = priceFrom(v.pricing_bands);
  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F; animation:smash-pulse 1.6s ease-in-out infinite"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Badminton · ${esc(v.suburb)}, Sydney</span>
    </div>
    <h1 class="rise rise-2" style="margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(30px,7vw,42px); line-height:1.03; letter-spacing:-.03em; text-wrap:balance">${esc(v.name)}</h1>
    ${v.address ? `<div class="rise rise-2" style="display:flex; align-items:center; gap:6px; color:#96969E; font-size:14px; font-weight:600"><ion-icon name="location-outline" style="font-size:15px; color:#7A7A82"></ion-icon><span>${esc(v.address)}</span></div>` : ""}
    <div class="rise rise-3" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center">
      ${v.profile?.courts_total ? `<span class="stat"><ion-icon name="grid-outline" style="font-size:14px; color:#96969E"></ion-icon>${esc(v.profile.courts_total)} court${v.profile.courts_total === 1 ? "" : "s"}</span>` : ""}
      ${v.profile?.dedicated ? `<span class="stat"><ion-icon name="ribbon-outline" style="font-size:14px; color:#35D6A6"></ion-icon><span style="color:#35D6A6">Dedicated badminton</span></span>` : ""}
      ${cost ? `<span class="stat"><ion-icon name="pricetag-outline" style="font-size:14px; color:#D6FF3F"></ion-icon><span style="color:#D6FF3F">${esc(cost)}</span></span>` : ""}
    </div>
    ${v.upcoming_game_count > 0 ? `<p class="rise rise-3" style="margin:0; font-size:13.5px; font-weight:700; color:#EBFF7A">${v.upcoming_game_count} Smashio game${v.upcoming_game_count === 1 ? "" : "s"} on here this week</p>` : ""}
    ${v.profile?.summary ? `<p class="rise rise-3" style="margin:0; max-width:48ch; font-size:14.5px; line-height:1.65; color:#C8C8CE">${esc(v.profile.summary)}</p>` : ""}
    ${ctaButtons()}`;
}

function venueBody(v) {
  const hoursRows = openingHoursRows(v.profile?.opening_hours);
  const amenities = v.amenities || [];
  const bands = v.pricing_bands || [];

  const sections = [];

  if (hoursRows.length > 0) {
    sections.push(`
      <div>
        <h2 style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:16px; margin:0 0 12px">Opening hours</h2>
        <div style="display:grid; grid-template-columns:1fr auto; gap:6px 16px; font-size:13.5px">
          ${hoursRows.map((r) => `<span style="color:#96969E">${esc(r.day)}</span><span style="color:#F5F5F7; font-weight:600; text-align:right">${esc(r.label)}</span>`).join("")}
        </div>
      </div>`);
  }

  if (bands.length > 0) {
    sections.push(`
      <div>
        <h2 style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:16px; margin:0 0 12px">Pricing</h2>
        <div style="display:flex; flex-direction:column; gap:8px">
          ${bands
            .map(
              (b) =>
                `<div style="display:flex; justify-content:space-between; gap:12px; font-size:13.5px"><span style="color:#96969E">${esc(b.label)}</span><span style="color:#F5F5F7; font-weight:700">$${(b.cents / 100).toFixed(0)}${esc(unitLabel(b.unit))}</span></div>`
            )
            .join("")}
        </div>
        <p style="margin:10px 0 0; font-size:11.5px; color:#5C5C64">Pricing as last checked by Smashio — confirm with the venue before you turn up.</p>
      </div>`);
  }

  if (amenities.length > 0) {
    sections.push(`
      <div>
        <h2 style="font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:16px; margin:0 0 12px">Amenities</h2>
        <div style="display:flex; flex-wrap:wrap; gap:8px">
          ${amenities.map((a) => `<span class="chip">${esc(a.label)}</span>`).join("")}
        </div>
      </div>`);
  }

  if (sections.length === 0) return "";

  return `<div class="rise rise-4" style="display:grid; gap:28px; grid-template-columns:1fr; padding-top:8px; border-top:1px solid rgba(255,255,255,.06)">${sections.join("")}</div>`;
}

module.exports = async function handler(req, res) {
  const identifier = (req.query && req.query.slug) || "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");

  if (!identifier) {
    return res.status(404).send(shell({
      title: "Smashio - Venue not found",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  let v = null;
  try {
    v = await callRpc("venue_seo_detail", { p_identifier: identifier });
  } catch {
    // Supabase unreachable — fall through to the not-found card rather than 500ing.
  }

  if (!v) {
    return res.status(404).send(shell({
      title: "Smashio - Venue not found",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  const canonicalUrl = `https://smashio.com.au/venue/${v.slug || v.id}`;

  // No enrichment yet (venues-plan.md's unenriched P2 queue) — real venue, thin content. Show it
  // (so the existing uuid share link still resolves to something real) but keep it out of the
  // index until it's enriched.
  if (!v.profile) {
    return res.status(200).send(shell({
      title: `Smashio - ${v.name}`,
      description: `${v.name} in ${v.suburb}, Sydney. Find badminton games happening there on Smashio.`,
      canonicalUrl,
      indexable: false,
      heroContent: thinHero(v),
    }));
  }

  const cost = priceFrom(v.pricing_bands);
  const description = `${v.name} in ${v.suburb}, Sydney${v.profile.courts_total ? ` — ${v.profile.courts_total} badminton courts` : ""}${cost ? `, ${cost.toLowerCase()}` : ""}. See opening hours, pricing and games happening there on Smashio.`;

  return res.status(200).send(shell({
    title: `${v.name} — Badminton in ${v.suburb} | Smashio`,
    description,
    canonicalUrl,
    indexable: true,
    jsonLd: jsonLdFor(v, canonicalUrl),
    heroContent: venueHero(v),
    bodyContent: venueBody(v),
  }));
};
