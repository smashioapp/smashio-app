# Smashimals Expansion Plan — SMASHIO

Written 2026-08-25. **Status: direction signed off 2026-08-25 (§6), no implementation started.**
Sibling to [avatars-plan.md](avatars-plan.md), which shipped the 28 circular bust avatars —
this one covers what happens *after* identity: props, a full-body brand cast, motion, and the
website. [not-boring-plan.md](not-boring-plan.md) owns the motion vocabulary this reuses.

---

## 1. Diagnosis

1. **The Smashimals only ever appear as a 26–56px disc.** [avatars.ts](../ui/lib/avatars.ts) ships
   28 characters and the app renders them at avatar sizes only. The art carries far more
   personality than a roster stack can show.

2. **Every empty state is the same floating logo.** [EmptyState.tsx:10](../ui/components/EmptyState.tsx)
   hardcodes `require("../assets/splash-icon.png")` and is used by
   [chat.tsx](../ui/app/(tabs)/chat.tsx), [discover.tsx](../ui/app/(tabs)/discover.tsx),
   [my-games.tsx](../ui/app/(tabs)/my-games.tsx), [past.tsx](../ui/app/my-games/past.tsx),
   [venues/index.tsx](../ui/app/venues/index.tsx) and [MapSheet.tsx](../ui/components/MapSheet.tsx).
   Six different dead ends, one identical picture.

3. **Hero moments celebrate with geometry, not character.** Wizard success
   ([wizard.tsx:433](../ui/app/wizard.tsx)) and post-game
   ([post-game/[id].tsx](../ui/app/post-game/[id].tsx)) fire `Burst` + checkmark + odometer. All
   six not-boring channels are lit and none of them is *you*.

4. **The website has no characters at all.** [index.html](../website/index.html) is 667 lines of
   type, gradients and phone frames. The `smash-drift` / `smash-marquee` keyframes are already
   defined and running on abstract shapes.

5. **`ShareCard` was never built** (avatars-plan P3, unchecked) — the one artefact designed to
   leave the app has no art.

6. **There is no 404 page.** `website/` has seven HTML files and no `404.html`.

---

## 2. What we're building

### The prop-overlay trick

Every shipped Smashimal is a **bust, not a head** — torso, shoulders and **paws at the bottom edge
of the disc** (verify on `quokka.png`, `kookaburra.png`). A prop layer composited in front of the
bust therefore reads as *held*, for all 28 animals, from a single asset.

```
[dark disc] → [existing bust PNG] → [prop PNG, bottom-anchored] → [copy as RN <Text>]
```

The banner face is charcoal `#1F1F24` with a lime `#D6FF3F` border and **no baked text**, so one
asset says "Game on.", "You're in." or "Sydney, we're live" depending on the caller. Six props
≈ 40 KB buys personalised celebration art for every user on every hero moment, with no per-animal
illustration run.

### The cast

Full body is a **brand** job, busts are an **identity** job — different problems, different budgets.
Four named characters, full-body, multi-pose:

| Animal | Role | Why |
|---|---|---|
| **Quokka** | the friendly host | world's happiest animal, warmest tile in the set, leads the website |
| **Kookaburra** | the loud one | laughs at you, Aussie as it gets, carries hype and celebration |
| **Wombat** | the reliable regular | stocky, turns up, never bails — streaks and My Games |
| **Galah** | the flake | "what a galah" is the slang. **Error, offline and 404 only** — never pointed at a real player (§6.4) |

**28 full-body illustrations are explicitly rejected** (§5): 28 × 4 poses is 112 drawings, heavy
style drift across generation runs, and roughly 3 MB on both store binaries.

### Three asset tiers

| Tier | What | Count | Used by |
|---|---|---|---|
| **T0 Props** | banner, trophy, racquet, shuttlecock, medal, speech bubble | 6 files | in-app hero moments, all 28 animals |
| **T1 Cast** | full body, 4 characters × ~3 poses | ~12 files | empty states, website |
| **T2 Rig** | T1 split into layers (body / head / arm-L / arm-R / eyes-shut) | 4 × 5 | animation |

---

## 3. Where they go

### 3.1 App — hero moments (T0, the user's own animal)

| Screen | File | Treatment |
|---|---|---|
| Publish match success | [wizard.tsx:433](../ui/app/wizard.tsx) | your Smashimal holds the **banner**, "Game on." Layers on the existing `Burst` + `sparkle` |
| Join success | [game/[id].tsx](../ui/app/game/[id].tsx) | Smashimal **peeks up** from the card's bottom edge, waves once, ducks back |
| Post-game ratings | [post-game/[id].tsx](../ui/app/post-game/[id].tsx) | streak increment → Smashimal raises the **trophy** alongside the existing odometer |
| `ShareCard` | avatars-plan P3, unbuilt | Smashimal + banner + game details. `react-native-view-shot` already installed |
| Push attachment | avatars-plan P5 | already scoped — needs the public `smashimals` bucket |

### 3.2 App — empty states (T1 cast)

Replaces the one shared logo in [EmptyState.tsx](../ui/components/EmptyState.tsx). The component
gains a `character` prop; each of the six call sites picks one.

| Screen | Character + pose | Copy direction |
|---|---|---|
| Discover empty | **Kookaburra**, head cocked, wing shading its eyes | "Nothing on nearby right now." |
| My Games empty | **Wombat** sat on a bench, racquet across its knees | "No games yet. Wombat's been waiting a while." |
| Past games empty | **Quokka** beside an empty trophy shelf | "Nothing played yet." |
| Chat empty | **Kookaburra** asleep | "Quiet in here. Even the kookaburra's gone quiet." |
| Venues empty | **Quokka** holding a map | |
| Error / offline | **Galah** tangled in a net | "Something's gone wrong, give it another go." |

### 3.3 App — everyday texture

- **[AvatarPicker.tsx](../ui/components/AvatarPicker.tsx)** — the selected animal blinks and
  head-tilts. This is avatars-plan P5's parked "slow blink", now buildable on the rig.
- **[onboarding/setup.tsx](../ui/app/onboarding/setup.tsx)** — "This one's yours" reveal pops and
  waves using the prop-layer arm. Stays a bust: no per-animal body needed.
- **Pull-to-refresh** — unchanged. The spinning shuttlecock stays; an animal at that frequency
  wears out inside a week.

### 3.4 Website ([index.html](../website/index.html), static, no build step)

1. **Hero** (`#top`, line 65) — a row of 5–7 **busts** along the bottom edge, each on its own
   `smash-drift` delay, parallax on scroll. Uses the shipped avatar PNGs as-is, no new art.
2. **`#how`** (line 164) — one cast member per step of "Court to court in three taps", full body,
   mid-action.
3. **Existing marquee** (`smash-marquee`, defined ~line 38) — busts inline between the words.
   Near-zero work, high charm.
4. **`#get-app`** (line 600) — **Quokka holding the banner**, banner carries the CTA. Same asset as
   the app, which is what ties the two surfaces together.
5. **[player.html](../website/player.html) / [venue.html](../website/venue.html)** — 31-line
   deep-link stubs. A waiting Smashimal instead of a bare redirect.
6. **[support.html](../website/support.html) / [delete-account.html](../website/delete-account.html)**
   — a small bust warms up the admin pages. **Not** privacy or terms; those stay plain (CLAUDE.md:
   legal text is accurate first).
7. **New `404.html`** — lost galah.

**`assets/og-image.png` stays as-is** (§6.3). It is the highest-leverage single image on the site —
every shared link preview — so it is worth revisiting once the cast art exists, but it is not in
this round's scope.

---

## 4. Animation

Installed today: **reanimated 4.5.1**, **react-native-svg 15.15.4**. No Lottie, no Rive.

**Decision: layered PNG puppet rig, driven by Reanimated in the app and CSS `@keyframes` on the
website. No new dependency, and one art pipeline feeds both runtimes.**

```
ui/assets/smashimals/quokka/
  body.png  head.png  arm-l.png  arm-r.png  eyes-shut.png
```

All layers share one coordinate space (`left:0 top:0 width:100%`), so composition is free and only
`transform-origin` differs per layer. Covers blink, breathe, wave, bounce, head tilt, banner sway
and peek-up — everything §3 asks for.

**Sprite strips** (6–8 frames in one 2048×256 PNG, clipped `View` + negative `translateX` driven by
Reanimated) are the escape hatch for the two or three beats needing real deformation — a smash
swing, a jump. Still no new dependency.

Rejected: **Lottie** — a new dependency whose real payoff is handing animation to a motion designer,
which is not a constraint we have. Revisit if a designer joins. **Rive** — native module plus
tooling cost, overkill at this scale.

Timings come from [motion.ts](../ui/lib/motion.ts)'s existing `SPRING.pop` (overshoot, hero) /
`SPRING.settle` (damped, arrivals) vocabulary. Everything honours `useReduceMotion()`.

---

## 5. Asset production

Runs outside the repo — you generate, I wire. Same shape as avatars-plan §3.

### 5.1 Style-match risk — read before generating

avatars-plan §3.1 **rejected ChatGPT for this exact character set**: soft airbrush, textured fur,
ellipses instead of circles, 13–19% centre drift. Gemini won and shipped all 28. New art from a
different generator risks a visibly two-tone set.

Mitigations, in order:

1. **Attach three shipped PNGs as style reference on every single request.** Non-negotiable.
2. **Generate one test tile and compare side by side before any full run.**
3. T0 props are low risk — flat geometric objects, no fur. T1 full-body is high risk.
4. If T1 comes back painterly, run T1 in Gemini and keep ChatGPT for T0.

**Size constraint:** gpt-image-1 caps at 1536 × 1024. A 3 × 2 grid at that size gives **512px cells**,
matching the existing pipeline exactly. Do not ask for 4 × 4 sheets — cells land at 256px and lose
detail before quantization.

**Watermark rule (avatars-plan §3.4) still stands:** a visible provenance mark is never edited out;
the tile is discarded. Gemini's sparkle glyph lands in r3c3 of a 4 × 4 sheet. ChatGPT does not stamp
a visible glyph, but every tile still gets checked by eye.

**Processing:** crop cells → key the pure-black background → quantize, via the existing
[ui/scripts/avatars/process.mjs](../ui/scripts/avatars/process.mjs) (`sharp`, dev-dependency).

### 5.2 Prompt A — T0 props

Attach `ui/assets/avatars/quokka.png`, `kookaburra.png`, `koala.png`.

```
Match the exact art style of the attached reference images: flat vector, kawaii,
hard clean edges, solid fills only. No gradients, no outlines, no drop shadows,
no texture, no fur detail, no airbrush softness, no 3D shading.

Generate a 3 x 2 grid of six separate PROP objects on a pure black (#000000)
background. Image size 1536 x 1024, so each cell is 512 x 512. Each prop sits
fully inside its own cell, centred, with clear black space around it. Props must
not touch or overlap each other.

The six props, left to right, top row then bottom row:

1. A wide blank hand-held banner sign. Rectangular with slightly rounded corners,
   held up by two short dark grey poles angled outward at the bottom. The banner
   face is dark charcoal #1F1F24 with a 6px lime #D6FF3F border. The face is
   COMPLETELY BLANK - absolutely no text, no letters, no symbols, no logo.
2. A simple trophy cup. Dark charcoal #1F1F24 body, lime #D6FF3F handles and base.
3. A badminton racquet held upright, head at the top. Dark charcoal #1F1F24 frame
   and handle, lime #D6FF3F strings.
4. A badminton shuttlecock, pointing up. Off-white #F5F5F7 feathers, lime #D6FF3F
   cork base.
5. A round medal hanging on a short ribbon. Lime #D6FF3F medal disc, dark charcoal
   #1F1F24 ribbon.
6. A blank rounded speech bubble. Dark charcoal #1F1F24 fill, lime #D6FF3F outline,
   tail pointing down-left. COMPLETELY BLANK inside - no text.

Colour rule: lime #D6FF3F is the only saturated colour anywhere in the image.
Everything else is charcoal, near-black or off-white.
Background rule: pure #000000, absolutely nothing else in frame - no shadows on
the background, no reflections, no grid lines, no captions, no watermark.
```

### 5.3 Prompt B — T1 cast, one character per run

Attach the matching bust PNG plus two others for style. Swap the animal name per run.

```
Match the exact art style of the attached reference images: flat vector, kawaii,
hard clean edges, solid fills only. No gradients, no outlines, no drop shadows,
no texture, no fur detail, no airbrush softness, no 3D shading. Same head shape,
same eye style (large solid dark ovals with a single small white highlight), same
rosy cheek circles, same proportions.

Draw the SAME quokka character from the reference, now FULL BODY, standing,
front-facing, on a pure black #0A0A0B background. Image size 1024 x 1024.

- It wears the same lime #D6FF3F headband as the reference, plus lime #D6FF3F
  wristbands on both wrists.
- Big head, small rounded body, short limbs - chunky kawaii mascot proportions,
  roughly 1:2 head-to-body.
- Body fur colour matches the reference exactly.
- Standing straight, arms relaxed at its sides, feet together, neutral happy
  expression, looking directly at the viewer.
- Full body fully inside the frame with even margin on all sides. Nothing cropped.

Colour rule: lime #D6FF3F is the only saturated colour. Everything else is the
animal's natural muted fur tone, charcoal, near-black or off-white.
Background: pure #0A0A0B, flat, nothing else - no shadow under the feet, no
ground line, no text, no watermark.
```

Pose variants go as **follow-up messages in the same chat**, so style carries:

```
Same character, same style, same size, same background. Now redraw it
[POSE]. Keep every colour and proportion identical to the previous image.
```

| Character | Poses to request |
|---|---|
| Quokka | `holding a blank banner sign up in front of its chest with both hands` · `holding an open paper map with both hands, looking at it` · `standing beside an empty shelf, one paw resting on it` · `arms raised, both fists up, wide happy grin` |
| Kookaburra | `head cocked to one side, one wing raised to shade its eyes, looking into the distance` · `asleep, eyes closed as two curved downward lines, slumped forward` · `laughing, head tipped back, wings out` |
| Wombat | `sitting down with a badminton racquet resting across its knees` · `standing with both paws on its hips, chest out` |
| Galah | `tangled in a badminton net, embarrassed expression, wings poking through` · `standing looking around, confused, one wing scratching its head` |

### 5.4 Prompt C — T2 rig layers

Run after B is approved, in the same chat.

```
Take the character from the previous image. Output it split into SEPARATE
LAYERS, one image per message, each on pure black #0A0A0B, each at 1024 x 1024,
each with the layer positioned EXACTLY where it sits in the full illustration
(same coordinates, do not recentre anything):

1. Body only - torso, legs, feet, tail. No head, no arms.
2. Head only - head, ears, face, headband. No body, no arms.
3. Left arm only. 4. Right arm only.
5. Head again, identical, but with the eyes CLOSED (two short downward curves).

Identical style, colours and line weight in every layer.
```

**Expected to fail on registration.** Image models do not hold pixel-exact coordinates across
separate calls. The fallback is the cheaper path anyway: generate the full body once, split by hand
in Figma. 4 characters × 5 layers is about an hour, and it is exact.

### 5.5 Prompt D — website hero lineup

```
Match the exact art style of the attached reference images: flat vector, kawaii,
hard clean edges, solid fills only, no gradients, no outlines, no shadows, no
texture.

A wide horizontal lineup of four Australian animal mascot characters standing
side by side, front-facing, full body: a quokka, a kookaburra, a wombat and a
galah. Each wears a lime #D6FF3F headband and lime wristbands. Chunky kawaii
mascot proportions, big heads, small bodies. Slightly varied heights so the
silhouette is interesting - the galah tallest, the wombat shortest and widest.
Friendly neutral expressions, looking at the viewer.

Image size 1536 x 1024. Flat near-black #0A0A0B background, nothing else -
no ground, no shadows, no text, no logo, no watermark.
```

### 5.6 Prompt E — Claude Design, motion prototype

Claude Design emits HTML/CSS/SVG, so it prototypes the **website half directly** and the React
Native half becomes a transcription of the same timings. Upload the rig layer PNGs first.

```
Build a single dark HTML page (background #0A0A0B) that demonstrates a layered
PNG puppet rig for a mascot character, using the uploaded layer images
(body, head, arm-l, arm-r, head-eyes-shut).

Requirements:
- Stack the layers with absolutely positioned <img> elements inside one
  position:relative container. All layers share the same coordinate space, so
  every layer is left:0 top:0 width:100% - no manual offsets.
- Set a CSS transform-origin per layer so rotation looks anatomically right:
  head rotates about its base, arms rotate about the shoulder.
- Implement these five named animations as pure CSS @keyframes, each a separate
  labelled demo tile on the page with its own copy of the character:

  1. IDLE      - infinite loop. Body scaleY 1 -> 1.02 -> 1 over 2.6s, ease-in-out.
                 Head lags the body by 120ms. Never stops.
  2. BLINK     - fires every 4-7 seconds at random. Cross-fade the eyes-shut head
                 over the open head for 90ms, then back.
  3. WAVE      - one-shot, 900ms. Right arm rotates -60deg, then oscillates
                 +/-12deg twice, then returns. Head tilts 5deg toward the arm.
  4. CELEBRATE - one-shot, 1100ms. Both arms rotate up and out, whole character
                 jumps: translateY -18px with a squash on takeoff (scaleY .94)
                 and a stretch at the apex (scaleY 1.06), settling with a small
                 secondary bounce.
  5. PEEK      - one-shot, 700ms. Character starts fully below a clipping mask,
                 slides up to reveal the top 60% with an overshoot, holds 400ms,
                 slides back down.

- Motion vocabulary: overshoot on hero beats, damped settle on arrivals.
  Use cubic-bezier(.22,1.2,.36,1) for pops and cubic-bezier(.22,1,.36,1) for
  settles. No linear easing anywhere.
- Each tile has a Replay button for the one-shots, and a control that prints the
  exact keyframe timings and easing for that animation as copyable text - I need
  to port these numbers to react-native-reanimated.
- Respect prefers-reduced-motion: reduce - all animation off, static pose only.
```

---

## 6. Decisions (settled 2026-08-25)

1. **Props + a 4-character cast**, not 28 full-body sets (§2). The prop overlay is what makes
   personalisation affordable; the cast is what makes the brand.
2. **Cast: quokka, kookaburra, wombat, galah.** Emu was proposed as a fifth (tall, awkward newbie,
   good comic proportions for empty states) and **not taken** — reopen only if the four can't cover
   the six empty states without repeating.
3. **App icon, splash, favicon and `og-image.png` all stay as they are.** Smashimals go everywhere
   inside the app and across the website, but the brand mark is untouched — the beta already
   shipped with it and store listings are live. The OG image is the obvious first thing to revisit
   once cast art exists.
4. **No reliability mood states, and the galah is never pointed at a player.** A droopy avatar for
   low reliability, and a galah on the no-show flow, were both proposed and both rejected: in a
   small named beta community that is a joke aimed at a real person. The galah is used for **app**
   failure only — error, offline, 404.

---

## 7. Not doing

- **Full-body art for all 28 Smashimals.** §2. Busts do identity, the cast does brand.
- **Chat sticker pack.** Wanted, and the obvious next use of this art, but it is
  [social-plan.md](social-plan.md) territory and that plan is unapproved. Needs its own sign-off.
- **Lottie or Rive.** §4.
- **Smashimal on pull-to-refresh.** Too high-frequency.
- **Cosmetic unlocks / a season ladder.** [not-boring-plan.md](not-boring-plan.md) Phase 4 is
  explicitly parked. Accessories are the obvious unlock currency and that is exactly why this must
  not reopen it sideways.
- **SVG retrace of the 28 busts.** A genuine option — `react-native-svg` is installed, SVG is
  scale-free and rig-able for nothing — but it is a redraw of the entire shipped set. Logged, not
  started.
- **Custom or user-uploaded props.** Same UGC moderation cost avatars-plan §5 already priced.

---

## 8. Phases

| Phase | Scope | Blocks on |
|---|---|---|
| **A0** | Prompt A → 6 props → `ui/assets/props/` + a `PropOverlay` component | nothing |
| **A1** | Props on wizard success, join success, post-game, `ShareCard` | A0 |
| **B0** | Prompt B → 4 cast × ~3 poses → `data/smashimals/cast/`, processed into `ui/assets/smashimals/` | style test tile passes (§5.1) |
| **B1** | `EmptyState` takes a `character` prop; migrate the six call sites (§3.2) | B0 |
| **C0** | Prompt C or hand-split → rig layers; Prompt E → motion timings | B0 |
| **C1** | `SmashimalRig` component (Reanimated) — idle, blink, wave, celebrate, peek. Wire into `AvatarPicker` and onboarding | C0 |
| **W0** | Website: hero bust row, marquee busts, `#get-app` banner, `404.html` | A0 (hero row and marquee need no new art) |
| **W1** | Website: `#how` step characters, stub pages, support/delete-account | B0 |

**A0 → A1 and W0's first half need no new illustration at all** — the props are flat objects and the
hero row reuses the shipped busts. That is the fastest visible win; start there.

Per phase: `npx tsc --noEmit`, `npm test`. B1 additionally needs a Maestro pass, since it changes
what six screens render when empty. No SQL in any phase — nothing here touches the schema.
