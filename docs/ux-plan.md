# UX Plan — SMASHIO

Written 2026-08-08. Goal: CRED-level UX polish, badminton/Australia, **native only (iOS + Android)** — no web target. Backend is done ([backend-plan.md](backend-plan.md), all slices shipped); this plan covers the UI layer only.

Baseline audit done by walking every screen (code read + live run via `smashio-web` preview, logged in with real Google session). Dark/lime aesthetic already reads CRED-adjacent. Real gaps: dead taps, no motion/haptics, no skeleton loaders, zero growth loops, one cold-start dead end.

## Phase 0 — fix what's broken

Blockers first, no polish until these land.

- [ ] **Profile rows dead** — `Edit profile` / `Notifications` / `Payment methods` have no `onPress` at all ([profile.tsx:94-105](../ui/app/(tabs)/profile.tsx)). Wire real screens or hide the row until built.
- [ ] **Dev toggle shipped as notification bell** — Discover's bell button calls `toggleEmptyState`, a debug affordance, not real notifications ([discover.tsx:66-72](../ui/app/(tabs)/discover.tsx)). Strip or replace with a real notifications screen.
- [ ] **Wizard cold-start dead end** — venue search needs 3+ chars and returns nothing with an empty `venues` table. Seed real AU venues (Melbourne/Sydney courts) via `supabase/seed.sql`, add a "popular near you" shortcut so first-run isn't a dead search box.
- [ ] **No confirm on destructive actions** — `Leave game` (game/[id].tsx) and wizard back-out mid-flow (step 0 → `router.back()`) both fire with zero confirmation.
- [ ] **Apple sign-in is a dead alert** — `comingSoon()` on login.tsx. Either finish (needs Apple Developer Program enrollment per existing comment) or remove the button for now.
- [ ] **Onboarding progress inconsistent** — plain "Step 1 of 2" text on profile-photo/profile-skill vs. the real segmented progress bar in wizard.tsx. Reuse the wizard's bar component everywhere multi-step.

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

- [ ] Strip `Platform.OS === "web"` shell code from Screen.tsx, wizard.tsx, TabBar.tsx (the 430px phone-frame hack) once web target is formally dropped.
- [ ] Verify Map view (native-only per code, `GameMap` on Discover) actually works on a real device/simulator — untestable on web preview.
- [ ] Full pass on iOS + Android simulators for anything not verifiable via web preview: image picker flows, push notifications, haptics, native maps/directions.

## Not doing

- No web app. Web preview stays as a dev/demo convenience only (per `.claude/launch.json`), never a shipped surface.
- No redesign of the visual language — palette/typography already lands the CRED-dark-premium tone; this plan is about behavior and motion, not re-skinning.

## Working order

Phase 0 → 1 → 2 → 3, sequentially, since 1-3 build on Phase 0 not being broken underneath them. Phase 4 runs whenever web preview is no longer needed, independent of the others.
