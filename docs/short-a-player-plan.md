# Short-a-player plan — aligning the app on one promise

Written 2026-09-24. **Signed off and implemented 2026-09-24**, committed on branch
`short-a-player` (owner: "lets implement";
D1-D4 taken as recommended). S1-S8 built and tested against the local stack, then **shipped
2026-09-25**: both migrations pushed to the hosted project, `push-dispatch` redeployed, app and
website changes merged to `main` (OTA to testers, Vercel for the site). The inline **Ask to join**
push action followed 2026-09-25 (§8.2; JS-only, no store build needed after all; `push-dispatch` v16 + OTA live). Still open: the
store subtitle/keywords (A19, console) and the S8 read-out. See §8 for what shipped and where it
deviates from the slices below.

Read [gtm-plan.md](gtm-plan.md) §1–§2 first. This doc narrows its message, it does not replace it.

---

## 0. The promise

> **Got a court, short a player? Smashio fills it, with someone your level who actually turns up.**

Short form for UI and store: **"Real court. Real level. Real players."**

Why this and not "less admin": a direct Sydney competitor, **Jigsaur Sports** (jigsaur.app),
already sells admin relief to organisers of big social sessions: waitlist, built-in payments, QR check-in,
claims 1,000+ players and ~10 groups, English only, organiser-picked level labels. gtm-plan §2.3's
"direct AU competitor: none found" is wrong as of 2026-09. Head-on, Smashio loses that fight
before November. The **small game** (2–6 people, one person booked a court, 1–3 short) is served
by nobody: the incumbents are group-chat begging, cancelling the court, or playing 2-on-1.

The small game has one fear: **playing with strangers.** Three questions decide a join, and
Smashio already has the data for all three. No competitor we found shows all three together:

| Question | Signal | Already built |
|---|---|---|
| Is the court real? | **Court booked** | `games.verification_status`, AI parse via `ai-proxy`, `VerifiedSheet` |
| Will they be my level? | **Level voted** by people who played with them | `peer_skill_vote`, `player_card.peer_skill_label/votes` (post-game-plan D12) |
| Will they flake? | **Turns up %** | `reliability_score`, host no-show marking, late-leave ledger |

Prior art checked 2026-09-24: Playo's skill rating is self-rating-weighted and publicly known to
inflate; Rallia (US tennis/pickleball) shows reliability; SubHook/Pickleheads do sub-finding. None
is in AU badminton, none verifies the court.

**The problem this plan fixes:** the data exists, but the app doesn't *say* any of it. The badge
reads "Verified" (verified what?) or "Verified venue" (wrong, it's the booking). The voted level is
visible only on your own profile. Reliability appears in one host line. And the moment the promise
depends on, a spot opening at the last minute, triggers nothing for nearby players.

---

## 1. Audit — where the app diverges from the promise today

| # | Surface | File | Today | Gap |
|---|---|---|---|---|
| A1 | Spot opens (drop-out, removal) | `trigger_notify_*` migrations | `player_left` goes to host only; waitlist promotes if one exists | **No one outside the game hears about a spot.** |
| A2 | Short-notice games | `dispatch_nudge_underfilled` (notifications_p3) | Nudges host at T-24h | Skips any game created <24h before start (`created_at <= starts_at - 24h`), exactly the last-minute ones. Host-only anyway. |
| A3 | New-game alerts | `trigger_notify_game_alerts` | Fires on publish, only to users who manually saved an alert | Most users never save one; no default. |
| A4 | Discover hero | `discover.tsx` ~L1257 | Kicker "BEST MATCH FOR YOU" | Doesn't say the thing that makes it urgent: "needs 1". |
| A5 | Discover rails | `discover.tsx` `rails` | "Closing soon", "At your level, near you", "Back at …" | Closing soon = starts <24h; not "short a player". |
| A6 | List row | `GameCard.tsx` `GameRow` | `skill · distance · Verified · Full` | No spots-needed count; "Verified" unexplained. |
| A7 | Featured card | `GameCard.tsx` `FeaturedGameCard` | "Verified venue" badge, "3/4 joined" | Wrong noun; "joined" frames what's done, not what's needed. |
| A8 | Map card | `MapCarouselCard.tsx` | "x/y joined" | Same. |
| A9 | Game detail hero | `game/[id].tsx` ~L315 | Badge only when status ≠ none | No trust summary above the fold; reliability buried in Host section near bottom. |
| A10 | Lineup | `LineupStrip.tsx` | Avatars + names | No level-voted or turns-up signal per player. |
| A11 | Join-request vetting | `VettingStrip.tsx` | Self-declared tier, played, reliability band | Shows **self-declared** tier; ignores peer vote. |
| A12 | Other players' profiles | `PlayerCard.tsx` (mode "them") | Self-declared tier | Peer-voted level shown only on your own profile (`profile.tsx` L280). |
| A13 | Host entry | `wizard.tsx` fork, `TabBar.tsx` HostButton | "Got a booking confirmation?" → receipt/manual | Right mechanics, neutral framing. Doesn't say "we'll fill it". |
| A14 | Feed "Looking for players" post | `compose.tsx`, `feed.tsx` | Free-text "Anyone free at NBC Thursday 8pm?" | A weaker parallel path to the same job. No trust signals, no alerts, no roster. |
| A15 | Share text | `lib/share.ts` `shareGame` | "Come play badminton at X, date time." | Doesn't say how many needed or what level. **Android string contains an em dash** (copy-rule violation). |
| A16 | Website game page | `website/api/game/[id].js` | "Up to N" players, tier | No spots-needed, no court-booked signal. |
| A17 | Website home / OG | `website/api/home.js` | "Games are on. Find one, or host your own." | Generic; doesn't own the small-game job. |
| A18 | Onboarding | `onboarding/index.tsx`, `setup.tsx` | "Never scramble for a fourth again." Level picked once | Tagline is right. Level pick doesn't say others will confirm it; no spot-alert opt-in. |
| A19 | Store listing | App Store Connect (console) | Subtitle "Find players & courts near you" | Generic. |
| A20 | Analytics | `lib/analytics.ts` | 10-event funnel | No time-to-fill, no fill-after-drop-out metric. The promise is unmeasured. |

---

## 2. Design guardrails

Keep the v2/v3 design system as is ([v2-design-plan.md](v2-design-plan.md)): tokens, type, density
weights (featured/standard/rail), **lime only on the featured card** (rule 5), Smashimals. Layout
may move; no new visual language.

The trust signals render as **one reusable component**, not re-styled per screen:

```
TrustRow  (compact | full)
  compact:  ✓ Court booked · Host turns up 98%          (list/map/share)
  full:     three stacked rows with a one-line explainer each, tappable → existing sheets
```

- Colours from existing tokens: court-booked uses the current verified green (`colors.intermediate`
  at 15% bg, as `FeaturedGameCard` does today); reliability uses `reliabilityColor`.
- A signal that's absent is **omitted, not shown as a negative** (VerifiedSheet's rule: "none reads
  as normal, not suspicious"). A game with no booking just doesn't show the tick.
- Copy follows CLAUDE.md tone: plain, casual Australian, no em dashes.

**Vocabulary change (D2):** "Verified" → **"Court booked"** everywhere a player sees it. Nobody
knows what "verified" verifies; everybody knows what a booked court is.

---

## 3. Slices

Each slice is independently shippable. Effort is focused build time.

### S1. Spot alerts (the engine) — 1.5 d, backend + small UI

The promise is empty without this. When a spot opens close to game time, the right nearby players
hear about it inside minutes.

- **New notification type `spot_open`**, fired when a published, public game within **36 h** of start
  goes from 0 open spots to ≥1, **or** is published with <24 h to go (covers A1 + A2), **and** the
  waitlist is empty (a non-empty waitlist promotes first, existing `promote_waitlist`).
- **Recipients:** players whose tier matches the game's tier range (`skill_tier_id`..`skill_tier_max`),
  within their radius of the venue (saved `game_alerts` **or** the new default below), not on the
  roster, not blocked by or blocking the host, `notification_pref_enabled(..., 'alerts')`.
- **Default opt-in (D1):** a "Last-minute spots near me" preference, created from `profile_private`
  home point + primary tier, 10 km. Reuses the `alerts` pref key, so the existing settings toggle
  turns it off.
- **Caps:** 2 `spot_open` per user per day, 1 per game per user, quiet hours 10pm–7am local.
  Shares the existing 3/day `alert_match` budget logic pattern.
- **Host "Find a sub" button** on the game's host card (`game/[id].tsx` "spots to fill" block): re-sends
  to the next ring (15 km) once per 6 h. It sits next to the existing Share link / Invite / WhatsApp
  chips and uses the same styling.
- **Fix A2** in the same migration: drop the `created_at <= starts_at - 24h` exclusion from
  `dispatch_nudge_underfilled` so short-notice hosts get the nudge too.
- Push copy: *"1 spot, tonight 7pm at Alpha Auburn. Intermediate, court's booked. Keen?"*
  Inline action: **Join** (reuse the join-request notification category pattern).
- Grants: new functions need explicit `grant execute` per AGENTS.md's 2026-09-14 default-privilege
  rule; trigger helpers run security definer.

### S2. TrustRow + "Court booked" — 1 d, UI + one RPC field

- Build `components/TrustRow.tsx` (compact/full per §2).
- Wire compact into `GameRow` subtitle (replaces bare "Verified"), `FeaturedGameCard` (replaces
  "Verified venue" pill), `MapCarouselCard` rows.
- Wire full into game detail directly under `StatusBand`, above `GamePitch` (A9). Each row taps to
  its existing explainer: court → `VerifiedSheet`, host reliability → host `PlayerCard`, level →
  S5's level sheet.
- `nearby_games` (signed in) feeds `organizerReliabilityScore`. `nearby_games_public` (anon,
  checked 2026-09-24) projects `verification_status` and `open_spots` but **no reliability**, so a
  logged-out viewer sees "Court booked" only. That's correct under website-plan §5.4, don't widen
  it. If `profile_visibility` hides a host's score, omit the row. No new PII.
- Rename Badge label "Verified"/"Pending" → "Court booked"/"Checking booking" in game detail hero.

### S3. "Needs N" everywhere a game is listed — 0.5 d, UI

Frame the game by what it needs, not by what's done (A4–A8).

- `GameRow` title stays `Venue, 7pm`; subtitle leads with **"Needs 2"** (or "Full · waitlist").
- `FeaturedGameCard`: "3/4 joined" → **"Needs 1 · Intermediate"**. Kicker becomes contextual:
  `NEEDS 1 · YOUR LEVEL · TONIGHT` when true, else keep "BEST MATCH FOR YOU".
- `MapCarouselCard`: "x/y joined" → "Needs N".
- Hero selection in `discover.tsx` adds one tiebreak: fewer open spots first among same-day,
  level-matched games (a game needing 1 is the most satisfying join and the highest host value).

### S4. Discover leads with "Short a player tonight" — 0.5 d, layout

- Rename rail "Closing soon" → **"Short a player tonight"**: open spots 1–2, starts within 12 h,
  sorted by fewest spots, then soonest. Move it to first position (it already is).
- Keep "At your level, near you" and "Back at …".
- Empty-state copy for the rail omitted (rail hides when empty, existing behaviour).
- No filter changes, no new chips.

### S5. Earned levels on every player surface — 0.5 d, UI

- `VettingStrip`: show peer level when `peerSkillVotes ≥ 3`: **"Intermediate (voted by 7)"**, else
  self-declared with **"says Intermediate"** (A11).
- `PlayerCard` mode "them": same rule, and the peer-vote chip that `profile.tsx` already renders
  for self moves into the shared card (A12).
- `LineupStrip` slot tap sheet: add the same one-liner. No layout change to the strip itself.
- `onboarding/setup.tsx` tier step subtitle: *"Pick what feels right. Players you hit with will
  back it up after your first game."* (A18)
- Post-game skill vote header: *"Keep levels honest. What level did they play at?"*
- Threshold 3 votes (D4) stops a single vote from overriding someone's own pick.

### S6. Host path says "we'll fill it" — 0.5 d, copy + small layout

- Wizard fork (`wizard.tsx` ~L1028): title **"Got a court booked?"**, primary card *"Snap the
  booking, we'll fill the spots"*, secondary *"No booking yet, set it up"*. Same two paths, same
  parse. (A13)
- After publish, the existing stamp screen adds one line: *"We'll tell nearby players at your
  level."* (true once S1 ships, gate the line on S1).
- `compose.tsx` "Looking for players" tab (A14, D3): a top card *"Got a court booked? Post it as a
  game, it fills faster and players get pinged."* → wizard. The text post stays for "anyone keen
  to book something?" chatter.

### S7. Share, website, store — 0.75 d

- `shareGame` text: *"Need 2 for badminton at Alpha Auburn, Thu 7pm. Intermediate, court's
  booked."* Falls back to today's line when full or unknown. Replace the Android em dash with a
  colon. (A15) `ShareableGame` gains optional `openSpots`, `tierLabel`, `courtBooked`.
- `website/api/game/[id].js`: "Up to N" → **"Needs N"**, plus the court-booked tick. (A16)
  `game_preview` does **not** project either today (checked 2026-09-24), so this needs a migration
  adding `open_spots int` and `court_booked boolean`. Both are already anon-visible through
  `nearby_games_public`, so no new exposure. It's a return-type change: drop and recreate, then
  re-grant `anon`/`authenticated` explicitly (AGENTS.md default-privileges rule). The app's
  `GamePreviewTeaser` reads the same RPC and gets it for free.
- `website/api/home.js` hero secondary line: *"Got a court? Short a player? Fill it tonight."*
  OG description to match. H1 stays. (A17)
- **Console only, owner does it:** App Store subtitle → *"Short a player? Fill your court"*
  (30 chars), keyword add `sub,fill,last minute`. Same on the Play listing when it exists. (A19)

### S8. Measure the promise — 0.25 d

PostHog, added to the existing funnel (gtm-plan §6 capped it at ten; these replace two
lower-value ones, not add three):

| Event | Props |
|---|---|
| `spot_open_sent` | game_id, recipients, ring (default/boost) |
| `spot_filled` | game_id, minutes_since_opened, source (alert/discover/share/waitlist) |

Derived weekly: **median time-to-fill for a last-minute spot** (headline metric for the promise and
for marketing: "filled in 38 minutes"), and % of opened spots filled before start.

---

## 4. Sequence and total

```
S1 spot alerts ──► S2 TrustRow ──► S3 Needs N ──► S4 rail ──► S5 levels ──► S6 host copy ──► S7 share/web ──► S8 metrics
   1.5 d             1 d            0.5 d         0.5 d       0.5 d         0.5 d            0.75 d           0.25 d
```

About **5.5 build days**. S2–S7 are mostly independent after S2 lands; S6's "we'll tell nearby
players" line waits for S1. Only S1 and S7's `game_preview` change touch the database; everything
else is JS and ships over OTA to current testers. S1's new notification category needs a native build only if it adds
an inline action; the first cut can ship without the inline **Join** and add it with the next
store build.

Target: all slices live before the go/no-go check in gtm-plan's pre-launch week (2 Nov).

---

## 5. Not doing

| | Why not |
|---|---|
| Payments / wallet | Jigsaur's lane; drags positioning toward booking (gtm-plan §1 anti-message). |
| Court rotation / queue tools inside a session | Different job (Racket Social, Qcourt, Shuttl own it). |
| Algorithmic rating (Elo/UTR-style) | Needs match results we don't collect; peer vote is honest and already built. |
| Showing a negative badge ("Not verified", "Unreliable") | Punishes the normal case; absent signal is omitted. |
| Naming competitors in any copy | Own the job, don't reference others. |
| Unlimited or marketing-style pushes | Spot alerts are capped and transactional or they get muted. |

---

## 6. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| D1 | Spot alerts default on for everyone with a home point + tier? | **Yes**, shown as a pre-ticked toggle in onboarding and a one-time in-app prompt for existing users; off in settings. Capped 2/day. |
| D2 | Rename "Verified" to "Court booked" player-facing? | **Yes.** Internal column/enum names unchanged. |
| D3 | Keep the feed's "Looking for players" text post? | **Keep**, add the "post it as a game" card on top. |
| D4 | Peer level shown once there are how many votes? | **3.** Below that, "says Intermediate". |

## 7. Sign-off

2026-09-24: owner said go on the whole plan. D1 yes (default on, pre-ticked in onboarding,
one-time prompt for existing users), D2 yes, D3 keep, D4 = 3 votes.

## 8. Implementation notes (2026-09-24)

| Slice | Where | Notes / deviations |
|---|---|---|
| S1 | `20260924000000_spot_alerts.sql`, `push-dispatch` (`spotOpenBody`, `spots` channel), `find_a_sub` + host chip in `game/[id].tsx` | Deferred constraint triggers, so they evaluate at commit after `promote_waitlist`. Fires on **any** drop-out that leaves an open spot inside 36h, a superset of "0 to >= 1"; per-game and 2/day caps bound it. Also fires when a host raises `max_players` or releases a held spot. Recipients: `profile_private.home_point` + `profile_sports` tier inside the game's tier range (10 km default, 15 km boost), unioned with saved `game_alerts`. Skips anyone already sent `alert_match` for the game in the last hour. Quiet hours: the player's own window if set, else 22:00-07:00, applied when recipients are picked (recipients in quiet hours are skipped for that event, not queued). New Android channel `spots` (DEFAULT importance) instead of the LOW `discovery` channel. No inline Join action yet (needs a store build). A2 fix also switches the nudge to `open_spots()`: the old `approved < max_players` ignored the host's slot and nudged full games. `nudge_underfilled` copy now says today/tomorrow correctly. |
| S2 | `components/TrustRow.tsx`, `lib/trust.ts` | Host "turns up %" only shows with >= 3 games behind it (score defaults to 100 for everyone). GameRow shows the court tick only; the host % would truncate a single line, so it's on the featured card and detail. Full TrustRow shows to non-hosts only. Level row shows the **host's** voted level, only when earned. |
| S3/S4 | `GameCard.tsx`, `MapCarouselCard.tsx`, `discover.tsx` | As written. `heroKicker` / `shortAPlayer` in `lib/trust.ts` with tests. |
| S5 | `VettingStrip`, `PlayerCard` (them), `LevelSheet`, onboarding `setup.tsx`, post-game vote row | Lineup slot tap still goes straight to the player page (which now shows the level); no new sheet on the strip. |
| S6 | `wizard.tsx`, `compose.tsx` | Stamp line is honest about timing: "heads up now" only for public games inside 24h, else "if someone drops out close to the day". |
| S7 | `lib/share.ts` (`gameShareText`), `20260924000100_game_preview_needs.sql`, `website/api/game/[id].js`, `website/api/home.js` | `game_preview.spots_left` was also wrong (ignored host slot, double-counted claimed holds); now equals `open_spots`. Also removed em dashes from post/referral share copy. Store subtitle/keywords (A19) are console work for the owner. |
| S8 | `spot_openings` table, `spot_open_sent` event | Time-to-fill is recorded server-side (`opened_at` / `filled_at` per fan-out) rather than a client `spot_filled` event, since the fill happens in the DB. Only the host boost is visible to the client, so that's the one PostHog event added. |

Deploy order (followed): `supabase db push` (both migrations), then `supabase functions deploy
push-dispatch`, then push to `main` (OTA). The JS tolerates the old `game_preview` shape, and
`find_a_sub` errors cleanly if called before the migration lands.

### 8.1 Deploy record (2026-09-25)

| Step | Where | State |
|---|---|---|
| Migrations | hosted `20260924000000_spot_alerts`, `20260924000100_game_preview_needs` | Live |
| `push-dispatch` | hosted v15 (contains `spotOpenBody`, `spots` channel) | Live |
| App + website | `7ccca7c` on `main` (branch rebased, not merge-committed) | OTA run succeeded; Vercel deploys the site from `main` |
| Follow-up | `346f213`: small `StatTile` shrinks values over 9 chars to 10.5px so skill ranges ("Intermediate-Advanced") fit on the game detail tile row | OTA'd |

Still open:

- ~~Inline **Join** action on the `spot_open` push.~~ Done, §8.2.
- A19 store subtitle/keywords. Owner console work, App Store Connect + Play Console.
- S8 read-out. Check `spot_openings` (`opened_at` / `filled_at`) and `spot_open_sent` once there are a couple of weeks of fan-outs, before the gtm-plan pre-launch go/no-go (2 Nov).

### 8.2 Inline "Ask to join" (2026-09-25)

The "needs a store build" call above was wrong. Notification categories are registered from JS
(`setNotificationCategoryAsync`, already in the shipped binary), so a new one ships over OTA.

- `push-dispatch` `CATEGORY_FOR_TYPE`: `spot_open` → `spot_actions`.
- `ui/lib/notifications.ts`: `spot_actions` has one button, **"Ask to join"** (not "Join": it calls
  the same `request_to_join` as the game screen's hold-to-join, so the host still approves). It
  opens the app on the game so the player sees the price and their pending request, or the error
  if the spot's already gone. Tracked as `join_requested` with `source: "push_action"`.
- **Found while doing it:** Android never showed any action button. Approve/Decline and Reply
  were attached to Android channels through a `notificationActions` channel option that
  expo-notifications doesn't have (silently ignored), and categories were only registered on iOS.
  Categories are now registered on both platforms from one table, which fixes Approve/Decline
  and Reply on Android too.
- Deploy order doesn't matter: a push carrying a category the app hasn't registered yet shows
  without buttons.

| Step | Where | State |
|---|---|---|
| App | `8e1fb89` on `main` | OTA run succeeded, CI green |
| `push-dispatch` | hosted v16 (`spot_open` → `spot_actions`) | Live |
| Device check | tester phone, iOS + Android | Not done yet: confirm "Ask to join" on a `spot_open` push, and Approve/Decline + Reply now show on Android |
