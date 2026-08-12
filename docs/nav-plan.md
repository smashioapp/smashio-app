# Navigation Plan — SMASHIO bottom bar

Written 2026-08-12. Scope: the bottom navigation bar only ([TabBar.tsx](../ui/components/TabBar.tsx), [(tabs)/_layout.tsx](../ui/app/(tabs)/_layout.tsx)) plus the content padding it forces on the four tab screens. Native only, matches [ux-plan.md](ux-plan.md).

Problem statement: bar reads as small, ambiguous and cramped. Icons are undersized, nothing is labelled, the centre `+` collides with screen content, and nothing accounts for the device's bottom inset.

---

## 1. Audit — what's actually wrong

Measured from source, not vibes.

| # | Defect | Where | Platform standard |
|---|---|---|---|
| 1 | Tap target **42×42px** | `TabButton` :70 | iOS HIG min **44pt**, Android min **48dp**. Fails both. |
| 2 | Icon **19px** | :74 | HIG tab icon ~**25pt**, Material 3 **24dp**. ~25% undersized. |
| 3 | **No labels at all** | `ICONS` :27-32 | Only `search` is a universal icon. `calendar-outline` → "My Games" and `person-outline` → "Profile" are guesses on first run. |
| 4 | FAB **not vertically centred on the bar** — sits 28px proud of it | `AddButton` :107 (`bottom:36` inside a `bottom:14 height:64` container) | It overlaps scrolling content; visible in Discover where it covers the **Map** pill. |
| 5 | **No safe-area inset** — fixed `bottom:14` | `TabBar` :140 | Bar sits under/over the home indicator on gesture phones, and over the Android 3-button nav bar. |
| 6 | `paddingBottom: 110` **hardcoded in 8 places** | discover ×4, my-games ×2, chat, profile | Any height change silently breaks list bottoms. |
| 7 | Badge is a **7px dot, no count** | `UnreadDot` :48 | 1 unread and 20 unread look identical. |
| 8 | **Weak active state** — 12% tint circle + colour swap | :71 | Lowest-contrast selected state in the whole app. |
| 9 | Blur bar over dark content at 40 intensity | :141 | Contrast of inactive `textSecondary #96969E` on translucent surface is borderline for WCAG AA non-text. |
| 10 | Centre slot — the app's most valuable pixels — spent on **Host a game**, a minority action | `AddButton` | Most users join; few host. |

**Map control** ([discover.tsx](../ui/app/(tabs)/discover.tsx))

| # | Defect | Where | Consequence |
|---|---|---|---|
| 11 | Map pill is `bottom:96, alignSelf:"center"` — **same centre column as the FAB**, overlapping it by ~10px | :745 | The collision in the screenshot. Two floating controls, two independent y-values, no shared owner. |
| 12 | **Asymmetric toggle** — enter via bottom-centre pill, exit via top-left `close` X | :742 vs :761 | Not a toggle, reads as "open a thing / dismiss a thing". Airbnb puts the return control in the *same* spot with the label flipped. |
| 13 | Map is **zustand state, not a route** (`discoverView` in [store.ts:52](../ui/lib/store.ts:52)), and there is **no `BackHandler` in the codebase** | :754 | Android hardware-back does not close the map — it exits the tab. Map mode also persists after leaving Discover and returning. |
| 14 | Entry pill hidden when `showInitialLoading` or `pinnedGames.length === 0` | :741 | Control appears/disappears; no stable home. |
| 15 | Map overlay's X at `top:14`, count pill at `top:20` | :764, :770 | 6px misalignment, and neither uses the top inset. |

## 2. Research — how the good ones do it

**Platform guidelines**

- **Apple HIG (tab bars):** icon **+ label** is the default; label-less bars are the exception. Min 44pt targets. iOS 18/26 moved to a floating, rounded bar that **minimises on scroll** and expands on scroll-up — the direction of travel is "floating pill, but bigger and labelled".
- **Material 3 (navigation bar):** **80dp** tall, **24dp** icons, **labels always visible** for ≤4 destinations, and an explicit **active-indicator pill (64×32dp)** behind the selected icon. Notably M3 **deleted M2's docked centre FAB** — the FAB now lives *above* the bar, bottom-right, or in content.

**Product patterns worth stealing**

| App | Pattern | Takeaway |
|---|---|---|
| Airbnb, Spotify, Uber, Strava | Always-labelled tabs, 24px icons | Labels are table stakes for apps without Instagram-scale icon familiarity. |
| Instagram / X | Icon-only | Works *only* on a decade of muscle memory. Instagram also moved `+` **out of** the centre after accidental-tap complaints. |
| Strava | Centre "Record" is a **real labelled tab item**, not a floating disc | If the centre action stays, it should live *in* the bar, aligned and labelled — not hover over it. |
| Duolingo, CRED | Floating pill; selected item expands to **icon + label**, others stay icons | Keeps a compact silhouette while killing ambiguity. Fits our CRED-adjacent direction. |
| Apple Music / iOS 26 | Bar **minimises to a slim pill on scroll down** | Reclaims screen without hiding navigation. |

**Nielsen Norman:** icon-only navigation measurably reduces destination recognition; the set of genuinely universal icons is tiny (home, search, settings). Our two ambiguous icons are exactly the failure case.

### List ↔ map switching

| App | Pattern | Takeaway |
|---|---|---|
| **Airbnb** | Floating bottom-centre pill `Map`; in map view the **same pill in the same place** flips to `List` | Symmetric toggle. One control, one location, label swaps. We enter bottom-centre and exit top-left — that asymmetry is defect #12. |
| **Zillow, Redfin** | Segmented `List | Map` control docked in the filter header | Zero floating chrome, zero collision risk, always visible. Least elegant, most predictable. |
| **Apple Maps, Google Maps, Yelp** | Map is the base surface; results are a **draggable bottom sheet** with detents | Best feel for map-first products. Wrong for us — we are list-first, and a sheet plus a floating tab bar plus a FAB is three stacked bottom layers. |
| **Booking.com** | Static map **thumbnail card inline in the list**, tap to expand | Discoverable with no floating layer at all. Worth stealing as a *secondary* entry point. |

**Conclusion.** Two separate conclusions fall out:

1. For the tab bar: the fix is not "make the icons bigger" — it's *labels + real touch targets + inset awareness*.
2. For the floating controls: `Map` and `+` were positioned independently, so they collided. The fix is not to nudge one of them. Both belong to **one bottom action rail** with a single owner of the y-coordinate, and the map toggle becomes symmetric (Airbnb) rather than open/dismiss.

---

## 3. Target spec

```
Bar:      floating pill, left/right 16, bottom = max(insets.bottom, 12)
Height:   64 content + inset          (was 64 fixed, no inset)
Item:     56w × 52h  hitSlop 6        (was 42 × 42)
Icon:     24px filled-when-active     (was 19px, always outline)
Label:    11px / 600, always visible  (was none)
Active:   accent pill 52×30 behind icon + accent icon + accent label
Inactive: textSecondary icon + label
Badge:    count pill (9+ cap) on Chat; dot only where there is no count
Motion:   minimise to 44px slim pill on scroll-down, expand on scroll-up
Create:   see Phase 2
```

Active/inactive icon pairs (Ionicons): `search`/`search-outline`, `calendar`/`calendar-outline`, `chatbubble-ellipses`/`chatbubble-ellipses-outline`, `person`/`person-outline`.

---

## Phase 0 — Foundation, zero visual change

De-risks every later phase. Nothing on screen moves.

- [ ] Export `NAV` metrics from [lib/theme.ts](../ui/lib/theme.ts) (or new `lib/nav.ts`): `BAR_HEIGHT`, `BAR_MARGIN`, `ITEM`, `ICON`, `MIN_BOTTOM_INSET`.
- [ ] `useSafeAreaInsets()` in `TabBar`; bar bottom becomes `Math.max(insets.bottom, 12)`.
- [ ] Add `useTabBarSpace()` hook returning the exact content clearance (bar + inset + FAB overhang).
- [ ] Replace all **8** `paddingBottom: 110` literals with that hook.
- [ ] Add `accessibilityRole="tab"`, `accessibilityState={{selected}}`, `accessibilityLabel` per item — currently absent, so VoiceOver/TalkBack announce four unlabelled buttons.

**Done when:** bar renders pixel-identical on a gesture phone, and no screen has a magic number.

## Phase 1 — The bar redesign (the actual fix)

- [ ] Labels on all four items, always visible: `Discover`, `My Games`, `Chat`, `Profile`.
- [ ] Icons 19 → **24px**; filled variant when active.
- [ ] Items 42×42 → **56×52** with `hitSlop`, clearing 44pt/48dp on both platforms.
- [ ] Active indicator: rounded accent pill behind the icon (M3-style), replacing the 12%-alpha circle. Spring-morphs between items using `SPRING.settle` from [lib/motion.ts](../ui/lib/motion.ts).
- [ ] Raise inactive colour `textSecondary` → `textDim` for AA contrast on the blurred surface; raise `BlurView` intensity/backing opacity so text never sits on a light card bleeding through.
- [ ] Badges: count pill on Chat (`9+` cap), keep dot for pending-request state on My Games/Profile.
- [ ] Verify at `fontScale` 1.3 — labels truncate to one line, never wrap.

**Done when:** a first-run user can name every destination without tapping it.

## Phase 2 — The bottom action rail (Create + Map)

Defects #4, #10, #11–#15. `+` and `Map` were each positioned by hand against the screen bottom, never against each other — hence the overlap. This phase gives them one owner.

**2a. Move Create out of the bar. Decided 2026-08-12: option B.** (Rejected: **A** — `+` as a labelled fifth bar item, still spends prime real estate on a minority action; **C** — header-only, lowest discoverability.)

- [ ] Remove `AddButton` from `TabBar`; delete the `<View style={{width:56}}/>` spacer (:166) so the four items space evenly.
- [ ] New `HostFab`: extended pill `＋ Host a game`, `accentDiagonal` gradient, `colors.base` label.
- [ ] Mount on **Discover** and **My Games** only — not Chat, not Profile, where it is pure noise.
- [ ] Collapse to a 56px circle (label width-animates out) on scroll-down; re-extend on scroll-up. Shares the Phase 3 scroll offset.
- [ ] Keep the existing press-in rotate/scale and `whoosh` sound; they're good.

**2b. New `BottomRail` component — the single source of truth for floating controls.**

One absolutely-positioned row sitting directly above the tab bar, with `left` / `centre` / `right` slots. Nothing else in the app is allowed to hand-position against the screen bottom again.

```
BottomRail   bottom = tabBarSpace + 12, height 48, pointerEvents="box-none"
  left    — (free)
  centre  — MapToggle
  right   — HostFab
```

- [ ] Build `BottomRail`; migrate `HostFab` and the map pill into its slots.
- [ ] `useTabBarSpace()` grows to include rail height, so lists clear bar **and** rail.
- [ ] Both slots share one y-value → collision is structurally impossible, not just currently absent.

**2c. Make the map toggle symmetric (Airbnb).**

- [ ] Map pill stays bottom-centre — legal now that the FAB has moved right — and becomes a **persistent toggle**: `🗺 Map` in list view, `☰ List` in map view, **same slot, same size, label and icon swap**. Delete the top-left `close` X (:761).
- [ ] Show the count on it: `Map · 8` — the number is why you'd tap it.
- [ ] Stop hiding it on `pinnedGames.length === 0`; disable it instead, so it holds a stable position (defect #14).
- [ ] Align the map overlay's count pill to the **top inset**, not `top:20` (defect #15).
- [ ] Cross-fade list ↔ map instead of a hard swap; gate on `useReduceMotion()`.

**2d. Make map a real navigation state (defect #13).**

- [ ] Add a `BackHandler` (Android) that returns map → list instead of leaving the tab. This is the app's only hardware-back dead end.
- [ ] Reset `discoverView` to `list` when Discover loses focus (`useFocusEffect`), so returning to the tab never lands you in a map you didn't ask for.
- [ ] Decide: keep zustand + back handler, or promote map to `/discover/map` route so back is free. Route is cleaner; zustand is one file's change. **Default: keep zustand + explicit handler**, revisit only if more views appear.
- [ ] Consider Booking.com's inline map thumbnail as a second entry point in the list — **deferred, not in scope**, logged here so it isn't re-litigated.

**Done when:** no floating control overlaps another or overlaps scrollable content on any tab screen, and Android back closes the map.

**Done when:** no floating control overlaps scrollable content on any tab screen.

## Phase 3 — Motion & scroll behaviour

- [ ] Scroll-aware minimise: bar shrinks to a ~44px pill (icons only) on scroll-down, expands on scroll-up or scroll-to-top. Driven by the existing Reanimated setup; a shared scroll offset per tab screen.
- [ ] Tab-press feel: keep `haptics.tick()`, add a subtle label fade on the outgoing item so the indicator morph reads as one motion, not two.
- [ ] Re-press active tab → scroll list to top (standard iOS behaviour, currently a no-op).
- [ ] Gate every animation on `useReduceMotion()` — bar must be fully static when the setting is on.

**Done when:** the bar never costs more than 44px of vertical space while reading a list.

## Phase 4 — Validate

- [ ] Device matrix: iPhone SE-class 375pt (label truncation), tall gesture iPhone (inset), Android gesture bar, Android **3-button** nav (worst case — the bar has never been tested against it).
- [ ] Accessibility: VoiceOver + TalkBack pass on all 4 tabs; contrast check on active + inactive states; `fontScale` 1.0 / 1.3 / 1.6.
- [ ] Confirm every list bottom still clears the bar **and rail** after Phase 0's hook change — all 8 former call sites.
- [ ] Map specifically: toggle in/out 5×, hardware-back from map (Android), leave-tab-and-return, zero-results state, and map ↔ list with the FAB collapsed *and* extended.
- [ ] Before/after screenshots of Discover (list **and** map) + Profile, appended here.

**Done when:** all four checkboxes above are ticked with evidence.

---

## Sequencing note

Phases 0 → 1 → 2 are ordered by dependency, not by preference. Phase 1 without Phase 0 re-hardcodes the padding problem at a new number; Phase 2 without Phase 1 leaves a hole in the bar with nothing to fill it. Phases 3 and 4 can swap.

Phase 0 + 1 alone fix roughly 80% of the perceived "it's too small / bad UX" complaint.
