# SMASHIO v2 design plan — "2026 redesign"

Status: **approved 2026-08-16**, implementing straight onto `main` in incremental commits.

## Progress (updated 2026-08-16)

| Phase | Status | Commit |
|---|---|---|
| P0 tokens + Space Grotesk | ✅ done | `141a439` |
| P1 primitives (Hero, ListRow, RailCard, StatTile, SegmentedToggle, TierRing, GameCard variants) | ✅ done | `7de7a75` |
| P2 bottom nav, centre host FAB | ✅ done | `9fd6daa` |
| P3 Discover list | ✅ done | `65d9f11` |
| P4 Discover map layer | ✅ done | `d6b09d7` |
| P5 Game Detail | 🔲 not started | — |
| P6 My Games agenda + past screen | 🔲 not started | — |
| P7 Chat thread | 🔲 not started | — |
| P8 Profile + stats screen | 🔲 not started | — |

**Known loose end from P2 — half resolved by P3:** `app/(tabs)/discover.tsx` no longer renders
`BottomRail`/`HostFab` (deleted in P3, replaced by the header `SegmentedToggle` and the TabBar
centre button). `app/(tabs)/my-games.tsx` still renders the old pair — that double-host-button
state resolves once P6 rewrites that screen per §3.3.

**P4 fix:** moving the List | Map switch into the header (P3) meant the map's old
`absolute inset-0` overlay would cover the header and make the switch unreachable — the map
overlay now measures the header's height (`onLayout`) and starts below it instead.

`SegmentedToggle.tsx`, `StatTile.tsx` and `TierRing.tsx` exist but have **zero call sites yet** —
they're wired up starting in P3 (SegmentedToggle), P5 (StatTile), P8 (TierRing).

Source: `SMASHIO 2026 Redesign.html` in the claude.ai/design project
`23bc2cae-5ee1-4648-a0f1-15a9412f2b1b` (imported via the `claude_design` MCP). Six boards:
Discover list, Discover map layer, GameCard density variants, Game Detail, My Games agenda,
Chat thread, Profile.

Read alongside — this plan **supersedes the layout sections** of, but does not overturn the
diagnoses in: [discover-plan.md](discover-plan.md), [my-games-plan.md](my-games-plan.md),
[nav-plan.md](nav-plan.md), [map-plan.md](map-plan.md), [profile-plan.md](profile-plan.md),
[chat-plan.md](chat-plan.md). Where v2 moves a control, the reason the old control existed is
recorded in §7 so it doesn't get re-added by accident.

---

## 1. Decisions locked

| # | Decision | Answer |
|---|---|---|
| 1 | Scope of this pass | All 5 designed screens (Discover list + map layer, Game Detail, My Games, Chat thread, Profile) + the GameCard density system. Other screens (chat list, venue detail, wizard, onboarding, settings, post-game, player detail) keep their current composition and only inherit the new tokens/type for free. |
| 2 | Typography | Adopt **Space Grotesk** as the display face (replaces Bricolage Grotesque). **Keep Manrope** for body copy. |
| 3 | Bottom nav | **5 slots with a centre lime `+` FAB, no labels.** Icons stay Ionicons (see §6 for why the design's abstract CSS glyphs aren't being copied literally). Every slot gets an `accessibilityLabel`. |
| 4 | Rollout | Straight onto `main`, one commit per phase. No runtime flag, no parallel v1 code path. |

## 2. What v2 actually is

The palette is unchanged — `lib/theme.ts` already matches the design's `:root` variables
byte-for-byte. This is **not** a re-skin. Six composition rules carry the whole redesign:

1. **One anchor per screen.** A single hero element carries the composition; everything else
   drops to compact rows. No screen has three cards of equal weight stacked.
2. **Three card weights, never repeated side by side.** Featured (one per screen), Standard
   (a single-line list row), Rail (a 132px scroll chip).
3. **Density up.** List rows are single-line. Height is spent only on the 1–2 things that earn it.
4. **Map is a mode, not a tab.** Full-bleed map with a drawer; the list/map switch is a
   segmented control in the header.
5. **Lime is rationed.** `--accent` means *join / live / act here* and appears once per screen.
   Everything else uses tier colours (`beginner`/`intermediate`/`advanced`/`pro`) or neutral text.
6. **Hierarchy from weight + colour + face, not size.** Display numbers (price, countdown,
   reliability, spots) get Space Grotesk; body stays Manrope.

---

## 3. Design-system layer

### 3.1 Tokens — `ui/lib/theme.ts`, `ui/tailwind.config.js`

Colours: **no change.** Already identical to the design.

Add a `v2` spacing/type constant set to `lib/theme.ts` so screens stop hand-rolling numbers:

```
SCREEN_PAD = 24        // design frames use left/right 24 (was 20 = px-5)
RADIUS = { hero: 26, card: 18, rail: 16, pill: 100, sheet: 28 }
HAIRLINE = colors.cardBorder     // 1px row divider, replaces per-row borderBottom literals
```

### 3.2 Typography

`@expo-google-fonts/space-grotesk` — load `500Medium / 600SemiBold / 700Bold` in
`app/_layout.tsx`, drop the three Bricolage weights. Tailwind aliases keep their existing
**names** so no call site churns:

| class | before | after |
|---|---|---|
| `font-display` | `BricolageGrotesque_800ExtraBold` | `SpaceGrotesk_700Bold` |
| `font-display-bold` | `BricolageGrotesque_700Bold` | `SpaceGrotesk_700Bold` |
| `font-display-medium` | `BricolageGrotesque_500Medium` | `SpaceGrotesk_500Medium` |
| `font-display-semibold` | — (new) | `SpaceGrotesk_600SemiBold` |
| `font-body*` | Manrope 500/600/700/800 | unchanged |

Space Grotesk tops out at 700, so the old 800 display weight is gone; the design compensates
with size + colour, which is rule 6.

**Type scale (v2):**

- Screen title — `font-display` 30 (was 26)
- Screen kicker — body-bold 12.5, `textSecondary`, uppercase, `letterSpacing .05em`
- Hero title — `font-display` 21–22
- Section label — body-bold 12–13, `textTertiary`, uppercase
- Row title — body-semibold 13.5, `text`
- Row sub — 11.5, `textSecondary`
- Display numbers — `font-display` 18–30

### 3.3 Primitives

New (`ui/components/`):

- **`Hero.tsx`** — the featured card shell: `linear-gradient(160deg,#1c1f10,card)`, 1.5px
  `rgba(214,255,63,.4)` border, 26px radius, radial lime bloom top-right. Takes an accent prop
  so My Games' live hero can swap to the `intermediate` variant (`#101c14` / green border).
- **`ListRow.tsx`** — the Standard weight: tier dot · title/sub column · optional avatar stack ·
  optional trailing value or chevron, with a hairline separator. One component, used by Discover,
  My Games and Game Detail's info rows.
- **`RailCard.tsx`** — 132px compact chip: tier dot, venue, `time · distance`.
- **`StatTile.tsx`** — the Game Detail trio (`$8 / per player`, `2 / spots left`,
  `Intermediate / skill level`).
- **`SegmentedToggle.tsx`** — the List/Map pill pair in the Discover header.
- **`TierRing.tsx`** — Profile's 132px SVG progress ring + avatar + tier badge.

Rewritten: `GameCard.tsx` (becomes `variant: "featured" | "standard" | "rail"`),
`TabBar.tsx`, `NextUpHero.tsx`, `ChatEventHeader.tsx`, `MapSheet.tsx`.

Retired: `HostFab.tsx`, `BottomRail.tsx` (host action moves into the tab bar; the map toggle
moves into the Discover header — nothing is left floating above the bar).

---

## 4. Screen specs

### 4.1 Discover — list

**Header.** `Discover` (display 30) + kicker `SYDNEY · 5KM RADIUS` (real values from
`useLocationLabel` + `discoverRadiusKm`). Right: notification bell (existing, with its
permission dot) and a `List | Map` segmented toggle.

**Filter row.** One horizontal chip row: `Badminton` (sport, active), `Tonight` (when),
`Any skill` (level), `5km` (radius). Each chip opens the corresponding section of the existing
`FiltersSheet` — the sheet keeps sort/price/has-spots/verified. This collapses today's *two*
chip rows + Filters button + removable token row into one line.

**Anchor — best match hero.** `BEST MATCH FOR YOU`. Countdown chip (lime, live), verified-venue
badge (intermediate), venue name, `suburb · distance · court`, avatar stack + `+N`, price in
display face with `/player`, `6/8 joined · Intermediate`, and a full-width lime CTA.
*Selection rule (must be honest, not fabricated):* first game in the current sorted result set
that is (a) not full, (b) within 24h, (c) `levelFit === "match"` for the viewer's tier — falling
back to (a)+(b) alone, then to no hero at all. It is excluded from the list below it, exactly
like My Games' hero.

**Rail.** `Tonight · See all` → `RailCard`s. The three existing rails (Closing soon / At your
level, near you / Back at *venue*) keep their logic and render as rails of `RailCard`s.

**List.** `Near you · N games` then single-line `ListRow`s: tier dot, `Venue — 7:30pm`,
`Level · distance[· Verified]`, avatar stack, price. Sticky day headers survive for multi-day
result sets.

The fallback ladder, alert-me row and empty states stay (they're the fix for a dead-end
screen) restyled to `ListRow`/pill language.

### 4.2 Discover — map layer

Already a full-bleed overlay with a 3-snap sheet — the architecture matches. Deltas:

- Floating search field (`Search venues, suburbs…`) + circular filter button, glass-backed.
  **Scope: client-side filter** of the pins/rows already fetched by name + suburb. Geocoded
  suburb search → backlog.
- Mode chips under it: `Tonight` (the when filter, live). The design's `◐ Heatmap` chip is
  **not built** — there's no heat layer behind it and a dead chip is worse than no chip (§7).
- Sheet header becomes venue-anchored: `Riverside Badminton Centre · 1.8km`, then court cards
  (`Court 3 · 7:00pm` / `Intermediate · 6/8 joined` / `$8/pl` + tier dot). Same carousel/snap
  mechanics; `MapCarouselCard` restyled to that spec.
- List/Map switch moves from `BottomRail` to the header segmented control.

### 4.3 Game Detail

- **Anchor:** 300px `CourtBackdrop` hero — countdown chip, venue in display 27, `Court 3 ·
  Today, 7:00–9:00pm`; circular back and share buttons floating over it. (Host edit becomes a
  third circular button rather than a text pill.)
- Avatar stack row + `6/8 spots`.
- Three `StatTile`s: price / spots left / skill.
- Thin `ListRow`s: host (avatar, `Maya Chen · Host`, `Reliability 94 · Excellent`, `Message`
  chip) → `View venue & get directions` → `Open chat` → `Share game link`.
- **Host console** card when the viewer is the organiser: `HOST CONSOLE · N REQUESTS`, each
  request a row with inline ✓ / ✕. `SwipeToDecide` + `VettingStrip` stay inside it.
- Fixed bottom `HOLD TO JOIN` pill (the existing `HoldButton`), full-width, lime, 58px.
- Cancelled banner keeps its current treatment above the stats.

### 4.4 My Games — agenda

- Header `My Games` + a `Hosting N ›` lime chip (filters the agenda to hosted games).
- **Anchor:** `TODAY · NEXT UP` hero. Green (`intermediate`) variant when live/imminent, lime
  otherwise. `● LIVE IN 42 MIN`, court, venue, `7:00–9:00pm · 6/8 joined`, two buttons:
  `Directions` (neutral) and `Open chat` (lime).
- Day-grouped single-line `ListRow`s: `TOMORROW, SAT 17` → dot, `Zetland Arena — 6:00pm`,
  `Advanced · Hosting`, chevron.
- Bottom card: `12 past games ›` → **new route `app/my-games/past.tsx`** carrying today's entire
  Past tab (history header with streak/most-played/regulars, month grouping, rate-players,
  rebook). The `Upcoming | Past` chip tabs are removed.
- Cancelled games stay in the agenda as a danger-bordered row that expands to replacement
  suggestions.

### 4.5 Chat thread

- One slim sticky bar replaces today's *two* stacked headers (nav header + `ChatEventHeader`):
  back, avatar, `Riverside Badminton — Court 3`, `● Starts in 42 min` (intermediate), `6/8`
  chip, `⋯` for the details sheet. Tapping the title opens the game.
- Thread stays quiet and dense: 16/16/16/4 radius bubbles, `card` + border for others,
  **solid lime with dark text for mine** (today it's a translucent lime tint).
- Host broadcast: left 3px lime border, `HOST BROADCAST` label — wired to announce-mode/host
  system messages.
- Composer, mentions, images, lightbox, retry, muted/closed states all unchanged.

### 4.6 Profile

- **Anchor:** `TierRing` — 132px ring showing progress to the next games-played tier, avatar
  inside, tier badge (`GOLD`) on the corner, name in display 22, `74% to Platinum · Advanced
  player`.
- Reliability card: display 30 number in `intermediate`, `Reliability · Excellent`, divider,
  right column `On-time · Low cancels` + `What's this? ›` → the existing explainer sheet.
- `52 games played` line, then behaviour chips (`BehaviourBadges`).
- Settings rows: `Edit profile` · `Notification settings` · `Invite friends` (with lime
  `EARN BADGES`) · `Settings` · `Delete account` (danger). All routes already exist.
- Everything the design drops moves to **new route `app/profile-stats.tsx`**, reached from a
  `Stats & achievements ›` row: rating distribution, peer-perceived skill, streak, activity
  tiles, 12-week heatmap, regulars, achievements, completeness meter, share-my-card. Straight
  move, restyled to the row/card language — nothing is deleted.

---

## 5. Nav

`app/(tabs)/_layout.tsx` gains a 5th slot. Order: **Discover · My Games · `+` · Chat · Profile**.

- The `+` is a 52px lime circle sitting −30px above the bar with a lime glow, routing to
  `/wizard`. It is not a tab route — it's a button rendered in the middle slot.
- No labels. `accessibilityLabel` + `accessibilityRole="tab"` on each icon; the `+` gets
  `accessibilityRole="button"`, label `Host a game`.
- **Icons stay Ionicons** (`search`, `calendar`, `chatbubble-ellipses`, `person`). The design's
  glyphs are CSS-shape approximations of exactly these; hand-rolling them as SVG buys nothing
  and loses the filled/outline active state.
- Unread/pending dots survive on My Games and Chat.
- `HostFab` and `BottomRail` are deleted; `useTabBarSpace(withRail)` loses its rail argument.

---

## 6. Sequence

| Phase | Commit | Contents |
|---|---|---|
| P0 | `v2: design tokens + Space Grotesk` | fonts, tailwind aliases, theme constants |
| P1 | `v2: primitives` | Hero, ListRow, RailCard, StatTile, SegmentedToggle, TierRing, GameCard variants |
| P2 | `v2: bottom nav with centre host FAB` | TabBar, tabs layout, delete HostFab/BottomRail, nav math |
| P3 | `v2: Discover list` | header, single filter row, best-match hero, rails, single-line list |
| P4 | `v2: Discover map layer` | search field, mode chips, venue-anchored sheet, carousel cards |
| P5 | `v2: Game Detail` | court hero, stat tiles, info rows, host console, hold-to-join |
| P6 | `v2: My Games agenda + past screen` | agenda, hero, `my-games/past` route |
| P7 | `v2: Chat thread` | merged sticky bar, bubble + broadcast restyle |
| P8 | `v2: Profile + stats screen` | tier ring, reliability card, settings rows, `profile-stats` route |

Each phase must typecheck (`npx tsc --noEmit`) before its commit.

---

## 7. Backlog — shipped features the design has no place for

Recorded here rather than deleted. Nothing in this list is removed from the app by v2 unless
the "v2 disposition" column says so.

| # | Feature | Where it lives today | v2 disposition |
|---|---|---|---|
| B1 | Week pulse strip (`N games nearby this week · M spots open`) | Discover row 1 | **Removed from the list.** Its job is partly done by the header kicker. Re-add as a hero footnote later. |
| B2 | Removable filter tokens row | Discover | **Removed.** The 4-chip row shows active state inline; the sheet has Reset all. |
| B3 | Inline `Request to join` on every list card | `GameCard showJoinAction` | **Removed from Standard rows.** Joining happens on the hero CTA and Game Detail only — matches "lime once per screen". |
| B4 | `VenueCourtHeader` court graphic on every card | GameCard | **Featured/hero only.** |
| B5 | Scarcity progress bar + `RollingNumber` spot counter | GameCard | **Hero + detail only.** Standard rows carry `6/8` as text. |
| B6 | Organizer line (name · hosted N · reliability) on list cards | GameCard | **Detail only.** |
| B7 | Map heatmap layer | never existed (design shows a chip) | **Not built.** Needs a real heat layer + density source first. |
| B8 | Geocoded suburb/venue search on the map | never existed | **Client-side name filter only** in this pass. |
| B9 | Full cost breakdown (courts × duration, if-full total, your share) | Game Detail card | Moves behind a tap on the price `StatTile` → sheet. Build in a follow-up; the tile shows the per-player number today. |
| B10 | Full roster grid with names + long-press remove | Game Detail | Moves behind a tap on the avatar stack → roster sheet. Follow-up; removal stays reachable from the host console in the meantime. |
| B11 | Add-to-calendar action | NextUpHero third button; silent on join | Silent-on-join keeps working. The explicit button is dropped from the 2-button hero → moves to Game Detail's row list in a follow-up. |
| B12 | Host controls on the My Games card (cancel game, upload confirmation, approve/decline, share) | `UpcomingGameCard` | Consolidated into Game Detail's **Host console**. The agenda row is single-line. |
| B13 | `Upcoming | Past` chip tabs | My Games | Replaced by the agenda + `12 past games ›` route. |
| B14 | Profile stats block (distribution, peer skill, streak, activity tiles, heatmap, regulars, achievements, completeness, share card) | Profile | Moved wholesale to `/profile-stats`. |
| B15 | Tab bar labels | TabBar | Removed per decision 3; `accessibilityLabel` compensates. |

## 8. Things the design implies that don't exist yet

Built in this pass because removing the underlying capability would be a regression:

- `app/my-games/past.tsx` — the past-games screen the `12 past games ›` row points at.
- `app/profile-stats.tsx` — the home for everything §4.6 displaces.
- Best-match selection rule for the Discover hero (§4.1) — the design shows the card but not
  what picks it. Computed from real query results, never fabricated.
- `Hosting N ›` chip behaviour on My Games — filters the agenda; the design only shows the chip.

## 9. Not doing

- No new backend, RPC, or migration. v2 is presentation only.
- No change to the tech stack, data fetching, or query keys.
- No restyle of chat list, venue detail, wizard, onboarding, settings, post-game, or player
  detail beyond what the token/type change gives them for free.
- No light theme. The app is dark-only and stays dark-only.

## 10. Verification

Per phase: `npx tsc --noEmit`. At the end, run the app against the hosted project with
`test@smashio.dev` and walk: Discover list → hero → Game Detail → hold to join → chat →
My Games agenda → past → Profile → stats. Confirm the 5-slot bar renders on all four tabs and
the `+` opens the wizard.
