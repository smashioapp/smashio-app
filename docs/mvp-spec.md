# MVP Spec — SMASHIO

Sport: badminton only (data model stays multi-sport ready). Platform: mobile.

## 1. Onboarding

- Sign up: phone/email or social login
- Profile setup: name, photo, sports played, skill level

## 2. Home / Discover

- Nearby games — map or list view
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

## Open questions (not yet decided)

- Cost split mechanics — even split only, or organizer sets shares?
- Reliability score formula — weight of late cancels vs no-shows vs reviews
- Verified badge — manual review of booking confirmation, or OCR auto-parse?
- Venue data source — user-submitted, scraped, or partner-integrated?
- Chat — in-house or third-party (e.g. Stream, Sendbird)?
- Tech stack — not decided
