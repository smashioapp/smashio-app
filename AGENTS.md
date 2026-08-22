# AGENTS.md

Guidance for AI agents working in this repo.

## Project state

Backend is fully built and live in production (Supabase — Postgres/PostGIS, Auth, Realtime, Storage, Edge Functions; see docs/backend-plan.md, all 10 slices shipped). `ui/` is a complete Expo Router app wired to real data — no mocked data remains. Major UI rebuilds (Discover, My Games, bottom nav, Discover map, auth/onboarding) are shipped; see docs/discover-plan.md, docs/my-games-plan.md, docs/nav-plan.md, docs/map-plan.md, docs/auth-onboarding-plan.md. App is in private beta (Sydney, iOS via TestFlight, Android added in batches). Tech stack decided (see docs/tech-stack.md) — don't change it unprompted, ask first.

## What this app is

SMASHIO — player-matching app for Australia, badminton first, multi-sport by design. Core action: find/match with players for a game. Not a venue-booking app; venue booking confirmation is just a trust signal. iOS/Android app only — website (smashio.com.au, `website/`) is marketing + store links only, no in-app functionality on web.

Read [README.md](../README.md), [docs/mvp-spec.md](mvp-spec.md), [docs/business-context.md](business-context.md), [docs/tech-stack.md](tech-stack.md) before proposing features. Backend/integration work: read [docs/backend-plan.md](backend-plan.md) first. Before touching Discover, My Games, the bottom nav, the map, or auth/onboarding, read that area's plan doc (discover-plan.md / my-games-plan.md / nav-plan.md / map-plan.md / auth-onboarding-plan.md) — the diagnosis and "not doing" sections explain why the code looks the way it does.

[docs/venues-plan.md](venues-plan.md) (facility directory — amenities, pricing, venue detail screen) got explicit sign-off 2026-08-15 and A1-A6(P1) are live: schema, `venue_detail`/`venues_near` RPCs, `ui/app/venue/[id].tsx`, and all 37 P1 leads are enriched (56 venues total, up from the original 8-row seed). The 51-venue P2 queue is still unenriched — see venues-plan.md §8. [docs/social-plan.md](social-plan.md) is still proposed, not approved — beyond the MVP spec, needs explicit sign-off before any app code or migration lands.

The venues-plan §3 discovery sweep HAS been run (2026-08-15) — `scripts/venues/` + `data/venues/`, results in [data/venues/SWEEP-FINDINGS.md](../data/venues/SWEEP-FINDINGS.md). Read it before touching venue data: it found that `seed.sql`'s "NBC Homebush" is stale, that `venues.google_place_id` uniqueness does not stop duplicate venues (NULL place_id on the 8 seeded rows), and that venue matching must never merge on proximity alone.

Testing locally: log in with `test@smashio.dev` / `Test1234!` (email/password form, no Google needed). Local dev/e2e run against the local `supabase start` db by default (`ui/.env`, seeded by `supabase/seed.sql`) — the same account also exists on the hosted project with bot accounts + games for manual hosted testing, see backend-plan.md's "Test data & local login" section.

## Rules

- Sport must stay a config/data concern, not hardcoded — badminton ships first but engine assumes more sports later.
- Don't add scope beyond the MVP spec (docs/mvp-spec.md) without asking.
- Business/legal facts (ABN, ASIC name status) belong in docs/business-context.md — keep updated if they change, don't duplicate elsewhere.
- Stack is decided (docs/tech-stack.md: React Native/Expo + Supabase + Google Maps, chat in-house on Supabase Realtime, AI calls server-side only). Changing it needs explicit user sign-off.
- AI features must go through a server-side proxy — never call the LLM API directly from the client app.
