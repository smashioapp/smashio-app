# Not Boring Plan — SMASHIO

Written 2026-08-09. Sibling to [ux-plan.md](ux-plan.md), which covered *behavior* (dead taps, skeletons, growth loops). This one covers *feel*: porting the (Not Boring) design language onto SMASHIO's existing dark/lime shell. Native only. No re-skin — the palette stays.

## What (Not Boring) actually does

From Andy Allen's own account ([Behind the Design](https://developer.apple.com/news/?id=9ab1g4r3)), five principles, in order of how much they matter to us:

1. **Layered feedback.** The Habits checkbox fires ~6–7 simultaneous feedback channels; a typical app fires 2–3. Visual state + motion + particles + sound + haptics + copy change, all on one tap.
2. **Effortful input on the hero action.** The checkbox needs a *sustained hold*, not a tap. Deliberately "a very big, gross interaction" — the effort is what makes the payoff land.
3. **Richness over minimalism.** "I don't want to live in a perfectly white-walled museum." Texture, depth, overshoot. Nothing arrives by linear fade.
4. **Game grammar on a utility.** 66 levels, a journey through forests and mountains, a final battle — habit *tracker* reframed as habit *builder*.
5. **Off-the-shelf underneath.** Standard UIKit/SwiftUI controls carry the app; the expensive custom work is spent only on hero moments. Performance is a feature.

Their 3D is SceneKit + Blender. We are not doing that (see [Not doing](#not-doing)) — everything below is achievable with what's already installed plus one audio dependency.

## Where SMASHIO stands

Already good: `Button`/`GameCard` press-scale springs, `FadeInUp` list stagger, `ZoomIn` on wizard success, three haptic primitives, the new splash logo bounce.

The gap is that every one of those is a **single-channel** effect. One spring, or one haptic, never stacked. And the app's three biggest emotional moments — joining a game, publishing a match, submitting ratings — currently feel identical to scrolling a list.

## Phase 0 — foundation

Build these five first; every later phase composes them. Nothing user-visible ships in this phase alone.

- [x] **`lib/motion.ts`** (new) — one shared spring vocabulary so the whole app moves like one system: `SPRING.pop` (overshoot, hero), `SPRING.settle` (damped, arrivals), `SPRING.press` (tight, 0.96 scale), `DURATION.*`. Also a `useReduceMotion()` hook — that logic is currently inline in [onboarding/index.tsx](../ui/app/onboarding/index.tsx) and will get copy-pasted four more times otherwise.
- [x] **`lib/haptics.ts`** (extend) — today it is three one-shots ([haptics.ts](../ui/lib/haptics.ts)). Add: `tick()` (Rigid, for scrubbing/selection), `ramp(ms)` (escalating Light→Heavy ticks during a hold), `burst()` (Heavy→Heavy→Medium→Light sequenced over ~180ms — this is what reads as an "explosion"; a single Heavy does not).
- [x] **`lib/sound.ts`** (new) — `expo-audio` (SDK 57) wrapper: preloaded player pool, `sound.play('pop')`, global mute honoring a stored setting, no-op when unsupported. **Blocked on assets** — needs 5 short files in `ui/assets/sfx/`: `pop`, `whoosh`, `chime`, `thunk`, `sparkle`. See [Open decisions](#open-decisions).
- [x] **`components/Burst.tsx`** (new) — reusable radial particle burst. ~16 particles on randomized vectors, spring outward + gravity droop + fade, self-unmounting. Reanimated + Views only, no Skia needed at this count. Props: `origin`, `count`, `colors`, `onDone`.
- [x] **`components/HoldButton.tsx`** (new) — our checkbox equivalent, and the single most important thing in this document. Press and hold ~600ms; a ring fills around the button, scale creeps up, haptic ramp escalates with the fill, then at completion: burst + sound + `haptics.burst()` + label swap. Releasing early springs everything back with no penalty.

## Phase 1 — hero moments

Full 6-channel treatment. Three moments only — spending it anywhere else devalues it.

- [x] **Join a game** — [game/[id].tsx:194](../ui/app/game/[id].tsx) is a plain `Button` with a `haptics.tap()`. This is the highest-commitment action in the app (money, a time slot, four people depending on you) and it currently feels like a checkbox. Swap to `HoldButton`. On success: burst from the button, the roster avatar slams into the `AvatarStack` with a spring, the joined-count ticks over, `chime`.
- [x] **Publish a match** — [wizard.tsx:433](../ui/app/wizard.tsx) already has a `ZoomIn` checkmark, which is one channel. Layer it: court lines sweep in from the edges, checkmark *stamps* (scale 1.3 → 0.95 → 1 with rotation whip), radial burst behind it, the summary card slides up from under the checkmark rather than fading, `haptics.burst()`, `sparkle`. This is the moment a host becomes a host.
- [x] **Submit ratings** — [post-game/[id].tsx:29](../ui/app/post-game/[id].tsx) fires `haptics.success()` then `router.replace()` **immediately**. The streak — the whole reward, already computed and sitting right there — is never seen. Fix: hold the screen ~1.2s, roll the games-played and reliability numbers up as odometers, and if the streak incremented, flame-scale it with a burst. *Then* navigate.

## Phase 2 — everyday texture

Cheap, high frequency, this is what makes the app feel alive between hero moments.

- [x] **Star rating row** — [post-game/[id].tsx:84](../ui/app/post-game/[id].tsx) renders bare `Text` stars with zero feedback on tap. Add per-star scale-pop, `haptics.tick()`, and sequential fill (tapping 4 fills 1→4 in a 40ms cascade, not all at once).
- [x] **Tab bar** — [TabBar.tsx](../ui/components/TabBar.tsx). Focused state is currently a color and background swap. Add: icon spring-pop on switch + `tick()`; the center `+` FAB gets press-scale, a slight rotation, and a `whoosh`; the unread dot pulses instead of sitting still.
- [x] **GameCard** — [GameCard.tsx](../ui/components/GameCard.tsx) has press-scale but no haptic. Add `tick()` on press-in. Make `joinedCount` pop when it changes underneath the user.
- [x] **CountdownChip** — pulse when under one hour. Urgency should be felt, not read.
- [x] **Pull-to-refresh** — replace the stock spinner with a spinning shuttlecock (the `Shuttlecock` SVG removed from the splash is reusable here — recover it from git history at [onboarding/index.tsx@42f0e45](../ui/app/onboarding/index.tsx)).

## Phase 3 — status layer worth staring at

Phase 2 of [ux-plan.md](ux-plan.md) added tiers, streaks and the reliability explainer, but they all render as static text. Numbers that never move are numbers nobody looks at twice.

- [x] **Odometer numbers** — a `<RollingNumber>` component; every profile stat counts up on mount instead of appearing.
- [x] **Reliability gauge** — replace the flat score with an arc that fills on mount, colored by band ([reliabilityLabel](../ui/lib/theme.ts)).
- [x] **Tier badge** — Bronze/Silver/Gold gets a shine sweep on mount, tilt-on-press, and a progress ring showing distance to the next tier. Progress toward a thing you can see is the cheapest motivation there is.
- [x] **Streak flame** — scale and particle density grow with streak length.

## Phase 4 — journey (product decision, not polish) — PARKED

Not Boring's real hook isn't the checkbox, it's the 66-level mountain the checkbox climbs. SMASHIO's equivalent would be a **season ladder**: games played maps to rungs on a court-themed progression, unlocking cosmetic avatar frames and card skins at 10/25/50.

This is a product change with backend implications (new tables, new queries), not a motion pass. Scoped here only so it isn't forgotten. **Parked 2026-08-09** — phases 0–3 are done and live; revisit this only on explicit go-ahead, still needs a yes/no before any work starts.

## Not doing

- **3D / SceneKit equivalent.** `expo-gl` + three.js in React Native means a real asset pipeline, a large startup cost, and a class of crashes we cannot debug on a two-person budget. Everything above fakes depth with layering, shadow, and spring physics instead — on a phone-sized 2D surface the difference is mostly invisible.
- **Sound on every interaction.** Hero moments only. A social app that chirps on every scroll gets muted at the OS level, and then the hero moments are silent too.
- **Re-skinning.** Same as [ux-plan.md](ux-plan.md): palette and typography stay.

## Decisions (settled 2026-08-09)

1. **Audio: yes.** `expo-audio` goes in. Sound files are *synthesized* rather than downloaded — a build-time Node script writes short WAVs from sine/noise envelopes into `ui/assets/sfx/`. No licensing question, no network dependency, files are a few KB each, and the script is checked in so the sounds are reproducible and tweakable.
2. **Hold-to-join: yes, ship it.** `HoldButton` goes on Join Game, no flag. The friction is the point.
3. **Season ladder: parked.** Phase 4 stays written down but unstarted. Revisit after phases 0–3 land.

## Working order

Phase 0 → 1 → 2 → 3. Phase 0 is a hard prerequisite; phases 1–3 are independent of each other after that and can be reordered by appetite.

**Status (2026-08-09): phases 0–3 shipped and committed.** Phase 4 parked, needs explicit go-ahead.
