# Website plan — smashio.com.au v2

**Status: proposed, not signed off.** Written 2026-09-10. Nothing here is built.
Four decisions (DEC1-DEC4) were taken the same day and are recorded in §10 — they change W0, W5, W8 and W9.

Scope: what `website/` becomes between now and the **November 2026 public launch**, given the app
is now in **public beta on both stores** (iOS TestFlight, Android Play). The centre of it is turning
the site from a static brochure into a **live-data surface fed by anon-safe RPCs**, with an explicit
security model for what anonymous traffic is allowed to see.

Owns: `website/` (static HTML + `website/api/*` Vercel functions), the anon RPC surface those
functions call, and the web half of gtm-plan G11 and G15.
Does not own: the store listings or paid channels (gtm-plan §4–§7). One deliberate exception inside
`ui/`: slice W4.5, the create-game consent line, because publishing a game to the web without
telling the host is not something the website can fix on its own.

Related: gtm-plan.md §3 (G11 SEO pages, G15 capture, G3 share pages, G12 clubs),
social-plan.md C0 (club pages), venues-plan.md (the venue directory this all rides on),
quick-wins.md §1.2/§1.3 (assetlinks/AASA, already shipped), smashimals-plan.md W0/W1 (cast art on
web, still unbuilt).

---

## 0. The rule that does not move

AGENTS.md: **no in-app functionality on the web.** Nothing on smashio.com.au lets a person join a
game, host one, message anyone, or hold an account. That stays true in every slice below.

What this plan does add is the two things either side of that line:

- **Read** — anonymous visitors see real games, real venues, real clubs, real counts.
- **Capture** — anonymous visitors can hand over an email address.

Everything else is an install CTA. If a slice below starts to smell like a web client, it is out of
scope and needs its own sign-off.

---

## 1. Where the site is today

30 files, no build step, deployed on Vercel.

| Surface | File | State |
|---|---|---|
| Home | `index.html` (668 lines) | Static. Hero game cards are **hand-written mock data**. |
| Sydney hub | `api/sydney.js` | Live: venue directory grouped by suburb + club list. **No games.** |
| Venue page | `api/venue/[slug].js` | Live from `venue_seo_detail`. No games at that venue. |
| Club page | `api/club/[slug].js` | Live from `club_seo_detail`. Seed-only data. |
| Game share | `api/game/[id].js` | Live from `game_preview`. Single-id only, not listable. |
| Post share | `api/post/[id].js` | Live from `post_preview`. |
| Player share | `player.html` (31 lines) | **Stub.** Every `/player/:id` share link lands on a shell. |
| Sitemap | `api/sitemap.js` | Dynamic: static URLs + venues + indexable clubs. |
| Legal/support | 5 static pages | Fine. |

Shared chrome lives in `api/_venue-lib.js` — `shell()`, `ctaButtons()`, `callRpc()`, `esc()`.
`index.html` does **not** use it and has diverged.

What already works and should not be rebuilt: the dark/lime shell, the thin-page `noindex` rule,
the dynamic sitemap, the edge-cache headers, and the Supabase-RPC-from-a-serverless-function
pattern. This plan extends that pattern, it does not replace it.

---

## 2. Competitive scan

### 2.1 What the app-category players do on the web

| Product | Web surface | The move worth noting |
|---|---|---|
| **Playtomic** (padel/tennis, global) | `/clubs`, `/clubs/[slug]`, city sections, web booking | Web is a **real product surface**, not a brochure. Club pages carry availability and a Book now path. The directory is the moat, ~18k courts. |
| **GoodRec** (pickup sports, US) | Deep `sport × city` page grid, "upcoming games" lists, large social-proof numbers | Programmatic SEO across two axes. Every game row ends in **Join via app** — the listing is bait, the app is the only door. Their rows read as templated rather than live, which is the trap to avoid. |
| **It's Crowded** (pickup, US) | `/pickup-[sport]/[city]`, `/pickup-[sport]-near-me`, public live map | Public map with **no login**, plus join-in-browser. The `-near-me` page pattern answers how people actually search. |
| **RacketPal** (racket sports, UK/EU) | Player-matching positioning, thin web | Nothing to copy. |
| **OpenSports** | Organiser tooling, embeddable event widgets on club sites | **Embeds** — a club puts its own sessions on its own site and the widget carries our brand. Cheap distribution. |

### 2.2 Who actually holds the Sydney badminton SERP

This matters more than the global apps, because these are the pages a Sydney player finds today.

| Site | What it has | Weakness we exploit |
|---|---|---|
| **Sydney Badminton Hub** | 70+ social sessions, 30+ courts, 13 coaches, blog, Discord, claims ~18k visits/yr | **No timestamps.** Sessions are hand-maintained and freshness is unverifiable. Ours is live from a database. |
| **Meetup** (many Sydney badminton groups) | Strong domain authority, real groups | Generic chrome, no venue facts, no skill tiers, no price. |
| **Facebook groups** | Where the demand actually lives | Zero SEO, zero structure, invisible to Google. |
| **sydneybadmintonplayers.com.au** | One club, fixed weekly sessions | Single club only. |
| **keepactive.com.au / sportsmatchmaker.com.au** | Generic multi-sport directories | Thin, stale, badminton is an afterthought. |

**Read:** the category leader in Sydney is a hand-maintained link list. Smashio's directory is
already bigger (~98 venues against 30+) and its game data is live. The win is not out-designing
anyone, it is being the only page that is **true at the moment it is read**.

### 2.3 Five patterns to copy

1. **Two-axis programmatic pages** — geography by intent, not one hub page.
2. **A `near me` page**, because that is the literal query string.
3. **Live listings with a visible freshness stamp** — the thing Sydney Badminton Hub cannot do.
4. **Social proof as numbers**, in the shell, on every page.
5. **Every listing row ends in an install CTA.** No dead ends.

### 2.4 Three to refuse

1. **Web booking or web join** — breaks the AGENTS.md rule, and we are not a booking app.
2. **Fabricated or templated listings** — a "games near you" page with placeholder rows is worse
   than no page. Being real is the differentiator.
3. **Indexed player profiles** — GoodRec-style aggregate social proof is fine, indexed people are
   not. See §5.4.

---

## 3. Diagnosis — what is wrong now

**D1. The hero lies.** `index.html` shows invented game cards while ~98 real venues and real games
sit one RPC away. The highest-leverage single change on the site is making that block real.

**D2. Beta copy is stale.** Every surface says "Private beta · Sydney", and `ctaButtons()` in
`api/_venue-lib.js` still tells Android users to email for an allowlist spot. Nine surfaces carry
some version of this string.

**D3. No games anywhere on the web.** `/sydney` lists venues and clubs. A visitor cannot see that
anything is *happening*, which is the entire product.

**D4. No capture (G15, still open).** No email field on any page. Every visitor not ready to
install today is lost permanently.

**D5. No web analytics.** PostHog is in `ui/` only. We cannot tell which page drives an install, so
§8 is currently unanswerable.

**D6. `/player/:id` is a 31-line stub.** Share links from the app land on a shell.

**D7. One city, hard-coded.** Nothing exists at suburb level, which is where search intent sits
("badminton Chatswood").

**D8. Zero mid-funnel content.** No guides, no answers, no reason for anyone to link to us. Every
competitor in §2.2 has a blog.

**D9. Structured data is partial.** Venues and clubs have JSON-LD. Games have none, so there is no
`SportsEvent` eligibility.

**D10. Third-party render-blocking.** Every page loads `ionicons` as an ES module from unpkg plus
fonts from Google. Two third-party origins on the critical path, for about a dozen glyphs.

**D11. `index.html` does not share the shell.** Its chrome is a copy-paste fork of
`api/_venue-lib.js`, so any brand change has to be made twice.

---

## 4. What the website is for

Three jobs, in priority order:

1. **Convert intent to an install.** Someone searching "badminton near me Sydney" should land on a
   page showing a real game near them and one button.
2. **Be the organic surface the app cannot be.** App content is invisible to Google. The website is
   the only crawlable representation of the venues, the clubs, and the live game graph.
3. **Prove the thing is alive.** Before launch the hardest objection is "is anyone actually on
   this?" Live counts answer it without a testimonial.

Non-goals: a web app, account management beyond `delete-account.html`, in-browser chat, a booking
funnel, or a second city before Sydney is dense.

---

## 5. Live data on the web — architecture and security model

This is the core of the plan. Everything below keeps the existing pattern: **Vercel function →
Supabase RPC → server-rendered HTML.**

### 5.1 What is already anon-callable

| RPC | Shape | Listable? |
|---|---|---|
| `game_preview(uuid)` | One game, no organiser, no address, no roster | No, needs a known UUID |
| `post_preview(uuid)` | One post | No |
| `preview_reserved_spot_invite(text)` | One invite by token | No |
| `venue_seo_detail` / `venue_seo_directory` | Venue facts | **Yes** |
| `club_seo_detail` / `club_seo_directory` | Club facts | **Yes** |
| `nearby_games_public(...)` | Full game rows including lat/lng, cover, tiers | **Yes** |
| `open_spots`, `claimed_reserved_count`, `open_rateable_count` | Counters | No |

Most of what this plan needs already exists. `nearby_games_public` is the one that must not be used
as-is, for the two reasons below.

### 5.2 P0 — a real leak to fix before any of this ships

`games.visibility` (`public` or `link_only`) was added in
`supabase/migrations/20260901120000_host_a_game_v3.sql`. **Neither `nearby_games` nor
`nearby_games_public` filters on it.** A host who picks link-only gets their game listed in Discover
for every user, and exposed to anonymous callers of `nearby_games_public`.

That is a live bug in the app today, independent of this plan. It gets much worse the moment a
crawlable page renders that list. Fix first, on both functions:

```sql
and gp.visibility = 'public'
```

Nothing in §6 ships before this does.

### 5.3 Do not reuse app RPCs for public pages

`nearby_games_public` returns `venue_lat`, `venue_lng`, `cover_key`, `verification_status`,
`reserved_claimed` and everything else Discover needs. It is an **app** contract. The next time
someone adds an organiser field to it for a Discover feature, that field silently becomes public
HTML.

**Rule: SEO surfaces get their own `security definer` RPCs with an explicit column allowlist**, the
same way `venue_seo_detail` is separate from `venue_detail`. New functions:

- `games_seo_feed(p_suburb, p_from, p_to, p_limit)`
- `games_seo_at_venue(p_venue_slug, p_limit)`
- `city_seo_stats()` for aggregate social proof

Returning only: game id, venue name, venue suburb, venue slug, start, end, skill tier label, format
label, max players, open spots, cost per player, courts booked.

### 5.4 The PII line

| Allowed on an anonymous page | Never on an anonymous page |
|---|---|
| Venue name, suburb, street address, courts, hours, price (commercial facts) | Player display names, handles, avatars, photos |
| Game start and end, skill tier, format, price per player | Organiser identity of any kind |
| Open spots, max players, courts booked | Reliability scores, ratings, achievements |
| Aggregate counts ("41 games this week") | Roster, waitlist, attendance, no-show data |
| Club name, suburb, contact the club itself published | Chat, notes, any free text a user typed |
|  | Emails, push tokens, auth ids |

Two judgement calls, both resolved conservatively:

- **Organiser first name is out.** `game_preview` already omits it, so a listable feed must not be
  looser than the single-game one.
- **Free-text `games.notes` is out.** It is unmoderated user text, and indexing it means we own it.
  `nearby_games_public` already excludes it, and the SEO RPCs must keep excluding it.

### 5.5 Threat model

**T1. Enumeration.** A listable endpoint exposes the whole graph. Mitigation: a hard `p_limit` cap
of 50, no offset paging, and a bounded window of now to now plus 14 days. Past games never appear.

**T2. Location precision.** Games happen at commercial venues, so venue coordinates are public
facts. But **do not emit lat/lng on the game feed.** The venue page already carries the address, and
game rows with coordinates make a scraped movement dataset trivially joinable. Suburb only.

**T3. The anon key.** The publishable key sits in `api/_venue-lib.js` and is public by design. Treat
it as public and **never ship it to browser JavaScript.** If a page needs client-side refresh, proxy
it through our own `/api/*` route. That is already the practice, so write it down and let it
survive.

**T4. Scraping.** A competitor can rebuild our venue graph. Accept it. Venue facts are public
anyway, and being the canonical source is the point. The game feed is the sensitive half and T1
plus T2 already bound it.

**T5. Rate abuse.** The edge cache absorbs crawlers, so Supabase sees roughly one request per page
per cache window. Add a per-IP token bucket in the Vercel function for uncached paths, and keep
every new RPC `stable`.

**T6. Staleness read as a lie.** A cached page saying "6 spots" when the game is full turns our
differentiator against us. Every live block carries a visible "checked N minutes ago" stamp and
drops to coarser language beyond 15 minutes.

**T7. Host consent.** A host who created a game in August did not agree to it appearing on a public
web page. This is a product and privacy change, not a copy change:

- `website/privacy.html` gains a clause saying public games are visible on the web to people
  without an account.
- The create-game visibility picker in `ui/` gains a line saying a public game may appear on
  smashio.com.au.
- Games created before that ships stay **suburb-level only, off venue pages**, until the in-app
  disclosure has been live for 30 days.

T7 is the item most likely to be waved away and the one with actual downside. Do not skip it.

### 5.6 Caching and freshness

| Surface | `s-maxage` | Why |
|---|---|---|
| Venue and club pages | 3600 | Facts change monthly |
| Suburb pages | 900 | Game list, 15 minutes is tolerable |
| `/sydney`, `/badminton-near-me` | 300 | Highest-traffic live surfaces |
| Sitemap | 3600 | Unchanged |

Keep `stale-while-revalidate=86400` throughout as now. Any page rendering spot counts renders its
own generation time server-side, never with client JS.

---

## 6. Slices

Sequenced. Days are build days, not calendar days.

**Amendment 2026-09-10 — every ungated slice shipped.** W2-W4 landed first (`70c75a0`), then W1,
W4.5, W6, W7, W8 and W10 the same day. Nine of thirteen slices done. The four still open (W0, W5,
W9, W11) are each blocked on something outside this repo, not on build time — see their own notes
below. AGENTS.md carries the same dated note.

**W0 — Truth pass. 0.5 d. Not shipped — blocked on the Play console change below.** Copy across all nine surfaces: badge, hero, `ctaButtons()`, footer,
meta descriptions, OG text. Wording is "open beta testing, Sydney" plus a November 2026 launch line,
not "private beta". Kill the Android allowlist mailto and the "Android spots are invite only"
footer.

**Prerequisite, console-only, not a code change:** move the Android app from the Play **internal**
test track to **open testing** (DEC1 in §10). Internal testing is a 100-account allowlist, so the
opt-in link currently on the site fails for anyone not already added. W0 must not ship its copy
before the track has actually changed, or the site claims open access it does not have. The
`PLAY_BETA_URL` constant in `website/api/_venue-lib.js` changes to the open-testing URL at the same
time.

**W1 — Analytics. 0.5 d. Shipped 2026-09-10.** Vercel Web Analytics plus a PostHog web snippet on the app's existing
project, so a web session ending in an install is attributable. Tag every store-link click. Closes
the web half of gtm G1, and ships early because everything after it is unmeasurable without it.

**W2 — Visibility fix plus the SEO RPC layer. 1 d. Shipped (`70c75a0`).** The §5.2 filter on both functions. A migration
adding `games_seo_feed`, `games_seo_at_venue` and `city_seo_stats` with the §5.3 allowlist.
Regenerate `ui/lib/db.types.ts`. No page changes.

**W3 — Real games on the home page and `/sydney`. 2 d. Shipped (`70c75a0`).** Replace the mock hero cards with three
live rows and the live counts from `city_seo_stats`. Add a "Games this week" block to `/sydney`
above the venue grid. Freshness stamp per T6. An empty state that is honest and still converts.
Fixes D1 and D3.

**W4 — Capture. 1.5 d. Shipped (`70c75a0`), minus Turnstile/double opt-in (DEC7 still open).** A `web_signups` table, service-role insert behind a Vercel function and
never a direct anon insert, honeypot plus Turnstile, double opt-in email. Two entry points: the
footer on every page, and a "tell me when a game opens near me" field on suburb pages with the
suburb attached. Closes G15.

**W4.5 — Host consent. 0.5 d. Shipped 2026-09-10.** The one `ui/` change this plan carries. A line in the create-game
visibility picker saying a public game may appear on smashio.com.au, and a matching clause in
`website/privacy.html`. Ships before W5, per DEC2 in §10. Games created before this is live stay
suburb-level only for 30 days.

**W5 — Games on venue pages. 1 d. Not shipped.** `games_seo_at_venue` into `api/venue/[slug].js`, plus
`SportsEvent` JSON-LD per game and `SportsActivityLocation` on the venue. This is where freshness
buys ranking, because venue pages are the deepest indexable layer we have. **Gated on W4.5 and its
30-day window**, per T7 — W4.5 shipped 2026-09-10, so this unblocks 2026-10-10.

**W6 — Suburb pages. 1.5 d. Shipped 2026-09-10.** `/sydney/:suburb`, generated from the distinct suburbs in
`venue_seo_directory`, roughly 30 to 40 pages. Venues in the suburb, live games there, neighbouring
suburbs, breadcrumbs, capture field. Same thin-page rule as venues. The sitemap picks them up.
Fixes D7.

**W7 — `/badminton-near-me`. 0.5 d. Shipped 2026-09-10.** One page answering the literal query, geolocating in the
browser to pick a suburb and linking into W6. Pattern lifted from It's Crowded. Built as a manual
suburb list (never empty) plus geolocation as a progressive enhancement through a new
`/api/geocode`, which reverse-geocodes server-side via Nominatim rather than shipping any
coordinates to the client or hand-guessing suburb centroids.

**W8 — Guides. 1.5 d. Shipped 2026-09-10.** Three hand-written pages under `website/guides/`, no build step, sharing the
same shell: cost of badminton in Sydney, a beginner's guide, and where to play indoors (DEC3 in §10).
`FAQPage` JSON-LD, internal links down into venue and suburb pages. The three cut targets — skill
tiers explained, finding players without a club, venue comparison — are held until Search Console
shows which queries actually land. Fixes D8.

**W9 — Home page redesign, shell unification and performance. 4.5 d. Not shipped.** Per DEC4 in §10 this is a full
rebuild of `index.html`, not a patch. Needs a design pass through `docs/design-brief.md` first, in
the same per-screen-prompt style as the v3 app passes, and that pass should be treated as a
prerequisite rather than part of the 4.5 days. Includes: the page rebuilt on a shared `_shell.js`
that the functions also use, the W3 live block carried across rather than re-invented, capture and
social proof above the fold, unpkg ionicons dropped for inline SVG, both font families self-hosted,
explicit image dimensions. Fixes D10 and D11.

Sequencing note: W3 puts live data into the **current** home page. W9 then redesigns around a live
block that already works. Doing it the other way means designing against mock data again, which is
D1 all over.

**W10 — Player share pages. 1 d. Shipped 2026-09-10.** Replace `player.html` with `api/player/[id].js` rendering an
aggregate-only card that honours `profile_visibility`, **always noindex**, never in the sitemap.
Fixes D6 within the §5.4 line. Backed by a new `player_seo` RPC, kept deliberately narrower than
`player_card` (no name, photo, or rating — ever) rather than a trimmed reuse of it.

**W11 — Launch surface. 1 d. Not shipped.** November: store badges swap from beta to public, a `/press` kit, a
launch-day home page, schema updated. Depends on store state, not on us.

**Total roughly 17 days**, after the §10 decisions: guides down 1.5, home page redesign up 3, host
consent up 0.5. Order: W0, W1, W2, W3, W4, W4.5, W5, W6, W7, W8, W9, W10, W11.

Two things sit outside that count and gate slices rather than consume build days: the Play
open-testing track change before W0, and the `design-brief.md` pass before W9.

If only three ship: **W2, W3, W4.** Correct data, live listings, an email field.

---

## 7. URL map after W11

```
/                          home, live hero          index
/sydney                    city hub + live games    index
/sydney/:suburb            ~35 pages                index (thin-page rule)
/badminton-near-me         intent page              index
/venue/:slug               ~98 pages, + live games  index (thin-page rule)
/club/:slug                seed clubs               index if indexable
/guides/:slug              3 pages                  index
/game/:id                  share target             noindex
/post/:id                  share target             noindex
/player/:id                share target             noindex, never in sitemap
/privacy /terms /support /community-guidelines /delete-account   index
```

`robots.txt` gains an explicit `Disallow: /player/`. The sitemap gains suburbs and guides.

---

## 8. Measurement

The baseline is zero, which is why W1 is second.

- Organic sessions by page group, weekly. At launch, suburb, venue and guide pages should carry
  most organic entries.
- Store-link click rate per page group. Suburb pages should beat the home page. If they do not, the
  live block is not doing its job.
- Capture: email signups per week, and their conversion to installs.
- Indexed page count in Search Console against the sitemap count. A large gap means the thin-page
  rule is too loose or too tight.
- Freshness: the share of `/sydney` loads where the live block was non-empty. If that is low, the
  site is advertising a ghost town and W3's empty state matters more than its populated state.

---

## 9. Not doing

- **Web join, web host, web accounts.** §0.
- **Indexed player profiles.** §5.4.
- **The feed on the web**, beyond the existing `/post/:id` share targets. Indexing user content
  pulls in a moderation obligation the site does not carry today. Revisit after social-plan B3.
- **Multi-city pages.** Melbourne and Brisbane pages with no games are exactly the templated
  emptiness §2.4 rejects. Gated on real liquidity outside Sydney.
- **A build step or framework.** Static plus serverless is working, and a build step is a new class
  of failure for a marketing site.
- **Embeddable club widgets**, the OpenSports move. Genuinely good, but it needs clubs as a real
  entity, which social-plan gates behind C1.
- **A Chinese-language landing page.** Worth doing given gtm-plan's ASO note, but it needs a
  translator, not a plan. Parked for after launch.
- **Smashimals web art** (smashimals-plan W0/W1, `404.html`). Still unbuilt, still out of scope
  here, worth folding into W9 if the art exists by then.

---

## 10. Decisions

### Taken 2026-09-10

**DEC1. Android moves to Play open testing.** The app is on the **internal** test track, which is a
100-account allowlist — the opt-in link on the website resolves only for Google accounts already
added in Play Console, so the "just use the link" story does not hold for strangers. Decision: move
to **open testing**, which gives a public opt-in URL with no allowlist and no cap while the listing
still reads as beta. Website copy becomes "open beta testing". This is a Play Console change with
no code in it, and W0 is gated on it actually being done.

**DEC2. Host disclosure ships before venue-level listings.** New slice W4.5: a line in the
create-game visibility picker plus a privacy clause, then W5 behind it, with games created earlier
held at suburb level for 30 days. Costs half a day in `ui/` and delays W5. Taken over the faster
option because hosts who created games in August never agreed to a public web page.

**DEC3. Guides cut from six to three.** Cost of badminton in Sydney, beginner's guide, where to play
indoors. Saves 1.5 days. The other three targets wait for Search Console data rather than a guess.

**DEC4. Home page gets a full redesign, not a patch.** W9 rebuilds `index.html` for launch rather
than swapping the mock cards and leaving the layout. Adds about 3 days and needs a
`docs/design-brief.md` pass first. W3 still lands live data on the current page, so the redesign is
designed against something real.

### Still open

**DEC5. Spot counts on cached pages.** Exact numbers with a freshness stamp, or coarse language?
Recommend exact plus a stamp, dropping to coarse past 15 minutes. Needed by W3.

**DEC6. Suburb page threshold.** The venue thin-page rule is a slug plus a profile. Suburbs need a
number. Recommend 2 venues, or 1 live game. Needed by W6.

**DEC7. Email tooling for W4.** Double opt-in needs a sending path and an anti-spam check. Nothing in
the repo suggests either exists yet. Resend or Postmark plus Cloudflare Turnstile is the cheap
default, but it is an account someone has to open.

---

## 11. Sign-off

Nothing here is approved. §5.2, the `visibility` filter, is a live bug and should be fixed whether
or not the rest of this plan is taken.
