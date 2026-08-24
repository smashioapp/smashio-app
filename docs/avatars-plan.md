# Avatars & Game Covers Plan — SMASHIO

Written 2026-08-24. **Status: approved 2026-08-24, P0 → P1 → P2 shipped same day.** P3/P4
(covers, chat list identity) stay parked per §6.6. Sibling to [ux-plan.md](ux-plan.md) (behaviour) and
[not-boring-plan.md](not-boring-plan.md) (feel) — this one covers *identity*: making every player
and every game visually distinct without asking anyone to upload anything.

---

## 1. Diagnosis

Six concrete things, all verifiable in the current tree.

1. **No photo means a letter in a circle.** [Avatar.tsx:35](../ui/components/Avatar.tsx) falls back
   to `initial(name)` on a hash-derived background ([theme.ts:70](../ui/lib/theme.ts)). Functional,
   forgettable, and identical to every other app's fallback.

2. **`AvatarStack` silently drops photos entirely.** Its prop type is
   `{ name: string; color: string }[]` — no `photoUri`, no `id`
   ([Avatar.tsx:42](../ui/components/Avatar.tsx)). So the roster faces on
   [GameCard.tsx:65,114](../ui/components/GameCard.tsx),
   [NextUpHero.tsx:101](../ui/components/NextUpHero.tsx),
   [UpcomingGameCard.tsx:179](../ui/components/UpcomingGameCard.tsx) and
   [game/[id].tsx:229](../ui/app/game/[id].tsx) render **letters even for players who did upload a
   photo**. Upstream confirms it: [gamePlayers.ts:20](../ui/lib/queries/gamePlayers.ts) selects
   `profiles(display_name)` and nothing else. The photo never gets as far as the component.

3. **Every chat thread looks the same.** [chat.tsx:41-47](../ui/app/(tabs)/chat.tsx) renders one
   `ShuttlecockGlyph` in a `surfaceAlt` tile for every row. Twenty threads, twenty identical tiles.
   Only the text title distinguishes them, and the title is `venue · date`, so two games at the same
   venue are near-indistinguishable at a glance.

4. **Games have no cover column at all.** No `cover_key`, no image, nothing.
   [game/[id].tsx:38](../ui/app/game/[id].tsx) reserves `HERO_HEIGHT = 300` with no art behind it.

5. **Identity is split by auth method.** [onboarding/setup.tsx:72](../ui/app/onboarding/setup.tsx)
   prefills from the OAuth provider photo, so Google sign-ups arrive with a face and email sign-ups
   arrive with a letter. The only fix path is an opt-in photo upload buried in
   [profile-edit.tsx:104](../ui/app/profile-edit.tsx), which most people skip.

6. **Deleted users render "D".** `delete_account` nulls `photo_path` and sets the name to
   "Deleted user" ([account_deletion.sql:89-96](../supabase/migrations/20260812000200_account_deletion.sql)).

---

## 2. What we're building

### Smashimals

**28 Australian-native animals**, flat-vector kawaii portraits, each on a `#1F1F24` circle, each
wearing exactly **one lime `#D6FF3F` badminton band** (sweatband / wristband / collar). That single
saturated accent is what makes the set read as one system on the dark UI, and what makes it ours —
generic cute-animal packs are everywhere; an Aussie-native set in SMASHIO lime is not.

Roster — the **28** shipped keys, as they sit in `ui/assets/avatars/` (§3.2, §3.3):

```
koala        kangaroo      wombat           quokka
echidna      platypus      sugar-glider     bilby
numbat       tasmanian-devil  dingo         brushtail-possum
quoll        bandicoot     flying-fox       cockatoo
lorikeet     magpie        little-penguin   black-swan
budgerigar   goanna        kookaburra       galah
emu          cassowary     pelican          tawny-frogmouth
```

28 lays out as a 4 × 7 picker grid — one row taller than fits without scrolling, so the sheet
scrolls slightly. Dropping to 24 restores the clean 4 × 6; that trade is §6.3's to revisit once the
picker is real and the scroll can be judged rather than guessed.

AI-generated (§3), shipped as **bundled PNGs** — no network, no CDN, no cache-bust, works offline,
renders instantly in a scrolling list. Every profile gets one **deterministically from their user
id at signup**, so nobody ever sees a letter again, including before they open the picker.

Photos are not removed. The ladder becomes:

```
photo_path  →  chosen avatar_key  →  animal from id hash  →  letter (dead branch, kept as guard)
```

### Game covers

Generated **court-poster art**, deterministic from game id + skill tier + start hour, drawn
client-side from `HERO_TONE` gradients + court-line geometry. Zero uploads, zero moderation, zero
fetches — which is exactly what lets it appear as a 46px thumb in the chat list without N image
requests. A curated pack of ~10 host-pickable covers sits on top; custom uploads are explicitly out
(§5).

---

## 3. Asset production (prerequisite for P1)

Runs outside the repo — you generate, I wire.

**Generate** (Gemini / ChatGPT, two runs of twelve — prompt is in the chat transcript; paste it
verbatim, then re-run with the second animal list plus "match the exact style of the previous
image").

**Acceptance checklist per file** — reject and regenerate if any fail:

| Check | Requirement |
|---|---|
| Dimensions | 512 × 512, square |
| Composition | Circle centred, equal padding, animal not cropped |
| Circle fill | `#1F1F24` (or `#141416`) — never white |
| Lime band | Present, `#D6FF3F`, the only saturated element |
| Style | Flat, no outlines, no gradients, no drop shadow, no text/watermark |
| Weight | ≤ 30 KB after quantization |

**Processing** — `scripts/avatars/process.mjs` (new, `sharp`, dev-dependency only, not shipped):
slice sheets into cells, centre-crop, resize to 512, **key out the baked circle background**,
quantize to PNG-8, write to `ui/assets/avatars/<key>.png`, print a size table and fail the run if
the total exceeds the budget.

The keying step is a flood fill from the disc edge inward at ~12 tolerance, not a global colour
replace. Connected-region only, so it cannot eat a dark animal (tassie devil, magpie) — those
aren't connected to the outside — and where a koala's ears touch the circle boundary the fill
correctly stops at the ear. Output keeps alpha; `Avatar.tsx` supplies the circle. This is what
makes assets from different generation runs tonally consistent, and what lets an avatar sit on a
light surface later (`ShareCard`, push attachments) instead of carrying a dark disc into it.

### 3.1 Source-set evaluation — 2026-08-24

Two candidate sets were generated and measured (`ui/assets/avatars/gemini/`, `.../chatgpt/`).

| | Gemini | ChatGPT |
|---|---|---|
| Sheet / cell | 2048², 4×4 → **512×512 square** | 1254², 4×3 → 313×418 portrait |
| Content W / H | 505 / 507 — **true circles** | 295 / 343 — **ellipses (0.86)** |
| Size spread | 3% | 38% on height |
| Centre offset | **avg 2.3px, max 5px** | avg 41px, max 60px (13–19%) |
| Lime measured | **#D5FB4F** (brand `#D6FF3F`) | #C8E63B / #C1E927 — drifts to `accent2` |
| Style | flat vector, hard edges | soft airbrush, textured fur |
| Roster | 32 slots, 8 dupe pairs → **24 distinct** | 24/24 exact, no dupes |

**Decision: Gemini.** Centring is the reason — `Avatar.tsx` clips with `borderRadius` +
`overflow: hidden`, so a 13%-off-centre ellipse clips differently in every cell and the picker grid
visibly wobbles. Gemini's ±5px drops in with no per-file correction; ChatGPT would need all 24
re-cropped by hand. Flat hard edges also key cleanly (above) where airbrushed edges halo.

**Regenerate three Gemini cells**, using sheet 1 as the style reference (bg `#17171A`, lime
`#D5FB4F` — *not* sheet 2, which drifted to `#141318` / `#C9F052`):

1. kookaburra — side profile plus a blue wing patch: unreadable at 26px, and the blue breaks the
   one-accent rule
2. sheet 1 r3c4 (grey bird) — no lime item
3. sheet 1 r4c1 (brown animal) — no lime item

**Do not mix the two sets.** ChatGPT's galah, lorikeet and magpie are better birds, but painterly
fur beside flat vector in one 4×6 grid reads as broken rather than varied.

**Budget: 28 files ≤ 900 KB total.** Measure before merging; that lands on both store binaries.

Ship PNG, not WebP — RN on iOS needs extra native config for WebP and it isn't worth it at this size.

### 3.2 Gen 2 — accepted, sliced, shipped (2026-08-24)

A second Gemini run against the corrected prompt (pure-black outside, fixed circle diameter,
front-facing only, muted non-lime colours). Both sheets 2048², 4×4, 512px cells. Measured:

| | Sheet A — mammals | Sheet B — birds & reptiles |
|---|---|---|
| Outside the circles | `#000000` exactly ✅ | `#000000` exactly ✅ |
| Disc diameter | 464–468px, aspect 1.00 | **472px in all 16**, aspect 1.00 |
| Centre offset | 2.8–11.4px | **0.0px in all 16** |
| Disc fill | `#232227`–`#26252A` | `#212025`–`#232228` |
| Lime present | **16 / 16** | **8 / 16** |

Both defects from gen 1 are gone: geometry is production-grade, and the two sheets now agree on
disc tone (~`#222126`, within 4/255 of `surfaceAlt` `#1F1F24` — close enough to leave alone, no
normalisation pass needed).

The one remaining miss is sheet B: eight cells came back with **no lime accessory at all** —
`kookaburra`, `galah`, `emu`, `cassowary`, `pelican`, `tawny-frogmouth`, `frilled-lizard`,
`saltwater-crocodile`. Sheet A honoured the rule 16/16, so this is a sheet-B-only regression.

**16 + 8 = exactly the 24 the plan calls for**, so gen 2 ships as-is and the eight are parked.

**Slicing performed** (one-off, `System.Drawing`; the reusable `scripts/avatars/process.mjs` is
still owed): per cell, measure the disc bounding box, crop 512×512 **re-centred on the measured
disc centre**, then paint through an antialiased circular mask at a uniform r=232 so every file is
identically framed regardless of the source cell's drift.

**Layout now:**

```
ui/assets/avatars/<key>.png      24 shipped avatars, 512×512 RGBA
data/avatars/needs-band/         8 held cells — good art, missing the lime accessory
data/avatars/source/gemini/      gen 1 + gen 2 sheets (design source)
data/avatars/source/chatgpt/     rejected candidate set, kept for reference
```

Source sheets were moved **out of `ui/`** deliberately: they are design source, not app assets, and
15 MB of PNG sitting under `ui/assets/` invites exactly the kind of accidental bundling that
`updates.assetPatternsToBeBundled` is easy to get wrong on.

**Quantization — done 2026-08-24.** `ui/scripts/avatars/process.mjs` (new, `sharp` dev-dependency)
resizes each 512px source to 256px — nothing in the app renders an avatar above ~112px, so 256px
is 2x-retina-sharp there — then quantizes to a 128-colour indexed palette. **28 files, 5.4 MB → 260
KB total**, comfortably under the 900 KB budget, no visible loss on the flat-vector art. Re-run it
after adding or regenerating any Smashimal PNG.

Two accepted deviations from the one-accent rule, both kept because they carry the animal's
identity: the **cockatoo**'s yellow crest and the **black swan**'s red bill.

### 3.3 Gen 3 — the parked eight, re-run (2026-08-24)

A 4 × 4 sheet drawing each of the eight bandless animals **twice**, in a headband variant and a
collar variant, so the better one could be chosen rather than accepted. Best geometry of any run:

| Check | Result |
|---|---|
| Outer area | `#000000` exact |
| Disc diameter | 472–478px, aspect ~1.00 |
| Centre offset | **0–3px** across all 16 |
| Visible watermark | **none** — 0 non-black px outside the discs |
| Lime coverage | 14 / 16 |

**Six recovered**, taking the headband variant in every case except the galah:

`kookaburra` · `galah` · `emu` · `cassowary` · `pelican` · `tawny-frogmouth`

The galah's headband variant was rejected as a near-duplicate of the shipped `cockatoo` — same grey
body, same pale crest. Its collar variant has the pink crest that actually reads as a galah, so that
one ships, and the pink joins the cockatoo's crest and the swan's bill as an accepted deviation.

**Two still parked.** `frilled-lizard` and `saltwater-crocodile` came back with lime=0 on their
headband tiles, and their collar variants drifted into near-identical copies of the already-shipped
`goanna` and `blue-tongue-lizard` (verified side by side). Both remain in
`data/avatars/needs-band/`. Not worth a fourth run on their own.

The set reached 30 here, then lost two to the watermark finding below. **Final: 28.**

### 3.4 Watermarking — settled

Gemini output carries **SynthID**, an invisible provenance watermark that survives cropping and
resizing. It is not removable and no attempt is made to remove it. It is a provenance signal only
and places no restriction on commercial use.

Gemini *also* stamps a small four-point sparkle glyph — a **visible** mark — at the bottom-right of
each generated sheet. On a 4 × 4 grid that lands inside the **r3c3** tile's disc.

Two shipped avatars were built from an r3c3 tile and carried it: **`dugong`** (gen 2 sheet A) and
**`blue-tongue-lizard`** (gen 2 sheet B). Both were spotted by eye and deleted. Gen 3's r3c3 also
carries it, but that tile had already been discarded as a duplicate of `goanna`, so it never shipped.

**The automated scan did not catch this, and could not have.** It only counted non-black pixels
*outside* the discs, to find a mark sitting in the black margin. This mark sits *inside* the artwork.
Its clean result was true and useless. Any future run needs the r3c3 tile checked by eye, or
excluded outright — the cheap fix is to lay out 4 × 4 sheets with a deliberately sacrificial
sixteenth tile.

Blast radius is exactly one tile per sheet, so the remaining **28 are clean** — no other tile can
contain the glyph.

**Standing rule:** a visible provenance watermark is never edited out. If one lands in the black
margin, the circular crop simply never picks it up. If one lands inside a disc, that tile is
discarded — as `dugong` and `blue-tongue-lizard` were.

---

## 4. Phases

### P0 — schema and plumbing — done 2026-08-24

- [x] Migration [20260824000300_smashimals_and_covers.sql](../supabase/migrations/20260824000300_smashimals_and_covers.sql):
  ```sql
  alter table public.profiles add column avatar_key text;
  alter table public.games add column cover_key text not null default 'auto';
  ```
- [x] **No enum, no FK, no check constraint on `avatar_key`.** Validity is a client concern — an
      unknown key falls through to the id-hash animal. Adding a 25th animal must not require a
      migration, and an old client must not crash on a new key.
- [x] Carry the new columns through every read path that already carries `photo_path`:
      `games_public` view, `nearby_games`, `player_card`, `post_game_roster`.
      `chat_threads` deliberately skipped — it doesn't select `photo_path` today either (P4 is
      parked; unpark adds both together). `venues_directory` / `venue_detail` `photo_path` is venue
      photos — unrelated, left alone.
- [x] `delete_account`: sets the reserved `'ghost'` key (decision 7 — asked, answered) alongside
      nulling `photo_path`.
- [x] `supabase/seed.sql`: bot profiles + the test user now carry varied `avatar_key`s.
- [x] Regenerated `ui/lib/db.types.ts` (do not hand-edit — CLAUDE.md rule). Note: the real path is
      `ui/lib/db.types.ts`, not `ui/db.types.ts` as this doc's header states — CLAUDE.md corrected.

**Done when:** `supabase db reset` is clean and `npx tsc --noEmit` passes with the regenerated types. ✅

### P1 — registry, `Avatar` rewrite, and the `AvatarStack` fix — done 2026-08-24

- [x] `ui/assets/avatars/*.png` — 28 files landed 2026-08-24 (§3.2, §3.3).
- [x] `ui/scripts/avatars/process.mjs` + `sharp` dev-dependency; quantization run over the 28 —
      5.4 MB → 260 KB (§3.2).
- [x] `ui/lib/avatars.ts` — `ANIMALS` registry (`key`, `label`, `require()`d `src`), `AnimalKey`
      type, `animalFor(key, id)` with the same hash shape as `avatarColor()`. `require()` is
      static so Metro bundles them; no dynamic path construction.
- [x] `Avatar.tsx` gains `id` and `avatarKey` props and implements the four-rung ladder, including
      the `'ghost'` reserved key (renders a muted `?` instead of an animal or a letter).
- [x] **`AvatarStack`'s prop type changes** to `{ id, name, color, photoUri?, avatarKey? }[]` —
      the fix for diagnosis 2. Every call site now carries a real `Player`/`ChatMember` object with
      `id`/`photoUri`/`avatarKey`, sourced from `useGameRoster`/`useMyGamesRoster`/`useChatMembers`.
- [x] `useGameRoster` and `useMyGamesRoster` ([gamePlayers.ts](../ui/lib/queries/gamePlayers.ts))
      select `photo_path, avatar_key`. `useMyGamesRoster` stays one query across all cards.
- [x] Migrated the twelve `<Avatar>` / five `<AvatarStack>` call sites, plus three more hand-rolled
      letter-circles found along the way in [game/[id].tsx](../ui/app/game/[id].tsx) (roster row,
      host row, join-request row) that the diagnosis's call-site count had missed.

**Done when:** a player with no photo renders their animal in Discover, My Games, game detail, chat,
the roster stacks, blocked list and share card — and a player *with* a photo renders the photo in the
roster stacks, which they never did before. ✅

### P2 — the picker — done 2026-08-24

- [x] [AvatarPicker.tsx](../ui/components/AvatarPicker.tsx) — bottom sheet (reuses `Sheet.tsx`),
      4-column grid, lime ring on the current selection, a shuffle button, `haptics.tick()` and a
      scale-pop per [not-boring-plan.md](not-boring-plan.md) Phase 2.
- [x] [profile-edit.tsx](../ui/app/profile-edit.tsx): tapping the avatar opens
      *Take photo / Choose photo / Pick a Smashimal* instead of jumping straight to the image picker.
- [x] `useUpdateProfile` accepts `avatar_key` (it already took a generic `TablesUpdate<"profiles">`
      patch, no signature change needed). Picking an animal clears `photo_path`; uploading a photo
      leaves `avatar_key` intact underneath as the fallback.
- [x] [onboarding/setup.tsx](../ui/app/onboarding/setup.tsx): new step, **pre-seeded with the
      id-hash animal** and phrased as "This one's yours — want a different one?". Keeping it is
      zero taps. This is the fix for diagnosis 5: email and Google sign-ups now arrive equally
      identified.

**Done when:** a fresh email signup reaches the home tab with a distinct avatar having made no
decisions. ✅

### P3 — covers — PARKED 2026-08-24

**Parked by decision (§6.4): avatars ship first, covers come later.** Scoped here so the design
isn't re-derived. `games.cover_key` still lands in P0 — one nullable column costs nothing now and
saves a second migration later — but nothing reads it until this phase is unparked.

Ordered before the chat list because the chat thumb depends on `GameCover`.

- [ ] `ui/lib/covers.ts` — `coverFor(game)` → gradient + glyph + line pattern, deterministic from
      `id`, `skill_tier`, `starts_at` hour. Reuses `HERO_TONE` so open / live / urgent stay
      consistent with the rest of the app.
- [ ] `ui/components/GameCover.tsx` — one component, three sizes: `thumb` (46), `card`, `hero` (300).
      `expo-linear-gradient` + `react-native-svg`, both already installed.
- [ ] Pack of ~10 keys (`pack:night-courts`, `pack:doubles`, `pack:social`, `pack:drills`,
      `pack:beginners`, …) drawn by the same component from a fixed config — no new image assets.
- [ ] [wizard.tsx:44](../ui/app/wizard.tsx): optional `cover` step inserted into
      `MANUAL_STEP_KEYS` after `level` (and `RECEIPT_STEP_KEYS` after `level`). Defaults to `auto`,
      skippable in one tap — hosting must not get longer.
- [ ] Render in game detail hero, `GameCard`, `UpcomingGameCard`, `ShareCard`.

**Done when:** every game — including all existing rows, which default to `auto` — has art, and the
wizard is no slower for a host who doesn't care.

### P4 — chat list identity — PARKED 2026-08-24

**Parked with P3.** Worth stating plainly: *"show it on the messages screen to identify the event
properly"* was the original brief, and parking covers parks that outcome —
[chat.tsx:41](../ui/app/(tabs)/chat.tsx) keeps rendering the same `ShuttlecockGlyph` on every row
(diagnosis 3) until this phase is unparked.

- [ ] `chat_threads()` returns `cover_key`, `organizer_avatar_key`, `organizer_photo_path`, and
      `member_avatar_keys text[]` (top 3). All scalars — **no image URLs, no signed URLs, no extra
      round trips.**
- [ ] [chat.tsx:41](../ui/app/(tabs)/chat.tsx): replace the `ShuttlecockGlyph` tile with a
      `<GameCover size="thumb">` plus a 3-up Smashimal mini-stack.
- [ ] Closed threads desaturate the cover rather than only dimming the text.

**Done when:** the chat list is scannable by picture.

**Cheap unpark option, if the wait bothers you:** the member Smashimal stack alone fixes most of
diagnosis 3 and needs no cover art at all — just the two `avatar_key` columns on `chat_threads()`
and a stack in place of the glyph. That is a P2-sized piece of work sitting inside a parked phase.

### P5 — polish

- [ ] Upload the 24 PNGs once to a **public `smashimals` storage bucket** so `push-dispatch` can
      attach an avatar to a notification ([quick-wins.md](quick-wins.md) 2.5). Bundled assets have no
      URL; this is the only reason a server copy exists.
- [ ] Ghost avatar for deleted users (decision 4).
- [ ] Idle micro-motion — a slow blink on the picker's selected animal. Hero moments only, per
      [not-boring-plan.md](not-boring-plan.md); no motion in list rows.

---

## 5. Not doing

- **Runtime-composed parametric SVG avatars.** The earlier proposal in this thread. A generated
  raster set is better art for less code, and the combinatorial version's only real advantage —
  thousands of permutations — is worthless when 24 recognisable characters read better in a 26px
  stack than 3,840 near-identical ones.
- **Custom host cover uploads.** A second UGC moderation queue.
  [venue_photos](../supabase/migrations/20260815000900_venue_photos_corrections.sql) already showed
  the full cost: an approval trigger, a private bucket, signed-URL reads. Revisit after beta.
- **Venue photos in the chat list.** Same reason — the `venue-photos` bucket is private, so a
  20-row list would need 20 signed URLs. Venue photos stay on the game detail screen only.
- **`expo-image` / blurhash migration.** A real gap, already logged as its own item in
  [quick-wins.md](quick-wins.md). Don't couple it to this.
- **Cosmetic unlocks / season ladder.** Accessories are the obvious unlock currency, and Phase 4 of
  [not-boring-plan.md](not-boring-plan.md) is explicitly parked. Design the registry so it's possible
  later; build none of it now.
- **Removing photo upload.** Photos still win the ladder. They just stop being the only way to not
  look like a spreadsheet cell.

---

## 6. Open decisions

### Settled 2026-08-24

1. **Aussie natives**, not generic cute animals. Ownable, on-brand for an Australia-first app.
2. **Set name: "Smashimals."** Used in the picker header, onboarding copy, and the `ANIMALS`
   registry.
3. **Set size: 28** (was "24, not 36"). Gen 3 recovered six more (§3.3), then two were lost to the
   watermark finding (§3.4). Lays out 4 × 7, so the picker scrolls a little. The schema takes new
   keys with no migration, so the set can grow — or be trimmed back to a no-scroll 24 — later.
4. **`sharp` as a dev-dependency**, to quantize 5.4 MB → ~700 KB. Prebuilt binaries, dev-only,
   never shipped. Rejected: a hand-rolled PNG-8 encoder on Node's `zlib` — same result, ~100 more
   lines to own.
5. **Regenerated the eight parked cells** (§3.3). Six recovered; `frilled-lizard` and
   `saltwater-crocodile` stay parked in `data/avatars/needs-band/` — not worth a fourth run alone.
6. **Covers deferred entirely.** P3 and P4 are parked; ship P0 → P1 → P2 (avatars only). The chat
   list keeps its identical tiles for now — see the note on P4 for the cheap partial unpark.

7. **Deleted-user avatar — settled 2026-08-24.** Reserved `'ghost'` key, not the id hash — a
   cheerful quokka labelled "Deleted user" was the thing being avoided. `delete_account` sets
   `avatar_key = 'ghost'`; `Avatar.tsx` renders it as a muted `?`, never an animal.

---

## 7. Working order and verification

**Scope for this round: `P0 → P1 → P2`.** P3 and P4 are parked (§6.6); P5 follows P2.

P1's asset dependency is satisfied (§3.2) — its remaining blockers are the regenerated eight and
the quantization pass. `games.cover_key` still ships in P0 so the parked phases don't need a second
migration.

Per phase: `npx tsc --noEmit`, `npm test`, and `supabase db reset` on any phase touching SQL — the
same three the CI workflow runs on pushes to `main` (`3f6b8fc`). P1 and P4 additionally need a
Maestro pass, since both change what the chat and My Games rows render.
