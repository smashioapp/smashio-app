# Quick-wins backlog — cheap, high-leverage additions

Written 2026-08-23. A running list of small, mostly-independent items that buy disproportionate
value for the effort. Not a plan doc — nothing here is approved, sequenced, or blocking. Pick
items off it; don't treat the ordering as a roadmap.

Scope rule: an item earns a place here only if it is **≤1 day of work** and does **not** need
sign-off against [mvp-spec.md](mvp-spec.md). Anything bigger belongs in its own plan doc.

**Context.** The app is already dense — haptics wired through 31 files, push notification
categories with inline Approve/Decline actions ([notifications-plan.md](notifications-plan.md) P3),
calendar, share cards, store review, Universal Links, Sentry. So the gaps below are narrow and
specific, not "the app is missing basics". Each one was verified absent from the repo on
2026-08-23, with the evidence noted.

---

## 1. Tier 1 — do these first

Operational leverage. Every one of these makes the *next* piece of work cheaper or more visible.

### 1.1 `expo-updates` — OTA JS updates ✅ done 2026-08-23

**Gap.** Not in `ui/package.json`. No `expo-updates`, no update channel in `ui/app.config.js`.

**Shipped.** `expo-updates` installed, `runtimeVersion: { policy: "appVersion" }` + `updates.url`
pointed at the EAS Update service in `ui/app.config.js`, channel picked via
`EXPO_PUBLIC_UPDATE_CHANNEL` (defaults `"production"`). New workflow
`.github/workflows/ota-update.yml` publishes on every push to `main` that touches `ui/**`
(excluding native `ios/`/`android/` dirs). **Needs a one-time manual step before this works:** add
an `EXPO_TOKEN` repo secret (from an Expo access token with publish rights on the project), and
run `eas channel:create production` once so the `production` branch/channel exists.

**Why it hurts.** iOS ships via self-managed GitHub Actions to TestFlight
([store-readiness-plan.md](store-readiness-plan.md) §"Release pipeline"). Today a one-line JS
bugfix in private beta costs a full native rebuild plus TestFlight processing. With OTA it costs
minutes.

**Work.** `npx expo install expo-updates`, add `updates.url` + `runtimeVersion` to
`app.config.js`, wire a publish step into `build-ios.yml`. Pick a channel per profile so beta and
production don't cross-update.

**Effort:** ~1h including CI. **Highest leverage item in this doc.**

### 1.2 Android App Links — `assetlinks.json` missing ✅ done 2026-08-24

**Gap.** `website/.well-known/` contains only `apple-app-site-association`. No `assetlinks.json`.

**Shipped.** `website/.well-known/assetlinks.json` added (package `com.smashio.app`), served with
`Content-Type: application/json` via `website/vercel.json`. `android.intentFilters` (autoVerify,
`smashio.com.au` host, `/game/*`, `/venue/*`, `/player/*` path patterns) added to
`ui/app.config.js`. No release keystore existed at all before this — generated one
(`smashio-upload` alias, PKCS12, 10000-day validity) and set it as the 4 GitHub secrets
`build-android.yml` expects (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`); `sha256_cert_fingerprints` in `assetlinks.json` is
the real fingerprint of that keystore. **The keystore file and its password are not stored
anywhere else** — back them up somewhere durable (password manager + encrypted backup); losing
them means every future Play Store update needs a new app listing.

**Why it hurts.** Android is being added to the beta in batches. Every
`https://smashio.com.au/game/<id>` link tapped on Android opens the browser instead of the app —
the exact dead-end the AASA file was added to fix on iOS (see the comment in `app.config.js`).

**Effort:** ~20min (plus the manual fingerprint step above).

### 1.3 Universal Link paths are too narrow ✅ done 2026-08-24

**Gap.** AASA `paths` is `["/game/*"]` only.

**Shipped.** `/venue/*` and `/player/*` added to AASA `paths`
(`website/.well-known/apple-app-site-association`) and to the same Android intent filters as 1.2.
Static fallback pages `website/venue.html` and `website/player.html` added (dark-theme, matches
`index.html` styling, TestFlight/Android-beta CTAs) with `website/vercel.json` rewrites
`/venue/:id → /venue.html` and `/player/:id → /player.html`, mirroring the existing `/game/:id`
rewrite.

**Why it hurts.** There are 56 enriched venues and a real venue detail screen
(`ui/app/venue/[id].tsx`, [venues-plan.md](venues-plan.md) A1–A6) plus `ui/app/player/[id].tsx`.
Neither is linkable. Sharing a venue is free top-of-funnel and currently impossible.

**Effort:** ~30min plus whatever the web fallback pages cost.

### 1.4 Product analytics — none installed

**Gap.** No PostHog, Amplitude, or Firebase Analytics in `ui/package.json`. Sentry is present but
only covers crashes and errors.

**Why it hurts.** The app is in private beta with zero funnel instrumentation. There is no way to
answer "where does onboarding drop?", "does Discover convert to a join?", "do people who use the
map retain better?" — which are precisely the questions a beta exists to answer.

**Work.** PostHog RN SDK, identify on session, and instrument roughly ten events to start:
onboarding step completions, game created, join requested, join approved, chat message sent,
post-game rating submitted. Resist instrumenting everything.

**Note.** Adds a privacy-policy obligation — check `website/privacy.html` says what is collected
before shipping, and keep it opt-outable given the existing Privacy & visibility settings block.

**Effort:** ~1h for the SDK plus event pass.

### 1.5 `expo-image` — not installed

**Gap.** Not in `ui/package.json`; avatars, venue photos, and chat images all use React Native's
built-in `Image`.

**Why it hurts.** No disk cache, no progressive/blurhash placeholder, visible pop-in on every
scroll of Discover, the venue directory, and chat. Venue photos landed with
[venues-plan.md](venues-plan.md) and made this materially worse.

**Work.** Drop-in swap in `Avatar.tsx`, `VenueCard.tsx`, `MapCourtCard.tsx`, `PlayerCard.tsx`,
`ChatLightbox.tsx`, plus a `placeholder` on each.

**Effort:** ~1–2h for a full sweep.

---

## 2. Tier 2 — cheap native add-ons

| # | Item | Gap | Effort |
|---|---|---|---|
| 2.1 | **Quick Actions** (`expo-quick-actions`) — long-press app icon → "Create game", "Next game", "Discover nearby" | not installed | ~45min |
| 2.2 | **Offline banner** (`expo-network`) — global connectivity banner, pause TanStack Query, surface Realtime disconnect | no connectivity handling anywhere in `ui/`; chat and Realtime fail silently offline | ~1h |
| 2.3 | **Alternate app icons** (iOS) earned via streaks / reputation tier | `TierBadge.tsx` and `TrophyCase.tsx` already model tiers with nothing cosmetic attached | ~1h |
| 2.4 | **`expo-keep-awake` on game detail** — court-side, phone in hand, screen sleeps mid-roster | not installed | 5min |
| 2.5 | **Rich push images** — venue photo or host avatar as a notification attachment | `push-dispatch` builds payloads; categories infra already exists in `ui/lib/notifications.ts` | ~1h |

2.2 is the one worth doing first — silent failure is the worst failure mode, and chat is on
Supabase Realtime with no reconnect surface.

**Explicitly not here:** iOS Home Screen widgets and Live Activities. Both are genuinely valuable
for a "next game at 7pm" glanceable, and both need a native target plus a config plugin. That is a
plan doc, not a quick win. See §5.

---

## 3. Tier 3 — product features, no new dependencies

These are the ones users will actually notice. All are ≥half a day, so they sit at the boundary of
this doc's scope — take them one at a time.

### 3.1 Waitlist for full games — **highest product value here** — **shipped 2026-08-31**

**Gap.** No `waitlist` anywhere in `supabase/migrations/`. A game at capacity is a hard dead end.

**Why it hurts.** Social badminton is capacity-bound by court size. "Full" is the single most
common state a popular game reaches, and today it converts an interested player into nothing.

**Work.** Added a `waitlisted` status to `game_players` (`20260831000000_waitlist.sql`).
`request_to_join` routes there instead of `requested` once `open_spots` hits zero, skipping host
review entirely. A new `promote_waitlist` trigger auto-promotes the longest-waiting row the moment
an approved spot frees up (`leave_game`/`remove_player`), which re-fires the existing
`trigger_notify_join_decision` push — no new notification type needed. `leave_game` now also
releases a waitlisted spot. UI: `game/[id].tsx` swaps the disabled "Game full" button for "Hold to
join waitlist", shows queue position (`waitlist_position` RPC) once on it, and the host sees a
"N on waitlist" count next to the roster.

### 3.2 Recurring games — start with "Duplicate"

**Gap.** No `recurring` / `repeat` column in the schema.

**Why it hurts.** Weekly social sessions are the dominant real-world pattern. Hosts re-key the
same game every week through the wizard.

**Work.** Ship the cheap half first: a **Duplicate this game** button that prefills
`ui/app/wizard.tsx` from a past game, with the date bumped forward. No schema change, ~1h. True
recurrence (RRULE, series cancellation semantics, per-instance rosters) is a real design problem —
give it its own doc if the duplicate button proves demand.

### 3.3 Invite a specific player to a game

**Gap.** `useRequestToJoin` exists in `ui/lib/queries/gamePlayers.ts`; there is no inverse. A host
looking at `ui/app/player/[id].tsx` cannot pull that player into a game.

**Work.** New RPC mirroring `request_to_join`, reusing the P0 notification pipeline, plus an entry
point on the player profile and the roster's empty slots.

**Effort:** ~2–3h.

### 3.4 Search

**Gap.** No search route exists at all.

**Why it hurts.** 56 venues in the directory and no way to type a venue name. Discover is
map/proximity-first, which is correct, but "I know where I want to play" has no path.

**Work.** Start with venue text search off the existing `venues` table — trivial. Player search
needs a decision against the existing Profile visibility setting before it ships.

**Effort:** ~2h for venues.

### 3.5 Calendar auto-sync

**Gap.** `expo-calendar` is wired but manual — the user taps to add.

**Work.** A toggle in the Preferences block of `ui/app/settings.tsx`: auto-add on join, auto-remove
on leave or cancellation. Store the created event id against the membership so removal is exact.

**Effort:** ~1–2h.

---

## 4. Tier 4 — polish, under an hour each

- **Move the review prompt.** `expo-store-review` currently fires from a Settings row. Trigger it
  after a *good* post-game rating instead — same API, far better timing.
- **Post-game result share cards.** `ShareCard.tsx` + `react-native-view-shot` already exist;
  extend to a result card from `ui/app/post-game/[id].tsx`.
- **Chat tab empty state.** Discover's empty-state spacing was fixed in `a2d73a3`; Chat still has
  no CTA when there are no threads.
- **Surface referrals.** The `?ref=` deep link already exists (`ui/lib/share.ts`,
  `20260815000300_profile_referred_by.sql`) and nothing in the app shows a count or a reward.
- **`expo-localization`** for locale-aware time and number formatting. The distance-units setting
  exists (`ui/app/settings/units.tsx`) but times are not locale-formatted.

---

## 5. Deliberately not quick wins

Listed so they don't keep getting re-proposed as small:

| Item | Why it isn't cheap |
|---|---|
| iOS widgets / Live Activities | native target + config plugin + a second render layer to keep in sync |
| Siri / App Intents | native, and needs an intent vocabulary designed against multi-sport |
| Share extension | native target; unclear what a user would share *into* Smashio |
| i18n / translation | AU-only today; a translation pipeline is a commitment, not a feature |
| True recurring games | series semantics (cancel one vs all, roster inheritance) is real design work — see §3.2 |

---

## 6. Suggested order

`1.1 expo-updates` → `1.2 assetlinks` + `1.3 AASA paths` → `1.4 analytics` → `3.1 waitlist`.

The first three make beta operationally sane, the fourth makes it measurable, and the fifth is the
missing feature a real user hits soonest.
