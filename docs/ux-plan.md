# UX Plan — SMASHIO

Written 2026-08-08. Goal: CRED-level UX polish, badminton/Australia, **native only (iOS + Android)** — no web target. Backend is done ([backend-plan.md](backend-plan.md), all slices shipped); this plan covers the UI layer only.

Baseline audit done by walking every screen (code read + live run via `smashio-web` preview, logged in with real Google session). Dark/lime aesthetic already reads CRED-adjacent. Real gaps: dead taps, no motion/haptics, no skeleton loaders, zero growth loops, one cold-start dead end.

## Phase 0 — fix what's broken ✅

Blockers first, no polish until these land.

- [x] **Profile rows dead** — `Edit profile` / `Notifications` now wired to real screens ([profile.tsx](../ui/app/(tabs)/profile.tsx)); dead `Payment methods` row removed.
- [x] **Dev toggle shipped as notification bell** — Discover's bell now opens real `/notification-settings`.
- [x] **Wizard cold-start dead end** — real Sydney venues seeded via `supabase/seed.sql`.
- [x] **No confirm on destructive actions** — `Leave game` and wizard discard both confirm via `Alert.alert`.
- [x] **Apple sign-in is a dead alert** — wired to real `continueWithApple()`.
- [x] **Onboarding progress inconsistent** — profile-photo/profile-skill both use shared `StepProgress` component.

## Phase 1 — motion & feedback ✅

This is CRED's actual signature — not the color palette, the feel.

- [x] Replace every `ActivityIndicator` spinner (my-games.tsx, chat.tsx, game/[id].tsx, post-game/[id].tsx) with skeleton/shimmer loaders.
- [x] `expo-haptics` on primary actions: publish match, join game, approve/decline request, submit ratings.
- [x] `react-native-reanimated` (already a dependency, unused for feel) — card entrance stagger on list screens, button press scale, success micro-animation on wizard step 5 ("You're hosting!").
- [x] Pull-to-refresh on Discover, My Games, Chat list.
- [x] Tab bar badges — unread dot on Chat icon, pending-join-request dot on Profile/My-Games icon (TabBar.tsx currently has neither).

## Phase 2 — status & reward layer ✅

CRED's core hook: make your own stats worth looking at.

- [x] Reliability score gets an explainer (tap → sheet: how it's calculated) instead of a bare 5-star with no context.
- [x] Visual host/player tier (Bronze/Silver/Gold) on Profile, not just a raw games-played number.
- [x] Urgency countdown chip on game cards ("Starts in 2h 15m") — Discover list, My Games, Game Detail.
- [x] Streak surfaced after rating submission on post-game screen ("3 weeks running").
- [x] "Member since" treated as a flex stat (styled callout) not a plain stat tile.

## Phase 3 — growth loops ✅

Currently zero. Two entry points missing entirely.

- [x] Share/invite button on Game Detail — deep link into the specific game.
- [x] Referral entry point in Profile — deep link into app install/join.
- [x] Every empty state gets a CTA + (once real data exists) social proof — never a flat sentence. My Games "Past" tab was the last one missing a button.

## Phase 4 — native-only cleanup

Do this once web preview is no longer needed for dev/demo — it's still useful until then, don't rip out early.

- [x] Strip `Platform.OS === "web"` shell code from Screen.tsx, wizard.tsx, TabBar.tsx (the 430px phone-frame hack) once web target is formally dropped.
- [ ] Verify Map view (native-only per code, `GameMap` on Discover) actually works on a real device/simulator — untestable on web preview.
- [ ] Full pass on iOS + Android simulators for anything not verifiable via web preview: image picker flows, push notifications, haptics, native maps/directions.

## Phase 5 — "wow" pass (CRED / Not So Boring tier)

Written 2026-08-11. Phases 0-4 landed the fundamentals (motion, haptics, rewards, growth loops) but the app still reads flat, not motivating. Goal: give it a signature feel a badminton player is proud to open. Order: splash first (proven starting point), rest sequenced after.

- [x] **Branded launch sequence** — native splash now uses the shuttlecock logo on brand dark bg ([app.config.js](../ui/app.config.js)); JS handoff into a smash-in reveal animation with haptic landing ([AnimatedSplash.tsx](../ui/components/AnimatedSplash.tsx)), wired in [_layout.tsx](../ui/app/_layout.tsx).
- [x] **App voice / bold typography** — every flat "No X yet." empty state rewritten with motivational badminton-voice copy (Discover, My Games x3, Chat).
- [x] **Signature illustration system** — reusable `EmptyState` component: floating shuttlecock (brand logo, idle bob/tilt loop + soft glow) in place of generic icons; also killed a brand bug (tennis-ball icon in a badminton app, two spots).
- [x] **Milestone "money-shot" screens** — tier level-up (Bronze/Silver/Gold) now gets a dedicated full-screen celebration with confetti burst and extended hold, detected in the post-game reveal ([post-game/[id].tsx](../ui/app/post-game/%5Bid%5D.tsx)); streak flame and hosting-confirmation bursts were already in place from Phase 2/3.
- [x] **Interaction feel overhaul** — tab bar (floating pill, blur, pop animation, pulsing badges) was already there; added swipe-right-to-approve / swipe-left-to-decline on join requests ([SwipeToDecide.tsx](../ui/components/SwipeToDecide.tsx)), layered on top of the existing tap buttons, not replacing them.

Constraints: no new paid tools/services; prefer libs already in the project (`reanimated`, `expo-linear-gradient`) over new deps.

## Not doing

- No web app. Web preview stays as a dev/demo convenience only (per `.claude/launch.json`), never a shipped surface.
- No redesign of the visual language — palette/typography already lands the CRED-dark-premium tone; this plan is about behavior and motion, not re-skinning.

## Working order

Phase 0 → 1 → 2 → 3, sequentially, since 1-3 build on Phase 0 not being broken underneath them. Phase 4 runs whenever web preview is no longer needed, independent of the others.
