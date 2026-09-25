# GTM strategy — Smashio, Sydney launch

Written 2026-09-25. **This is the authority for go-to-market planning.** Any marketing, growth,
launch, content, partnership or pricing plan cites this doc and stays inside it. Change the
strategy here first, with a dated amendment, then change the plan.

Status: **direction signed off** (owner, 2026-09-24/25: the strategy paragraph in §1 and the
short-a-player positioning). Dates, budget and the open decisions in §13 are proposed.

Relationship to other docs:
- [gtm-plan.md](gtm-plan.md) (2026-08-26) is the **history and gap audit**. Its §3 (G1–G15) records
  why each growth fix exists and is still the reference for those. Its §0–§2 and §4–§7 are
  superseded by this doc where they disagree, mainly §2.3 ("no direct competitor", wrong) and the
  organiser-first targeting.
- [short-a-player-plan.md](short-a-player-plan.md) is the **product half** of this strategy
  (shipped 2026-09-25). This doc is the market half.
- [website-plan.md](website-plan.md), [social-plan.md](social-plan.md),
  [business-context.md](business-context.md) keep their own authority for their areas.

---

## 1. Strategy on one page

> Sydney has plenty of badminton players. What it lacks is **games you can find**. Players are
> stuck in WhatsApp, WeChat and Meetup groups, and the moment it hurts most is **when you've
> booked a court and you're a player short**. Smashio owns that moment: post the spot, and nearby
> players at your level get pinged. They can trust the game because the **court's booked**, their
> **level is voted** by people who've played with them, and their **turns-up rate** is on show.
> We launch in 2–3 suburb clusters, not "Sydney", we grow through venues and group chats rather
> than ads, and we never pitch ourselves as a booking app.

**Promise:** *Got a court, short a player? Smashio fills it, with someone your level who actually turns up.*
**Tagline:** *Real court. Real level. Real players.*
**Legacy line, still valid:** *Stop chasing a fourth.*

---

## 2. Positioning

### 2.1 The job

| | The small game (**ours**) | The big social session (not ours) |
|---|---|---|
| Shape | 2–6 people, someone booked a court, 1–3 short | 10–40 people, one organiser, $15–25 a head |
| Pain | "Partner pulled out, I've got a $35 court and 3 players" | Admin: roster, payments, waitlist |
| Today | Begging group chats, cancelling, playing 2-on-1 | Jigsaur, Meetup, WhatsApp clubs |
| Owner | **Nobody** | Jigsaur Sports is ahead |

We serve the big-session organiser if they come (the app handles 20-player games), but we never
lead with them and never build their feature list (payments, check-in, rotation).

### 2.2 Message house

| Pillar | Player-facing words | Proof in the product |
|---|---|---|
| **Real court** | "Court booked" | Host uploads the booking, checked server-side (`verification_status`) |
| **Real level** | "Level voted by 7 players" | Post-game skill votes (`peer_skill_vote`), shown from 3 votes |
| **Real players** | "Turns up 98%" | Reliability score, host marks no-shows, late-leave ledger |
| **Fast** | "Needs 1 · tonight" / "filled in 38 min" | `spot_open` alerts, waitlist, time-to-fill from `spot_openings` |

### 2.3 Words

- **Use:** short a player, need one more, fill your court, court booked, your level, keen, tonight,
  turn up, game on.
- **Never:** book courts, booking app, marketplace, verified (for a game's booking, say "court booked"),
  "the best", competitor names, anything claiming open Android access before it exists.
- Copy tone per [CLAUDE.md](../CLAUDE.md): casual Australian, clear first, no em dashes.
- Chinese (RED/WeChat): working line *有场地，缺一人？Smashio 帮你凑齐* ("Got a court, one short?
  Smashio fills it"). **Have a native speaker check it before it's used.**

### 2.4 Who we're for

| Segment | Role in the flywheel | Where they are |
|---|---|---|
| **Court bookers** (pairs and trios who book a court at a commercial centre) | **Supply**: they post spots | At the venue, in the venue's booking flow, in small friend group chats |
| **Solo and newly arrived players** (students, new to Sydney, lost their group) | **Demand**: they fill spots | RED, uni clubs, Facebook groups, "badminton near me" searches |
| **Small recurring groups** (4–12, weekly) | Both. They post their overflow and fill each other | WhatsApp/WeChat groups, one admin each |
| Big-session organisers | Not a target | Jigsaur, Meetup |

---

## 3. Market

### 3.1 Competitive set (checked 2026-09-24)

| Who | What | Threat |
|---|---|---|
| **Jigsaur Sports** (jigsaur.app) | Sydney-only social badminton app. Organiser-led sessions, waitlist, payments, QR check-in. Claims 1,000+ players and 400+ sessions. English only. Organiser-picked levels. Absorbing smaller tools (SmashBud moved to it). | **High** for big sessions. Low for the small game. Watch for them adding "need a player". |
| Sydney Badminton Hub | Website + Discord: 70+ sessions, 30+ courts, coaches, tournaments. 18k visits/yr. No app. | Content and SEO competitor. Possible partner. |
| Meetup, Facebook groups, WhatsApp/WeChat groups | Where most sessions actually live | The real incumbent: free and familiar |
| Reclub | Global club app, thin in Sydney | Low |
| Rotation apps (Racket Social, Qcourt, Shuttl) | Court rotation inside a session | Different job |
| Playo (India), Rallia (US) | Closest product analogues, not in market | Proof the model works. Playo's self-rated levels are known to inflate, which our voted levels answer. |

**Never name a competitor in marketing.** Re-check this table before launch and every quarter.

### 3.2 Where to launch

Launch clusters, not a city. A cluster is "liquid" when games there post **and** fill without us.

| Cluster | Venues | Why | Notes |
|---|---|---|---|
| **A: Auburn / Granville / Lidcombe / Olympic Park** | Alpha Auburn, NBC South Granville, NBC Olympic Park, Yennora | Most courts, most bookers | **Default first cluster** |
| **B: Uni corridor** (Kensington / Ultimo / Camperdown) | UNSW, UTS, USYD halls, NBC Alexandria | Most app-native, lots of solo players | Term-bound. Light now, big at Feb O-Week |
| **C: Chatswood / Eastwood / Hurstville** | Local centres | Chinese-language channels (RED, WeChat) | Strongest non-English fit |

Pick **A plus one of B or C** that the founder can physically reach every week (§13 D-3). Expand
to a new cluster only after the current ones stay liquid for 3 weeks running without Smashio-run
sessions holding them up.

---

## 4. How growth works (the flywheel)

```
 booker posts spot ──► spot_open alert ──► nearby player at that level joins
        ▲                                             │
        │                                             ▼
 more bookers trust it ◄── levels + reliability ◄── game played, votes and attendance
        │                    get richer
        └── "filled in 38 min" becomes the marketing proof
```

**The constraint at launch is the alert pool, not games.** A booker only comes back if the spot
fills. A spot fills only if enough players with alerts on (home point + tier) live within 10 km
of that venue. So:

1. **Build the alert pool per cluster first:** players with a home point, a tier and alerts on.
   Target **≥60 per launch cluster** before the public push.
2. **Then reach bookers at the moment they're short:** at the venue (QR at reception and court-side),
   in their group chat (the share link), and through search.
3. **Seed games ourselves where needed:** Smashio-run weekly sessions in each cluster give the pool
   something to join before bookers arrive, and film content.

---

## 5. Where we are (2026-09-25)

**Product: launch-ready for this strategy.** Discover, host flow with booking parse, join/waitlist,
chat, ratings plus skill votes, reliability, referrals, duplicate game, feed, spot alerts with
inline "Ask to join", Court booked / Needs N / voted levels, share pages, venue/suburb/club SEO
pages, email capture, PostHog in the app and on the web.

**Market: zero.** Production was wiped 2026-09-24. **One** real profile. All 17 upcoming games are
seeded (`5eed0000…`), fake players who can't log in.

**Blockers before any public push:**

| # | Blocker | Owner | By |
|---|---|---|---|
| B1 | **Google Play production access.** New *personal* developer accounts must run a closed test with ≥12 opted-in testers for 14 days in a row, then pass review (up to ~7 days). **Unverified for this account, check Play Console → Dashboard.** Internal testing doesn't count. | Owner | Closed test running by **9 Oct** |
| B2 | iOS App Store review for public release (submit early, hold with "manually release") | Owner | Submit by **26 Oct** |
| B3 | **Remove the seeded fake games and players** before real users arrive. Real people would ask to join games that don't exist, and the website's live numbers count them. Removal handle: `5eed0000%`. | Owner decides, Claude runs | The day the first real games are live, and no later than the pre-launch push |
| B4 | Store subtitle + keywords (short-a-player A19): *"Short a player? Fill your court"* | Owner, console | Before B2 submission |
| B5 | Device check of spot alert "Ask to join", and Approve/Decline + Reply on Android | Owner + tester | This week |

---

## 6. Calendar

Recommended launch: **Thursday 12 Nov 2026** (fallback Thu 19 Nov). After ~20 Nov, hold the public
push for **Feb 2027 O-Week** instead, because December–January is holidays and many students leave Sydney.

| Date | Milestone |
|---|---|
| 25 Sep – 11 Oct | Phase 0: foundations |
| **by 9 Oct** | Play closed test running with ≥12 testers (B1) |
| 12 Oct – 1 Nov | Phase 1: seed the clusters |
| **2 Nov** | **Go/no-go** (§7.3) |
| 2 – 11 Nov | Phase 2: pre-launch |
| **12 Nov** | Public launch, both stores |
| 12 Nov – 20 Dec | Phase 3: prove the loop |
| 21 Dec – Jan | Holding pattern: keep weekly sessions alive, content only |
| **Feb 2027** | Uni O-Week (UNSW, UTS, USYD): second launch for Cluster B |

---

## 7. Phases

### 7.1 Phase 0: foundations (25 Sep – 11 Oct)

- [ ] B1 closed test (friends, family, beta players; they must stay opted in for 14 days).
- [ ] B4 store text; B5 device check.
- [ ] Decide D-1 (launch date) and D-3 (clusters).
- [ ] Claim one handle on Instagram, TikTok, Facebook and Xiaohongshu (RED). Same name, logo and bio link.
- [ ] **Recruit list** (spreadsheet, ~100 rows): venue front-desk managers in the chosen clusters,
      admins of small WhatsApp/WeChat groups, uni club committees, Facebook group admins,
      regulars you meet at courts. Columns: name, type, cluster, contact, status, next step.
- [ ] **Start one Smashio-run weekly session** in Cluster A (same venue, same time, every week,
      ~$35/hr court). Post it on Smashio and fill it. This is your first real game and your film set.
- [ ] Weekly scorecard (§9) set up in PostHog + one SQL query.

### 7.2 Phase 1: seed the clusters (12 Oct – 1 Nov)

Goal: **alert pool ≥60 per cluster, ≥20 real games in the next 14 days, ≥8 people who've posted.**

- **Venues (main channel for bookers).** Pitch 3–4 venues per cluster: *"When your customers
  are a player short, they cancel. Smashio fills the spot, so the booking stays."* Ask for:
  a QR poster at reception and court-side (*"Short a player? Fill your court →"*, linking to that
  venue's page), permission to mention it in their booking confirmation email or socials, a
  staff member who points people to it. Give them the free venue page (already live).
- **Group chats (demand and supply together).** Ask small-group admins to post their overflow
  games on Smashio and drop the link in the group. Every link is a free install funnel.
- **Personal recruiting.** Show up at sessions and sign people up on the spot. Make sure they set
  their home suburb and level, which is what puts them in the alert pool.
- **Smashio-run sessions:** 1–2 per week per cluster.
- **Content** (from the sessions): 3 posts a week. Formats: "posted at 5pm, full by 6", "turned up
  alone to play with strangers", venue tours, rally clips. Captions written as search phrases
  ("badminton sydney beginners", "where to play badminton auburn").
- **RED:** 2 useful posts a week in Chinese (court prices, how to find people to play with in
  Sydney, venue guides). Consistency or nothing.

### 7.3 Go/no-go (2 Nov)

Launch only if **all** are true:

1. ≥20 real games (not seeded) published for the next 14 days, across ≥3 suburbs.
2. ≥60 players in the alert pool in each launch cluster.
3. At least 5 real last-minute spots filled through a `spot_open` alert (proof for §2.2's "Fast").
4. Seeded data removed (B3). Android production approved (B1), iOS approved and held (B2).
5. Push verified on both platforms (B5).

**If it's a no, move the date.** Never launch into an empty map.

### 7.4 Phase 2: pre-launch (2 – 11 Nov)

- Every group admin and venue gets a "we're live on the 12th" message and a ready-to-forward text.
- Email the website signups (`web_signups`).
- Press list of about 10: council papers, uni papers, community-language outlets (SBS language programs,
  Chinese-language Sydney media). Angle: *local founder built an app because he kept being a
  player short.*
- Line up 2–3 micro-creators (10k–100k followers, RED or TikTok) to post in launch week.

### 7.5 Launch week (from 12 Nov)

- Day 1: release both stores; venues put up posters; group admins post; press emails; creators post.
- Days 2–7: be at 3+ sessions in person. Reply to every review and message within hours.
- **$0 paid.**

### 7.6 Phase 3: prove the loop (to 20 Dec)

- Hand each Smashio-run session to its most reliable regular.
- One small **ladder or mini-tournament** in Cluster A (gives people a weekly reason to open the app).
- Publish the first real proof number: median time-to-fill.
- **Paid ads only after a cluster is liquid 2+ weeks** (§8 Tier C).

### 7.7 Phase 4: Feb 2027 O-Week

Stalls at UNSW, UTS and USYD. Sponsor one uni club's weekly session for the term (~$400). Pitch to
students: *"New to Sydney? Find a game at your level tonight."* Inter-uni ladder.

---

## 8. Channels (ranked by cost per retained player)

| Tier | Channel | Why | Cost |
|---|---|---|---|
| **A** | **Venue partnerships + QR** | Reaches bookers at the exact moment of pain; venues gain kept bookings | Print ~$150 |
| **A** | **Group-chat seeding via admins** | Trusted distribution, zero cost | Time |
| **A** | **Personal recruiting at sessions** | Builds the alert pool with real players | Time |
| **A** | **Smashio-run weekly sessions** | Guaranteed games + content | ~$35/hr each |
| **B** | RED + WeChat (Chinese), WhatsApp communities (South Asian) | Reaches communities English-only channels miss; Jigsaur is English-only | Time + ~$500 creators |
| **B** | Short video (TikTok, Reels, RED) shot at our sessions | Search-driven discovery, cheap to make | Time |
| **B** | SEO (venue/suburb/guide pages, already live) | Compounding, free | Time |
| **B** | Referrals (priority waitlist credit, already live) | Rewards the people who bring players | Free |
| **B** | Local PR and uni media | Credibility | Time |
| **C** | Paid (Instagram 5 km around liquid venues; Apple Search Ads brand terms) | Only amplifies what already works organically | ≤$500 until CAC known |
| **C** | Giveaways | Keep them free to enter and skill-based, or keep the prize pool under $10k (NSW rules) | ~$150 |

Rule: drop any channel that shows no signal after 2 weeks. Only boost content that already did
well organically.

---

## 9. Metrics

**North star: liquid suburbs.** A suburb where ≥1 game was published *and* filled to ≥75% in the
trailing 7 days, excluding Smashio-run sessions.

**Promise metric: median time-to-fill for a last-minute spot** (`spot_openings.opened_at` →
`filled_at`). This is the number marketing quotes.

Weekly scorecard (every Monday, one table, kept in this doc's §14 log or a linked sheet):

| # | Metric | Source | Phase 1 target | Launch +4 wk |
|---|---|---|---|---|
| 1 | Real upcoming games, next 14 days | `games` (excluding seeded and Smashio-run) | 20 | 60 |
| 2 | Alert pool per cluster | profiles with home point + tier + alerts on, within 10 km | 60 | 150 |
| 3 | Spots opened → % filled before start | `spot_openings` | — | ≥50% |
| 4 | Median time-to-fill | `spot_openings` | — | <2 h |
| 5 | Repeat posters (posted last week and this week) | `games.organizer_id` | 5 | 20 |
| 6 | Liquid suburbs | derived | 1 | 3 |
| 7 | % of Discover opens showing 0 games | PostHog `discover_viewed` | <30% | <15% |
| 8 | New installs by source | PostHog `app_open_first` | — | report only |

If #7 goes above 30%, stop acquisition and go back to seeding.

---

## 10. Budget (to 20 Dec)

| Item | Amount |
|---|---|
| Smashio-run sessions (≈2/wk × 10 wk) | ~$700 |
| Print (QR posters, table cards) | ~$150 |
| Micro-creators (2–3) | ~$500 |
| Giveaway | ~$150 |
| Paid ads, only once a cluster is liquid | $0–500 |
| **Total** | **~$1.5–2k** |

Founder time: **~10 h/week** (4 recruiting, 3 at sessions, 2 content, 1 numbers). That time matters more than the money.

---

## 11. Guardrails (not doing)

| | Why not |
|---|---|
| Launch "Sydney" or another city | Liquidity is local. An empty map means a permanent uninstall. |
| Paid installs before a cluster is liquid | Sports installs cost ~$27 each and land on an empty map |
| Pay people to install | Brings non-players and no-shows |
| Market as a booking app, or build payments/check-in to match Jigsaur | Picks a fight with venues (our partners) and walks into the competitor's lane |
| Multi-sport marketing | Schema stays multi-sport, message stays badminton until Sydney badminton is liquid |
| Big influencers | Micro-creators get 3–5x the engagement for less |
| Fake activity in public (seeded games, invented numbers) | Misleading under Australian Consumer Law; kills trust, which is our whole pitch |
| Name competitors | Own the job instead |

---

## 12. Risks

1. **Alert pool too thin, so spots don't fill.** Bookers try once and leave. *Mitigation:* the
   go/no-go gate on pool size; Smashio-run sessions; recruit in person.
2. **Jigsaur adds "need a player".** *Mitigation:* our trust layer (court booked, voted level,
   reliability) is harder to copy than a button. Move fast in our clusters.
3. **Play production access slips (B1).** It covers roughly half the audience, and more in Clusters A and C. *Mitigation:*
   start the closed test now; if it slips, launch iOS and keep the Android waitlist.
4. **A no-show ruins someone's first game.** *Mitigation:* reliability plus no-show marking are
   the promise, so enforce them and keep them visible.
5. **A venue sees us as competition.** *Mitigation:* lead with kept bookings, never "booking".
6. **Founder bandwidth.** *Mitigation:* 2 clusters, not 3; the weekly routine in §14.

---

## 13. Decisions

### Settled

| # | Date | Decision |
|---|---|---|
| S-1 | 2026-09-24 | Strategy paragraph (§1): games not ads, clusters not city, group chat is the real competitor, never "book courts" |
| S-2 | 2026-09-24 | Own the small game ("short a player"), not organiser admin; don't compete with Jigsaur head-on |
| S-3 | 2026-09-24 | Small builds S1–S8 (short-a-player-plan), shipped 2026-09-25 |
| S-4 | 2026-09-10 | Android stays on internal testing until further notice (AGENTS.md). Note: public launch still needs production access (B1). |
| S-5 | 2026-08-26 | No paid acquisition before liquidity; paid stays under 25% of spend until CAC is known (gtm-plan §4.9) |

### Open

| # | Question | Recommendation |
|---|---|---|
| D-1 | Launch date | **Thu 12 Nov 2026**; fallback 19 Nov; otherwise Feb 2027 |
| D-2 | When to remove the seeded data (B3) | The day the first real games go live, and no later than 1 Nov |
| D-3 | Which clusters | **A** plus whichever of B/C the founder can reach every week |
| D-4 | Budget ceiling to Christmas | ~$2k |
| D-5 | Founding Host badge for the first 30 regular posters | Yes, small build (~0.5 d), strong recruiting hook |

---

## 14. Operating rhythm

- **Monday:** scorecard (§9), pick this week's 3 priorities, update §5 blockers.
- **Weekly:** 10 recruiting conversations, 1–2 sessions attended, 3 content posts, 2 RED posts.
- **Every plan doc from now on** opens with a line saying which section of this doc it serves
  (e.g. "Serves gtm-strategy §4 alert pool"). If it serves none, question whether to build it.
- **Amend this doc** with a dated block when a decision changes; never silently rewrite §1–§4.

### Log

| Week of | Note |
|---|---|
| 2026-09-22 | Doc written. Short-a-player shipped. Prod: 1 real profile, 0 real games. |
