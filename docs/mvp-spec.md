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

- Cost split mechanics — even split only, or organizer sets shares?
- Reliability score formula — weight of late cancels vs no-shows vs reviews
- Verified badge — manual review of booking confirmation, or OCR auto-parse?
- Venue data source — user-submitted, scraped, or partner-integrated?
- AI features — exact scope not decided (see [docs/tech-stack.md](tech-stack.md))
