# Host Flow Plan — receipt-first hosting

Status: proposed, 2026-08-15. Covers `ui/app/wizard.tsx`, `supabase/functions/ai-proxy`,
the `confirmations` bucket and `game_confirmations`.

Prereq for whoever implements the LLM call: read the `claude-api` skill before writing the
Anthropic request — model ids, structured-output shape and pricing move, don't write it from memory.

## Diagnosis

Hosting today is five screens of typing (venue search → date/time chips → level + players +
courts + duration → price → confirmation upload). Every one of those facts already exists, in
order, on a booking confirmation the host is holding when they open the app. We ask them to
re-key it, then ask them to upload the receipt anyway.

The receipt is at the **end** of the wizard (step 4) purely because of an implementation
accident: the storage bucket path is `{game_id}/filename` and its RLS checks
`games.organizer_id` ([20260807000900_confirmations_storage.sql:12](../supabase/migrations/20260807000900_confirmations_storage.sql:12)),
so the game must exist before a byte can be uploaded. `ai-proxy` inherits the same assumption —
it requires `game_id` in the request body and 403s without it. Nothing about the *product* wants
the receipt last; the schema put it there.

Second accident: `ai-proxy` is a stub. It ignores the file, returns
`{stub: true, confidence: 0.92}`, and unconditionally sets `verification_status='verified'`.
`game_confirmations.parsed jsonb` has never held a real value. `ANTHROPIC_API_KEY` is already
provisioned as a function secret and unused.

Restating what hosts are: they are **not** booking a court through us. They already booked and
paid. They are selling spare slots to cut their own cost. So the receipt is not a formality at
the end of a creation flow — it is the source document the whole flow is transcribing.

## Prior art

| App | Pattern | What we take |
|---|---|---|
| Expensify SmartScan | snap → OCR → land on an editable draft, never auto-submit | the review step is mandatory, not a nicety |
| split-trip (OSS) | merge only into fields the user hasn't typed; banner names what was auto-filled and is dismissible | per-field "from your confirmation" tag, cleared on edit |
| TripIt | forward to `plans@tripit.com`, Inbox Sync, Pro turns photos/PDFs into plans | forward-to-email is the only zero-friction path for true email confirmations — deferred, see §Not doing |
| SlatePlanner | keeps the source PDF attached to the created event | the original stays the trust artifact, not a throwaway |
| Claude Vision practice | strict JSON schema via tool use, explicit `confidence` field gating low-confidence to human review, Haiku tier for bulk extraction | exactly our shape |

Common thread: **extraction never decides anything.** It pre-fills, then a human confirms. We
follow that, with one deliberate exception noted in §Verification.

## Target flow

New step 0, ahead of everything:

```
        ┌─────────────────────────────────┐
        │  Have a booking confirmation?   │
        │  [ Upload a photo ]             │
        │  I'll type it in instead →      │
        └─────────────────────────────────┘
                 │                    │
            (receipt)              (manual)
                 ▼                    ▼
        parse (2–5s)          existing 5-step wizard
                 ▼                    unchanged
        ┌─────────────────────────────────┐
        │ REVIEW — here's what we read    │
        │ [receipt thumbnail]             │
        │ Venue    Olympic Park  ·tagged  │
        │ When     Thu 21 Aug, 8:00pm     │
        │ For      2 hours · 2 courts     │
        │ You paid $44.00                 │
        └─────────────────────────────────┘
                 ▼
        Level + max players     ← not on any receipt
                 ▼
        Price per player        ← prefilled from $44 ÷ players
                 ▼
        Publish (already verified)
```

Five steps become three. The two remaining questions are the two a receipt genuinely cannot
answer — who this game is *for* (skill tier, headcount) and what the host wants to *charge*.

### Manual path is untouched

"I'll type it in" drops into today's wizard exactly as it is, receipt upload still available at
step 4. No regression risk for hosts who don't have a photo handy. Receipt-first is an
accelerator, never a gate.

## What gets extracted

Single Claude call, strict tool schema, one tool `record_booking`:

```jsonc
{
  "is_booking_confirmation": true,      // false → not a receipt, bail politely
  "venue_name":        "Sydney Olympic Park Sports Halls",
  "venue_address":     "Olympic Blvd, Sydney Olympic Park NSW 2127",
  "starts_at_local":   "2026-08-21T20:00",   // venue-local, no zone suffix
  "ends_at_local":     "2026-08-21T22:00",
  "courts":            2,
  "court_labels":      ["Court 3", "Court 4"],
  "total_cost_aud":    44.00,
  "booking_reference": "SOP-88213",
  "confidence":        "high"                // high | medium | low
}
```

Every field nullable except `is_booking_confirmation` and `confidence`. A partial parse is the
**normal** case, not an error — fill what came back, ask the rest as ordinary questions.

Prompt must pin: Australian date order (DD/MM), venue-local time, and today's date passed in as
context so "Thu 21st" resolves.

**Implemented 2026-08-15 on Gemini (2.5 Flash / `gemini-flash-latest`), not Claude Haiku as
originally specced above.** No funded Anthropic Console account for this project; Gemini's free
tier (Google AI Studio) covers this workload at zero cost via `GEMINI_API_KEY`. Same tool-call
shape (`record_booking`, forced function call), same untrusted-input framing, same
`is_booking_confirmation`/`confidence` gate — only the wire format differs (OpenAPI-style schema,
`functionDeclarations` instead of `tools`). See `supabase/functions/ai-proxy/index.ts` for the
actual request/response shape if re-porting to Claude later.

**The image is untrusted input.** Text inside a receipt is data, never instruction. Structured
output already bounds the blast radius to bad field values, and the host reviews every one
before publish — but the system prompt says so explicitly regardless.

### Cost / price suggestion

`total_cost_aud` is the highest-value field and the reason the price step stops being a guess.
After the host picks max players, the price step opens on `ceil(total ÷ players)` with a line
reading *"Your booking was $44. At 8 players that's $6 each — you'd cover it."* Host is free to
go higher or lower; the existing `duration_hours × $20` cap still binds
([games_cost_per_player_cents_check](../supabase/migrations/20260814000000_courts_hours_perplayer_price.sql)).

Never auto-apply a price. Money is the one field where a silent default is hostile.

## Backend changes

### 1. Uploads before a game exists

`game_confirmations.game_id` becomes **nullable**, plus a `claimed_at timestamptz`. Draft
uploads land at `drafts/{auth.uid()}/{confirmation_id}.jpg`; a new storage policy grants
authenticated users full access under their own `drafts/{uid}/` prefix. The existing
organizer-scoped policy for the `{game_id}/` prefix stays — the upload-from-hosting-card path
([useUploadConfirmation](../ui/lib/queries/games.ts:442)) still uses it and must not regress.

On publish, the row is claimed in place — `game_id` set, `claimed_at` stamped — rather than
moving the storage object. Moving blobs mid-publish is a failure point that buys nothing; the
read policy gains a second arm for `uploaded_by = auth.uid()`.

Claiming is server-side only (service role, after checking `uploaded_by = auth.uid()` and that
the game is the caller's). No client-facing update policy on the table.

### 2. `ai-proxy` grows two modes

- `{ mode: 'parse', storage_path }` — no `game_id`. Downloads, calls Claude, inserts
  `game_confirmations` with `game_id = null`, returns `{ confirmation_id, parsed }`.
- `{ mode: 'attach', confirmation_id, game_id }` — verifies ownership of both, sets `game_id`,
  flips `games.verification_status`.
- Legacy `{ game_id, storage_path }` body keeps working unchanged, so the hosting-card path is
  untouched.

Rate limits: keep the existing 5/min, **add a daily cap** — parse now costs real money per call,
5/min forever does not bound spend. Client downscales to ~1600px long edge before upload
(today it only sets `quality: 0.8`), which cuts both upload time and image tokens.

### 3. Two crons, reusing the `pg_cron` → `pg_net` → edge function pattern

Same shape as [dispatch-game-reminders](../supabase/migrations/20260808000500_push_dispatch.sql:139).
A new `purge-confirmations` function does the deleting — dropping rows out of `storage.objects`
from SQL is not a reliable way to free the underlying blob.

- **Orphan sweep**, hourly: `game_id is null and created_at < now() - 24h` → delete object + row.
  A host who bailed mid-wizard leaves nothing behind.
- **Retention purge**, daily: confirmations whose game is `completed` and `ends_at < now() - 7d`
  → delete the storage object, null `storage_path`, keep `parsed` and `review_status`.
  Receipts carry the host's full name, email, sometimes card last-4 and a home address; holding
  them forever is not defensible in a privacy policy. The 7-day tail leaves room for disputes.

Privacy policy and the store-listing data-safety answers need updating to match — receipts are
processed by a third-party model provider and retained for a bounded window. Flag before
next submission ([store-readiness-plan.md](store-readiness-plan.md)).

## Venue resolution

Parse returns a venue *string*; `games.venue_id` is a NOT NULL FK. Bridge with the existing
Places autocomplete ([lib/places.ts](../ui/lib/places.ts)) — feed it `venue_name` (plus suburb
from `venue_address` when present), take the top prediction, run the existing
`getPlaceDetails` → `useUpsertPlaceVenue` path.

Show it as a resolved card with a plain **"Not this one? Change"** next to it. Zero results, or
a top prediction that doesn't share a token with the parsed name → don't guess: drop into the
normal venue search step with the query prefilled. A wrong venue is worse than one more tap,
because venue is deliberately non-editable after publish
([useUpdateGame comment](../ui/lib/queries/games.ts:252)).

## Date/time fidelity — needs its own pass

The wizard's pickers are 4 date chips (`dateOptions`) and 6 fixed `TIME_OPTIONS`
([lib/schedule.ts](../ui/lib/schedule.ts)). A receipt reading "Thu 21 Aug, 8:30pm" maps to
neither — it may be more than 4 days out, and 8:30pm isn't an option.

**Do not snap to the nearest chip.** Snapping silently publishes a game at a time that differs
from the booking the receipt proves, which breaks the premise of verification and, more
concretely, sends players to a court at the wrong hour.

Instead: a parsed datetime is a first-class value. Inject it into both option lists as a
pre-selected chip (`Thu 21 Aug`, `8:30 PM`), leaving the standard options alongside it. Host can
override to a standard chip; the parsed one stays available.

**Open — needs a decision, not in this plan's scope:** `games.duration_hours` is an `int`. A 1.5-hour
booking is common in badminton and currently cannot be represented. Options are round up (and
publish an end time later than the real booking), or migrate to `duration_minutes`. Rounding is
the cheap answer and is wrong for exactly the sessions hosts most often sell into. Flagging, not
deciding.

## Verification

Decision: **receipt present = verified**, matching today's stub behaviour. A parseable
confirmation naming a venue and a future date is the trust signal. No new failure state, and no
punishing a host who corrects a bad OCR read.

Consequences accepted for v1, worth revisiting once there's abuse to look at:

- A stale or borrowed receipt verifies. Cheap mitigation later: SHA-256 the image, reject exact
  re-uploads across games.
- Host may edit parsed venue/date after prefill, so "verified" can drift from the document.
  Later: when parsed venue ≠ selected venue, or parsed date ≠ game date, keep showing verified
  but set `review_status='pending'` for a manual queue. The column already exists and already
  has the three states.
- `is_booking_confirmation: false` does **not** verify. A photo of a wall is not a trust signal.

## Failure ladder

Every branch lands the host in a working flow. None dead-ends.

1. **Not a booking confirmation** → *"That doesn't look like a court booking. Want to type it in?"*
   → manual path, draft discarded.
2. **Parse errored or timed out** → *"Couldn't read that one. Your photo's saved — type the
   details and we'll still verify."* → manual path, receipt stays attached, still verifies.
3. **Partial parse** → not an error. Prefill what returned; the rest are ordinary questions.
4. **`confidence: "low"`** → land on the review step with every field styled as unanswered and
   focused, rather than presented as read facts.
5. **Venue unresolvable** → venue search step, query prefilled.
6. **Parsed date is in the past** → surface it, force an explicit pick. `isSlotBookable`'s
   15-minute lead-time buffer already covers the near-miss case.

## Review step details

- Receipt thumbnail pinned at the top, tappable to zoom. This is what makes "did we read it
  right?" answerable in one glance.
- One row per field: label, value, and a small **"from your confirmation"** tag.
- Editing a row clears its tag, so provenance stays visible and a later
  parsed-vs-actual comparison has something to compare against.
- Null / low-confidence rows render as questions, not as blanks with a tag.

## Phasing

| Phase | Scope |
|---|---|
| **P0 — backend** | nullable `game_id` + `claimed_at`, `drafts/{uid}/` storage policy, `ai-proxy` parse/attach split, real Claude call with strict schema, orphan + retention crons, `purge-confirmations` function, daily spend cap |
| **P1 — wizard** | step 0 upload choice, review step, shortened question flow, price suggestion, venue resolution, full failure ladder |
| **P2 — datetime** | injected parsed date/time chips; resolve the `duration_hours` int question |
| **P3 — privacy** | privacy policy + store data-safety copy for third-party processing and retention |

P0 ships behind no flag — it's additive and the legacy body shape keeps working, so the existing
step-4 upload silently gains real parsing before any UI moves.

## Not doing (v1)

- **PDF attachments.** The chosen input is photo/screenshot only. A screenshot of a confirmation
  email covers most of the email case; a PDF attachment does not. The boundary is drawn so this
  is a small drop-in later — Claude accepts PDFs natively, so the delta is
  `expo-document-picker` plus a content-type branch, no parse-side rework.
- **iOS/Android share sheet** ("Share to SMASHIO" from Mail). Best UX for real email
  confirmations, but needs `expo-share-extension`, a config plugin, and a fresh native build.
- **Forward-to-email** (`host@smashio.com.au`, TripIt's model). Needs inbound email infra plus
  sender-to-profile matching, and sender matching is spoofable.
- **Auto-applying a suggested price.** Suggested, never set.
- **Snapping parsed times to existing chips.** See §Date/time fidelity.
- **Multi-receipt / recurring bookings.** One receipt, one game.
