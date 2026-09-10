// website-plan.md W8 (DEC3: three guides, not six). Mid-funnel content — D8 was zero guides while
// every competitor in the Sydney SERP scan (§2.2) has a blog. No build step, sharing the same
// _venue-lib shell as every other live page, hand-written and hardcoded (this is not sweep data,
// so it doesn't need a "last checked" stamp the way the venue/club pages do). Internal links point
// down into real venue/suburb pages, fetched live rather than hardcoded, so they never rot.
const { esc, callRpc, shell, ctaButtons } = require("../_venue-lib");

const GUIDES = {
  "cost-of-badminton-in-sydney": {
    title: "The Cost of Badminton in Sydney",
    description: "What badminton actually costs in Sydney: casual session fees, court hire by the hour, gear, and how to play for less.",
    intro: "Badminton is one of the cheaper racket sports to get into, but the total depends heavily on how you play it. Here's the honest breakdown.",
    sections: [
      {
        heading: "Casual social sessions",
        html: "Most casual sessions in Sydney run on a per-person, per-session basis rather than an hourly court rate, since you're sharing courts and shuttles with a group. Pricing varies by venue and whether it's a dedicated badminton centre or a multi-purpose stadium. Every venue Smashio tracks lists its actual pricing on its own page, updated from what the venue publishes.",
      },
      {
        heading: "Hiring a full court",
        html: "If you're booking a court outright with your own group, dedicated badminton centres are usually cheaper per hour than multi-purpose stadiums, and rates climb sharply in peak evening and weekend slots. Off-peak weekday daytime hours are the cheapest time to play almost everywhere.",
      },
      {
        heading: "Gear",
        html: "A beginner racket, a few shuttles, and court shoes with non-marking soles is enough to start. Feather shuttles cost more and wear out faster than nylon ones, which is why most casual social sessions supply nylon. You don't need your own shuttles for a Smashio game unless the host asks for BYO.",
      },
      {
        heading: "Playing for less",
        html: "Splitting a court across more players brings the per-person cost down, which is most of what a matching app like Smashio is for: it fills a court that would otherwise sit at 2 players instead of 4, or a session that would otherwise not run at all.",
      },
    ],
    faqs: [
      { q: "Is badminton expensive in Sydney?", a: "Not compared to squash or tennis court hire. Casual sessions are usually the cheapest way in, especially split across a full group of players." },
      { q: "Do I need my own shuttles?", a: "Not for a casual social session, most supply nylon shuttles. Check the game's notes if you're not sure, or ask the host in chat." },
      { q: "What's the cheapest time to play?", a: "Weekday daytime, off-peak. Evenings and weekends cost more almost everywhere because that's when demand is highest." },
    ],
  },
  "beginners-guide-to-badminton": {
    title: "A Beginner's Guide to Badminton in Sydney",
    description: "New to badminton? What to bring, how skill tiers work, and how to find your first game in Sydney without knowing anyone yet.",
    intro: "Badminton has a low barrier to entry and a real learning curve, both at once. Here's what actually helps in the first few sessions.",
    sections: [
      {
        heading: "What to bring",
        html: "A racket (venues rarely rent them, so borrow one if you don't have one yet), non-marking court shoes, and a water bottle. Most social sessions supply shuttles.",
      },
      {
        heading: "The basics",
        html: "Games are usually played to 21 points, win by 2, best of 3 games. Doubles is more common than singles at social sessions since it's easier to organise around a group and less physically demanding for beginners. The serve has to go underarm and below your waist, that's the rule that trips up most new players first.",
      },
      {
        heading: "Skill tiers, and why they matter",
        html: "Smashio sorts games by skill tier (beginner through pro) so you're not thrown into a session with players who've been competing for a decade. Set your tier honestly when you sign up, it makes the games better for everyone, including you.",
      },
      {
        heading: "Finding your first game without knowing anyone",
        html: "This is the actual hard part of starting badminton in a new city; the sport is easy, finding a group is not. Smashio exists for exactly this: open the app, filter to beginner-tier games near you, and join one. No club membership, no waiting list.",
      },
    ],
    faqs: [
      { q: "Do I need experience to join a Smashio game?", a: "No. Filter to beginner-tier games and you'll be playing with others at a similar level." },
      { q: "Singles or doubles for a first game?", a: "Doubles. It's more social, less running, and what most casual sessions are set up for." },
      { q: "How do I know what tier I am?", a: "Be honest rather than precise, everyone starts somewhere. You can change your tier later as you play more." },
    ],
  },
  "where-to-play-indoor-badminton-sydney": {
    title: "Where to Play Indoor Badminton in Sydney",
    description: "Dedicated badminton centres vs multi-purpose stadiums across Sydney, and how to pick between them.",
    intro: "Sydney's indoor badminton falls into two rough categories, and the difference matters more than most players expect.",
    sections: [
      {
        heading: "Dedicated badminton centres",
        html: "Purpose-built venues with sprung floors, proper court markings, and consistent lighting, usually run by badminton-focused operators or clubs. These are generally the better experience if badminton is your main sport, and often better value per hour too.",
      },
      {
        heading: "Multi-purpose stadiums",
        html: "Shared indoor sports centres with badminton courts marked out alongside basketball, futsal or volleyball lines. More common, more widely spread across Sydney's suburbs, and usually the closer option if you're not near a dedicated centre. Floor quality and lighting vary more here.",
      },
      {
        heading: "How to choose",
        html: "Closer usually beats better for a regular weeknight game, nobody keeps showing up to a great court that's 40 minutes away. Every venue Smashio tracks shows whether it's dedicated, plus courts, hours and pricing, so you can compare before you commit.",
      },
    ],
    faqs: [
      { q: "What's the difference between a dedicated centre and a stadium?", a: "A dedicated centre is built for badminton specifically, sprung floors and proper markings. A stadium shares its courts with other sports and the floor quality varies more." },
      { q: "Are dedicated centres always better?", a: "For the game itself, usually. For convenience, not always, the closer multi-purpose stadium often wins for a regular weeknight session." },
    ],
  },
};

function faqJsonLd(guide, canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
    url: canonicalUrl,
  };
}

function notFoundHero() {
  return `
    <img src="/assets/smashio-mark.svg" alt="" class="rise rise-1" style="width:48px; height:48px; object-fit:contain" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(26px,7vw,34px); line-height:1.1; letter-spacing:-.03em">Guide not found</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">That guide doesn't exist. Browse every badminton venue Smashio tracks in Sydney instead.</p>
    <a class="rise rise-3" href="/sydney" style="font-size:13.5px; font-weight:700">Browse all Sydney venues →</a>
    ${ctaButtons()}`;
}

function guideHero(guide) {
  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Guide</span>
    </div>
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(28px,7vw,40px); line-height:1.05; letter-spacing:-.03em; text-wrap:balance">${esc(guide.title)}</h1>
    <p class="rise rise-3" style="margin:0; max-width:52ch; font-size:14.5px; line-height:1.65; color:#96969E">${esc(guide.intro)}</p>
    ${ctaButtons()}`;
}

function guideBody(guide, venueLinks) {
  const sections = guide.sections
    .map(
      (s) => `
      <div>
        <h2 style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:17px; margin:0 0 8px; color:#F5F5F7">${esc(s.heading)}</h2>
        <p style="margin:0; font-size:14px; line-height:1.7; color:#C8C8CE">${esc(s.html)}</p>
      </div>`
    )
    .join("");

  const faqSection = `
    <div>
      <h2 style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:17px; margin:0 0 12px; color:#F5F5F7">Questions</h2>
      <div style="display:flex; flex-direction:column; gap:14px">
        ${guide.faqs
          .map(
            (f) => `
          <div>
            <div style="font-size:13.5px; font-weight:700; color:#F5F5F7">${esc(f.q)}</div>
            <div style="font-size:13.5px; color:#96969E; margin-top:3px; line-height:1.6">${esc(f.a)}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>`;

  const linksSection =
    venueLinks.length === 0
      ? ""
      : `<div>
          <h2 style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:17px; margin:0 0 12px; color:#F5F5F7">See real venues and games</h2>
          <div style="display:flex; flex-wrap:wrap; gap:8px">
            ${venueLinks.map((v) => `<a class="chip" href="/venue/${esc(v.slug)}">${esc(v.name)}</a>`).join("")}
            <a class="chip" href="/sydney">All Sydney venues</a>
          </div>
        </div>`;

  return `<div class="rise rise-4" style="display:flex; flex-direction:column; gap:28px; padding-top:8px; border-top:1px solid rgba(255,255,255,.06)">${sections}${linksSection}${faqSection}</div>`;
}

module.exports = async function handler(req, res) {
  const slug = (req.query && req.query.slug) || "";
  const guide = GUIDES[slug];

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");

  if (!guide) {
    return res.status(404).send(shell({
      title: "Smashio - Guide not found",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  let venues = [];
  try {
    venues = await callRpc("venue_seo_directory", {});
  } catch {
    venues = [];
  }
  const venueLinks = venues.slice(0, 4);

  const canonicalUrl = `https://smashio.com.au/guides/${slug}`;

  return res.status(200).send(shell({
    title: `${guide.title} | Smashio`,
    description: guide.description,
    canonicalUrl,
    indexable: true,
    jsonLd: faqJsonLd(guide, canonicalUrl),
    heroContent: guideHero(guide),
    bodyContent: guideBody(guide, venueLinks),
  }));
};
