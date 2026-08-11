# Discover Plan — SMASHIO

Written 2026-08-11. Goal: make Discover the best-in-class landing page for pickup badminton — judged on UX, UI, creativity, retention, and information density. Companion to [ux-plan.md](ux-plan.md) (which covered app-wide polish); this doc is only the Discover tab.

Scope: [ui/app/(tabs)/discover.tsx](../ui/app/(tabs)/discover.tsx), [GameCard.tsx](../ui/components/GameCard.tsx), [GameMap.tsx](../ui/components/GameMap.tsx), plus the `nearby_games` RPC. Backend changes are called out per phase — most of this is UI, but two phases need SQL.

---

## 1. Who is on this screen (HCD frame)

Discover serves three different people wearing three different hats. Today it serves one of them, badly.

| Mode | Share (est.) | Mental state | What they need | Success |
|---|---|---|---|---|
| **Hunter** | ~60% | "Tuesday's free. Get me in a game." | Filter by day + level, see spots left, judge trust fast | Joined a game in <60s |
| **Browser** | ~30% | "What's the scene like?" | Structure, faces, venues, a reason to come back | Left with intent for later in the week |
| **Stranded** | ~10% | "Nothing here for me." | An exit that isn't a dead end | Set an alert / widened search / hosted |

The current screen is a degraded Hunter tool: one flat list, one filter row, one dead end.

**Design principle for the whole plan:** the join decision is a *trust* decision, not a *browse* decision. A player asks "is this real, is it my level, will it actually happen, who's running it?" Every pixel on the card should answer one of those four. Everything else is decoration.

---

## 2. Benchmark — what the world's best Discover pages actually do

Not a features list. Each row is a mechanic worth stealing, and why it maps to badminton.

| Product | Mechanic | Why it applies to us |
|---|---|---|
| **Airbnb** | Map is a *layer*, not a mode — results and map coexist, pins carry price, a card carousel is synced to pins. Cards carry editorial badges ("Guest favourite"). | Our List/Map toggle throws away the list. Location is the #2 decision factor after time; it should never cost you your results. |
| **Playtomic** (direct competitor) | Level-matching is the product. Shows your level vs the match level and whether you're eligible; "Matches in Common" screen. | Our skill tier is a decorative colored pill. It should be a *fit verdict*: "Your level" / "One above you". |
| **GoodRec** (direct competitor) | Brutal simplicity — sport → city → game → show up. Explicitly surfaces the host ("find your host"). 4.88 iOS. | The fast path must be ≤2 taps. And host identity is table stakes in pickup sports; we show none. |
| **Spotify Home** | Horizontal shelves that each declare *why they exist* ("Because you played X"). | A flat chronological list has no point of view. 2–3 named rails give the app a voice and make it feel like it knows you. |
| **Resy / OpenTable** | You scan by *time slot*, not by list position. | Players think in days ("Thursday night"), not in list order. Day-grouped sticky sections beat a flat feed. |
| **Strava** | The feed is social, not transactional. "3 people you follow ran here." | Our real moat is people. A game with 5 named faces converts; a game with a number doesn't. |
| **Meetup** | Host credibility block, "X going", RSVP deadline. | Same trust problem, solved. |
| **Instagram Explore / TikTok** | Never empty. Always adjacent supply. | Our empty state is a wall. It should be a ladder. |
| **Duolingo** | Retention = a daily reason to return, not a better search. | "Alert me when a game matches" turns a failed search into a scheduled return visit. This is the retention primitive we lack entirely. |
| **Partiful** | Event pages that feel like a party, not a form. | Voice. We started this in Phase 5 empty states; it should reach the cards. |

**Synthesis — the five things all of them share:**
1. The default view is already personalised. Nobody lands on "All".
2. Every result carries a *human* (host, attendees, faces).
3. Scarcity and urgency are shown only when real.
4. There is always a next thing to look at. No dead ends.
5. Structure over volume — grouped, labelled, with a stated reason.

We currently have **none** of the five.

---

## 3. Diagnosis — what's wrong today

Grounded in the current code, worst first.

**Truth bugs (these actively mislead):**
- `"Sydney, NSW"` is hardcoded in [discover.tsx:60](../ui/app/(tabs)/discover.tsx#L60). It renders under a location pin regardless of where the user actually is.
- **First load shows the empty state.** `games = discoverQuery.data ?? []` and `isLoading` is never read, so a cold start flashes "Court's quiet right now" before data arrives. First impression of a live app is "this app is dead."
- **The avatar row is always blank.** `toGame` in [queries/games.ts:37](../ui/lib/queries/games.ts#L37) sets `joined: []` (roster is RLS-gated), and `GameCard` renders `<AvatarStack people={game.joined} />`. On Discover that draws nothing — a permanent hole where the social proof should be.

**Model problems:**
- The filter row conflates two axes. `FILTERS = ["All levels", …, "Tonight"]` is single-select, so choosing "Tonight" silently clears your level filter. Users can't express "Intermediate, tomorrow".
- No search, no date picker, no distance control, no sort, no "has spots" filter.
- Default is "All levels" even though the user's tier is known (`profile_sports.skill_tier_id`).
- No pagination — `nearby_games` returns everything within a 50 km radius in one shot.

**Information gaps on the card:**
- No host. The single most-asked question in pickup sports is unanswered.
- Skill is a pill, not a fit verdict.
- `spotsLeft()` is computed but only used as a binary `full` check — "2 spots left" urgency is thrown away.
- No venue imagery; every card is the same dark rectangle.
- No way to act without opening the detail screen.

**Structure:**
- Flat list, no day grouping, no rails, no sections.
- Map is a mode that discards the list.
- One empty state for two different situations ("nothing exists" vs "nothing matches your filters") — and no way to clear filters from it.
- Notification bell has no unread badge.

---

## 4. The plan

Seven phases. Sequenced by leverage, not by screen order.

### D0 — Truth & trust ✱ *start here*

Nothing else matters while the screen lies. Small, all UI.

- [ ] Real location in the header — reverse-geocode `useUserLocation()` to a suburb; fall back to "Near you", never a hardcoded city.
- [ ] Skeleton cards on `isLoading` (reuse [Skeleton.tsx](../ui/components/Skeleton.tsx)); the empty state renders only after a settled, genuinely-empty fetch.
- [ ] Kill the blank avatar row — until D2 lands, show a real headcount treatment instead of an empty `AvatarStack`.
- [ ] Split the empty state: *no supply* ("Court's quiet…" + Host CTA) vs *no match* ("Nothing at Intermediate tonight" + Clear filters + adjacent suggestions).
- [ ] Error state — a failed fetch currently renders as "Court's quiet", which is a lie. Add a retry state.
- [ ] Unread badge on the notification bell.

### D1 — The card (highest conversion leverage)

This is where the join decision happens. Rebuild it around the four trust questions.

- [ ] **Host row** — avatar, name, and a credibility signal ("Hosted 12 · Reliable"). *Backend: extend `nearby_games` to project `organizer_display_name`, `organizer_photo_path`, `organizer_reliability_score`.* Single highest-leverage change in this doc.
- [ ] **Level fit verdict** — replace the bare `SkillPill` with a relational badge computed against the viewer's tier: "Your level" / "One above" / "Below your level".
- [ ] **Honest scarcity** — "2 spots left" with a fill bar; "Last spot" in accent; nothing at all when the game is half empty. Never manufacture urgency.
- [ ] **Venue identity** — a per-venue deterministic court-pattern header (reuse [CourtBackdrop.tsx](../ui/components/CourtBackdrop.tsx)) so cards are visually distinguishable at a glance. Real Places photos are a later upgrade via `venues.google_place_id`.
- [ ] **Inline action** — Join / Request directly on the card for the Hunter path.
- [ ] Keep the existing entrance stagger and press-scale; they're good.

### D2 — Filter model (Hunter)

- [ ] Split into two independent axes: **When** (Tonight / Tomorrow / This week / Pick a date) and **Level** (multi-select, defaults to the user's own tier + adjacent, with an "Any level" escape).
- [ ] A single **Filters** pill with an active-count badge → bottom sheet ([Sheet.tsx](../ui/components/Sheet.tsx) exists) for distance radius, has-spots-only, price cap, verified-only.
- [ ] **Sort**: Soonest · Closest · Cheapest · Most spots.
- [ ] Personalised default view on first paint: your level, next 7 days, sorted soonest.
- [ ] Persist filter state (already in `store.ts`) and show it as removable tokens so the user always knows why the list looks the way it does.
- *Backend: `nearby_games` gains `has_spots`, `max_cost_cents`, `verified_only`, `sort` args + keyset pagination.*

### D3 — Structure & scan (Browser)

- [ ] **Day-grouped sections** with sticky headers: "Tonight" · "Tomorrow · Wed 12" · "Thu 13" …
- [ ] **Rails above the list**, each with a stated reason:
  - "Closing soon" — starts <24 h, ≥1 spot left
  - "At your level, near you"
  - "Back at [venue you last played]" — from `useMyPastGames`
- [ ] **Week pulse strip** — "18 games in Sydney this week · 44 spots open". Pure social proof from data we already have, zero new backend.

### D4 — Map as a layer

- [ ] Remove the List/Map toggle. Map becomes a floating button → full-screen map with a snap-point card carousel synced to pins (Airbnb pattern).
- [ ] Pins carry information: start time or price, colour-coded by level — not identical generic dots.
- [ ] Tapping a pin scrolls the carousel; swiping the carousel pans the map.
- [ ] Cluster pins at low zoom.

### D5 — No dead ends + the retention primitive

- [ ] **Fallback ladder** on thin results, each rung a labelled section rather than a wall: nothing tonight → tomorrow → adjacent levels → wider radius → host it.
- [ ] **"Alert me"** — save the current filter set as a watch; push when a matching game is posted. *Backend: `game_alerts` table + insert trigger on `games` reusing the existing push pipeline.* This is the one feature on this list that converts a failed session into a returning user.
- [ ] Follow a venue / follow a host as lighter-weight versions of the same loop.

### D6 — Feel

- [ ] Filter change cross-fades the list instead of hard-swapping.
- [ ] Sticky day headers shrink on scroll.
- [ ] Haptic tick on chip select (`haptics.tick()` already exists).
- [ ] `CountdownChip` shifts to accent/danger under 2 h.
- [ ] Live spot decrement animates via [RollingNumber.tsx](../ui/components/RollingNumber.tsx).

---

## 5. How we'll know it's the best

Define the scoreboard before building, or "best" is just taste.

| Metric | Why | Target |
|---|---|---|
| Discover → game detail CTR | Is the card doing its job? | ↑ 2× |
| Detail → join rate | Did the card set honest expectations? | ↑, not ↓ (a drop means the card oversold) |
| Time to first join, new user | The Hunter path | <60 s |
| % sessions ending on an empty/zero-result state | The Stranded leak | <5% |
| Alerts set per stranded session | Retention primitive adoption | >30% |
| D7 / D30 return rate | The actual goal | baseline first |

---

## 6. Order of work

**D0 → D1 → D2 → D3 → D4 → D5 → D6.**

Rationale: D0 stops the screen lying. D1 (host + fit + honest scarcity on the card) is the biggest conversion lever and is mostly self-contained. D2 makes the filters expressible, which D3's structure then depends on. D4 and D5 are larger and can be scheduled independently. D6 is polish and should trail, not lead.

Two backend touchpoints, both small, both worth batching: the `nearby_games` projection + args (D1, D2), and `game_alerts` (D5).

## 7. Not doing

- No algorithmic/ML ranking feed. Supply is small and local; recency + distance + level fit beats a black box, and an unexplainable order destroys trust in a marketplace this thin.
- No engagement-bait mechanics — fake countdowns, fake "5 people viewing". Scarcity is shown only when the underlying data is real.
- No visual language redesign. The dark/lime palette stays (same constraint as [ux-plan.md](ux-plan.md)).
- No new paid services or heavy deps; prefer `reanimated`, `expo-linear-gradient`, and the existing component set.
