# GTM plan — Sydney launch (v1 public)

Written 2026-08-26. Covers two questions: **how to market SMASHIO in Sydney**, and **which app
gaps make that marketing leak** — the second half is the reason the first half works or doesn't.

Read [business-context.md](business-context.md), [mvp-spec.md](mvp-spec.md) and
[quick-wins.md](quick-wins.md) first. This doc does not add product scope on its own; where it
needs product work it points at an existing plan doc or an existing quick-win item. Items marked
**NEW** have no home yet.

Status: **proposed, not signed off.** §3 (gap fixes) needs approval before code lands; §4–§7
(channels, sequence, budget) need approval before money is spent.

---

## 0. Verdict up front

1. **Do not buy installs to start.** Sports is the most expensive Apple Ads category measured in
   2026 — ~$14.41 cost-per-tap and ~$26.81 CPI. At that price a paid user who opens a Discover
   map with no games near them is $27 set on fire. Paid comes *after* liquidity, as amplification.
2. **The wedge is supply, not demand.** Sydney has no shortage of badminton players. It has a
   shortage of *findable games*. Everything in §4 Tier A is about hand-recruiting the ~30 hosts
   whose sessions already exist inside WhatsApp/WeChat/Meetup and making them publish here.
3. **The real competitor is a group chat**, not another app. There is no direct AU badminton
   player-matching app in market. Meetup, Facebook groups, WeChat/WhatsApp groups and a venue's
   own booking page are what a Sydney player uses today. Smashio has to beat a free group chat on
   *one* axis: finding a game at your level when you don't already know anyone.
4. **English-only marketing misses most of the market.** Sydney social badminton is dominated by
   Chinese, Indian, Indonesian/Malaysian, Vietnamese and Korean communities. Xiaohongshu (RED) and
   WeChat reach a segment sitting inside roughly a quarter of the Australian market that
   English-only campaigns never touch; WhatsApp does the same for the subcontinental cohort.
5. **Four gaps must close before any campaign runs** (§3, P0). The worst: a shared game link — the
   highest-intent link the product produces — currently resolves to the generic marketing
   homepage. Every share is a dead end today.

**North-star metric: weekly liquid suburbs** — suburbs where ≥1 game was published *and* filled to
≥75% capacity in the trailing 7 days. Installs are a vanity number; a liquid suburb compounds.

---

## 1. What Smashio actually sells

Not court inventory, not a social network. It sells **"there is a game tonight, near you, at your
level, with spots left."**

Message hierarchy, in order:

1. *Tonight / this week* — recency beats breadth. A directory of 56 venues is not the promise.
2. *At your level* — the #1 fear of a new player joining strangers is being the worst on court;
   the #1 complaint of a strong player is being sandbagged. Skill matching is the differentiator
   against a group chat where nobody knows who's turning up.
3. *Spots left / turn up alone* — social permission to arrive without a group. This is the
   emotional unlock. "Stop chasing a fourth" (already the site's `og:title`) is the right line.

Anti-message: never say "book courts". SMASHIO is not a booking app
([business-context.md](business-context.md)) and that framing loses to venue booking pages
instantly.

---

## 2. Sydney market reality

### 2.1 Where the supply already sits

| Pocket | Examples found | Why it matters |
|---|---|---|
| Organised social groups | Sky Hawks (Roketto Mon 6–8pm, Alpha Auburn Thu 8–11pm, Roketto Sat 2–4pm), "Badminton & Social Activities" | Ready-made hosts. They already do the admin Smashio automates. |
| Affiliated clubs | NSW Badminton Association affiliated club list | Structured, contactable, credibility by association. |
| Commercial centres | Alpha (Auburn), The Badminton Club Prestons (10 courts), Sydney Sports Club Kings Park (7), Roketto, BadmintonWorx Botany, NBC South Granville | Already in `venues` — 56 enriched rows ([venues-plan.md](venues-plan.md)). Physical distribution points. |
| Council / low-cost | City of Sydney KGV casual badminton, Tue 7–9am, $6.40 | The cheapest possible "first game" for a new user. |
| Universities | USYD, UNSW, UTS, Macquarie, Western Sydney badminton clubs | Highest density, highest churn, most app-native cohort. O-Week (Feb, Jul) are the two biggest acquisition days of the year. |

### 2.2 Geography that matters

Badminton demand in Sydney clusters west and south-west (Auburn, Granville, Lidcombe, Prestons,
Hurstville, Chatswood, Eastwood, Burwood) plus the uni corridor (Ultimo, Kensington, Camperdown).
**Do not launch "Sydney".** Launch 3 clusters and get them liquid:

- **Cluster A — Auburn/Granville/Lidcombe** (Alpha, NBC South Granville): highest court density.
- **Cluster B — Uni corridor** (UTS RMSH, Kensington, Ultimo): highest app adoption, term-bound.
- **Cluster C — Chatswood/Eastwood/Hurstville**: strongest Chinese-language channel fit.

Discover's default radius should guarantee a user in these clusters sees ≥3 games. That is a
product setting with a marketing consequence.

### 2.3 Competitive set

- **Direct AU competitor: none found.** Social Sport (Melbourne) runs operator-owned pickup games,
  not player-hosted matching, and isn't badminton or Sydney.
- **Playtomic** is padel/pickleball and club-booking led; **Playo** is India. Neither is in market.
- **Actual competitors:** Meetup, Facebook groups, WeChat/WhatsApp groups, and doing nothing.

Implication: category education is cheap (people already play), but *switching* a working group
chat costs the host effort. Marketing sells the **host** on admin relief (roster, no-shows,
reminders, cost split — all shipped), not the player on a new app.

---

## 3. Gaps that block marketing

Audited against the repo 2026-08-26. Ordered by marketing damage, not by effort.

### 3.1 P0 — fix before a single dollar or flyer goes out

**G1. No product analytics.** No PostHog/Amplitude/Firebase in `ui/package.json`; Sentry only
catches crashes. Every campaign below is unmeasurable and the install→first-game funnel is
invisible. Already logged as [quick-wins.md](quick-wins.md) §1.4. **~1h. Item zero. Shipped
2026-08-31** — PostHog wired, ten-event funnel, gated on `EXPO_PUBLIC_POSTHOG_KEY` (blank locally,
real key/CI secret in prod, project 586186 US Cloud).

**G2. Android cannot ship.** No Play Console, release path never run in CI
([store-readiness-plan.md](store-readiness-plan.md)). Android is ~40–45% of AU handsets and skews
*harder* toward exactly the student and subcontinental/SE-Asian cohorts that play badminton.
Marketing a Sydney badminton audience iOS-only loses roughly half the clicks, and worse in
Clusters A and C. **Blocker. Nothing else here matters more.**

**G3. Shared game links dead-end.** `website/vercel.json` rewrites `/game/:id → /index.html`, so a
shared game resolves to the generic homepage: no venue, no time, no spots-left, same static
`og:image` for every game. `ui/lib/share.ts` generates those links and `game/[id].tsx` already
handles the post-install resume — the viral loop is built on both ends and broken in the middle.
**Fix: a real `/game/:id` page (build-time or edge-rendered from a public read) + per-game OG
image + "Open in app / Get the app" CTA. NEW — ~half a day. Shipped 2026-08-31** — real per-game
OG title/description now render server-side: `website/api/game/[id].js` is a single Vercel
serverless function (no bundler, matches the rest of `website/`'s no-build-step setup) that calls
the same anon-safe `game_preview` RPC the app's `GamePreviewTeaser` uses, and `vercel.json` now
routes `/game/:id` there instead of the static homepage. Shows venue, suburb, date/time, cost,
skill tier, and max players; falls back to a generic "open in app" card for a bad/unknown/
cancelled id. The `og:image` itself is still the one static image (dynamic per-game images need
an image-generation pipeline — bigger scope, not attempted here). `website/venue.html` and
`player.html` are still 31-line stubs with the same problem, not fixed by this pass.
Restyled 2026-08-31 to match `index.html`'s dark/lime brand (radial background blooms, pulsing
live badge, homepage-style countdown chip, skill-tier colours, staggered fade-up entrance,
gradient CTA + QR block) instead of the plain `venue.html`/`player.html` card it launched with.
A completed game (`games.status = 'completed'`) now gets a muted non-pulsing badge, an "Already
played" chip instead of a countdown, and past-tense body/OG copy instead of a join CTA that no
longer applies — verified live against a real hosted game id.

**G4. Production push and AI are silently failing.** `service_role` has no PostgREST table grants
on the live project, so `ai-proxy` and two branches of `push-dispatch` 403 in production
([store-readiness-plan.md](store-readiness-plan.md)). Push *is* the retention channel — game
reminders, join approvals, chat. Sentry is also inert (no DSN secret, no symbol upload). Acquiring
users into an app whose reminders don't fire is buying churn. **Blocker. Shipped, confirmed
2026-08-31** — both halves already fixed and just undocumented: the grants migration
(`20260815000400_service_role_grants.sql`) is live on the remote project (`supabase migration
list` shows it applied), and `EXPO_PUBLIC_SENTRY_DSN`/`SENTRY_AUTH_TOKEN` exist as GitHub secrets
(added 2026-08-24) with no `SENTRY_DISABLE_AUTO_UPLOAD` left in either build workflow.

### 3.2 P1 — conversion amplifiers, ship inside the first 30 days

**G5. Hard auth wall, no preview.** `ui/app/index.tsx` sends any session-less user to
`/onboarding`. With G3 the share funnel is: link → generic site → store → install → sign up →
onboarding → *then* the game. Six gates. The spec's "download required for any action" survives
intact if the **web page** previews the game read-only and the **app** allows browsing Discover
pre-signup with the wall at join/host. Recommend both. **Shipped 2026-08-31.** Web preview
(`game/[id].tsx`'s `GamePreviewTeaser`, backed by the anon `game_preview` RPC) already shipped
2026-08-20. App side: `index.tsx` now sends a session-less user to `/(tabs)/discover` instead of
onboarding; Discover runs off a new anon-safe `nearby_games_public` RPC (no organizer PII, no
exact address — same rule `game_preview` already followed) instead of `nearby_games`, which
403s without a session. Map, alerts, and the amenities filter stay authenticated-only (their
backing RPCs/tables are authenticated-only grants not worth widening for this slice) and wall to
`/onboarding`, same as Host and every tab but Discover in the tab bar. Join still walls via the
existing `GamePreviewTeaser` on the game screen.

**G6. No waitlist for full games.** [quick-wins.md](quick-wins.md) §3.1. "Full" is the state a
*popular* game reaches, and popular games are the ones that get shared. A share that lands after
capacity converts to nothing today. **~half a day. Shipped 2026-08-31.**

**G7. Referrals invisible.** `shareReferral` exists and `?ref=` attribution is captured
(`ui/lib/referral.ts`, `20260815000300_profile_referred_by.sql`), but nothing shows a count, a
standing, or a reward. An unrewarded, uncounted referral link is a button, not a loop.
**Fix: surface count + a real reward (§4.6). ~half a day. Shipped 2026-08-31.**

**G8. No recurring / duplicate game.** Sydney social badminton is overwhelmingly *weekly*. A host
who must re-key the wizard every Tuesday drifts back to WhatsApp within a month — precisely the
churn that kills a supply-seeded launch. Ship the cheap half (Duplicate, prefilled, date bumped)
per [quick-wins.md](quick-wins.md) §3.2. **~1h. Shipped 2026-08-31.**

**G9. No search.** 56 venues and no way to type "Alpha Auburn". Every flyer, poster and RED post
naming a venue creates a search intent the app cannot serve. **~2h for venue search. Shipped
2026-08-31.** The venue-search RPC and screen (`venues_directory`, `ui/app/venues/index.tsx`)
already existed but had no visible entry point from Discover's default list view — reaching it
took Filters sheet → scroll → "Browse venues", three taps deep. Added a **Search** pill to the
List view's chip row (`ui/app/(tabs)/discover.tsx`), same session-gated pattern as the existing
Map pill (anon users route to onboarding, matching G5's documented boundary — `venues_directory`
stays authenticated-only, not worth widening for this). Single-keyword queries ("Auburn") match
fine; multi-word literal queries ("Alpha Auburn") don't — `venues_directory`'s search predicate is
a pre-existing gap, not touched here.

**G10. ASO. Shipped 2026-08-31** — App Store Connect (console-only, no repo change):
- iOS name `Smashio: Badminton Games` (was bare `Smashio`), subtitle `Find players & courts near you`
- Keywords: `badminton,shuttle,social sport,pickup,courts,players near me,doubles,sydney,club,racquet`
- Screenshots already showed a filled roster with real suburb names (Sydney Olympic Park, Chatswood
  Sports Hall), no empty UI — no change needed.
- `zh-Hans` (Simplified Chinese) localisation added: name `Smashio: 羽毛球找搭子`, subtitle
  `找羽毛球搭子，就在你身边`, keywords `羽毛球,球局,球友,搭子,悉尼羽毛球,双打,球馆,附近球局,社交运动,约球,羽毛球俱乐部`,
  promotional text and description translated. `zh-Hant` not added — evaluate demand before
  doubling localisation maintenance.

### 3.3 P2 — compounding, start inside 90 days

**G11. Zero organic search surface.** `website/sitemap.xml` had five URLs. The DB holds 56 enriched
venues (amenities, pricing, photos) — genuinely unique data, the one thing that still makes
programmatic local pages rank in 2026. "badminton courts near me sydney" / "badminton auburn" is
high-intent, permanent, free traffic currently going to badmintoncourt.au and venue Facebook
pages. **Fix: static `/venue/:slug` pages generated from `venue_detail`, a `/sydney` hub, and a
real sitemap. NEW — ~1–2 days, highest long-run ROI in this doc. First slice shipped 2026-08-31.**
Two new anon-safe RPCs (`venue_seo_detail`, `venue_seo_directory`,
`20260831020000_venue_seo_pages.sql`) — `venue_detail` itself is authenticated-only and a crawler
never logs in. `website/api/venue/[slug].js` server-renders a real, indexable page per venue
(courts, hours, pricing, amenities, JSON-LD `SportsActivityLocation`), replacing the old
`noindex` placeholder `venue.html`; it also resolves the existing uuid-based `shareVenue` links
(`ui/app/venue/[id].tsx`) so those get real content too, canonicalised to the slug URL.
`website/api/sydney.js` is the hub page linking every indexable venue, grouped by suburb — added
to the homepage nav for internal linking. `website/api/sitemap.js` replaces the static sitemap,
listing the hub plus every venue with a slug and a profile (unenriched venues stay `noindex` and
out of the sitemap — venues-plan.md's P2 queue, thin pages hurt more than they help). Not done:
photos (private bucket, needs a signed URL a stateless function can't cheaply get — same
omission `game_preview` made), and the venue directory's P2 unenriched queue (51 venues) still
won't get a real page until enriched.

**G12. No club / group entity.** Sydney plays as named groups ("Sky Hawks"), not atomised
individuals. A recruited host's group has no object to own, so it can't bring its identity across.
[social-plan.md](social-plan.md) covers adjacent ground and is unapproved. **Deferred — out of
scope for this GTM pass, captured under social-plan.md instead.**

**G13. Privacy policy out of date — a marketing risk, not just a store risk.** Booking-confirmation
photos go to a third-party model provider and are retained up to 7 days
([host-flow-plan.md](host-flow-plan.md)); neither `website/privacy.html` nor the store data-safety
answers say so, and those photos carry names, emails, sometimes card last-4. Any press or
community attention will find this. **Fix before public launch. Shipped 2026-08-31** — privacy
policy updated (Google Gemini disclosed, 7-day photo retention), store-console answers drafted in
[store-readiness-plan.md](store-readiness-plan.md).

**G14. Cold-start empty state. Shipped 2026-08-31.** A user in a suburb with no games is the most
common bad first session during a launch. Discover's default (unfiltered) empty state
(`ui/app/(tabs)/discover.tsx`'s new `ColdStartEmpty`) now widens silently to the max radius option
(50km, closest-first, via the existing `useDiscoverGames`/`nearby_games(_public)` — no new RPC)
and shows the nearest 3 games with distance, an "Alert me" row reused from the D5 fallback ladder
but relabelled "Tell me when a game appears in `<suburb>`", and "Host one, we'll help fill it".
Only falls back to the bare kookaburra "Court's quiet right now" state when the 50km pool is also
empty. The isFiltered branches (D5 ladder, radius-relaxed) are untouched — this only fires on the
true no-filter cold start.

**G15. Website has no capture.** No email/waitlist capture, no Android-beta signup. Every
pre-launch impression not ready to install is lost. **~2h. Not required — Android ships next
week (2026-09-07 target), so no Android-beta waitlist needed.**

### 3.4 Fix order

```
G1 analytics → G2 Android → G4 push/Sentry → G3 share pages → G14 empty state → G10 ASO
  → G6 waitlist → G8 duplicate → G5 preview → G7 referral reward → G9 search → G11 SEO pages
  → G13 privacy → G15 capture
```

G12 groups deferred, out of scope — see social-plan.md.

G1–G4 are pre-launch. G14 and G10 ship with launch. The rest run through the first 60 days.

---

## 4. Channel plan

Ranked by expected cost per *retained player*, not per install.

### 4.1 Tier A — host recruiting (the whole ballgame)

Target: **30 active hosts publishing 60+ games/week across the 3 clusters by day 60.**

Method — deliberately unscalable, which is correct at this stage:

1. List every reachable Sydney badminton organiser: Meetup organisers, NSW Badminton affiliated
   club contacts, uni club committees, big Facebook group admins, and the regulars-with-a-group at
   the 56 venues already in the DB.
2. Contact them individually. Pitch admin relief, not "join our app": roster, reminders, no-show
   tracking, cost split, reliability scores — all shipped
   ([post-game-plan.md](post-game-plan.md), [host-flow-plan.md](host-flow-plan.md)).
3. White-glove them — create their first three games *for* them from their existing schedule and
   hand over the account. Zero setup cost is the offer.
4. Give the first 30 a permanent **Founding Host** badge. Costs nothing, is unrepeatable later,
   and `TierBadge.tsx` already models cosmetic tiers.

Success test: a recruited host publishes a 4th game *without being asked*. Instrument that event.

### 4.2 Tier A — Smashio-run sessions (buy supply directly)

Where a cluster has demand but no willing host, **be the host.** Book a court, publish it, fill it,
turn up. Sydney court hire runs roughly $25–40/hr; a 2-hour session for 8 players is under $80 of
subsidy for 8 real first *sessions* plus a fillable weekly slot — a sub-$10 cost per played game
against a ~$27 paid install for an app-open.

Run 1–2 per week per cluster for 8 weeks, always the same time and venue so it becomes a fixture,
then hand each one to its most reliable regular (who becomes a Founding Host).

### 4.3 Tier A — venue partnerships

56 enriched venues is an asset nobody else in market has. Offer each venue, free:

- A **verified venue page** in-app (`ui/app/venue/[id].tsx`, already built) and, after G11, a real
  indexed web page they can link to.
- A **QR poster at the door / court-side**: "Court free tonight? Find players →", deep-linking to
  that venue's games (needs G3/G11 so the no-app fallback isn't embarrassing).
- **Fill their off-peak.** Venues care about 2pm Tuesday, not 8pm Thursday. Publishing off-peak
  sessions is a commercial pitch, not a favour ask.

Start with the 6–8 highest-court-count venues in Clusters A and C. One 10-court venue with a QR at
reception beats 200 flyers.

### 4.4 Tier A — university clubs

Two hard dates: **O-Week, February and July.** Between them: club socials and ladders.

- Sponsor a uni club's weekly session for a term in exchange for Smashio being the sign-up
  mechanism. A shuttle-tube subsidy is $30–50/session and buys a captive weekly cohort.
- Run an **inter-uni ladder** on Smashio — ladders create a weekly reason to open the app, which is
  exactly the retention hole a transactional app has.
- Students churn out of Sydney but churn *in* every February. Treat it as an annuity.

### 4.5 Tier A — language channels (the underrated one)

- **Xiaohongshu (RED)** for Clusters A/C. RED is a search-and-research surface, so posts must be
  useful — Sydney court guides, peak/price comparisons, how a newcomer or student finds partners —
  each ending at the app. Post consistently or don't start; a dormant account is worse than none.
  Use 3–5 micro-creators (10k–100k followers), not one large one: 3–5x the engagement at a
  fraction of the cost.
- **WeChat**: get into the existing Sydney badminton groups *via the hosts recruited in §4.1*.
  Never cold-blast. One trusted group admin sharing a game link beats any ad.
- **WhatsApp Communities** for the subcontinental cohort — same play, and the format maps 1:1 onto
  how those groups already coordinate.
- Localised store listings (G10) close the loop: a Chinese-language RED post landing on an
  English-only store page converts badly.

Community-led acquisition of this shape reports roughly half the CAC and materially better
retention than paid, and here it is also the only way to reach a segment paid channels can't
target well in Australia.

### 4.6 Tier B — referral, once G7 lands

Reward must be something Smashio can give free that a group chat can't:

- **Priority spot** — first claim on a reserved spot in games they've joined
  (`games.reserved_spots` exists, [post-game-plan.md](post-game-plan.md)).
- **Cosmetics** — alternate app icon / avatar prop tier ([quick-wins.md](quick-wins.md) §2.3,
  [smashimals-plan.md](smashimals-plan.md) props).
- **Free entry to a Smashio-run session** (§4.2) — real value, cash cost already budgeted.

Avoid cash or credit rewards: no wallet exists, it invites fraud, and it drags positioning toward
the booking app §1 rejects.

**Shipped mechanic (2026-08-31, `20260831010000_referral_priority.sql`):** priority spot, scoped
to the waitlist queue rather than reserved spots (those stay host-named/invited/token-only, no
public self-claim path exists to reward into). Each successful referral
(`profiles.referred_by` set for the first time) banks one credit on the referrer
(`profiles.referral_priority_credits`). The credit is spent automatically, one-time, the next time
that referrer's `request_to_join` lands them on a full game's waitlist — `game_players
.priority_waitlist` is stamped true and `promote_waitlist`/`waitlist_position` sort priority rows
ahead of the existing FIFO queue. Not a skip-to-approved: still a queue, just a shorter one.

### 4.7 Tier B — content engine

4–6 short videos/week, shot at the Smashio-run sessions (§4.2) so content costs nothing extra.
Formats that work: rally clips with a "who's the higher level?" hook, "turning up to play with
total strangers" POV, venue tours (which double as G11 page content), 20-second beginner
technique. Post to TikTok, Reels and RED. Write titles and on-screen text as *search targets*
("badminton sydney beginners", "where to play badminton auburn") — TikTok search volume is up
sharply year on year and behaves like a second app store.

Amplify only what already performs organically. Never boost cold creative.

### 4.8 Tier B — local PR and earned media

Angles a Sydney outlet will actually run: solo founder builds an app because he couldn't find a
fourth; badminton as the quiet giant of Sydney's west; migrant communities organising sport over
WeChat. Targets: council papers, uni papers, r/sydney (participate, don't spam),
community-language media.

### 4.9 Tier C — paid, only after 3 liquid suburbs exist

- **Apple Ads**: brand-defence exact match (cheap), plus a small category/competitor set. Cap hard;
  sports CPT is the worst in the store.
- **Meta/Instagram**: 5km radius around anchor venues, badminton interest, language targeting for
  Clusters A/C. Creative = the best organic video, not purpose-made ads.
- **Giveaways**: under **$10,000** total prize value, a NSW game-of-chance promotion needs no
  authority, and games of *skill* never do. Keep prize pools small and entry free. Opening a
  promotion to other states means checking those states separately.

Guard: paid spend stays under 25% of total until CAC is known from G1 data.

---

## 5. 90-day sequence

### Phase 0 — weeks −4 to 0 (fix and seed, publicly quiet)

- [ ] G1 analytics, G2 Android release path, G4 push/Sentry, G3 share pages, G14 empty state.
- [ ] G10 ASO metadata + `zh-Hans`/`zh-Hant` listings; G13 privacy copy.
- [ ] Recruit the **first 10 hosts**, publish their real schedules (target 20 live games).
- [ ] Book the first 4 Smashio-run sessions (one per cluster, plus one uni).
- [ ] Sign 3 venue partners; print QR posters.
- [ ] G15 capture live; start collecting Android-beta signups.

**Gate to launch: ≥20 published games in the next 14 days across ≥3 suburbs, and push verified
end-to-end on both platforms.** Do not launch into an empty map.

### Phase 1 — weeks 1–4 (launch the clusters)

- [ ] Public launch, both stores, zero paid spend.
- [ ] Hosts to 20; Smashio-run sessions at 2/week/cluster.
- [ ] Content engine live (4–6 posts/week); RED account plus 3 micro-creators.
- [ ] WeChat/WhatsApp seeding through recruited hosts.
- [ ] Ship G6 waitlist, G8 duplicate.
- [ ] Weekly funnel review (§6); kill any channel with no signal after 2 weeks.

### Phase 2 — weeks 5–8 (make it repeat)

- [ ] G5 preview, G7 referral reward, G9 search.
- [ ] First ladder/tournament in Cluster A or inter-uni.
- [ ] Hand 2 Smashio-run sessions to Founding Hosts; measure whether they survive handover.
- [x] Start G11 venue SEO pages — long lead time, start before you need the traffic. First slice
      shipped 2026-08-31 (67 venue pages + hub + sitemap); photos and the P2 enrichment queue
      remain.
- [ ] First capped paid test, only in already-liquid clusters.

### Phase 3 — weeks 9–12 (prove the loop, then expand)

- [ ] Target: 30 hosts, 60+ games/week, 3 liquid suburbs, ≥40% of new users arriving via
      share/referral/organic search rather than direct.
- [ ] Expand to a 4th cluster only when clusters 1–3 hold liquidity 3 weeks running *without*
      Smashio-run sessions propping them up.

---

## 6. Instrumentation (what G1 must emit)

Ten events, no more, or the data becomes unreadable.

| Event | Why |
|---|---|
| `app_open_first` (source, `?ref`) | per-channel attribution |
| `onboarding_step_completed` (step) | the drop-off nobody can see today |
| `discover_viewed` (games_visible_count) | **the empty-map metric** — sessions seeing 0 games is the launch killer |
| `game_viewed` (source: share/deeplink/discover/map) | proves or kills the share loop |
| `join_requested` / `join_approved` | the real conversion, not install |
| `game_played` (attendance marked) | the only event that means anything |
| `game_published` (host, is_duplicate) | supply health, and §4.1's 4th-game test |
| `share_sent` (game/venue/referral) | viral coefficient inputs |
| `rating_submitted` | loop closure, and the store-review prompt trigger |
| `push_opened` (category) | verifies G4 stays fixed |

Derived weekly: **liquid suburbs**, fill rate (joined/capacity), host retention (publishing in
week N → N+1), share→install→join conversion, CAC per channel.

---

## 7. Budget scenarios (first 90 days)

| | Bootstrap ($0–500) | Realistic ($2–3k) | Aggressive ($8–10k) |
|---|---|---|---|
| Smashio-run sessions | 1/wk × 8 wks (~$400) | 4/wk × 10 wks (~$1,400) | 8/wk × 12 wks (~$3,500) |
| Uni sponsorship | — | 1 club, 1 term (~$400) | 3 clubs (~$1,500) |
| RED/TikTok micro-creators | — | 3 creators (~$600) | 8 creators (~$2,000) |
| Print / QR at venues | ~$100 | ~$200 | ~$400 |
| Giveaways (keep prize pool < $10k) | — | ~$300 | ~$1,000 |
| Paid ads | $0 | $0 until liquid, then ~$500 test | ~$1,500 capped |

Bootstrap is viable. Tier A is mostly labour, and labour is the founder's to spend. Nothing above
beats the host-recruiting calls in §4.1.

---

## 8. Not doing (and why)

| | Why not |
|---|---|
| National launch | Liquidity is local. A Melbourne user with an empty map is a permanent uninstall. |
| Multi-sport marketing | Schema stays multi-sport; the *message* stays badminton until Sydney badminton is liquid. |
| Paid installs pre-liquidity | ~$27 CPI into an empty map. |
| Influencer mega-deals | Micro-creators out-convert them 3–5x here at a fraction of the price. |
| Court booking / payments | Contradicts positioning ([business-context.md](business-context.md)) and picks a fight with the venues who are supposed to be partners. |
| A generic social feed as a launch feature | [social-plan.md](social-plan.md) is unapproved, and an empty feed makes a young app look dead. |
| Paying users to install | Attracts non-players, and one no-show poisons a real game for 7 other people. |

---

## 9. Risks

1. **Host churn back to WhatsApp.** Mitigation: G8 duplicate + reminders + roster admin the group
   chat can't do. Watch host week-N→N+1 retention above every other number.
2. **A no-show ruins someone's first session.** Reliability scores and no-show marking exist
   ([post-game-plan.md](post-game-plan.md)) — market them as the trust promise, and enforce them.
3. **Android slips again.** It gates half the addressable audience. If it can't ship, the plan
   shrinks to iOS-heavy clusters (uni corridor, east) at materially worse cost per player.
4. **A venue reads Smashio as competition.** Never frame as booking; lead with off-peak fill.
5. **Booking-confirmation privacy exposure** (G13) surfacing exactly when attention peaks. Fix
   before the first press push.
6. **ASIC business-name determination still pending** ([business-context.md](business-context.md))
   — resolve before spending on print, signage, or paid creative carrying the name.
