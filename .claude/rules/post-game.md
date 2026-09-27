---
paths:
  - "ui/app/post-game/**"
  - "ui/lib/queries/ratings.ts"
  - "ui/lib/queries/gamePlayers.ts"
  - "ui/lib/queries/reservedSpots.ts"
---
# Post-game / ratings / capacity

Read [docs/post-game-plan.md](../../docs/post-game-plan.md) before touching `ratings`, `rating_tags`, `game_players`, `games.reserved_spots`, or capacity math (diagnosis lists six ways the old flow broke).

- Host occupies one of `max_players`.
- Reserved spots can be named/invited/claimed.
- Host marks no-shows.
- Ratings carry player/host dimension plus an explicit skill vote.
- Ratee-side rating reads are aggregate-only.
