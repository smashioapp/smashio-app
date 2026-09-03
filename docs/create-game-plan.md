# Create-a-Game Plan — v2 of hosting

Status: **structure signed off 2026-09-01, scope of §5 fields signed off, build not started.**
Written 2026-09-01. Read §9 first — it records the settled decisions and overrides anything in
the body still phrased as an option. Design pass runs through
[design-brief.md](design-brief.md) Prompt 6. Build order: after the feed.
Covers `ui/app/wizard.tsx`, `ui/app/game/[id].tsx`, `ui/app/game/edit/[id].tsx`,
`ui/components/ReservedSpots.tsx`, `supabase/functions/ai-proxy`, `games`, `game_confirmations`,
`game_reserved_spots`.

Supersedes nothing. It is the **next** pass on top of [host-flow-plan.md](host-flow-plan.md),
which shipped and works. Read §0 before anything else — it records what already exists so this
doc doesn't re-propose it.

---

## §0 What already shipped (do not re-propose)

From host-flow-plan.md, all live in `wizard.tsx` today:

- Entry screen: **"Got a booking confirmation?"** → photo upload, or "I'll type it in instead".
- Receipt path: parse via `ai-proxy` `{mode:'parse'}` → Gemini 2.5 Flash, forced
  `record_booking` function call, strict schema, `is_booking_confirmation` + `confidence` gate.
- Review step with per-field "from your confirmation" tags, cleared on edit (`editedFields`).
- Venue auto-resolution through Places + `sharesToken` guard, falls back to the search step.
- Full six-branch failure ladder. Draft confirmations at `drafts/{uid}/`, claimed at publish
  via `{mode:'attach'}`, orphan + retention crons.
- Date/time is **no longer** the 4-chip/6-slot picker the old plan complained about — it's a
  native inline date picker plus a 5-minute-interval time spinner. `TIME_OPTIONS`/`dateOptions`
  survive in `lib/schedule.ts` for other callers.
- Manual path step 4 already takes **up to 5 files, images or PDF**
  (`DocumentPicker`, `type: ["image/*","application/pdf"]`, `useUploadConfirmationFiles`).

Two things the old plan listed as "not doing" that this plan reopens: **PDF into the parse
path** (§4.1) and nothing else. Forward-to-email, share-extension, and multi-receipt stay out.

---

## §1 Diagnosis — why it's boring

The receipt path is genuinely good. Everything downstream of it is a form.

**1. Every screen asks for a number.** After venue and date, the host meets four steppers in a
row — total players, reserved spots, courts booked, duration — then a fifth for price. Five
`+`/`−` controls with a big lime numeral in the middle. There is no other interaction in the
flow. `courtLabel` is the only free-text field in the entire wizard and it's optional and
twenty characters.

**2. The host never sees what they're making.** Six steps of input, then a publish stamp, then a
summary. The `GameCard` that other players will actually see — cover art, tier pill, spots-left
line — is not on screen at any point during creation. Compare Luma, where the event *page* is
the editor. We ask people to fill a form and trust us.

**3. Nothing collected is about the game.** The full column list of what a host tells us:

| What we ask | Column | Type |
|---|---|---|
| Venue | `venue_id` | FK, Places or Smashio directory |
| Start | `starts_at` | native date + time picker |
| Duration | `duration_hours` | **int**, 1–6 |
| Skill | `skill_tier_id` | FK, one of 3 tiers, single value |
| Total players | `max_players` | 2–16, includes host |
| Reserved spots | `reserved_spots` | 0 … max−1 |
| Courts | `courts_booked` | 1–10 |
| Court number | `court_label` | optional text ≤20 |
| Price | `cost_per_player_cents` | capped at `duration × $20` |
| Receipt | `game_confirmations` | ≤5 images/PDF |

Derived or hardcoded, never asked: `ends_at`, `sport_id` (badminton, literal `SPORT_SLUG`),
`cover_key`, `status`, `verification_status`, `chat_mode`, `chat_photo_approval`.

Not collected **at all**: a title, a note, format (social / competitive / drills / doubles
rotation), a skill *range* rather than a point, visibility, request-to-join vs auto-approve,
who brings shuttles, how to pay, where to actually meet (door, level, parking), minimum
players to go ahead, recurrence.

That is the whole answer to "why is it boring": ten fields, nine of them numbers, zero of them
the host's voice. Two games at the same venue on the same night are indistinguishable.

**4. Reserved spots is an abstraction, not a thing.** The wizard asks for a *count* of anonymous
held spots, with copy explaining you can name them later. Naming happens on a different screen
after publish, in a section called "Held for friends", behind an iOS-only `Alert.prompt` that
silently degrades to an unnamed row on Android
([ReservedSpots.tsx](../ui/components/ReservedSpots.tsx)). The host's actual mental model is
"me, Mia, Raj, and three strangers" — we make them convert that into the integer 2 and then go
find the naming screen.

**5. The host isn't in the roster.** `game/[id].tsx` renders
`Players joined ({joinedCount + 1}/{maxPlayers})` — the `+1` is the host — and then maps only
`joined` into avatars. So the header says 3/4 and three avatars appear, one of whom is not the
host. The host is a *separate card higher up the page*, and that card is hidden entirely when
you are the host (`organizer && !isOrganizer`). A host looking at their own game sees a roster
that does not contain them, above a count that does.

**6. Nothing marks the receipt as the point.** `verification_status` flips to `verified` and,
as far as the create flow is concerned, that's the end of it. The one genuinely differentiated
thing this app does at creation time — an LLM read your booking and we can vouch for it — gets
no moment.

---

## §2 Prior art, 2026

| App | Pattern worth taking |
|---|---|
| **Luma** | The single-screen event sheet. What is usually a multi-page form is one elegant screen, and that screen *is* the event page — you edit the artifact, not a form about it. Widely credited with making Eventbrite feel bureaucratic. ([Luma help](https://help.luma.com/p/creating-an-event), [design critique](https://ixd.prattsi.org/2026/02/luma-design-critique/)) |
| **OpenSports** | Three visibility tiers (public / private / secret), one-time *or* recurring at creation, **custom named spots and teams** created up front, automatic waitlist with timed offer-to-next. ([event setup](https://opensports.net/blog/get-ready-to-launch-your-first-event), [recurring](https://opensports.net/blog/create-recurring-events-on-opensports)) |
| **Pickleheads** | **Lists** — a private organiser-owned roster of regulars, built once, invited in a few taps. Player limit auto-manages the waitlist. Two chats: whole group, and today's RSVPs. ([creating a session](https://www.pickleheads.com/organize/watch/creating-a-session), [weekly sessions](https://www.pickleheads.com/guides/how-to-set-up-weekly-sessions)) |
| **Playtomic** | Private booking → **convert to public match**, one-way, at any time after creation. Level *range* (0–7), not a point. Competitive vs friendly is an explicit, ranked-affecting flag. ([convert to public](https://playerhelp.playtomic.com/hc/en-gb/articles/39545442764945-How-to-convert-a-Private-Booking-to-a-Public-Match)) |
| **Spond** | Event *kinds* at creation (single / repeating / season / **time poll**), and per-event "auto-attending vs must confirm". Also the cautionary tale: reviewers call its availability model confusing — a state machine users can't name is a bug regardless of how correct it is. ([Spond events](https://www.spond.com/events/)) |
| **Partiful** | Free, no-account RSVP by link. Personality-first: the invite is the product. ([overview](https://party.pro/partiful/)) |
| **Progressive disclosure, 2026 research** | Reveal only what the current task needs; a 2026 study found progressive disclosure raised *perceived* learning. Wizards earn their keep where step order matters and skipping breaks state — otherwise accordions and bottom sheets beat them on mobile. ([UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/), [IxDF](https://ixdf.org/literature/topics/progressive-disclosure)) |
| **Trust-badge UX** | Place the trust signal where the doubt is, not uniformly. A badge that **links to its evidence** is materially more credible than a static seal. ([UserIntuition](https://www.userintuition.ai/reference-guides/trust-ux-badges-proof-and-the-research-behind-them/), [LogRocket](https://blog.logrocket.com/ux-design/trust-driven-ux-examples/)) |

Two threads run through all of it:

- **Nobody good ships a linear stepper for this.** Steppers are for irreversible ordered setup.
  Creating a game is a set of independent facts, most with sensible defaults. Luma, Partiful and
  Playtomic are all one screen; OpenSports and Spond are one screen with disclosure.
- **The people you're bringing are named at creation, not after.** OpenSports custom spots,
  Pickleheads lists, Spond invite lists — all before publish. Ours is the only flow that asks
  for an integer.

---

## §3 Target shape — the draft card

Replace the 6-step stepper with **one scrolling screen that is a live `GameCard`**.

```
 ┌───────────────────────────────────────┐
 │  [ live GameCard preview — cover art, │   ← the actual card other players see,
 │    venue, time, tier pill, ● ● ○ ○ ]  │     re-rendering as you type
 │                        ✓ Verified     │
 └───────────────────────────────────────┘

   WHERE     Olympic Park Sports Halls   ·from your confirmation
   WHEN      Thu 21 Aug · 8:00–10:00pm   ·from your confirmation
   WHO       ○●●○  4 players · Intermediate–Advanced
   COST      $6 each   (your booking was $44)

   ▸ More options            ← format, note, visibility, shuttles, court no.

   [ ══════ Publish ══════ ]
```

Rules:

- **Every row is tap-to-expand in place** (bottom sheet or inline accordion), never a page push.
  Progressive disclosure, and the card above never leaves the screen.
- **Required rows are the only ones above the fold.** Where, when, who, cost. Everything else
  lives under "More options", collapsed, with a count badge when non-default.
- **The card is the receipt for your own work.** The single biggest fix in this doc. A host
  should watch spots fill in and the verified tick land while they're still editing.
- **Receipt path fills the top two rows instantly**, and the card is already stamped Verified
  before publish. That is the moment §1.6 is missing.
- **Publish is always visible**, disabled with an inline reason (`Pick a venue first`) rather
  than a gated Continue.

The receipt-vs-manual entry screen stays exactly as it is — it works, it's the best thing in
the flow, and it's the fork that decides how much of the card is pre-filled.

---

## §4 The five asks

### 4.1 PDF into the parse path, and parsed fields lock

**PDF.** `pickConfirmationForParse` is `ImagePicker.launchImageLibraryAsync({mediaTypes:["images"]})` —
images only. The manual step-4 path already accepts PDF. Three changes:

1. `wizard.tsx` — swap `ImagePicker` for the same `DocumentPicker.getDocumentAsync({type:["image/*","application/pdf"]})`
   already used by `pickConfirmationFiles`, single-select.
2. `useParseConfirmation` — currently hardcodes `.jpg`, `contentType:"image/jpeg"`, and runs
   `prepareConfirmationImage` (downscale). Branch on mime: PDFs upload as-is, skip the
   downscale, extension `.pdf`. Add a size cap (**15 MB**, under Gemini's 20 MB inline limit).
3. `ai-proxy` — **`downloadImage` is the actual bug.** Line 304:
   `const mediaType = data.type?.startsWith("image/") ? data.type : "image/jpeg"`. A PDF gets
   relabelled `image/jpeg` and Gemini is handed a mislabelled blob. This means **PDF parsing is
   broken today on the legacy path too** — the manual step-4 picker accepts a PDF as file 0 and
   then fires a parse that can't succeed. Allow `application/pdf` through the allowlist.
   Gemini 2.5 Flash takes PDF `inline_data` natively; multi-page confirmations get read whole,
   which is better than a screenshot of page 1.

Also add a **camera** option alongside the library. Hosts standing at the desk holding a
printed receipt currently have to photograph it, leave, and re-enter through the library.

**Locking parsed fields.** As asked: once parsed, the identified fields are read-only and the
game publishes `verified`.

One concern, then I'll build it as specified. host-flow-plan §Verification chose editable
deliberately — *"extraction never decides anything"* — because a locked wrong value is a
dead end. Gemini will occasionally read 8:00 as 3:00, or land on the wrong branch of a chain
venue. If that field can't be touched, the host's only recourse is to abandon the draft and
start over, and if they don't notice, players go to the wrong court at the wrong hour.

So: lock as asked, plus a mandatory escape hatch that is not "silently edit":

- Fields locked when `confidence` is `high` or `medium`, rendered with a lock glyph and the
  provenance tag, tappable to zoom the source document (the badge links to its evidence — §2).
- `confidence: "low"` **does not lock.** Today it already renders every field as unanswered and
  focused; that stays.
- Each locked row carries **"Doesn't match my booking?"** → sheet with two exits:
  **Re-upload** (new document, re-parse, replaces the draft) or **Unlock and fix** (single
  confirm, that field becomes editable, its provenance tag clears, `editedFields` records it).
  A game with any unlocked field publishes `verified` still — the receipt is real — but its
  `game_confirmations.review_status` goes to `pending` so there's a manual queue if abuse shows
  up. The column and its three states already exist.
- Venue stays a special case: it is not editable after publish
  ([useUpdateGame](../ui/lib/queries/games.ts:252)), so a wrong locked venue is the most
  expensive failure in the flow. `sharesToken` guards it, but keep venue's unlock one tap, not
  two.

**The verified moment.** New `<VerifiedStamp>` on the draft card: cover art gains a lime tick
ribbon, one line — *"Verified — we read this off your booking at Olympic Park."* Tap opens the
source document. On the public `GameCard` and Discover list, verified games carry the tick; a
Discover filter for "Verified only" is the marketing payoff and is one predicate on an existing
column. (Flag for [gtm-plan.md](gtm-plan.md) §3 — this is a real differentiator no competitor
in the Sydney market has.)

### 4.2 Verify an existing game

New entry point on `game/edit/[id].tsx` and, when `verification_status <> 'verified'`, a
dismissible strip on `game/[id].tsx` for the host: **"Verify this game — upload your booking
confirmation."**

Flow: pick document → `{mode:'parse'}` (unchanged) → **diff screen** → apply → attach.

The diff screen is the new piece:

```
   We read your booking. Here's what changes:

   When    Thu 21 Aug 8:00pm  →  Thu 21 Aug 8:30pm     ✓ apply
   Courts  1                  →  2                      ✓ apply
   Venue   Olympic Park       →  Olympic Park           unchanged
   Cost    (booking $44 total — your $6/player stands)

   3 players are in this game. They'll get a heads-up.
   [ Apply and verify ]
```

- **The document wins by default**, as asked — every differing row is pre-ticked to apply.
- Rows are still individually untickable. A host who *knows* the receipt is the old booking
  (rescheduled by the venue over the phone) must not be forced to corrupt a live game to earn
  a tick. Untick anything → publishes verified, `review_status='pending'`.
- **`total_cost_aud` never auto-overrides `cost_per_player_cents`.** Money the host charges is
  not money the host paid; the receipt cannot answer it. Show it as context, offer the
  recompute as a suggestion. host-flow-plan already settled this: *"a silent default is
  hostile"* on money.
- **Venue is the hard case.** `useUpdateGame` deliberately excludes `venue_id`, and joined
  players agreed to a place. If the parsed venue differs from the game's: do **not** offer it as
  a tickable row. Show it as a blocking mismatch — *"This booking is for a different venue. If
  it's the right one, you'll need to cancel this game and post the new one."* Same reasoning as
  the wizard's failure ladder #5: a wrong venue is worse than more taps.
- **Anything that changes for joined players fires a push.** `starts_at` / `duration_hours`
  changes reuse the existing game-change notification path; add a distinct copy variant
  (*"Heads up, the host verified this game against their booking and the time moved 30 min"*)
  because "verified" and "changed" arriving together needs one sentence, not two pushes.
- Guard: refuse a document whose `starts_at_local` is more than **14 days** from the game's
  start. That is a different booking, not a correction.

### 4.3 Add people at creation, kill the count

Replace the `reserved_spots` stepper with a **"Who's coming with you?"** row on the draft card,
above cost.

```
   WHO'S COMING
   ┌──────────────────────────────────────┐
   │ 👑 You                          host │
   │ 🟣 Mia Chen        Smashio · invited │  ← push sent on publish
   │ 🟠 Raj              held · send link │  ← name only, share sheet
   │ ＋ Add someone                        │
   └──────────────────────────────────────┘
   4 more spots open to anyone
```

- One picker, three outcomes, no mode switch: type a name → matching Smashio players appear
  above a **"Just hold a spot for 'Raj'"** row. Pick a player → invite. Pick the hold row →
  named held spot with a share link. Exactly `InvitePicker` + `promptAdd` merged, minus the
  iOS-only `Alert.prompt` (which is a real Android bug today, not just an inconsistency).
- **`reserved_spots` stays as the integer it is.** No schema change: the count is
  `named.length + anonymous`, and the wizard just stops asking for it directly — it becomes a
  derived output of the list. `game_reserved_spots` rows are what change.
- Adding a person bumps `max_players` when the game is otherwise full, with the delta shown
  inline (*"Bumped to 6 so Raj fits"*). Never silently.
- **New RPC** `create_game_with_spots(… , p_spots jsonb[])` — atomic. Today reserved rows can
  only be added post-publish; doing N round-trips after `createGame` leaves a half-built game if
  one fails.
- Post-publish, the same list component renders on `game/[id].tsx`, so "Held for friends" as a
  separate section disappears — see §4.5, it merges into the roster strip.
- "Add someone" also offers **"From your last game"** — the cheap version of Pickleheads' Lists.
  Reads `game_players` from the host's most recent completed game. Real lists (a saved, named,
  reusable squad) are a bigger feature; noted in §7 as a follow-on, not proposed here.

### 4.4 Put the host in the roster

The host is player one. Render them as slot one of the strip, with a crown ring and the label
**You** (or the host's name, for everyone else). Delete the `joinedCount + 1` arithmetic —
the count becomes `filled/max` where filled includes the host by construction.

The separate organiser card above the roster does **not** disappear — it carries reliability
score and is the tap target for the host's profile, which matters to a stranger deciding whether
to join. It stops being the *only* place the host appears, and it renders for the host too
(showing their own reliability, which they currently cannot see from their own game).

### 4.5 The lineup strip

For `max_players ≤ 8`, replace the wrapped avatar grid **and** the "Held for friends" section
with one strip. Above 8, the strip collapses to `●●●●●●●● +4` with a tap-through to the full
list — a 16-slot strip on a 375pt screen is a grid again, and a bad one.

```
        ┌ court 1 ─────────┐   ┌ court 2 ─────────┐
         (👑)  (🦘)  ( M )  ⋮  ( R )   ⌀     ⌀     ⌀
          You  Priya  Mia   ⋮  held   open  open  open
                            ⋮
        3 in · 1 held · 4 open — $6 each
```

**States** — five, each visually distinct at a glance, not by reading:

| State | Render |
|---|---|
| Host | Smashimal bust, solid, **lime crown ring**, caption `You` / first name |
| Joined | Smashimal bust, solid ring |
| Named hold | Initial on the spot's assigned colour, **dashed** ring, small link/person glyph |
| Anonymous hold | Blank silhouette, dashed ring, `held` |
| Open | Outline silhouette, dotted ring at 40% opacity, `open` |

**Design decisions, and why:**

- **Order is stable and meaningful**: host, then joins in join order, then holds, then open.
  Filling reads left→right like a progress bar. Nothing ever re-sorts under a viewer's eyes.
- **Grouped by `players_per_court`** (4 for badminton) with a hairline divider. An 8-player
  2-court game visibly reads as two courts, which is what the host booked and what players will
  actually walk into. This must come from sport config, not a literal 4 — sport is a data
  concern ([AGENTS.md](../AGENTS.md) rules). `courts_booked` decides how many groups.
- **The silhouettes are Smashimals, not generic person glyphs.** 28 shipped busts already exist
  ([avatars-plan](avatars-plan.md)); the open-slot outline should be the *silhouette of a
  Smashimal* — same head shape, empty. That's a brand asset nobody else in the market has, and
  it costs one SVG mask. Coordinate with [smashimals-plan.md](smashimals-plan.md) §props before
  drawing it; do not invent a new character.
- **Every slot is a tap target**, which is what finally makes the strip earn its space:
  filled → player card peek (existing `RosterAvatar` behaviour); held → host names/invites/
  releases; open → host gets the share sheet, non-host gets Join. Today "invite someone into
  the game" is three screens deep.
- **Motion, restrained**: a newly filled slot pops with `SPRING.pop` + `haptics.tap` on realtime
  arrival. The **last** open slot going solid fires `Burst` + `sound.play("sparkle")` — the
  "we're on" moment, reusing the publish stamp's vocabulary. Respects `useReduceMotion`.
- **Copy under the strip replaces three separate counters**: the `Players joined (3/4)` header,
  the `Held for friends (1)` header, and the `2 spots left` chip all collapse into one line.
- Cancelled game → whole strip desaturates rather than disappearing.

Component: `ui/components/LineupStrip.tsx`. Consumed by `game/[id].tsx`, the wizard's draft-card
preview, and — collapsed, non-interactive — by `GameCard` on Discover, where four dots that
show fill state beat the text `2 spots left`.

---

## §5 What else the form should ask (needs sign-off)

Out of MVP scope as written, so flagged not assumed —
[AGENTS.md](../AGENTS.md): *"Don't add scope beyond the MVP spec without asking."* Ordered by
value-per-day.

| Field | Column | Why | Cost |
|---|---|---|---|
| **Note from the host** | `games.notes text` ≤280 | The one field that lets two games at the same venue differ. *"Casual hit, first-timers welcome, I'll bring feathers."* Must go through the `ai-proxy` classify filter that B5 already built. | 0.5 d |
| **Format** | `game_formats` sport-scoped table, FK | social / competitive / drills / doubles rotation. Playtomic's friendly-vs-competitive is the single most-used filter in that app. Sport-scoped table, not an enum — sport is data. | 1 d |
| **Skill range** | `skill_tier_min_id` + `skill_tier_max_id` | A point tier makes an Intermediate host reject Beginner-plus players they'd happily play. Playtomic ships a range. Touches Discover filtering. | 1.5 d |
| **Shuttles** | `games.shuttles text` | Badminton-specific, so it belongs in sport config, not `games`. Nylon vs feather and who pays is a real fight in Sydney comps. | 0.5 d |
| **Visibility** | `games.visibility` public / link-only | OpenSports has three tiers; two is enough. Link-only games don't hit Discover and don't need the location gate. RLS work. | 2 d |
| **Auto-approve** | `games.auto_approve bool` | Join-requests already exist; hosts who don't want to gatekeep can't turn it off. | 0.5 d |
| **Recurrence** | new `game_series` table | Pickleheads' and OpenSports' headline organiser feature, and the thing that turns one-off hosts into weekly ones. Genuinely large — series identity, per-instance edits, cancel-one-vs-all, chat scoping. | own plan doc |

Not proposing: title (venue + time + tier already names it, and a free title field is where
spam lands first), gender preference, age bands, min-players-to-go-ahead.

---

## §6 Schema deltas

Ordered, additive, no destructive migration.

1. `games.duration_hours int` → **`duration_minutes int`**, backfilled `× 60`, check
   `>= 60 and <= 360`, in 15-minute steps. host-flow-plan flagged this and explicitly declined
   to decide it. Deciding: **migrate.** 1.5-hour bookings are the most common badminton block
   in Sydney; rounding publishes an end time later than the booking the receipt proves, which
   breaks the premise of verification. Touches `durationMs`, the price cap
   (`MAX_COST_PER_PLAYER_PER_HOUR` becomes per-minute maths), `calendarFormat.ts`, edit screen.
2. `create_game_with_spots` RPC (§4.3).
3. `game_confirmations` — no shape change. `review_status='pending'` gains real meaning
   (§4.1, §4.2) and needs a queue to be read from; until there is one, it is a flag, and the
   doc should say so rather than implying moderation exists.
4. `ai-proxy` — `application/pdf` allowlisted in `downloadImage`, 15 MB cap, daily spend cap
   already exists and should be re-checked before PDFs (multi-page = more tokens per call).
5. §5 columns only on sign-off.

---

## §7 Phasing

| Phase | Scope | Est. |
|---|---|---|
| **E0** | `LineupStrip` + host in roster (§4.4, §4.5). Self-contained, no schema, biggest visible win. | 2 d |
| **E1** | PDF into parse + camera source + `downloadImage` mime fix (§4.1 part 1). Fixes a live bug. | 1 d |
| **E2** | Draft-card restructure (§3) — one screen, disclosure, live preview, publish always visible. | 3 d |
| **E3** | People-at-creation (§4.3) + `create_game_with_spots`. | 2 d |
| **E4** | Field locking + verified stamp + unlock ladder (§4.1 part 2). | 1.5 d |
| **E5** | Verify-an-existing-game diff flow (§4.2), incl. push copy. | 2.5 d |
| **E6** | `duration_minutes` migration (§6.1). | 1 d |
| **E7** | §5 fields, whichever get signed off. | 0.5–2 d each |

E0 and E1 are independent of everything else and could land this week.

---

## §8 Not doing

- **Recurrence.** Wants its own plan doc; half-building series identity is worse than not
  starting.
- **Saved squads / Pickleheads Lists.** §4.3 ships "from your last game" instead; a real named
  reusable roster is a `host_lists` entity and belongs with clubs
  ([social-plan §7](social-plan.md)).
- **In-app payment.** Out of MVP, and the receipt model exists precisely because we are not in
  the money path.
- **Auto-applying a suggested price.** Standing decision from host-flow-plan. Still standing.
- **Forward-to-email / share extension.** Still deferred, same reasons.
- **Multi-receipt per game.** The manual path stores ≤5 files; only file 0 is ever parsed. That
  stays true — one document is the source of truth, the rest are attachments.
- **A moderation queue for `review_status='pending'`.** Named as a gap, not built here.

## §9 Settled decisions (2026-09-01)

These are answered. Don't re-open them; design and build inside them.

1. **Structure — two steps, then one card.** Step 1 is the receipt-or-manual fork, unchanged in
   function and restyled. Step 2 is the draft card of §3. The six-step stepper is dead. Keeping
   the fork as its own step preserves a progress affordance for first-time hosts without
   reinstating the grind.
2. **Extra fields — all of §5 except recurrence, but out of the way.** Host note, format, skill
   range, shuttles, visibility, auto-approve all ship, behind a single collapsed **"More options"**
   row on the draft card that shows a summary of its own defaults ("Social · Public ·
   Auto-approve · You bring shuttles"). **Every one has a sensible default pre-selected** — a host
   must be able to publish having never opened the row. Fewer clicks is the point, not fewer
   fields. Recurrence still needs its own plan doc.
3. **Locking — high confidence only.** Medium and low stay editable with their provenance tag.
   This is more conservative than §4.1 proposed. The unlock ladder ("Doesn't match my booking?"
   → re-upload or unlock this field) still ships, because a locked wrong value is the worst
   failure in the flow even when it's rare. An unlocked field still publishes verified and sets
   `review_status='pending'`.
4. **A second nudge surface.** §5's collapsed row is the primary home for the extra fields; a
   game whose host note is still empty also gets one lightweight prompt on its own page after
   publish. One prompt, not a campaign.
5. **Lineup strip lives on exactly two surfaces** — the WHO row of the draft card, and the game
   detail screen. Same component. **Not** on Discover/My Games `GameCard`, **not** on the share
   or invite page. Those stay text counters for now.
6. **The strip is the people editor.** Tapping an open slot opens the add-someone picker; there
   is no separate "Who's coming" list row. One object does the whole job on both surfaces.
7. **Open slots are Smashimal head silhouettes** — empty outlines in the shipped busts' head
   shape, not generic person glyphs. Coordinate with [smashimals-plan.md](smashimals-plan.md)
   before drawing; do not invent a new character.
8. **Edit reuses the draft card.** `game/edit/[id].tsx` becomes a mode of the same component:
   venue row locked with its reason, a persistent "players will be notified" line, save instead
   of publish. The separate edit form goes away — create and edit drifting apart is how they got
   inconsistent the first time.
9. **Publish celebration stays, its landing changes.** `PublishStamp` is untouched. The success
   screen it lands on leads with **share and invite**, not a summary and a back button.
10. **Price is suggested, never applied.** Standing decision from host-flow-plan, reconfirmed.
    The row opens on `ceil(total ÷ players)` with the break-even line and waits for the host.
11. **Verify-an-existing-game (§4.2) is out of the design pass.** Still in the build plan at E5;
    it gets its own artboards later, reusing whatever the review rows land on.
12. **`duration_hours` → `duration_minutes`, 15-minute steps.** Confirmed over round-up.

Still genuinely open, decide before E-phase work starts:

- **Verified filter on Discover.** Ship the badge first; hold the filter until there's enough
  verified inventory that the filtered list isn't empty.
- **A moderation queue to read `review_status='pending'`.** Named as a gap in §8, still unowned.

## §10 v3 design build — deviation log (2026-09-03)

Bands 00/03–12 of *SMASHIO v3 — Host a Game* built P1–P7 per the phasing above. Every deviation
from the literal artboards, with why:

1. **Push title em dash.** `gameRescheduledBody`'s "New time — …" violated CLAUDE.md's no-em-dash
   rule; changed to "New time, …" and its test, in `push-dispatch/format.ts`.
2. **"Link sent, not opened" → "Link sent."** No `link_opened_at` tracking exists (defect #1);
   chose the copy change over building open-tracking.
3. **"Link used or lost" host row.** `claim_reserved_spot` burns the token and fills the spot the
   instant it's used, so a claimed link is no longer a hold row at all (defect #2). Only "lost" is
   real — the row offers "Send a new link", not a distinct used-state.
4. **"Duplicate this game" left out of edit's kebab**, per instruction — though `game/[id].tsx`
   already has a working `handleDuplicate` (seeds a rebook draft into the wizard), so the
   "no backend" premise doesn't hold. Worth reconsidering; not added here regardless.
5. **Kebab's "Share this game" uses `share-outline`**, not the design's `refresh-outline` — the
   design's own band 00 icon key maps refresh-outline to "reuse/duplicate", not share, so that
   icon choice contradicts its own legend. Used the app's existing share convention instead.
6. **Edit read-state's WHO "was" value** reads "was N players max" rather than reconstructing a
   full lineup-summary string for the pre-edit state.
7. **One push per save, not a synthesized combined one.** `trigger_notify_game_change` fires
   reschedule OR details-changed, never both (elsif priority) — editing time *and* price together
   sends the reschedule push only; the save bar's preview shows whichever one actually fires.
8. **Hold expiry uses preset chips (2h/4h/pin)**, not a drag slider — no drag primitive exists on
   this screen's controls, and a slider would be new scope beyond band 12e's own ask.
9. **No second join-requests queue built.** `game/[id].tsx`'s existing `JoinRequests` (swipe to
   approve/decline, vetting context, full-game guard) already satisfies band 05's minimal
   queue spec and exceeds it — reconciled to "keep the one that ships", not draw a second.
10. **Skill range (min/max tier) is quiet, not loud.** No trigger fires a push on a skill-tier
    change, so classifying it as loud would promise a notification that never sends.
11. **Cancel-game "reason" field (band 08c) not built.** No `cancellation_reason` column and no
    push copy variant for it exist; out of the backend deltas this pass was scoped to add.

---

Sources:
[Luma — creating an event](https://help.luma.com/p/creating-an-event) ·
[Luma design critique, Pratt IXD 2026](https://ixd.prattsi.org/2026/02/luma-design-critique/) ·
[OpenSports — event setup](https://opensports.net/blog/get-ready-to-launch-your-first-event) ·
[OpenSports — recurring events](https://opensports.net/blog/create-recurring-events-on-opensports) ·
[Pickleheads — creating a session](https://www.pickleheads.com/organize/watch/creating-a-session) ·
[Pickleheads — weekly sessions](https://www.pickleheads.com/guides/how-to-set-up-weekly-sessions) ·
[Playtomic — convert private to public](https://playerhelp.playtomic.com/hc/en-gb/articles/39545442764945-How-to-convert-a-Private-Booking-to-a-Public-Match) ·
[Spond — events](https://www.spond.com/events/) ·
[Partiful overview](https://party.pro/partiful/) ·
[UXPin — progressive disclosure 2026](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/) ·
[IxDF — progressive disclosure](https://ixdf.org/literature/topics/progressive-disclosure) ·
[UserIntuition — trust UX badges](https://www.userintuition.ai/reference-guides/trust-ux-badges-proof-and-the-research-behind-them/) ·
[LogRocket — trust-driven UX](https://blog.logrocket.com/ux-design/trust-driven-ux-examples/)
