// Server-rendered club page (social-plan.md C0, §13.3). Recruiting artefact, not a booking page:
// "your club already has a page, claim it" (gtm-plan.md §4.1). Mirrors api/venue/[slug].js's
// pattern (venue_seo_detail -> club_seo_detail) but the content bar is lower on purpose — these
// rows come from a directory sweep, not operator-confirmed data (venues-plan.md
// SWEEP-FINDINGS.md), so the page must not claim more than it knows.
//
// Two constraints from social-plan.md §13.3, both load-bearing:
// - only rows with a real hall (indexable from club_seo_detail) are indexed; a bare club name with
//   no location is thin content and stays noindex.
// - every page — indexed or not — carries a visible takedown link and a "last checked" stamp
//   sourced from the sweep date, not hardcoded, because this is public directory data about real
//   organisations republished without asking them first.
const { esc, callRpc, shell, ctaButtons } = require("../_venue-lib");

const TAKEDOWN_MAILTO_BASE =
  "mailto:hello@smashio.com.au?subject=Club%20page%20-%20";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

function jsonLdFor(c, canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    name: c.name,
    url: canonicalUrl,
    address: c.hall_suburb
      ? { "@type": "PostalAddress", addressLocality: c.hall_suburb, addressRegion: "NSW", addressCountry: "AU" }
      : undefined,
  };
}

function takedownLink(name) {
  const subject = encodeURIComponent(`${name} - update or remove this page`);
  return `${TAKEDOWN_MAILTO_BASE}${subject}`;
}

function footerNote(c) {
  return `
    <div class="rise rise-4" style="display:flex; flex-direction:column; gap:6px; padding-top:20px; border-top:1px solid rgba(255,255,255,.06); font-size:12px; color:#5C5C64">
      <span>Last checked ${esc(fmtDate(c.last_checked_at))}, from Badminton NSW's affiliated-club directory. Details may have changed since.</span>
      <a href="${takedownLink(c.name)}" style="color:#5C5C64; text-decoration:underline">This is our club — update or remove this page</a>
    </div>`;
}

function notFoundHero() {
  return `
    <img src="/assets/smashio-logo.png" alt="" class="rise rise-1" style="width:48px; height:48px; object-fit:contain; animation-name:smash-in, smash-drift; animation-duration:.6s, 3.4s; animation-timing-function:cubic-bezier(.16,1,.3,1), ease-in-out; animation-iteration-count:1, infinite; animation-direction:normal, alternate; animation-delay:.10s, .7s; animation-fill-mode:forwards, none" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(26px,7vw,34px); line-height:1.1; letter-spacing:-.03em">Club not found</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">This link doesn't point to a club we know. Browse Sydney badminton venues instead.</p>
    <a class="rise rise-3" href="/sydney" style="font-size:13.5px; font-weight:700">Browse all Sydney venues →</a>
    ${ctaButtons()}`;
}

function clubHero(c) {
  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Badminton club${c.hall_suburb ? ` · ${esc(c.hall_suburb)}, Sydney` : ""}</span>
    </div>
    <h1 class="rise rise-2" style="margin:0; font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(28px,7vw,40px); line-height:1.05; letter-spacing:-.03em; text-wrap:balance">${esc(c.name)}</h1>
    ${
      c.hall_name
        ? `<div class="rise rise-2" style="display:flex; align-items:center; gap:6px; color:#96969E; font-size:14px; font-weight:600"><ion-icon name="location-outline" style="font-size:15px; color:#7A7A82"></ion-icon><span>Plays at ${esc(c.hall_name)}</span></div>`
        : `<p class="rise rise-2" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">No confirmed venue on file for this club yet.</p>`
    }
    ${c.session_note ? `<span class="rise rise-3 stat"><ion-icon name="time-outline" style="font-size:14px; color:#96969E"></ion-icon>${esc(c.session_note)}</span>` : ""}
    <p class="rise rise-3" style="margin:0; max-width:48ch; font-size:14.5px; line-height:1.65; color:#C8C8CE">This page is unclaimed — pulled from Badminton NSW's public club directory, not confirmed with ${esc(c.name)} directly. Run this club? Get in touch and claim it.</p>
    ${ctaButtons()}
    ${footerNote(c)}`;
}

module.exports = async function handler(req, res) {
  const slug = (req.query && req.query.slug) || "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");

  if (!slug) {
    return res.status(404).send(shell({
      title: "Smashio - Club not found",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  let c = null;
  try {
    c = await callRpc("club_seo_detail", { p_slug: slug });
  } catch {
    // Supabase unreachable — fall through to the not-found card rather than 500ing.
  }

  if (!c) {
    return res.status(404).send(shell({
      title: "Smashio - Club not found",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  const canonicalUrl = `https://smashio.com.au/club/${c.slug}`;
  const description = c.hall_suburb
    ? `${c.name} plays badminton at ${c.hall_name} in ${c.hall_suburb}, Sydney. Find them on Smashio.`
    : `${c.name}, a Sydney badminton club. Find games and courts near you on Smashio.`;

  return res.status(200).send(shell({
    title: `${c.name} — Badminton Club${c.hall_suburb ? ` in ${c.hall_suburb}` : ""} | Smashio`,
    description,
    canonicalUrl,
    indexable: !!c.indexable,
    jsonLd: jsonLdFor(c, canonicalUrl),
    heroContent: clubHero(c),
  }));
};
