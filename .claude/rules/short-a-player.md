---
paths:
  - "ui/lib/trust.ts"
  - "ui/components/TrustRow*"
  - "supabase/functions/push-dispatch/**"
  - "ui/lib/queries/alerts.ts"
  - "ui/lib/queries/notifications*.ts"
---
# Short-a-player / spot alerts

Read [docs/short-a-player-plan.md](../../docs/short-a-player-plan.md) (§8 = what shipped, deviations, deploy order) before touching spot alerts, `TrustRow`, `lib/trust.ts`, or `game_preview`.

- Promise: "got a court, short a player? Smashio fills it".
- Player-facing copy says **"Court booked"**, never "Verified". Internal `verification_status` names unchanged.
- Notification type `spot_open` (Android channel `spots`), rides the `alerts` pref, default on.
- `game_preview` returns `open_spots`/`court_booked`; `spots_left` equals `open_spots`.
- Migrations are on hosted; db push before JS merge for new ones.
