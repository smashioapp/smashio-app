# MVP Spec — SMASHIO

Sport: badminton only (data model stays multi-sport ready). Platform: mobile.

## 1. Onboarding

- Sign up: phone/email or social login
- Profile setup: name, photo, sports played, skill level

## 2. Home / Discover

- Nearby games — map or list view
- Map: view events/games as pins, search on map, get directions to event from current location
- Filters: sport, date, skill level
- Actions: "Create a game" / "Join a game"

## 3a. Join a game

- Tap game → details (venue, time, players joined, skill level, cost split)
- Request to join → confirmation → added to game chat/group

## 3b. Create a game

- Fields: sport (badminton), venue, date/time, skill level, max players, cost split
- Verification path A: submit booking confirmation → "verified" badge
- Verification path B: upload booking confirmation → auto-fill fields + verified badge
- Publish → visible to nearby users
- Organizer manages join requests: approve → add to in-app chat; reject → notify player

## 4. Pre-game

- Group chat, joined players only
- Notification: 2 hours before game
- Cancel/leave option, with notice rules — affects reliability score + feedback

## 5. Post-game

- Rate players, mark game completed
- Stats update on profile: games played, sports, rating
- Prompt: rebook / create follow-up game

## Platform & UX principles

- Distribution: iOS/Android app only. Website (smashio.com.au) is marketing + store-link only — no flow works on web, download required for any action
- Map: search on map, directions to event from current location, view events on map (pins/list toggle)
- Group chat: in-app, per-game, joined players only
- AI features: planned, scope TBD (candidates: smart match suggestions, booking-confirmation OCR/auto-fill, chat moderation — not committed)
- Error handling: low-error target, all errors handled gracefully (no raw crashes/dead-ends surfaced to user)
- UX bar: best-in-class booking/join experience, smooth end-to-end, prioritized over feature breadth
- UI direction: CRED-style — dark theme, premium/creative visual design

## Open questions (not yet decided)

> **Amended 2026-09-07 (docs drift audit): four of these five are decided.** They were resolved in
> [backend-plan.md](backend-plan.md) §"Open questions — resolved 2026-08-08" and by work since;
> this list was never updated. Kept in place because later docs quote it.
>
> - **Cost split — decided: per-player price, entered directly.** `e6c55d0` added per-player
>   pricing and `b890b22` made it a free price entry. Not the derived even split described in
>   backend-plan.
> - **Reliability score formula — STILL OPEN.** Shipped as 0–100, `not null default 100`, 100 minus
>   5 per late leave. No-shows and ratings are not inputs yet. This is the one genuinely
>   undecided item here, and [post-game-plan.md](post-game-plan.md) has since added no-show marking,
>   so the data exists.
> - **Verified badge — decided: auto-parse, no manual queue.** `ai-proxy` `mode: 'parse'` reads the
>   uploaded confirmation with Gemini and `reviewStatusFor()` returns verified/rejected. Split into
>   email-verified (profile) and event-verified (game); mobile-verified stays deferred with OTP.
> - **Venue data source — decided twice.** Google Places for host-entered venues (slice 9), then a
>   curated facility directory on top ([venues-plan.md](venues-plan.md)): 56 venues, 37 P1 leads
>   enriched by hand, 51 P2 still queued.
> - **AI features — decided.** Booking-confirmation parsing and post moderation, both through
>   `ai-proxy`, both on Gemini. See [tech-stack.md](tech-stack.md)'s 2026-09-07 amendment.
>
> Two body claims also drifted: §1's "Sign up: phone/email or social login" — **there is no phone
> signup**, it is email + Google + Apple (Apple currently on the hosted-OAuth path, see
> [auth-onboarding-plan.md](auth-onboarding-plan.md) §5). And §4's "Notification: 2 hours before
> game" — there are **two** reminders now, T-24h and T-2h, per
> [notifications-plan.md](notifications-plan.md).

- Cost split mechanics — even split only, or organizer sets shares?
- Reliability score formula — weight of late cancels vs no-shows vs reviews
- Verified badge — manual review of booking confirmation, or OCR auto-parse?
- Venue data source — user-submitted, scraped, or partner-integrated?
- AI features — exact scope not decided (see [docs/tech-stack.md](tech-stack.md))
