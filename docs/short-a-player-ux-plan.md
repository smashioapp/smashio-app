# Short-a-player UX fixes, plan

Serves [gtm-strategy.md](gtm-strategy.md) §1 (the promise), §2.2 (message house: real court,
real level, real players, fast), §4 (the alert pool) and §7.2 (venue QR posters).

Written 2026-09-25 after a full mobile-viewport walkthrough of the app (Expo web, local
`supabase start` stack, `test@smashio.dev`). **Status: signed off 2026-09-25** (owner: fix all
F1-F25). All six decisions in §9 are answered; five went with the recommendation, D-U1 did not
(joining becomes a plain tap, see §5). **Implemented 2026-09-25** on branch
`feat/short-a-player-ux`; both migrations are on the hosted project, the JS is not on `main` yet.
§11 records what was built, the deviations, and the deploy order.

Related docs, read before touching their area: [short-a-player-plan.md](short-a-player-plan.md)
(S1-S8, shipped), [create-game-plan.md](create-game-plan.md) (the draft-card wizard, §4.3
"Who's coming"), [discover-plan.md](discover-plan.md) (and its G9/G14 amendment),
[not-boring-plan.md](not-boring-plan.md) (hold-to-join, reversed by D-U1), [website-plan.md](website-plan.md)
§5 (anon data rules), [social-plan.md](social-plan.md) §0/§17 (feed scope, blocks, visibility).

---

## 0. The problem in one line

Each screen is fine taken alone. Together they tell a player three different numbers for one game,
send them to a directory when they search for a game, and ask a host who is one player short to
think in terms of eight.

The three user jobs this plan is judged against:

| Job | Target | Today |
|---|---|---|
| **Host:** "I've got a court and 3 of us, need 1" | ≤ 4 taps after the venue, zero arithmetic | 4 taps, but it defaults to 8 players, so the host has to work out total players and held spots themselves |
| **Player:** "Find me a game near me tonight" | Open app, see it, tap, join | The list works, but search, the venue page and the lineup all mislead or dead-end |
| **Pool:** "Ping me when a spot opens" | Every signed-up player has a home point, a tier and alerts on, and can see that | Set once in onboarding, invisible afterwards, no recovery if they skip it |

---

## 1. Findings → fixes index

Numbers match the walkthrough findings (F1-F25). Phase is where the fix lands.

| F | Finding | Root cause (verified in code) | Fix | Phase |
|---|---|---|---|---|
| F1 | Venue page "1 upcoming game" is plain text, not tappable | `venue/[id].tsx:210` renders `upcoming_game_count` as text; no games query on the screen | List the venue's upcoming games as `GameCard`s | U2 |
| F2 | Discover search opens a venue directory | `discover.tsx:1192` pushes `/venues` (G9, deliberate: "no way to type Alpha Auburn") | One search that returns **games first**, then venues and suburbs. Keeps G9's venue lookup | U2 |
| F3 | Venue lists sorted A-Z, "? courts" | `venues_directory` has no location args, `order by base.name`; `wizard.tsx:630` prints `?? "?"` | Add `p_lat/p_lng`, order by distance, return `distance_m` + `upcoming_game_count`; hide the court count when it's unknown | U0 (copy) / U2 (RPC) |
| F4 | Create defaults to 8 players / 7 open | `lib/store.ts:61` `maxPlayers: 8`; WHO section asks "Total players (including you)" | Ask **"How many do you need?"** (default 1) and **"Who's already in?"**; `max_players` becomes derived | U1 |
| F5 | One game, several spot counts (Needs 4 / 2/6 joined / 1 in · 5 open / 6 spots) | Game page lineup is built from `useGameRoster`, which RLS returns **empty** to non-members; feed card uses the `max_players` snapshot in the post payload | Single source: `open_spots` (server) for every "needs" label; lineup pads hidden joiners from `joinedCount`; feed reads live `open_spots` | U0 |
| F6 | Host slot captioned "You" for every viewer | `LineupStrip.tsx:192` `if (slot.kind === "host") return "You"` | Caption "You" only when viewer is the host, else host's first name + host crown | U0 |
| F7 | Game tonight says "Starts in 1 day" | `StatusBand.tsx:26` `Math.max(1, Math.ceil(ms / DAY))` | Same-day: "Tonight, 10:57pm · in 3h 37m"; tomorrow: "Tomorrow, 5:57am"; ≥2 days: "In 3 days · Mon 28 Sept, 8pm" | U0 |
| F8 | Header "NEAR YOU · 15KM", no suburb, can't change location | `discover.tsx:1181`; `DEFAULT_DISCOVER_RADIUS_KM` 15 vs alert radius 10 | Tappable location pill "Marrickville · 10 km ▾" opens a sheet: use my location / type a suburb / radius | U2 |
| F9 | Same game up to 3× on one screen | Hero + "At your level, near you" carousel (`discover.tsx:1153`) + list all draw from one pool | Hero excluded from list; carousel only when pool ≥ 8 games and never repeats hero or the first screen of list | U0 |
| F10 | Exact-level default + full games shown | `levelTouched` effect sets viewer tier (`discover.tsx:698`); `hasSpotsOnly: false` default | Default `hasSpotsOnly` true; level default your tier ±1 (D-U3) | U2 |
| F11 | Hero repeats "Needs 4" twice | Kicker `NEEDS 4 · YOUR LEVEL · TONIGHT` + footer `Needs 4 · Intermediate` | Footer drops "Needs N" when the kicker says it | U0 |
| F12 | Filter sheet: 7 sections + 23 amenities; "Most spots" sort | Filter sheet in `discover.tsx` ~L200-260 | Amenities collapse behind "Court amenities (23) ›"; sort "Most spots" → **"Fewest needed"** | U2 |
| F13 | Hold-to-join friction; can't see who's playing | Hold is a signed decision (not-boring-plan §75); roster RLS is members-only | Plain tap to join (D-U1); signed-in lineup with trust info (D-U2) | U3 |
| F14 | No "Court booked" seen; "AWAITING BOOKING UPLOAD" pill | Local seed has no verified game (not a bug); success screen shows raw status | Success pill → "Add your booking later for a Court booked tick" (sentence case) | U1 |
| F15 | "No booking yet, set it up" excludes phone/friend bookings | `wizard.tsx:1056` | Two fallbacks: "Booked, but no screenshot? Skip it →" and "No court yet? Set it up →" (both go to step 2; the first pre-sets "court booked, unverified") | U1 |
| F16 | Cost asks per-player price | Cost row edits `cost` directly | Enter **court cost**, show "$35 ÷ 4 = $9 each"; per-player stays editable. Parse path already computes this (`wizard.tsx:311`) | U1 |
| F17 | Next Up (hosting) says "Bring $8", no fill status | `NextUpHero.tsx:109` has one variant for host and player | Host variant: "Needs 3 · Share link" + open chat; hosting rows show "Needs N" | U1 |
| F18 | Feed: stale spot counts, system noise, "Looking for players" fork | `feed.tsx:73` uses payload `max_players`; venue-added system posts on Nearby | Live `open_spots`; hide full/started game cards; venue-added posts batch into one weekly digest line; post type goes game-first + alert (D-U5) | U5 |
| F19 | Skipping location = silently out of the alert pool | `set_home_point` called only from onboarding + profile-edit | Discover banner + profile card "Get pinged for last-minute spots: set your suburb" (typed suburb, no GPS needed) | U4 |
| F20 | Alert status invisible; push copy doesn't mention spots | No status UI; `notification-settings.tsx:206` copy | "Spot alerts" card on Profile (on/off, suburb, level, radius); rewrite push copy | U4 |
| F21 | Onboarding preselects Intermediate | `setup.tsx:80` `useState<TierId>("Intermediate")` | No preselection, plain-language tier descriptions, "Not sure? Pick the lower one, players vote you up" | U4 |
| F22 | Sign-in / host headers don't state the promise | `onboarding/index.tsx:236`, wizard header | Sign-in: "Short a player? Fill your court. Real level, real players." Host header: "Fill your court" | U6 |
| F23 | Em dashes in UI copy | `game/[id].tsx:231`, `settings.tsx:290` (+ sweep) | Replace; add a grep check to CI | U0 |
| F24 | Day headers sometimes lose left gutter | `DayHeader` scales 0.88 around centre inside a sticky header; likely web-only | Check on a device first; if real, `transformOrigin: left` | U0 |
| F25 | Duplicate PCYC Marrickville (local only) | `seed.sql` row with NULL `google_place_id` | Merge the seed row onto the slugged one in `seed.sql`. Production is clean (75 slugged) | U0 |

---

## 2. Phase U0: correctness (JS only, no decisions, OTA-safe)

Goal: every screen tells the truth about one game. About 1.5 days.

### 2.1 One definition of "needs" (F5, F11)

Rule: **the only number a player sees is `open_spots`** (server, `public.open_spots()`, host takes
a slot, only unclaimed holds count as held). The label is always `needsLabel(open)` from
`lib/trust.ts`. Totals ("2 of 6 in") are secondary text, never the headline.

- `game/[id].tsx`:
  - Line 504 `"{joinedCount+1}/{maxPlayers} joined"` → headline **"Needs 4"**, secondary "2 of 6 in".
  - `lineupSummary()` (`LineupStrip.tsx:293`) takes `openSpots` from the game row instead of
    counting `open` slots, so it can't disagree with Discover.
- Lineup for non-members (root cause of "1 in · 5 open"): RLS on `game_players` lets only
  the organiser and approved members read rows, so `useGameRoster` is `[]` for a browser. Build
  `max(0, joinedCount - roster.length)` **"Joined" slots** (filled avatar silhouette, caption
  "Joined") between the host and the holds. This fixes the count now without exposing names;
  U3 then fills in who they are for signed-in viewers (D-U2).
- `feed.tsx:73`: stop reading `payload.max_players`. The feed query joins the live game row
  (`open_spots`, `status`, `starts_at`) for `game_published` system posts. Show `needsLabel`,
  and drop the card if the game is full, cancelled or started. (Stale snapshots are the bug; the
  payload stays for history.)
- `NextUpHero`, My Games rows, `MapCarouselCard`, share text (`lib/share.ts`): audit, all already
  on `open_spots` except My Games hosting rows, which get "Needs N" appended.

### 2.2 Lineup captions (F6)

`slotCaption(slot, viewerId)`: host slot is "You" only when `viewerId === slot.id`; otherwise
the host's first name, with the existing host marker. Same fix for the wizard preview (host is
always the viewer there, so no change in behaviour).

### 2.3 Countdown (F7)

Replace `upcomingText` in `StatusBand.tsx` with the `dayLabel()` + `formatCountdown()` helpers
already in `lib/format.ts` (tested in `format.test.ts`):

| Time to start | Text |
|---|---|
| ≤ 90 min | unchanged ("Starts in 37 min, about 6.8 km away") |
| same calendar day | "Tonight, 10:57pm · in 3h 37m" (or "Today, 2pm · in 5h") |
| next day | "Tomorrow, 5:57am" |
| later | "In 3 days · Mon 28 Sept, 8pm" |

Add cases to `format.test.ts` for the day boundary (23:30 → 00:30 is "Tomorrow", not "in 1 day").

### 2.4 Discover de-duplication (F9, F11)

- Hero game is removed from the list and the carousel.
- Carousel "At your level, near you" renders only when the filtered pool has ≥ 8 games and it
  would show ≥ 3 games not already in the first 6 list rows. Otherwise it's hidden. In a thin
  market (our launch reality, gtm §5) the list alone reads fuller.
- Hero footer drops "Needs N" when the kicker already says it.

### 2.5 Copy hygiene (F3 part, F23, F24, F25)

- `wizard.tsx:630`: `{courts} courts` only when known, else just the suburb.
- Em dashes: replace the two found; sweep `ui/app` + `ui/components` for `—` inside JSX text and
  string literals passed to `Text`, `Alert.alert`, `label=`, `title=`, `subtitle=`. Add
  `scripts/check-copy.js` (fails on `—` in those positions) to the existing CI job.
- F24: check on the iOS/Android build first. Only fix if it reproduces off web.
- F25: `seed.sql` only.

**Verify U0:** `npx tsc --noEmit`, jest (`format.test.ts`), web preview walk of Discover →
game (non-member and member) → feed, all showing the same "Needs N".

---

## 3. Phase U1: host flow, "Fill your court" (JS only, OTA-safe)

Goal: the one-short host never does arithmetic. About 2 days.

### 3.1 WHO becomes two questions (F4)

Replace "Total players (including you)" with:

```
   WHO'S ALREADY IN?
   👑 You   🟣 Mia   ＋ Add someone        ← named/anon holds, existing §4.3 picker
   or just a number:  [ − 2 + ] already in, including you

   HOW MANY DO YOU NEED?
   [ − 1 + ]          "Nearby players at your level get pinged for these"

   → 4 players on 1 court · doubles
```

- **Defaults: already in = 3 (you + 2), need = 1.** That's the doubles-one-short case, the
  strategy's headline scenario. The store keeps `maxPlayers`, now derived:
  `maxPlayers = alreadyIn + need`. `reservedSpots` = `alreadyIn - 1` (anonymous holds unless
  named via "Add someone"), exactly as create-game-plan §4.3 already models it. **No schema
  change.**
- "Already in" people who aren't on Smashio are anonymous holds, which the host can release later
  (existing flow, and releasing one already fires `spot_open` per short-a-player S1).
- Shape hint under the steppers: 4 → "doubles", 2 → "singles", 5-6 → "rotating on 1 court",
  > 6 → suggests a second court. Reuses the existing "All rotating on the one court booked" copy.
- Big sessions still work: both steppers go to 16 (`MAX_PLAYERS`).
- Parsed bookings (snap path) keep their current behaviour but land on the same two questions.
- `duplicate game` (from My Games) seeds both numbers from the source game.

### 3.2 Cost from the court price (F16)

Cost row asks **"What did the court cost?"** (optional). If entered, per-player =
`ceil(court / maxPlayers)` with the maths shown ("$35 ÷ 4 = $9 each, rounded up so you're
covered", the same sentence already used for parsed bookings at `wizard.tsx:1160`). Per-player
stays directly editable; the existing $20/hour cap still applies. If blank, falls back to today's
per-player entry.

### 3.3 Step 1 fallbacks (F15) and success screen (F14)

- Step 1 keeps "Snap the booking" as the primary action. Below it, two quiet links:
  "Booked, but no screenshot? Skip for now →" and "No court yet? Set it up →". Both go to step 2;
  the first shows a "You can add the booking later for a Court booked tick" hint on the draft
  card. (No new status value: `verification_status` stays `none` until upload.)
- Success screen: replace "AWAITING BOOKING UPLOAD" with a sentence-case row
  "Add your booking for a Court booked tick" + button, only when not verified.

### 3.4 Venue picker (F3, host side)

"Popular near you" becomes **"Your venues"** (the host's last 3 distinct venues, from their own
games) then **"Nearest"** (from the U2 `venues_directory` distance ordering). Until U2 lands, it
uses `venues_near` around the device location sorted client-side by `haversineMeters` (already in
`lib/format.ts`), so U1 doesn't block on the migration.

### 3.5 Host's Next Up card (F17)

`NextUpHero` gets a host variant: headline **"Needs 3"** (or "Full, game on"), actions
**Share link** · Open chat · Directions. "Bring $8" stays for players only. My Games hosting rows
show "Hosting · Needs 3".

**Verify U1:** create the one-short game from the FAB in ≤ 4 taps after the venue, check the draft
card reads "Needs 1", publish, confirm `max_players = 4`, `reserved_spots = 2` in the db, and that
Discover (as another user) shows "Needs 1".

---

## 4. Phase U2: finding a game (needs migrations)

Goal: from any entry point (search, venue page, QR poster, header) you're one tap from a joinable
game. About 3 days. **Deploy order: migrations to hosted, then JS** (JS calling an RPC that
doesn't exist yet on hosted breaks OTA testers; see AGENTS.md on OTA reach).

### 4.1 Migration `…_venue_distance_and_games.sql`

1. **`venues_directory`**: add `p_lat double precision default null, p_lng double precision default null`.
   When both are set, order by distance and return `distance_m`; otherwise keep `order by name`.
   Also return `upcoming_game_count` (public, listed games only). Signature change means drop and
   recreate, so **re-grant** explicitly (post-20260914000400 default is no one):
   `grant execute … to authenticated` (it's app-only today; keep it that way).
2. **`venue_upcoming_games(p_venue_id uuid, p_limit int default 20)`**: `security invoker`,
   returns the same row shape as `nearby_games` for one venue (so `GameCard` renders it
   unchanged), applying the same `visibility = 'public'` filter §5.2 of website-plan added.
   (`nearby_games` does not filter `blocks` today, checked 2026-09-25; match it, and treat a
   blocks filter on both as a separate follow-up.) Grant to `authenticated`.
   Guests (session-less G5 browse) use `nearby_games_public` filtered client-side by venue id;
   that's already anon-safe, so no new anon surface (website-plan §5 rule respected).
3. `supabase gen types typescript --local > ui/lib/db.types.ts`.
4. CI: `select public.assert_no_public_definer_execute();` still passes (both functions are
   invoker; the check is for definer, but keep the revoke-from-public pattern anyway).

### 4.2 Venue page lists its games (F1)

`venue/[id].tsx` "Play here": up to 5 `GameCard`s (compact row variant), "See all N" if more,
then "Host a game here". Empty: "No games on here yet. Host one, or get pinged when one's posted"
with the existing `AlertMeRow` scoped to this venue (saved alert centred on the venue, 2 km).
This is what the §7.2 QR poster lands on, so it's the highest-leverage fix in the plan.

### 4.3 One search (F2)

Keep G9's reason (typing "Alpha Auburn" must work), change the result:

```
  [🔍 Suburb, venue or "tonight"      ]
  GAMES                          ← nearby_games filtered by venue/suburb match, needs-first
    Alpha Auburn · Tonight 8pm · Needs 1 · Intermediate
  VENUES                         ← venues_directory(p_search, p_lat, p_lng)
    Alpha Badminton Centre - Auburn · 2.1 km · 3 games this week
  SUBURBS                        ← distinct venue suburbs matching
    Auburn · 4 venues · 6 games  → sets Discover's location to that suburb
```

- Empty query shows "Tonight near you" (top 5 by fewest-needed) and "Your venues".
- The amenity chips move off this screen into the venue directory ("Browse all venues ›" at the
  bottom), which stays at `/venues` for G9 and SEO parity.
- Guests can search; tapping **Join** on a result is what asks them to sign in, not the magnifier
  (today the magnifier itself routes guests to `/onboarding`, `discover.tsx:1192`).

### 4.4 Location pill (F8)

Header becomes a pill: **"Marrickville · 10 km ▾"** (falls back to "Near you" only when there's
no suburb). Sheet: "Use my location", suburb search (reuses the suburb matcher from 4.3), radius
chips (moved out of the filter sheet). A chosen suburb is session state, not the home point
(changing where you look ≠ changing where you get alerts; the alert card in U4 says which is which).

### 4.5 Filters and defaults (F10, F12)

- `hasSpotsOnly` default **true** (full games still reachable via the chip and the fallback
  ladder, which already offers the waitlist route).
- Sort options: Soonest · Closest · **Fewest needed** · Cheapest. "Most spots" removed.
- Amenities collapse behind one row "Court amenities ›" with a count badge when any are set.
- Level default: viewer's tier ±1, chip label "Around your level" (D-U3).
- Radius default: 10 km, matching spot alerts (D-U4).

**Verify U2:** `supabase db reset` passes (incl. the definer assertion); venue page lists games as
member, non-member and guest; search "auburn" returns games, then venues sorted by distance; the
Courts list and wizard picker open nearest-first.

---

## 5. Phase U3: joining with trust (decision-gated)

About 1 day.

- **D-U1 join is a plain tap (decided 2026-09-25, reverses not-boring-plan decision 2).** The
  Join / Join waitlist buttons in `game/[id].tsx` (~L786, ~L811) become a normal `Button`
  ("Join · $12", "Join the waitlist"). Accidental-join guard: for games with a cost, tap opens a
  small confirm sheet ("$12 each, split with the group. Join?", wording to match how cost is
  settled today); free games join
  straight away. Keep the success haptic/sound. `HoldButton` stays elsewhere (onboarding). The
  spot-alert push action "Ask to join" (short-a-player §8.2) is already one-tap.
- **D-U2 who's playing (decided: yes).** A `game_lineup_public(p_game_id)` **security definer** RPC
  for `authenticated` only, returning per approved player: first name, avatar, voted tier label
  (only when ≥ 3 votes, same rule as `peer_skill_vote` display) and turns-up % band. It respects
  `profile_visibility` (hidden profiles render as "Joined" silhouettes from U0) and blocks in both
  directions. Aggregate-only ratings rule (post-game-plan) is kept: no individual rating rows.
  Not exposed to `anon` (website-plan §5.4: no player identities on anonymous surfaces).
  Explicit `revoke … from public; grant … to authenticated`.
- Trust row on the game page then reads, for the joining decision:
  "Court booked · Level voted by 7 · Turns up 98%" (message house §2.2).

---

## 6. Phase U4: the alert pool (the launch constraint, gtm §4)

About 1.5 days. JS only (uses existing `set_home_point`, `profile_sports`, notification prefs).

### 6.1 Spot alerts card (F20)

On Profile (under Reputation) and at the top of Notification settings:

```
  SPOT ALERTS                                    [ on ]
  Pinged when someone near Marrickville is short a player at Intermediate
  Within 10 km · max 2 a day · quiet 10pm-7am       Edit ›
```

States: **on** (as above) · **off** · **missing home point** ("Set your suburb to get pinged",
primary button) · **push denied** ("Turn on notifications in Settings"). Each state maps to one
fix action.

### 6.2 Recovery nudge (F19)

If `home_point` is null or the `alerts` pref is off, Discover shows one dismissible row under the
header: "Get pinged when a spot opens near you. Set your suburb ›". Suburb entry works without
GPS: typed suburb → Places geocode (same path `profile-edit.tsx:172` already uses; needs
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, so fall back to the venue-suburb list when it's blank) →
`set_home_point`.
Dismissal snoozes for 7 days, max 3 times.

### 6.3 Copy (F20, F21)

- Push pre-prompt / settings line: "Get pinged when a spot opens near you, plus join requests and
  game chat." (spot alerts first; that's the reason to allow push.)
- Onboarding tier: no preselection (`setup.tsx:80` → `null`, finish disabled until picked), each
  tier with a one-line "you can…" description, helper "Not sure? Pick the lower one. Players you
  play with vote your level up." (That's the voted-level pitch, and it counters inflation.)

**Metric hook:** add `alert_pool_state` (on / off / no_home / push_denied) to the PostHog person
properties on app open, so gtm §9 scorecard row 2 can be read without SQL.

---

## 7. Phase U5: feed and the second composer (F18)

About 1 day, part decision-gated.

- Live `open_spots` on system game cards and hide full/started ones: already in U0.
- "X was added near you" system posts: collapse into a single weekly line
  ("3 new venues near you this week ›") instead of one card each.
- **D-U5 "Looking for players" post (decided: game-first + alert).** When the poster **has a court** the compose
  screen already nudges to a game; make that nudge the default action (the button reads "Post as a
  game, nearby players get pinged") and keep the text post as the secondary choice. When they
  **don't** have a court, rename it "Looking for a game" and, on post, also save a `game_alert`
  for their level and suburb, so the post turns into a ping when a matching spot opens.

---

## 8. Phase U6: promise copy (F22)

Half a day, JS only. All strings follow CLAUDE.md tone (casual Australian, no em dashes) and
gtm §2.3 words (use "short a player", "court booked", "your level"; never "book courts").

| Where | Now | New |
|---|---|---|
| Sign-in tagline | "Find your court. Match your level. Never scramble for a fourth again." | "Short a player? Fill your court. Real level, real players." |
| Wizard header | "Host a game" | "Fill your court" |
| FAB accessibility label | (check) | "Fill your court" |
| Discover empty cold start | "Court's quiet right now" | keep, subtitle → "Got a court? Post it and nearby players get pinged." |
| Courts screen title | "Courts near me" | "Venues near you" (the page is a directory, not court booking) |
| Filter "Bookable now" chip | "Bookable now" | "Casual play" (bookability data unchanged; gtm §2.3 bans booking framing) |

---

## 9. Decisions (all answered 2026-09-25, owner)

| # | Question | Decision | Note |
|---|---|---|---|
| **D-U1** | Keep hold-to-join? | **Plain tap to join.** Paid games get a confirm sheet | Not the recommendation. Reverses not-boring-plan decision 2 (annotated there) |
| **D-U2** | Show who's playing to non-members? | **Yes**, signed-in only: first name, avatar, voted level (≥ 3 votes), turns-up band, via a definer RPC honouring visibility and blocks | Anon stays identity-free (website-plan §5.4) |
| **D-U3** | Discover level default | **Your tier ±1**, labelled "Around your level" | |
| **D-U4** | Discover default radius | **10 km**, same as spot alerts | `DEFAULT_DISCOVER_RADIUS_KM` 15 → 10 |
| **D-U5** | "Looking for players" post | **Game-first + alert**: with a court, default action posts a game; no court, becomes "Looking for a game" and saves a `game_alert` | |
| **D-U6** | Host defaults | **3 already in, need 1** | |

## 10. Order, effort and shipping

| Phase | Content | Effort | Ships via | Blocked by |
|---|---|---|---|---|
| U0 | Truth: counts, lineup, countdown, dedupe, copy hygiene | ~1.5 d | OTA | nothing |
| U1 | Host: two questions, court cost, fallbacks, Next Up host variant | ~2 d | OTA | nothing |
| U2 | Find: venue distance + games RPCs, venue page games, one search, location pill, filters | ~3 d | migration → hosted, then OTA | nothing |
| U4 | Alert pool: status card, recovery nudge, onboarding tier | ~1.5 d | OTA | nothing |
| U3 | Join trust: lineup RPC, tap-to-join | ~1 d | migration, then OTA | nothing |
| U5 | Feed/compose | ~1 d | OTA (+ maybe feed query change) | nothing |
| U6 | Promise copy | ~0.5 d | OTA | nothing |

Total ≈ 10.5 days. Recommended order: **U0 → U1 → U2 → U4 → U6 → U3 → U5**. U0-U2 + U4 should land
before gtm Phase 1 recruiting starts (12 Oct), because that's when real bookers and QR-poster
scans arrive. None of this needs a store build (no native modules, no Expo version changes, no
lockfile changes), so the jsi-pin rules in AGENTS.md are not touched. Every phase still goes to
testers the moment it hits `main`, so each needs its verify step green first.

### Verification for every phase

1. `npx tsc --noEmit`, jest.
2. Migrations: `supabase db reset` locally (includes the definer-exposure assertion), then
   `supabase db push` to hosted **before** merging the JS that calls them.
3. Web preview walk at 375×812 (`smashio-web-alt`), as three viewers: guest, non-member,
   member/host. Screens: Discover, search, venue page, game page, wizard, My Games, feed, Profile.
4. One real-device check per phase on iOS (TestFlight OTA) for anything touching gestures
   (U3 tap-to-join) or sticky headers (F24).

### Not doing

- No new game fields or statuses; `max_players`/`reserved_spots` stay as they are.
- No player identities on anon surfaces (website-plan §5.4).
- No in-app booking, "book courts" copy or payments (gtm §11).
- No re-litigating G9: venue search stays, it's just no longer the only result type.

---

## 11. Implementation record (2026-09-25)

Built in one pass, U0 to U6 plus U3 and U5. Verified: `npx tsc --noEmit`, jest (70 tests, new
`startsWhenText`/`relativeDayPhrase` cases in `format.test.ts`), `scripts/check-copy.js`,
`supabase db reset` + `supabase test db` (new `game_lineup_public_test.sql` and the extended
`venues_rpc_test.sql` pass; `join_leave_flow_test.sql` and `push_dispatch_triggers_test.sql` fail
identically on the pre-change baseline, so they're not from this work), definer-exposure assertion
passes. Web preview walked as a guest (Discover, location pill + sheet, one search, suburb pick).
Signed-in walks (wizard, game page as member/non-member, profile card, feed) still to do.

### Deploy order

Step 1 done 2026-09-25: both migrations applied to hosted, grants checked (all three RPCs
authenticated-only, anon denied). They were first numbered `20260925000000/000100`, which
collided with the image-moderation migrations already on hosted under the same versions, so they
were renumbered to `20260925100000/100100` before pushing.

1. `supabase db push` for `20260925100000_venue_distance_and_games.sql` and
   `20260925100100_game_lineup_public.sql`. **Before** merging the JS: Discover search, the venue
   page, the venue directory and the wizard picker call `venues_directory` with `p_lat/p_lng` and
   `venue_upcoming_games`, and the game page calls `game_lineup_public`. On an old schema those
   calls fail for every OTA tester.
2. Then push the JS to `main` (OTA). No native change, no lockfile change, jsi pin untouched.

### What shipped, by phase

- **U0**: one "Needs N" everywhere. The game page lineup is built from `joinedCount` and the
  reserved counts, not from roster rows, so a non-member sees "Joined" silhouettes (new
  `LineupSlot` kind `hidden`) instead of false open slots; claimed holds are drawn once, as the
  joined player. Host caption is "You" only for the host. `StatusBand` uses calendar days
  (`startsWhenText`). Feed system game cards read live `open_spots` from `games_public` and drop
  full/cancelled/started games. Discover rails never repeat the hero; "At your level" needs 8+
  games and 3+ not on the first screen. Hero footer drops "Needs N" when the kicker says it.
  Em dashes swept from UI strings, `ui/scripts/check-copy.js` added to `ci.yml`. Chat's share
  card used `max_players - joined` (ignored the host and holds), now `open_spots`. Seed's duplicate
  PCYC Marrickville removed; its games point at the slugged venue.
- **U1**: WHO is "Who's already in?" (strip + "Add someone by name" + a number stepper) and "How
  many do you need?"; `maxPlayers` derived; defaults 3 in, need 1 (D-U6). Anonymous holds are now
  sent to `create_game_with_spots` as blank spots (before this, the wizard never sent them at all)
  and every non-invite hold is pinned after publish, so "already in" friends don't expire 4h out
  and fire a `spot_open`. Duplicate/rebook carry `reservedSpots`. Court-cost split, two step-1
  fallbacks, success-screen "Add booking" row, Next Up host variant ("Needs N", Share link first),
  "Hosting · Needs N" on My Games rows. Wizard venue picker: "Your venues" then "Nearest".
- **U2**: the migration above; venue page lists up to 5 games plus "See all", empty state with a
  venue-centred 2km alert (`AlertMeRow` moved to `components/`). New `/search` screen: GAMES,
  VENUES (signed in only, `venues_directory` is authenticated-only), SUBURBS; "Tonight near you"
  and "Your venues" on an empty query. Guests can search. Location pill + "Where to look" sheet
  (use my location, typed suburb, radius chips moved out of Filters). `hasSpotsOnly` defaults on,
  sort "Fewest needed" (client-side re-sort; the RPCs never implemented "most_spots", it silently
  sorted soonest), amenities collapsed, level default ±1 labelled "Around your level", radius 10km.
- **U4**: `SpotAlertsCard` (profile, under Reputation, and top of Notification settings) with the
  four states; `SpotAlertsNudge` on Discover (7-day snooze, 3 dismissals max); typed-suburb home
  point sheet (Places `(regions)`, falling back to venue-suburb centroids without a Maps key).
  Onboarding tier: no preselection, "you can..." descriptions, the lower-one hint. Push copy leads
  with spot alerts. `alert_pool_state` sent as a PostHog person property from the tabs layout.
- **U6**: sign-in tagline, wizard header and FAB label "Fill your court", cold-start subtitle,
  "Venues near you", "Casual play".
- **U3**: plain-tap Join (confirm sheet for paid games, haptic + chime kept); waitlist is one tap.
  `game_lineup_public` (definer, authenticated only) feeds a non-member's lineup with first name,
  avatar, voted level (3+ votes) and turns-up % (3+ games), plus a line per player under the strip.
  Maestro `join-request.yaml` and `leave-game.yaml` updated for the tap.
- **U5**: compose asks "Got a court?" first. Yes: "Post as a game, nearby players get pinged" (to
  the wizard, venue carried over), text post as the fallback link. No: "Looking for a game", and
  posting also saves a `game_alert` (their level, 10km, centred on the venue or on them). New-venue
  system posts fold into one "N new venues near you this week" line.

### Deviations

- §4.1 said `nearby_games` doesn't filter blocks. It does (`blocked_between`, since
  20260910000000); `venue_upcoming_games` matches it, so there's no follow-up to raise.
- §6.1's home point check reads `profile_private` (`useHasHomePoint`): `profiles.home_point` moved
  there in 20260912000100.
- The spot-alerts card's "Edit ›" became "Change suburb" + "Quiet hours ›"; there's no radius or
  daily-cap setting to edit, both are fixed server-side.
- F24 (day header gutter) not touched: still needs a device check first, as planned.
- `ui/.maestro/join-full-game.yaml` was already stale (expects a "Game full" CTA that became the
  waitlist button) and now also can't find game …02 on Discover, since full games are hidden by
  default. Left for the e2e owner.

