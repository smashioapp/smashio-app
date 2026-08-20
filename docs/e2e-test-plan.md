# E2E Test Plan — release gate

Written 2026-08-20, after the Maestro/emulator harness came good (API 35 AVD, swiftshader GPU, animation scale 0, `__DEV__` auto-login — see [ui/scripts/e2e.sh](../ui/scripts/e2e.sh)). Purpose: define the set of tests that must pass before an iOS or Android build is allowed to ship, and the work needed to make that set trustworthy.

Status: **proposed, not approved**. No flows have been written from this doc yet.

## 1. Gate tiers

Three gates, different costs, different triggers.

| Gate | Runs | Trigger | Budget |
|---|---|---|---|
| **G0 — static** | `tsc --noEmit`, `jest`, `supabase db reset`, `expo export` | every PR ([ci.yml](../.github/workflows/ci.yml)) | < 5 min |
| **G1 — smoke e2e** | 5 flows, P0-critical only | every PR (once emulator CI exists), or locally before push | < 5 min |
| **G2 — release e2e** | full P0 + P1 suite | before every `build-ios` / `build-android` dispatch | ~20 min |
| **G3 — manual device** | checklist in §7 | before a TestFlight/Play promotion | ~30 min human |

A build ships only when G0–G3 are green. G2 is the thing this doc is mostly about.

Two additions to G0 worth calling out, because `tsc` does not catch them:

- **`supabase db reset`** — replays all 50 migrations plus `seed.sql`. A migration that only works incrementally against an already-migrated database (or a seed that drifts from schema) currently fails nowhere in CI.
- **`npx expo export --platform android`** — Metro resolution, asset, and Babel/worklets failures are invisible to `tsc` and only surface in the release build, which is a 20-minute round trip on a hosted runner.

## 2. Diagnosis — what the current suite actually asserts

Six flows exist in [ui/.maestro/](../ui/.maestro). Read literally, most of them assert nothing meaningful:

- **The local database has no games, no profiles, no messages.** [seed.sql](../supabase/seed.sql) seeds sports, skill tiers, 8 venues and one auth user — no `profiles` row content, no `games`, no `game_players`, no `messages`. Every write-path flow is therefore wrapped in `runFlow: when: notVisible: "Nothing on your calendar"` / `"Quiet in here"`, so on a fresh database **the entire body of `my-games-and-join.yaml` and `chat-send.yaml` is skipped and the flow still reports green**. This is the single biggest problem: the suite's most important flows are conditional no-ops.
- **Zero `testID` props in the app.** Confirmed by grep across `app/` and `components/`. Flows tap by visible text or by percentage points (`50%,30%`, `97%,92%`). Percentage taps break on any layout change and silently hit the wrong row; text taps break on any copy change and collide when the same word appears twice ("Verified" is a game badge *and* a settings label; "Tonight" is a filter chip *and* a section header).
- **No database reset between runs.** A flow that sends a join request leaves a `requested` row behind, so the second run sees "Request sent" where the first saw "Request to join". Flows are not idempotent and nothing makes them so.
- **The location permission dialog is unhandled.** Discover mounts `useUserLocation` ([lib/location.ts:15](../ui/lib/location.ts)), which fires `requestForegroundPermissionsAsync()` on the very first tab the flows land on. `clearState: true` revokes runtime grants, so this OS dialog appears on every launch and is currently only ever dismissed by accident by the stray corner taps.
- **The dev warnings banner is worked around, not removed.** Three flows carry an unconditional optional tap at `97%,92%` with a paragraph of comment explaining the race. That is a workaround for a problem the app can just not have.
- **Distance and sort are non-deterministic.** No geo fix is set on the emulator, so `getCurrentPositionAsync` either times out into the Sydney CBD fallback or returns whatever the AVD last held. "Closest" sort cannot be asserted.

Everything below assumes those six are fixed first.

## 3. Preconditions — infrastructure work before the suite means anything

Ordered. Each is a prerequisite for the test cases that follow.

**P-1. Deterministic fixture in `seed.sql`.** Fixed UUIDs, relative timestamps, one owned fixture per mutating flow. Spec in §4.

**P-2. `supabase db reset` at suite start.** Add to `e2e.sh` before the Maestro invocation, behind a `--no-reset` escape hatch for iterating on a single flow. Cost is ~20–30s; it buys full determinism and lets every flow assert exact counts instead of "not empty".

**P-3. `testID` on every element a flow touches.** Roughly 35 of them. Naming convention: `<screen>-<element>[-<id>]`, e.g. `discover-card-<gameId>`, `game-cta`, `mygames-tab-hosting`, `chat-composer`, `wizard-next`. Maestro then targets `id: "game-cta"` and the percentage taps and text collisions all go away. This is the highest-leverage item in the list.

**P-4. Grant permissions at launch.** Replace every `launchApp` with:

```yaml
- launchApp:
    clearState: true
    permissions:
      all: allow
```

Kills the location and notification dialogs in one line.

**P-5. Fixed geo fix.** `adb emu geo fix 151.2093 -33.8688` (Sydney CBD) in `e2e.sh` after boot, so distance strings and "Closest" sort are reproducible.

**P-6. Silence the dev warnings banner under E2E.** `LogBox.ignoreAllLogs()` in `app/_layout.tsx` gated on `__DEV__ && process.env.EXPO_PUBLIC_E2E_EMAIL` — same gate the auto-login already uses ([lib/session.tsx](../ui/lib/session.tsx)). Then delete all three `97%,92%` taps.

**P-7. Tag flows.** Maestro tags (`tags: [smoke]` / `[release]`) so G1 can run `maestro test --include-tags=smoke .maestro` and G2 runs everything.

**P-8. Screenshot on failure + artifact upload.** `maestro test --format junit --output report.xml` plus the debug output directory, so a failing gate is diagnosable without a re-run.

## 4. The fixture

All of it goes in [seed.sql](../supabase/seed.sql) — it is already documented as the local dev seed and is never applied to the hosted project. Fixed UUIDs so flows can address rows directly via `testID`.

**Identities**

- `11111111-…-1111` — `test@smashio.dev`, the account under test. Needs what the seed currently omits: a `profiles` row with `display_name`, `home_suburb`, `home_point` (Sydney CBD), `reliability_score`, and a `profile_sports` row at `intermediate`.
- `22222222-0000-0000-0000-00000000000{1..6}` — six bot players, profiles + `profile_sports`, spread across tiers. Needed as organizers, rosters, chat counterparties and rating targets.
- One extra auth user with **no** profile content, for the onboarding flow (A6) — lets onboarding be tested deterministically without minting a new email per run.

**Games** — one per mutating flow so intra-run ordering never matters. Times are `now() + interval`, not absolute.

| id suffix | Shape | Serves |
|---|---|---|
| `…01` | open, +26h, intermediate, 2/6 approved, organizer bot1 | C1 join, C2 withdraw, C3 re-join |
| `…02` | full, +27h, 6/6 approved | C4 full CTA, B3 "has spots" filter |
| `…03` | test user approved member, +28h, 3 other players, 4 seeded messages | F1–F3 chat |
| `…04` | test user approved member, +29h | C5 leave |
| `…05` | test user is organizer, 2 pending requests from bots | C6 approve, C7 decline, C8 remove |
| `…06` | test user is organizer, +48h, no requests | D3 edit, D4 cancel, B8 discover exclusion |
| `…07` | test user has `requested` status, organizer bot2 | E1 "Requested" segment |
| `…08` | `completed`, ended −20h, test user approved, 3 co-players, no ratings | G1 rating submit |
| `…09` | `completed`, ended −44h, test user approved, ratings already written | G2 no re-prompt |
| `…10` | `cancelled`, +30h, test user was approved | E4 cancelled rendering |
| `…11` | beginner tier, $8/player, Hurstville (far) | B2 level filter, B4 sort |
| `…12` | advanced tier, $30/player, Homebush (near) | B2, B4 opposite end |

**Two timing traps, both real:**

1. **Midnight rollover.** A game seeded at `now() + 5h` lands "Tonight" at 14:00 and "Tomorrow" at 22:00. Never assert exact contents of the Tonight/Tomorrow chips — assert only that the filter returns a non-empty subset and does not crash. Bucket-boundary correctness belongs in a unit test over [lib/schedule.ts](../ui/lib/schedule.ts) (which already has one), not in e2e.
2. **`complete_past_games` cron.** The hourly job flips `published` → `completed` past `ends_at`. Seed `…08`/`…09` as `completed` directly rather than relying on the cron having run.

## 5. P0 — blocking. A build does not ship if any of these fail

Twenty flows. These are the ones where a regression means a broken app in a user's hands.

**A. Boot and auth**

- **A1** Cold launch, no session → welcome screen renders, "Get Started" reachable. *(new)*
- **A2** Typed email/password sign-in → lands on Discover. *(exists: `login-form.yaml`)*
- **A3** Relaunch **without** `clearState` → goes straight to the tabs, no sign-in screen. Covers token persistence/refresh; nothing tests it today and a broken SecureStore write logs every user out on the next app open. *(new)*
- **A4** Log out → sign-in screen; relaunch stays logged out. *(extend `logout.yaml` — the relaunch half is missing)*
- **A5** Wrong password → inline error, stays on the form, no crash. *(new)*

**B. Discover**

- **B1** List renders the expected fixture games with exact count. *(replaces `discover-load.yaml`, which currently asserts only that some text exists)*
- **B2** Level filter → result set narrows to the expected games.
- **B3** "Has spots open" → excludes `…02`.
- **B4** Sort Soonest vs Cheapest → first card differs and matches the fixture.
- **B5** Clear filters → full list restored.
- **B6** Filter combination matching nothing → "Court's quiet right now" empty state, not a spinner or a crash.
- **B8** Own hosted game `…06` never appears in Discover. Guards migration [20260818000000](../supabase/migrations/20260818000000_discover_exclude_own_games.sql).

**C. Join lifecycle — the core action of the product**

- **C1** Open `…01` → "Request to join" → "Request sent".
- **C2** Withdraw → back to "Request to join".
- **C3** Re-join after withdraw succeeds. **Permanent regression test** for the deadlock fixed in `a90c5ee`.
- **C4** `…02` shows "Game full" and the CTA does not submit.
- **C5** Member on `…04` → "Leave game" → confirm → returns to the request state.
- **C6** Host on `…05` → approve a pending request → roster grows, spots decrease.

**D. Host lifecycle**

- **D1** Create a game end-to-end through the wizard via the **Smashio venues** path (not Google Places — see §6) → publish → it appears under My Games → Hosting.
- **D4** Cancel `…06` → detail shows "Game cancelled"; the joined player's My Games shows the host-cancelled state.

**F. Chat**

- **F2** Open `…03`'s thread → seeded history loads in order.
- **F3** Send a message → it appears. Covers the optimistic write and the Realtime round-trip. *(exists as `chat-send.yaml`, but currently skipped on an empty database)*

**G. Post-game**

- **G1** `…08` → rate all co-players → submit → "Nice game!" reveal → returns to My Games. Also guards the silent-submit-failure fix in `a90c5ee`.

**K. Resilience**

- **K1** Backend unreachable (`adb shell svc wifi disable` mid-flow) → "Couldn't load games" + Retry, no crash, and Retry recovers once connectivity returns. Error paths are where release crashes actually come from and nothing tests them.

## 6. P1 — release suite, non-blocking on a hotfix

Run in G2, but a red P1 is a judgment call rather than an automatic stop.

- **A6** Onboarding: profile-less user → photo step → skill step → lands in the app.
- **B7** Map/list toggle renders and pins appear. Grey tiles are expected locally (§6 note below) — assert marker count, not imagery.
- **C7** Host declines a request. **C8** Host removes an approved player. **C9** Approving into a full game surfaces "Game is full".
- **D2** Wizard blocks continue on missing required fields ("Not ready yet").
- **D3** Edit game time/price → change reflected on the detail screen.
- **D5** Backing out of the wizard prompts "Discard match setup?".
- **E1** My Games segment counts (Hosting/Playing/Requested) match the fixture. **E2** Per-segment empty states. **E3** Past games list. **E4** Cancelled game rendering.
- **F1** Chat tab lists threads for joined games only. **F4** A non-member's thread is absent (RLS assertion from the UI side). **F5** Older-message pagination.
- **G2** An already-rated game does not re-prompt.
- **H1** Profile renders name/reliability/stats. **H2** Edit display name → persists across relaunch. **H3** Stats & achievements screen. **H4** Player card from a roster row.
- **I1** Venue directory list. **I2** Venue detail renders amenities/pricing/hours for an enriched P1 venue. **I3** "View venue & get directions" navigates from game detail.
- **J1** Notification settings toggle persists.
- **J2** Delete account, **full destructive path** (decided 2026-08-20). Runs **last in the suite**, signed in as the throwaway fixture user `22222222-…-0006` — never `test@smashio.dev`. Asserts both confirm steps, the live hosting-count warning, then confirms; verifies the session is dead and the profile is a scrubbed tombstone. Two hard requirements this adds:
  - The flow **must** re-authenticate as the throwaway user rather than inheriting the `__DEV__` auto-login session. Add an `EXPO_PUBLIC_E2E_EMAIL` override for this one flow, or have it log out and use the typed form.
  - It hits the `delete-account` Edge Function, which `e2e.sh` does not currently serve. The script needs `supabase functions serve delete-account` running (backgrounded, health-checked) before the suite, or J2 fails on a connection error and looks like a product bug.
- **K2** Deep link into a game detail (`adb shell am start -a android.intent.action.VIEW -d "smashio://game/<id>"`).

## 7. G3 — manual device checklist (cannot be emulated)

These stay human, on a real device, before promoting a build. Listing them so their absence from the automated suite is a decision rather than an oversight.

- Push notification delivery (needs real FCM/APNs — no emulator path).
- Google and Apple sign-in (OAuth web flow; the sandboxed emulator cannot complete it).
- Camera capture → booking-confirmation upload → AI parse. Needs `supabase functions serve` plus a live model key; the parse itself is non-deterministic and does not belong in a gate.
- Real Google Maps tiles and Places autocomplete. `ui/.env` ships `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` blank, so **locally the map is grey tiles and venue search returns nothing** — this is why D1 must use the Smashio-venues path, and why B7 asserts markers rather than imagery.
- Add-to-calendar (`expo-calendar` writing to a real calendar account).
- Share sheet / share game link.
- iOS-specific rendering — the whole automated suite is Android-only. There is no iOS e2e today and adding one is out of scope here.

## 8. Runner and CI wiring

- **Locally**: `npm run test:e2e` keeps its meaning — reset, boot, install, run everything. Add `npm run test:e2e:smoke` for the tagged subset.
- **CI**: the emulator suite does not go on GitHub-hosted runners yet. It needs KVM (`reactivecircus/android-emulator-runner` works on `ubuntu-latest`) *and* a Supabase stack in the job, and at ~20 minutes it would dominate PR time. Proposal: a separate `e2e.yml` on `workflow_dispatch` plus a required check before `build-ios.yml` / `build-android.yml` dispatch, rather than on every PR. Revisit once the suite is stable and the smoke subset is under 5 minutes.
- **Reporting**: JUnit XML + failure screenshots uploaded as artifacts (P-8).

## 9. Not doing

- **iOS e2e.** Maestro supports it, but it needs a Mac runner and a second device matrix. The manual checklist covers iOS until Android e2e has proven itself.
- **Asserting AI parse output.** Non-deterministic by nature. The wizard's manual-entry fallback path is what gets gated.
- **Load or performance assertions.** Out of scope for a correctness gate.
- **Testing RLS from the client.** F4 checks that the UI does not display another user's thread; actual policy enforcement belongs in SQL-level tests against the database, not Maestro.
- **A visual-regression baseline.** `takeScreenshot` stays diagnostic only — pixel baselines on a software renderer are a flake factory.

## 10. Sequencing

1. P-1 fixture + P-2 reset. Nothing else is worth doing first — until the database has data, every new flow inherits the same "green because skipped" failure mode.
2. P-4, P-5, P-6 (permissions, geo fix, LogBox). Small, and they remove the three known sources of flake.
3. P-3 `testID` pass, screen by screen, in the order the P0 flows need them.
4. Rewrite the six existing flows against the fixture, dropping every `notVisible` guard and every percentage tap.
5. Write the remaining P0 flows (§5), then P1 (§6).
6. P-7 tags, P-8 reporting, then the `e2e.yml` workflow.
7. Add `supabase db reset` and `expo export` to [ci.yml](../.github/workflows/ci.yml) — independent of all the above, and worth landing first since it is ten lines.

## 11. Decisions — 2026-08-20

Settled with the user before implementation started:

- **Android-only automated gate.** iOS stays on the G3 manual checklist. Accepted gap: the automated suite does not touch the binary that currently ships to TestFlight. Revisit if iOS regressions start reaching testers.
- **First slice = §3 prereqs + rewriting the six existing flows** against the fixture. `testID` coverage in this slice is scoped to the screens those six touch, not the full 35-element pass.
- **Fixture lives in `seed.sql`**, one file, applied by `supabase db reset`. Manual local testing gets populated screens as a side benefit. Never applied to the hosted project.
- **J2 runs the full destructive delete** against the throwaway fixture user, last in the suite. See §6 for the two requirements this adds.

Defaults taken without a specific decision, flag if wrong:

- G1 (smoke) does **not** block PRs until the suite's CI runtime is proven. PR gate stays G0.
- Fixture is re-applied by a full `supabase db reset`, not a targeted `psql` script. `--no-reset` exists for single-flow iteration.

## 12. Known implementation caveats

- **K1 (offline) cannot be a pure Maestro flow.** Maestro's `runScript` executes GraalJS, not a shell — there is no way to call `adb shell svc wifi disable` from inside a flow. K1 has to be structured as: flow A (load Discover) → shell toggle in the runner → flow B (assert error state + Retry) → shell restore. That makes it a wrapper-script sequence in `e2e.sh`, not a `.yaml`, and it is the one P0 item that will not port to an iOS matrix later.
- **`clearState: true` revokes runtime permission grants**, so a one-time `adb shell pm grant` after install does not survive. The grant has to come from `launchApp: permissions:` on every flow (P-4), not from the runner.
