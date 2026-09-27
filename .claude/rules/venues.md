---
paths:
  - "ui/app/venue/**"
  - "ui/app/venues/**"
  - "ui/lib/queries/venues.ts"
  - "scripts/venues/**"
  - "data/venues/**"
---
# Venues

- Read [docs/venues-plan.md](../../docs/venues-plan.md) first (A1-A6 live; §8 lists what's held: amenity-filter UI A4, photo moderation UI A5, 238 untriaged P4 leads).
- Read [data/venues/SWEEP-FINDINGS.md](../../data/venues/SWEEP-FINDINGS.md) before touching venue data. `seed.sql`'s "NBC Homebush" is stale; `google_place_id` uniqueness does not stop duplicates (NULL on the 8 seeded rows); never merge venues on proximity alone.
- Directory is exactly **75 venues**, all slugged (confirmed by direct query 2026-09-12). "56" and "~98" anywhere in docs are wrong/stale.
