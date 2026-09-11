# Website v2 design brief — smashio.com.au

Written 2026-09-11. This is the design pass that website-plan.md **DEC4** requires before **W9**
(full home page redesign) can be built. The design happens in Claude Design; this file holds the
prompt that seeds it and the decisions that shape it.

Related: [website-plan.md](website-plan.md) (§1 current state, §5 the PII/security line, §10
decisions), [v2-design-plan.md](v2-design-plan.md) and [design-brief.md](design-brief.md) (the app's
tokens and per-screen passes this must match), [smashimals-plan.md](smashimals-plan.md) W0/W1
(cast art on web, still unbuilt).

Status: **brief only.** No design approved, no code. W9 stays unshipped until a design comes back
and gets sign-off.

---

## 1. The prompt

Paste verbatim into Claude Design.

```text
Design v2 of smashio.com.au — the marketing + SEO website for SMASHIO, a badminton
player-matching app for Sydney, Australia. The app itself is polished and dark/neon;
the website looks flat and dull next to it. Fix that.

## What SMASHIO is
Find and join badminton games near you, or host your own. Sydney first. Badminton
only in every piece of copy, nav item and page on this site, no "more sports coming",
even though the engine supports more later. NOT a court-booking app, venue booking
confirmation is only a trust signal. iOS and Android.

## Design for the November 2026 public launch
The app is in private beta right now (iOS TestFlight, Android invite-only), but this
design is for the public launch. Draw the launch-state site. Keep the beta badge and
the Android email-invite form as clearly separated, removable blocks so the current
beta state can ship on the same layout and be swapped out later.

## Hard rule the design must respect
There is NO app functionality on the web. Nobody joins a game, hosts one, messages
anyone, or holds an account on the website. The site does exactly two things:
1. READ — show real live games, venues, clubs, counts, pulled from the database.
2. CAPTURE — collect an email address.
Every listing row, every card, every dead end resolves to an install CTA or an email
form. Never draw a "Join" button that implies a web join.

## The two install paths are not symmetrical — design for that
iOS is a direct App Store / TestFlight link, one tap, done.
Android is invite-only internal testing during beta: the Play opt-in link only
resolves for Google accounts already added to an allowlist. So the beta Android CTA is
an email form, not a link. A visitor leaves their email, a human adds their Google
account to the allowlist and emails them back. Design that form with a clear
"we'll add you and email you back" expectation and a visible pending state, and design
the launch-state version where Android is a plain store button.
Never write copy claiming open or public Android access.

## Brand tokens (must match the app exactly — these are not suggestions)
Background #0A0A0B, alt surface #0E0E10, card #18181C, card alt #141416,
hairline borders rgba(255,255,255,0.08).
Accent lime #D6FF3F, soft lime #EBFF7A, deep lime #AEE62A / #9FE020.
Text #F5F5F7, dim #C7C7CE, secondary #96969E, tertiary #7A7A82.
Skill tier colours, used as the only other hues on the site:
Beginner #6FCBFF, Intermediate #35D6A6, Advanced #FFB648, Pro #C08CFF, danger #FF6767.
Fonts: Space Grotesk (500/600/700) for headings, Manrope (500-800) for body.
Radii: hero 26, card 18, rail 16, tile 16. Base gutter 24px.
The app's signature move is a single lime-bordered "hero" element per screen
(bg gradient #1C1F10 to #18181C, border rgba(214,255,63,0.4)) with everything else
quiet. Carry that discipline to the web: one anchor per section, not lime everywhere.
The existing brand mark is locked. Do not redraw the logo or wordmark.

## Voice
Casually Australian, human, never corporate. Contractions fine. Light Aussie phrasing
("keen", "no worries", "sorted") where it lands naturally, but clarity beats slang.
Never "An error has occurred" or "Please try again later". NEVER use em dashes in
user-facing copy, use a comma or a full stop.

## Current state (so you redesign rather than invent)
Static HTML, no build step, deployed on Vercel, plus serverless functions that call
Supabase RPCs and server-render HTML. Existing shell: dark background, lime links,
Ionicons, Space Grotesk + Manrope. It works, it is just visually thin and inconsistent,
and the home page has diverged from the shared chrome every other page uses.

Current home page sections: hero ("Stop chasing"), "Court to court in three taps"
(3 steps: Find a game near you / Join it, or host your own / Show up and play),
"Built for people who actually turn up" (4 features: Live game listings, Four honest
skill tiers, Reliability score, Court maps & directions), an app-screenshot section
("Dark, fast, and out of your way"), and a get-the-app section with email capture.
The hero already pulls live games from /api/home-feed.

Live pages that exist and share a common shell: /sydney city hub (venues grouped by
suburb, club list, live games), /sydney/:suburb pages, /venue/:slug, /club/:slug,
/game/:id share page, /post/:id share page, /player/:id (aggregate only),
/badminton-near-me, three guides under /guides/:slug, plus privacy, terms, support,
community guidelines and delete-account.

## Real product facts you can design around (all true, do not invent numbers)
~98 real Sydney venues in the directory with amenities, pricing, hours and courts.
Live games with start time, venue, suburb, skill tier, format, open spots, cost per
player and courts booked. Four skill tiers with real definitions. A reliability score
that reflects turning up. Clubs as a real entity. In-app chat, a text feed where
players post "looking for players" and questions, host tools, post-game ratings and
no-show marking.

## The PII line — this constrains every card you draw
Allowed on a public page: venue name, suburb, address, courts, hours, price, game
start/end, skill tier, format, price per player, open spots, max players, aggregate
counts, club name and club-published contact.
NEVER on a public page: player names, handles, avatars, photos, organiser identity of
any kind, ratings, reliability scores, rosters, chat, or any free text a user typed.
So: no "hosted by Sarah", no player face piles, no testimonial cards with real
players. Design social proof as aggregate numbers and venue/club names instead.
Venue photos are also out. They live in a private storage bucket and never appear on
an anonymous page.

## Freshness is the product
The page currently winning the Sydney badminton search results is a hand-maintained
link list with no timestamps. Our edge is being the only page that is TRUE at the
moment it is read. So freshness is a design element, not a footnote:
- Show EXACT open-spot counts ("3 spots left"), paired with a visible freshness stamp
  ("updated 4 minutes ago").
- Past 15 minutes of cache age the same component degrades to coarse language
  ("spots left" / "nearly full"). Design both states of that component.
- A live dot, real counts, real times. Never anything that looks like a templated
  placeholder row.

## Imagery you have to work with
1. REAL app screenshots, captured on an iPhone. Design around real device captures,
   not drawn CSS phone frames. Tell me exactly which app screens you want captured
   and at what crop, and specify the frames and sizes so they drop straight in.
2. Static Google Maps tiles, brand-styled dark to match the app's map. A web API key
   is available, so venue pages, suburb pages and the near-me page can all carry a
   real map image. Use maps plus typographic stat cards as the visual answer on venue
   surfaces, since venue photos can never appear.
3. The Smashimals — the app's illustrated Australian animal cast: a quokka, a
   kookaburra, a galah and a wombat, drawn as friendly full-body characters, plus
   props they can hold (banner, trophy, medal, racquet, shuttlecock, speech bubble).
   Use them BROADLY on this site: hero, the three-step explainer, section breaks,
   empty states and the 404 page. Two guardrails. They carry warmth, they never carry
   information a person needs, so nothing important may live only in an illustration.
   And they are never used to depict or mock a real player, so no "this is your
   opponent" or unreliable-player jokes. Specify exactly which character, pose and
   prop each placement needs, because the art has to be produced to your spec.

## About the attached art
The attached images are the real Smashimals: the four full-body characters (quokka,
kookaburra, galah, wombat), two prop examples, one bust avatar, and one app screen.
Match this art style, proportion and palette exactly. Do NOT draw new mascots, do not
restyle these, and do not substitute stock illustration.

In the artboards, represent each Smashimal as a labelled placeholder frame at its real
aspect ratio (the full-body characters are roughly 540x1000, so tall and narrow).
Label every frame with the character, the pose and the prop you want. The art has to
be produced to that spec afterwards, so the labels are the deliverable, not the
drawing. Only the quokka currently has separate head, body and arm layers; assume any
new pose is a fresh full illustration and keep the list short enough to be worth
drawing.

## What to design — artboards, desktop 1440 and mobile 390 for each
1. Home page, full redesign top to bottom. This is the centrepiece. Hero with real
   live games, the three-step explainer, the feature set, an app-screenshot moment
   that actually sells the app's look, aggregate social proof, and the install block.
2. /sydney city hub — live games, venues by suburb, clubs, city stats.
3. Venue detail page — facts, amenities, pricing, hours, static map, games at this
   venue.
4. A live game card component in every state: open spots, nearly full, full, starting
   soon, each of the four tier colours, plus the fresh and stale-cache variants.
5. Suburb page (/sydney/:suburb) and the near-me page.
6. A guide article template.
7. Shared chrome: header, footer, install CTA block, email capture block, empty state
   and 404. These must unify every page, including the home page.
8. The email signup flow end to end, because it is double opt-in: form idle,
   submitting, "check your inbox" state, the confirmation landing page a person hits
   from the email, already-confirmed, expired-link and error states. Also design the
   confirmation email itself, dark, plain, deliverable.
9. A component sheet: buttons, badges, tier chips, stat tiles, freshness stamp,
   map card.

## Constraints
No build step, so the output has to be expressible as hand-written HTML and inline CSS.
Avoid designs that need a component framework or heavy JS. Server-rendered, so no
client-side data fetching beyond one or two progressive-enhancement calls. Must be
fast: the current site scores well and should not regress, so be deliberate about how
much illustration and map imagery loads above the fold. Dark theme only, no light
mode. Mobile-first is not optional, most traffic is a phone searching "badminton near
me". Accessible contrast on the lime, which fails against white text if misused.

## What I want back
The full set of artboards above, plus a short rationale for the home page structure
and a note on what changes in the shared shell. Show the type scale and spacing scale
you settle on. Give me two asset lists I can act on: the app screenshots to capture,
and the Smashimal poses and props to draw.
```

---

## 2. Decisions — taken 2026-09-11

All eight open questions are closed. These are inputs to the design, not up for
re-litigation inside it.

| # | Question | Decision |
|---|---|---|
| D1 | Launch state the design targets | **November 2026 public launch.** Beta badge and the Android email-invite form are separable blocks so the beta state ships on the same layout. |
| D2 | Spot counts on cached pages (closes website-plan **DEC5**) | **Exact counts plus a visible freshness stamp**, degrading to coarse language past 15 minutes of cache age. Both states are designed. |
| D3 | App screenshots | **Real iPhone captures**, supplied by Ajay. The design names the screens and crops it needs; the CSS-drawn phone mockups are retired. |
| D4 | Smashimals on web | **Used broadly** — hero, explainer, section breaks, empty states, 404. Guardrails kept from smashimals-plan §6: illustrations never carry load-bearing information, and the cast is never aimed at a real player. Art is produced to the design's spec, which is the W0/W1 work. |
| D5 | Venue and suburb imagery | **Brand-styled static Google Maps tiles plus typographic stat cards.** A web Maps API key will be generated for this. Venue photos stay out permanently (private bucket, website-plan §5). |
| D6 | Email opt-in (closes website-plan **DEC7**) | **Double opt-in on Resend**, integration in progress. The design covers the confirm email, the confirmation landing page, and the expired/already-confirmed states. |
| D7 | Sport scope | **Badminton only** across copy, nav and SEO. The roadmap widens, the launch message stays narrow (gtm-plan §1). |
| D8 | Brand mark | **Locked.** The 2026-09-07 mark is untouched; the redesign covers layout, type and components. |

### Follow-on work these decisions create

- A **screenshot capture pass** on a real iPhone, screens and crops named by the design.
- **Smashimal art production** for whatever poses and props the design specifies. Today only four
  full-body characters and six props exist, none exported for web. This is smashimals-plan W0/W1.
- A **Google Maps web API key** plus a static-maps usage and cost check, since every venue, suburb
  and near-me page would render a tile.
- **Resend integration** for the double opt-in send, plus an anti-spam check on the form.
- A **performance budget**, because D4 and D5 both add imagery to pages that are currently fast.
