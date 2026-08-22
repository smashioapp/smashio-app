# Discover map — human-centred redesign

Status: **proposed, not approved.** Needs sign-off before code lands.
Written 2026-08-20. Supersedes nothing — it is the second pass on
[map-plan.md](map-plan.md), whose §5 design was right and whose §5.10 execution is what broke.

Trigger: a real screenshot from a real device, Maroubra, one game in the whole database and it's
the viewer's own. The map showed roughly twenty glowing pins and a sheet reading
**"No games pinned nearby."** Both were true. That is the bug.

---

## 1. What the screenshot actually shows

| # | Defect | Why it happens |
|---|---|---|
| D1 | **The map and the sheet contradict each other.** ~20 pins visible, sheet says "No games pinned nearby". | Pins are `noGameVenues` (the venue directory); the sheet counts `mapPinnedGames` (games). Two datasets, one surface, no labelling. [discover.tsx:522](../ui/app/(tabs)/discover.tsx:522) vs [discover.tsx:954](../ui/app/(tabs)/discover.tsx:954) |
| D2 | **Seven distinct marker renderings, zero legend.** Game pill, "N games" pill, cluster bubble, accent dot + location glyph, accent dot + medal glyph, dashed dot + lock glyph, 10 px hollow ring. | [GameMap.tsx](../ui/components/GameMap.tsx) `NoGameVenuePin` branches on `hasProfile` / `dedicated` / `bookability`, each a 9 px icon inside a 16 px circle. |
| D3 | **The search bar and the "Search this area" pill overlap.** Visible as "Search venues, suburbs…" colliding with "…area". | The pill is absolutely positioned at `top: 16` inside `GameMap`; the floating search row is at `top: 12` in the overlay above it. Same coordinate space, no offset. |
| D4 | **Two primary CTAs stacked.** The sheet's "Host a game" button sits directly beneath the global `+` FAB. | Empty state renders its own accent CTA while `TabBar`'s FAB is still mounted. |
| D5 | **The header lies about where you are looking.** "MAROUBRA · 50KM RADIUS" while the viewport frames Newtown–North Sydney. | Header renders `useLocationLabel(userLocation)` + the filter radius; the camera is independent of both. |
| D6 | **The radius ring is not visible** despite `radiusKm` being passed. | 50 km at this zoom puts the ring off-screen. A default radius that never fits the viewport is decoration, not feedback. |
| D7 | **The viewer's own game is invisible.** They have exactly one game and it is nowhere. | [discover_exclude_own_games.sql](../supabase/migrations/20260818000000_discover_exclude_own_games.sql) removes it from Discover — correct for the list, disorienting on a map. |
| D8 | **Touch targets are 10–16 px.** | `NoGameVenuePin` renders a 16 px (directory) or 10 px (non-directory) circle with no expanded hit area. Apple's 44 pt minimum is missed by a factor of three, and NN/g flags dense map pins as the classic mis-tap generator. |
| D9 | **Courts are not sport-filtered.** A badminton player sees every venue in the directory. | Venues aren't sport-scoped — noted in the code comment at [discover.tsx:520](../ui/app/(tabs)/discover.tsx:520). `courts_badminton` is fetched and then unused for filtering. |
| D10 | **"Widen your filters" while a filter chip is right there.** The `Tonight` chip is active and the empty state doesn't offer to clear it. | Empty state is static copy, blind to which filter caused the emptiness. |

### The root cause

**The map is a venue map wearing a game map's clothes.** `map-plan.md` §5.10 deliberately added
no-game venue pins as the low-liquidity answer — "an empty map becomes a hosting funnel." The
intent was right. What shipped renders those venues in a visual language nobody can decode, on the
same canvas as games, with a sheet that only ever counts games. At zero liquidity — which is
*today's normal state, not an edge case* — the surface reads as broken rather than as a directory.

---

## 2. What the best apps do

**Airbnb — fewer pins beat all pins.** Airbnb's map work found that showing every listing made it
*harder* to book, and moved to ranking pins for the map specifically: a map has no top or bottom,
people don't scan every pin, and they browse by geography and visual clustering rather than by
list order. They also built one governed pin taxonomy that had to stay legible from dense city to
rural village, with explicit rules for which pin type appears when.
([Airbnb map platform](https://adamshutsa.com/map-platform/),
[Learning to Rank for Maps at Airbnb](https://arxiv.org/html/2407.00091v1))

**NN/g — the list is the default; the map is the option.** Their location-finder research is blunt:
"the default view should be the list layout," because lists carry higher information density and
users who found maps appealing at first preferred lists once they actually tried to pick
something. They call out three failure modes we have: pan-versus-scroll gesture conflict, pins
packed below touch-target size, and pins that must each be opened to reveal anything.
([Maps and Location Finders on Mobile Devices](https://www.nngroup.com/articles/mobile-maps-locations/))

**NN/g — an unlabelled icon means nothing.** There is no standard vocabulary for most icons, so a
text label is required to disambiguate; recognition should be tested *out of context*, icon alone,
no label. Our lock, medal and location glyphs are 9 px, unlabelled, and were never tested.
([Icon Usability](https://www.nngroup.com/articles/icon-usability/),
[Icon Usability: When and How to Evaluate](https://www.nngroup.com/articles/how-to-test-digital-icons/))

**GoodRec — the category leader in this exact use case is list-first.** Pick sport, pick city, pick
game. Discovery is card-based: format, surface, footwear policy on the card face; the game page
carries venue photos and player info. No map browse step in the core funnel.
([GoodRec](https://www.goodrec.com/), [App Store listing](https://apps.apple.com/us/app/goodrec-ex-just-play/id1510554246))

**Playo — two verbs, not a map.** "Create Activity" or "Join Activity", browsed from a Play tab
and matched on sport, area, date, time and skill level. The map is not the discovery primitive.
([Playo](https://playo.co/),
[how to find other players](https://playo.freshdesk.com/support/solutions/articles/1070000107581-how-to-find-other-players-on-playo-))

**Google Maps Platform — progressive disclosure is a first-class marker feature.** Advanced markers
support per-zoom visibility and explicit collision behaviour against basemap labels, precisely so
important markers stay visible and the rest don't compete.
([Markers overview](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview),
[control visibility by zoom](https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-zoom))

**Marketplace cold-start literature — an empty surface destroys demand-side trust instantly, and
the fix is single-player value.** Seed supply first; ship something useful to one side with the
other side absent. OpenTable is the canonical case: restaurant software first, consumer
marketplace later.
([Cold Start — Marketplace Pattern](https://themarketplaceguide.com/patterns/cold-start/),
[which side do you seed first](https://internetmango.com/insights/marketplace-cold-start-strategy/))

### What that means for us

We already **have** the single-player product and are hiding it. 56 enriched venues with amenities,
pricing and opening hours ([venues-plan.md](venues-plan.md)) is a genuinely useful badminton court
directory for Sydney with zero games in the database. The current design renders it as visual
noise under a label that says it doesn't exist.

---

## 3. Principles

1. **The map answers one question at a time.** "Where can I play *with people*?" and "Where are the
   courts?" are different questions and get different modes.
2. **The map and the sheet must never contradict each other.** Whatever is pinned is what is
   listed. Always.
3. **Every pin type is either labelled or explained by a visible legend.** No 9 px glyph carries
   meaning on its own.
4. **Empty is a state we designed for, not a failure we apologise for.** Zero games is the
   *expected* state in private beta. It should still be the most useful screen in the app.
5. **Fewer pins, chosen well.** Density is disclosed by zoom, not dumped at once.
6. **Never hide the user's own game from the user.** Excluding it from *results* is right;
   erasing it from the map is not.
7. **The list stays the default.** The map is a lens over the same results, not a second app.

---

## 4. The redesign

### 4.1 Two modes on the map: **Games** / **Courts**

A segmented control replaces the lone `Tonight` chip position. Mode is remembered.

| | Games mode | Courts mode |
|---|---|---|
| Pins | Game pins only, tier-coloured, labelled with time or price | Court pins, neutral, labelled with venue short name at z≥14 |
| Sheet | Pinned games carousel / list | Court cards — distance, courts, price, bookability, open-now |
| Radius ring | Yes, from the Discover filter | No |
| Empty | "No games yet" ladder (§4.4) | Never empty — the directory always has rows |
| Auto-select | Default mode when ≥1 game in radius | Default mode when 0 games in radius |

That last row is the whole fix for D1. With zero games the map opens in Courts mode, every pin has
a matching row in the sheet, and nothing on screen claims to be something it isn't.

If the segmented control is judged too heavy, the cheaper variant that still fixes D1: keep one
map, but the sheet gets a **content ladder** — games first, then "23 courts near you" as real
cards. The rule is the sheet reflects the pins. The mode switch is the better version of the same
rule because it also lets Courts mode carry court-specific filters.

### 4.2 Pin taxonomy — three types, not seven

| Pin | Meaning | Form |
|---|---|---|
| **Game** | An event you can join | Tier-coloured pill, label = start time (today) or `$x` (later). Dimmed at 45 % when full. Pulse when <2 h away. **Unchanged — this part works.** |
| **Yours** | Your own game (D7) | Same pill, accent ring, label prefixed `You` — visually distinct, never counted in the results total. **Refined 2026-08-22** ([discover-plan.md](discover-plan.md) §7): exempt from when/level, but scoped to the map's radius — an unscoped "Yours" pin rendered next to a sheet saying "No games here yet", and could sit 40km outside the radius ring the map draws. Also listed in the sheet under `Yours nearby`, and counted separately in the title row (`3 games · 1 yours`), so no visible pin is missing from the sheet. |
| **Court** | A place, no game on it | Single neutral dot, one size, one colour. Venue name label at z≥14. |
| **Cluster** | Collapsed group | Count + the noun: "12 courts", "3 games" — never a bare number |

**Deleted as pin shapes:** the medal (dedicated), the lock (club/members-only) and the 10 px hollow
ring (non-directory venue). Every one of those is a *property of the place*, and properties belong
on the card in the sheet, where there is room for the words "Members only" — not in a 9 px glyph
that fails the out-of-context icon test before we even run it.

Consequence for D8: one court pin size, 44×44 pt hit area via a transparent wrapper, visual dot
20 px.

### 4.3 Progressive disclosure by zoom

- **z < 11** — suburb count bubbles only. No individual pins.
- **z 11–13** — all game pins; courts capped to the nearest N (start at 15) ranked by
  dedicated-badminton first, then distance. Airbnb's finding, applied.
- **z ≥ 14** — all courts in viewport, with name labels.

Cap and rank rather than render everything. Twenty undifferentiated dots over Sydney is exactly
the failure Airbnb measured.

> **Ownership corrected 2026-08-22** ([discover-plan.md](discover-plan.md) §7). The rule shipped
> *inside* `GameMap`, so the sheet counted courts the map had silently dropped — "20 courts near
> you" over a single dot. The rule now lives in exported `visibleCourtsFor` / `courtZoomBucket`;
> `GameMap` reports a `"wide" | "mid" | "close"` bucket and renders exactly the array it is given,
> while `discover.tsx` computes that array once for both the pins and the sheet. When the cap bites,
> the sheet says `Zoom in to see all N` rather than counting what isn't drawn.

### 4.4 The empty state, rewritten

Today: *"No games pinned nearby / Widen your filters or be the first to host here."* — a shrug plus
a chore.

Replace with a state that ranks what the user can actually do, and names things concretely:

> **No games here yet**
> 23 badminton courts within 15 km. Nearest: Olympic Park Sports Centre, 3.2 km.
>
> [ Host at Olympic Park ]  ← primary, seeds the wizard with that venue
> [ Alert me when a game appears here ]  ← secondary, writes a `game_alerts` row
> [ Clear "Tonight" ]  ← only when a filter is what emptied the screen (D10)
> [ Browse courts ]  ← switches to Courts mode

Two things this earns beyond politeness:

- **"Host at {nearest court}"** already has the plumbing — `setHostHereSeed` at
  [discover.tsx:545](../ui/app/(tabs)/discover.tsx:545) — but today it only fires from a pin tap
  nobody knows is tappable. Promoting it to the empty state turns the cold-start problem into the
  hosting funnel `map-plan.md` §5.10 intended.
- **"Alert me"** is the retention primitive (`game_alerts`, and `alert_match` in
  [notifications-plan.md](notifications-plan.md) §4D) and it is currently reachable only from
  Settings → Notifications. An empty map is the single highest-intent moment in the app to create
  one. This should be the biggest single lever in this plan.

Filter-aware: the ladder inspects which filter is non-default and offers to clear *that* one by
name, rather than telling the user to go find the filter sheet.

### 4.5 Truthful context header

"MAROUBRA · 50KM RADIUS" describes the query. The camera describes something else (D5).

- While the camera is near the user's centre: keep `{SUBURB} · {radius} RADIUS`.
- Once the user pans away or "Search this area" is active: switch to `Showing this area · {n} km`
  with a **Back to Maroubra** affordance — same idea as the existing `mapAreaOverride` reset,
  surfaced in the header instead of buried in the empty state.

Also: **drop the default radius from 50 km to 15 km.** 50 km from Maroubra is most of Greater
Sydney; it makes the ring un-fittable (D6), makes "closest" sorting meaningless, and pulls in
courts nobody will drive to. 15 km fits the viewport at the opening zoom, so the ring becomes real
feedback. Keep 50 km as an option in `DISCOVER_RADIUS_OPTIONS_KM`.

### 4.6 Chrome collisions

- **D3** — move "Search this area" out of `GameMap`'s `top: 16`. Dock it bottom-centre, floating
  above the sheet's peek snap. That is also where the thumb is.
- **D4** — hide the global `+` FAB while the map sheet is showing its own primary CTA, or drop the
  sheet CTA and let the FAB carry hosting. One primary action per screen.

### 4.7 Sport scoping (D9)

Courts mode filters to venues with `courts_badminton > 0` when the active sport is badminton, via
the profile's selected sport — sport stays a data concern, no hardcoding (AGENTS.md). Venues with
unknown court data stay visible but sort last, since absence of data isn't evidence of absence.

Related: `noGameVenues` de-dupes game venues by `name@lat,lng`. `SWEEP-FINDINGS.md` established
that duplicate venue rows exist and that `google_place_id` uniqueness does not prevent them, so
two rows for one real venue will render as two pins. Fold the dedupe into `venues_near` rather than
patching it client-side.

---

## 5. Phasing

**P0 — stop the contradiction (half a day, no schema).** The sheet reflects the pins (content
ladder, §4.1 cheap variant); empty state rewritten with nearest-court, alert-me and clear-*this*-
filter (§4.4); "Yours" pin for own games (D7); search-pill collision (D3); duplicate CTA (D4);
default radius 15 km (§4.5). This alone makes the screenshot make sense.

**P1 — make the pins readable (1–2 days).** Pin taxonomy collapsed to three types with a visible
legend; medal/lock/hollow retired into card badges; 44 pt hit areas; venue name labels at z≥14;
truthful context header.

**P2 — Games | Courts mode split (1–2 days).** Segmented control, per-mode sheets, per-mode
filters, sport scoping (§4.7), mode auto-selected by liquidity.

**P3 — density and query surface.**
- Zoom-tiered disclosure with ranked court cap (§4.3) — **done**, [GameMap.tsx](../ui/components/GameMap.tsx):
  courts hidden above `COURT_HIDE_DELTA`, capped to 15 ranked dedicated-first-then-distance
  between that and `LABEL_ZOOM_DELTA`, full detail below.
- Cluster copy with nouns — **done**, [GameMap.tsx](../ui/components/GameMap.tsx)'s `ClusterBubble`
  reads "12 games" not a bare count.
- Open-now from venue opening hours — **done**. `venues_near` now returns `opening_hours`
  ([20260820000500_venues_near_opening_hours.sql](../supabase/migrations/20260820000500_venues_near_opening_hours.sql));
  [format.ts](../ui/lib/format.ts)'s `isOpenNow` checks it against the current day/time;
  [MapCourtCard.tsx](../ui/components/MapCourtCard.tsx) shows an Open now / Closed badge.
- Geocoded map search (backlog B8) — **done**. The existing client-side name/suburb filter over
  fetched pins stays for instant narrowing, and a debounced Places autocomplete dropdown
  ([discover.tsx](../ui/app/(tabs)/discover.tsx)'s `mapSearchPredictions`) now lets the viewer
  jump the map to anywhere in Australia, not just what's already in the viewport — picking a
  result sets `mapAreaOverride` and calls `mapRef.focusOn`, same path as "Search this area".
  [places.ts](../ui/lib/places.ts)'s `searchPlaces` gained an optional `types` param so the map
  search can run unrestricted (venues + suburbs) while the wizard's venue step keeps its
  `establishment`-only restriction.

P3 is now fully shipped.

---

## 6. Not doing

- **Player-density heatmaps.** `Heatmap.tsx` exists for the profile; there is no player-location
  data to plot and pretending otherwise is a privacy problem, not a feature.
- **Live player positions.** Same reason, harder.
- **Making the map the default view.** NN/g is unambiguous and GoodRec/Playo both ship list-first.
  The map earns attention as a lens, not as the front door.
- **Custom basemap artwork.** The cloud style is done ([map-plan.md](map-plan.md) §4); further
  cartography is not where the confusion is.
- **Removing no-game venue pins entirely.** Tempting as a fix for D1, wrong as a strategy — the
  directory is the single-player value that carries the app through zero liquidity.

---

## 7. How we know it worked

Before/after, on device, with people who have never seen the app:

1. **Out-of-context icon test** (NN/g's method): show each pin type alone, no label, ask what it
   means. Current lock/medal/dot set will score near zero; that is the baseline. Target: the
   three-type set is named correctly by 4 of 5 testers.
2. **First-session task**: "find a game you could join tonight." Measure time-to-first-game-tap and
   count contradictions noticed aloud.
3. **Zero-liquidity task**: with 0 games seeded, "what would you do next?" Success is any of host /
   alert / browse courts. Today the honest answer is "leave".
4. **Instrumented**: map → game-detail tap rate; empty-state CTA rate split by ladder rung;
   **alerts created from the map** (expected to be the largest single delta in this plan);
   Courts-mode → venue-detail rate; mis-tap rate proxied by pin-tap-then-immediate-back.

---

## 8. Sources

- [Maps and Location Finders on Mobile Devices — NN/g](https://www.nngroup.com/articles/mobile-maps-locations/)
- [Icon Usability — NN/g](https://www.nngroup.com/articles/icon-usability/)
- [Icon Usability: When and How to Evaluate Digital Icons — NN/g](https://www.nngroup.com/articles/how-to-test-digital-icons/)
- [Airbnb Map Platform — Adam Shutsa](https://adamshutsa.com/map-platform/)
- [Learning to Rank for Maps at Airbnb](https://arxiv.org/html/2407.00091v1)
- [How Airbnb Made Map Search Smarter](https://techscoop.substack.com/p/how-airbnb-made-map-search-smarter)
- [Map Pin UI Design — Mobbin](https://mobbin.com/glossary/map-pin)
- [Advanced Markers overview — Google Maps Platform](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview)
- [Control marker visibility by zoom level — Google](https://developers.google.com/maps/documentation/javascript/examples/advanced-markers-zoom)
- [GoodRec](https://www.goodrec.com/) · [App Store listing](https://apps.apple.com/us/app/goodrec-ex-just-play/id1510554246)
- [Playo](https://playo.co/) · [finding players](https://playo.freshdesk.com/support/solutions/articles/1070000107581-how-to-find-other-players-on-playo-)
- [Cold Start — The Marketplace Guide](https://themarketplaceguide.com/patterns/cold-start/)
- [Marketplace Cold Start: Which Side Do You Seed First?](https://internetmango.com/insights/marketplace-cold-start-strategy/)
