# Home page redesign — the ultraplan

Written 2026-09-12. **Proposed, not signed off.** Nothing here is built.

This is the plan that turns `website/index.html` from a generic app landing page into the best
badminton page in Sydney. It sits **under** [website-plan.md](website-plan.md) W9 (the full home
page redesign DEC4 requires) and **over** [website-design-brief.md](website-design-brief.md) (which
holds the Claude Design prompt and the eight D1–D8 decisions). Neither of those is re-litigated
here. What they do not have is a diagnosis of what is actually on the live page today, a
section-by-section structure, and a build order. That is this doc.

Related: [website-plan.md](website-plan.md) §2 (competitive scan), §5 (the PII line — it constrains
every card below), §10 (DEC1–DEC7). [design-brief.md](design-brief.md) and
[v2-design-plan.md](v2-design-plan.md) (the app tokens the site must match).
[smashimals-plan.md](smashimals-plan.md) W0/W1 (cast art on web). [gtm-plan.md](gtm-plan.md) §3
(G11, G15).

---

## 0. Verdict

The page is not badly made. It is **well-built and strategically wrong**.

It is shaped like every SaaS landing page since 2019: hero, three steps, three feature cards, a
screenshot rail, a CTA card. That shape is the reason it reads as boring. It also buries the one
asset nobody else in Sydney has, which is real live local game data, into a 460px column on the
right of the fold.

The reframe this whole plan turns on:

> **Stop building an app landing page with a data widget bolted on. Build a live Sydney badminton
> board that happens to sell an app.**

Sydney Badminton Hub currently wins the search results with a hand-maintained link list and no
timestamps (website-plan §2.2). GoodRec wins on testimonials and million-player numbers we do not
have. We cannot out-scale either. We can be the only page in the country that is **true at the
moment it is read**, and the design should make that impossible to miss within one screen.

---

## 1. What is actually wrong — evidence from the live page

Captured from `https://smashio.com.au/` and `/api/home-feed` on 2026-09-12.

### 1.1 Credibility bugs (fix these before any design work)

| # | Problem | Evidence |
|---|---|---|
| **B1** ✅ | **The live feed advertised badminton at 4:30am.** Confirmed against the production database, not inferred. Every real user-created game (Aug 19 → Sep 3) stores a sane Sydney local time: 10:00, 14:00, 19:00, 19:30. The rows the home page was showing were part of a batch of **ten** inserted at `2026-09-12 06:12:08`, landing at 04:00, 04:30, 05:00, 05:30, 20:00 and 00:00 Sydney time. Local wall-clock times were written into a `timestamptz` column as UTC. Those ten were also the *only* future `published` games, so the entire live hero feed was that batch. **Fixed 2026-09-12 (H0):** all ten shifted back 10 hours, `starts_at` and `ends_at` together. They now read Mon 6:30pm, Tue 7:00pm, Wed 6:00pm, Thu 7:30pm, Fri 10:00am, Fri 2:00pm, Sat 4:00pm, Sun 7:00pm, Tue 6:00pm, Wed 7:00pm. | prod `public.games`, `/api/home-feed` |
| **B1b** ⏸ | **Those ten games are fabricated, and nothing in the repo records it.** Their organisers are seven demo accounts (`demo.priya@smashio.dev` … `demo.ravi@smashio.dev`, ids `9a110000-…`) created 29 seconds before the games. They carry `game_players` rows and chat messages. No migration, script or seed file in the repo produces them, so they were inserted out of band and are untracked and unreproducible. They are `published` and `public`, which means they are visible to real beta users in Discover **and** to anonymous visitors on the website. This plan's own §8 says no fabricated listing rows, ever. **Kept deliberately as beta test data (Q6). Removal handles are in §9.** | prod `public.profiles`, `public.games`, repo grep |
| **B2** ✅ | **No date on any row.** A game three days out rendered as bare "4:30 am", implying tonight, and the clock was the visitor's own zone rather than Sydney's. **Fixed 2026-09-12 (H0):** `website/index.html` gained `fmtWhen()`, pinned to `Australia/Sydney`, rendering Today / Tonight / Tomorrow / `Wed, 16 Sept 6:00 pm`. `/game/:id` and `/sydney` already did both correctly, so the home page was the only offender. | `website/index.html` `fmtTime()` |
| **B3** | **Hero copy breaks on mobile.** "Everything **to the right** is pulled live from the app" — on a phone the feed is below, not right. Most traffic is a phone. | 375x812 capture |
| **B4** | **Phone screenshots are striped placeholder rectangles.** Six of them, full width, mid-page, where the product demo should be. The TODO in the file says so. | `website/index.html` `.phonescreen`, line ~334 |
| **B5** | **The venue count everyone is working from is wrong.** Production holds **75 venues, all of them slugged** — not the "~98" AGENTS.md states. `20260817000200_p2_enrichment` is applied (106 migrations, latest `20260912000100`), so this is not a missing migration, it is bad arithmetic in the doc: 56 plus 21 inserts is 77, not 98. The site is telling the truth; the internal docs are not. | prod `public.venues`, `supabase_migrations.schema_migrations` |
| **B6** | **"6" is the hero stat.** `games_this_week` is honestly 6, and per B1 all six are the bad batch. Rendered at ~64px as the first number on the page, it reads as "this app is empty". | live `/api/home-feed` |

### 1.2 Design problems

| # | Problem |
|---|---|
| **D1** | **Every section is the same shape.** Eyebrow, `h2`, three cards in a row. Four times. No density change, no rhythm, nothing that makes you scroll. |
| **D2** | **The hero is small.** `clamp(38px, 6vw, 56px)` tops out at 56px. In 2026 that is a section heading, not a hero. Award-winning pages this year lead with oversized type as the hero element, and the site already moved to Space Grotesk 700, where size, not weight, has to carry the hit. |
| **D3** | **The page is flat.** One radial lime bloom and a stroked rectangle in the hero SVG, then nothing. No layering, no elevation, no texture, no depth, no edge treatment. Dark plus flat plus no motion reads as unfinished, not minimal. |
| **D4** | **No motion at all.** One `smash-drift` keyframe on the quokka. Nothing reveals, nothing responds, and the live dot is the only thing that suggests the page is alive. |
| **D5** | **Lime is everywhere.** Eyebrows, icons, buttons, borders, glow. The app's signature discipline is one lime-bordered hero element per screen with everything else quiet. The site inverted it, so the accent stopped meaning anything. |
| **D6** | **The live feed is three rows in a side column.** The single differentiating asset on the page, sized like a sidebar widget. |
| **D7** | **The stat band is the weakest block on the page.** Two numbers, one of which is 6, and a row of tier chips. It is trying to be social proof and has no proof. |
| **D8** | **Dead ends.** Feed rows are not links. Nothing in the hero goes to `/sydney`, a venue, or a suburb. website-plan §2.3 pattern 5 says every listing row ends somewhere; these end nowhere. |
| **D9** | **Zero structured data.** No JSON-LD on the home page at all (`_venue-lib.js` supports it, `index.html` does not use it). No `Organization`, no `WebSite`, no `SportsEvent`. |
| **D10** | **The home page still does not use the shared shell.** `index.html` has diverged from `api/_venue-lib.js`'s `shell()`, so header, footer and CTA logic exist twice. website-plan D11 already flagged this. |

---

## 2. Research — what the field actually does in 2026

website-plan §2 already scans the category and the Sydney search results. Do not re-derive it. What
follows is the **home-page-specific** layer, gathered 2026-09-12.

### 2.1 Direct competitors, home page only

| Site | Home page structure | What to take | What to refuse |
|---|---|---|---|
| **GoodRec** | Hero claim, then `1M Players / 100,000+ Games / 20,000+ 5* reviews` repeated twice, eight named testimonials, three-step how-it-works, three benefits, an FAQ block, then a large `sport × city` link grid in the footer. | The **sport × city link grid** and the **FAQ block** — both are cheap, both are pure SEO surface, both prove scale. Their stat strip repeats at top and bottom, which is a good pattern. | **No live games on their home page at all.** Their rows read templated. That is exactly the gap we walk into. Also: their testimonials are named players, which our PII line forbids. |
| **Playtomic** | "Find courts and players near you", download CTA, then "Top searched clubs worldwide" as nine venue cards with addresses, testimonials, press logos (Forbes, ABC), 4M players / 5500 clubs. | **Named venue cards as the visual proof.** They lead with places, not people, and places are exactly what our PII line permits. Press logos as trust. | Web booking. Photography-heavy hero we cannot match (venue photos are permanently out, website-plan §5). |
| **Sydney Badminton Hub** | Nav by **day of the week** (Sessions → Monday…Sunday), "70+ sessions, 30+ courts, 13+ coaches, 18K annual visits", Discord link, newsletter, placeholder testimonial quotes. | **Day-of-week as the primary axis.** That is how a badminton player actually thinks, and we have real per-day data and they do not. Their "18K annual visits" as a stat is a tell that they had nothing better. | Everything else. No timestamps anywhere on their site, which is the whole opening. |

**The read:** the competitor with the best data has the worst page, and the competitors with the
best pages have no live data. Nobody in this category ships a live, timestamped, day-grouped board.
That is the hole in the market and it is a design decision, not an engineering one.

### 2.2 Craft patterns worth copying from outside the category

- **Real product UI, not drawn mockups.** Linear's page is a continuous walkthrough of actual dark
  product screens with real-looking content and no abstract illustration. Our current striped
  placeholders are the opposite of this, and website-design-brief D3 already decided on real iPhone
  captures.
- **Oversized type as the hero element.** The dominant 2026 pattern across award pages: the value
  proposition is the visual, not an image behind it.
- **Dark-mode-first with a single high-contrast accent.** Already our system. The discipline is
  using the accent once per view, which the site currently does not do.
- **Editorial density over card grids.** Text as the interface architecture, partly aesthetic and
  partly a page-weight argument. Good for us, since we have a no-build-step and performance
  constraint.

### 2.3 Techniques that fit the no-build-step constraint

The site has no bundler, so anything proposed has to be hand-written HTML plus inline CSS.
Fortunately the 2026 CSS baseline covers almost all of it with zero JavaScript:

- **CSS scroll-driven animations** (`animation-timeline: view()` / `scroll()`) for reveals, the
  sticky board header, and a scroll-linked progress rail. Chrome/Edge 115+, Safari 18+, Firefox
  behind a flag in stable as of mid-2026, roughly 84% global. **Rule: author the finished state as
  the default and layer the animation on top**, so a browser that ignores `animation-timeline`
  still renders a correct page.
- **View Transitions API** for the same-document board filter swaps. Progressive, optional.
- `text-wrap: balance` and `pretty` for headline and body line breaking (already used on the `h1`).
- CSS `@property` for animatable gradient stops on the single lime hero element.
- Container queries so the board row component works in the hero, on `/sydney` and on a suburb page
  without three sets of breakpoints.
- `content-visibility: auto` below the fold to protect the performance budget once real screenshots
  and map tiles land.

**Zero new JavaScript libraries.** No GSAP, no framework. That is not a limitation this year.

### 2.4 SEO and AI-search layer

No JSON-LD on the home page today. Three additions, all cheap:

1. `Organization` + `WebSite` on the home page.
2. **`ItemList` of `SportsEvent`** built from the same rows the board renders — name, `startDate`,
   `location` as the real venue `Place`, `offers` with the real price. Organiser identity is
   omitted, which keeps it inside the §5 PII line. Event schema is the correct 2026 type for
   time-sensitive sports listings, and it is what makes a listing page eligible to be surfaced and
   cited rather than just crawled.
3. `FAQPage` on the FAQ block from §3.7.

---

## 3. The proposed home page, section by section

Desktop 1440 and mobile 390. Mobile is the real design; most traffic is a phone searching
"badminton near me".

### 3.0 Top strip — beta banner
Unchanged in function, kept as a **separable block** per website-design-brief D1 so the November
launch state ships on the same layout.

### 3.1 Hero — one claim, full bleed, no split
Kill the 50/50 split. The feed moves out of the hero and becomes its own full-width section.

- Headline at `clamp(44px, 9vw, 104px)`, two lines, `text-wrap: balance`, tracking `-0.035em`.
  Second line in dim text so one line carries the lime-adjacent weight and the other recedes.
- One sub-line, maximum 18 words, replacing the broken "to the right" copy (B3).
- **A live counter strip directly under the CTA**, one line, hairline-bordered: games on in the next
  seven days, venues mapped, suburbs covered, and a freshness stamp with the live dot. This is
  where liveness gets asserted, at the top, in one line, instead of in a sidebar.
- Two CTAs, platform-detected exactly as today. The iOS/Android asymmetry stays.
- Background: the existing lime bloom, **plus** a badminton-court line motif drawn in CSS at very
  low opacity, plus a fine noise layer. That is the depth fix (D3) and it costs no requests.
- **This is the page's one lime hero element** (D5). Everything below goes quiet.

### 3.2 The Board — the centrepiece, and the section that does not exist anywhere else
Full-width. Real games from `games_seo_feed`, the next 14 days, **grouped by day** (the Sydney
Badminton Hub axis, but live).

- A sticky day header as you scroll the board. Today and Tomorrow named, then weekday plus date.
- Each row: suburb, venue name, start time **with the day**, tier chip in its tier colour, format,
  price per player, courts, and exact open spots. Fixes B1 and B2.
- Freshness stamp on the section, exact counts degrading to coarse language past 15 minutes of
  cache age, both states designed. This closes website-plan DEC5 as already decided in D2.
- **Every row is a link** to `/game/:id`, which already exists and already ends in an install CTA.
  Fixes D8.
- Filter chips across the top: All / Tonight / This weekend / Beginner / Intermediate / Advanced /
  Pro. Client-side filter over data already fetched, optional View Transition on swap. No new
  requests.
- Empty and thin states are designed first, not last, because with 6 games this week they are the
  common case. Thin state pivots to "here is what is on this fortnight" plus the venue board, never
  to a placeholder row. Once the B1 batch is removed the board may legitimately be empty, so the
  thin state is the launch state until real hosts start posting.
- Rendered **server-side**, not fetched by client JavaScript, so it is in the HTML Google reads.
  That means folding `index.html` onto the `_venue-lib.js` shell, which fixes D10 at the same time.

### 3.3 The Map moment
A single brand-styled dark static Google Maps tile of Sydney with venue pins, full-bleed, with
typographic stat cards over it. This is website-design-brief D5, applied to the home page.

It is the strongest purely visual asset available given that venue photos are permanently out, it
matches the app's map exactly, and it makes 75-plus venues *feel* like a directory instead of
reading as a number. Links to `/sydney` and `/badminton-near-me`.

### 3.4 The app, for real
Replace the six placeholder frames (B4) with real iPhone captures in a scroll-driven sequence: the
device holds position while the screen inside changes as you scroll, one caption per screen.

Screens to capture, in order: Discover list, Discover map, game detail, host a game, the feed,
profile with reliability. Captured on a real device per website-design-brief D3.

### 3.5 Why it is honest
The trust argument, and where the Smashimals carry the warmth: four skill tiers with their real
definitions, the reliability score, host tools, no-show marking. Editorial layout, not a third
three-card grid (D1). Illustrations never carry load-bearing information and are never aimed at a
real player (smashimals-plan §6).

### 3.6 Venues and suburbs link grid
The GoodRec move. Every suburb with coverage and every named venue, as a dense, quiet, typographic
grid. Proves scale honestly, and it is the internal-linking layer `/sydney/:suburb` and
`/venue/:slug` need. Depends on the B5 slug backfill.

### 3.7 FAQ
Eight to ten real questions with `FAQPage` schema: what it costs, do I need a partner, what level
should I pick, do I need to book a court, is it free, which suburbs, when is Android open, is there
an Android app yet. Cheap, useful, and a real 2026 SEO and AI-search surface.

### 3.8 Install block and footer
Structurally as today, restyled to the new system. The Android email form and the beta badge stay
separable per D1. Double opt-in states per D6.

---

## 4. The visual system upgrades

These are the answer to "it does not look good", independent of structure.

| | Now | Proposed |
|---|---|---|
| **Type scale** | Hero caps at 56px; three sizes total | Hero to 104px; a real six-step display scale plus a separate mono-ish face for data (times, prices, counts) so the board reads like a board |
| **Rhythm** | Four identical eyebrow + h2 + 3-card sections | Alternating density: wide hero, dense board, full-bleed map, sequential device, editorial trust, dense link grid |
| **Depth** | One bloom, otherwise flat | Court-line motif, fine noise, hairline edges, two elevation levels, one glow, used once |
| **Motion** | One keyframe | Scroll-driven reveals, sticky board header, scroll-linked device sequence, count-up on the live counters, pulse on the live dot. All CSS, all optional, finished state as default |
| **Accent discipline** | Lime on everything | One lime hero element in the fold; below it lime only on primary CTA and the live dot. Tier colours are the only other hues |
| **Contrast** | Lime used behind white text in places | Lime is a black-text surface only. Audit every pairing to WCAG AA |
| **Data as an aesthetic** | Numbers styled as body copy | Tabular figures, aligned columns, a real freshness component. Make the data look like data |

---

## 5. Assets this plan creates

1. **iPhone screenshot capture pass** — six screens, named in §3.4, exact crops set by the design.
2. **Smashimal poses for web** — four exist in `website/assets/smashimals/`. The design names what
   else it needs; this is smashimals-plan W0/W1.
3. **Google Maps web API key** plus a static-tile usage and cost check (website-design-brief D5).
4. **Performance budget**, because §3.3 and §3.4 both add imagery to a page that is currently fast.
   Above-the-fold weight budget, `content-visibility` below it, and everything lazy past the board.

---

## 6. Build order

Each slice ships on its own and is useful on its own.

| Slice | What | Depends on | Est. |
|---|---|---|---|
| **H0** ✅ | **Fix B1 and B2.** Shipped 2026-09-12. Ten rows shifted back 10 hours in production; `fmtWhen()` added to the home page, Sydney-pinned, day always shown. Verified end to end against a cache-busted `/api/home-feed`. Left open: B1b, the demo data itself, which is Q6, not a bug fix. | — | 0.5 d |
| **H1** | Fix B3 copy, correct the venue count in AGENTS.md and the plan docs (B5), and add home page JSON-LD (`Organization`, `WebSite`). | — | 0.5 d |
| **H2** | Move `index.html` onto the `_venue-lib.js` shell and server-render it. Closes website-plan D11, and every later slice needs it. | — | 1 d |
| **H3** | Design pass in Claude Design, seeded by the website-design-brief prompt plus this document's §3 structure. Artboards back, signed off. | — | 2 d |
| **H4** | **The Board** (§3.2) — server-rendered, day-grouped, linked rows, filter chips, freshness component, thin and empty states, `SportsEvent` `ItemList` schema. The single highest-value slice. | H2, H3 | 2 d |
| **H5** | New hero (§3.1) — type scale, live counter strip, court motif, depth, the one lime element. | H3 | 1 d |
| **H6** | Map moment (§3.3). | H3, Maps key | 1 d |
| **H7** | Device sequence (§3.4) with real captures. | H3, captures | 1 d |
| **H8** | Trust section, link grid, FAQ with schema, install block and footer restyle. | H3, H1 | 1.5 d |
| **H9** | Motion, accent and contrast audit, performance budget verification, Lighthouse and Core Web Vitals check against the pre-redesign baseline. | all | 1 d |

**Total ~11.5 days.** H0 alone is half a day and should ship this week regardless of whether the
rest is approved.

---

## 7. Decisions needed before H3

| # | Question | Recommendation |
|---|---|---|
| **Q1** | The board leads with real games, and there are 6 this week. Do we lead with it anyway? | **Yes.** 6 real timestamped games beats 70 undated ones, and the fortnight view plus day grouping makes it read as a schedule rather than a shortfall. But the thin state is a first-class design deliverable, not an afterthought. |
| **Q2** | Testimonials. GoodRec and Playtomic both lean hard on them; our PII line forbids surfacing anything a player typed in the app. | **Consented, off-platform testimonials only**, collected by email with explicit permission, first name and suburb. That is a different act from publishing app content. Needs your call before the design draws the block. |
| **Q3** | Press or partner logos, as Playtomic uses. | Skip for now, revisit at launch. Nothing to show yet. |
| **Q4** | Does the home page get the day-of-week nav axis in the header too, or only inside the board? | Board only for now. A `/sydney/tonight` style surface is a separate SEO slice, not this one. |
| **Q5** | Scroll-driven animation given Firefox is still flagged in stable. | Ship it, finished-state-first. It degrades to a correct static page with no fallback code. |
| **Q6** ✅ | **The ten demo games and seven demo accounts in production (B1b).** | **Closed 2026-09-12: they stay for now.** Ajay's call, they are test data during beta and will be removed later. Don't re-propose deleting them. Two things follow. (1) §8's "no fabricated listing rows" still holds for **launch**, so removal is a prerequisite for the November public launch and for anything that markets the board as live. (2) Removal must be one query, so the handles are recorded in §9 below. |

---

## 8. Not doing

- No web join, no web host, no accounts. AGENTS.md rule, unchanged.
- No player names, faces, handles, ratings, rosters, organiser identity, or in-app free text
  anywhere on the page. website-plan §5.4.
- No venue photos. Private bucket, permanent.
- No fabricated or templated listing rows **at launch**. Being real is the entire differentiator.
  The beta test data described in B1b is a deliberate, temporary exception (Q6), and §9 is how it
  gets cleared.
- No build step, no framework, no animation library.
- No light mode.
- No "more sports coming" copy. Badminton only (website-design-brief D7).
- No logo or wordmark changes (D8).

---

## 9. Clearing the beta test data

Q6 keeps the demo games and demo accounts in production for now. They must be gone before the
November public launch, and before any copy or campaign describes the board as live. This section
exists so that removal is one query rather than an archaeology exercise.

**The handles.** Both sets are identifiable by an exact timestamp and an id prefix, and neither
overlaps a real user or a real game:

| Set | Identifier | Count |
|---|---|---|
| Demo profiles | `id::text like '9a110000%'`, `created_at = '2026-09-12 06:11:39.489636+00'` | 7 |
| Demo games | `created_at = '2026-09-12 06:12:08.156839+00'` | 10 |

Real user-created games all predate `2026-09-03` and none carry a `9a110000-` organiser, so an
`organizer_id::text like '9a110000%'` filter is the safest single predicate for the games.

**Before deleting**, check the dependents — the batch carries `game_players` rows and chat
messages, and `auth.users` rows sit behind the profiles. `delete_account` (the existing Edge
Function) is the correct tool for the accounts, since it already knows the full dependency graph.
Do not hand-delete from `public.profiles` and leave `auth.users` orphaned.

**Verification after removal:** `city_seo_stats` should return `games_this_week: 0` and the home
page board should fall through to its thin state, which is exactly why §3.2 makes that state a
first-class deliverable rather than an afterthought.
