# AGENTS.md

Guidance for AI agents working in this repo.

## Project state

Backend is fully built and live in production (Supabase — Postgres/PostGIS, Auth, Realtime, Storage, Edge Functions; see docs/backend-plan.md, all 10 slices shipped). `ui/` is a complete Expo Router app wired to real data — no mocked data remains. Major UI rebuilds (Discover, My Games, bottom nav, Discover map) are shipped; see docs/discover-plan.md, docs/my-games-plan.md, docs/nav-plan.md, docs/map-plan.md. App is in private beta (Sydney, iOS via TestFlight, Android added in batches). Tech stack decided (see docs/tech-stack.md) — don't change it unprompted, ask first.

## What this app is

SMASHIO — player-matching app for Australia, badminton first, multi-sport by design. Core action: find/match with players for a game. Not a venue-booking app; venue booking confirmation is just a trust signal. iOS/Android app only — website (smashio.com.au, `website/`) is marketing + store links only, no in-app functionality on web.

Read [README.md](../README.md), [docs/mvp-spec.md](mvp-spec.md), [docs/business-context.md](business-context.md), [docs/tech-stack.md](tech-stack.md) before proposing features. Backend/integration work: read [docs/backend-plan.md](backend-plan.md) first. Before touching Discover, My Games, the bottom nav, or the map, read that area's plan doc (discover-plan.md / my-games-plan.md / nav-plan.md / map-plan.md) — the diagnosis and "not doing" sections explain why the code looks the way it does.

Proposed, not yet approved: [docs/venues-plan.md](venues-plan.md) (facility directory — amenities, pricing, venue detail screen) and [docs/social-plan.md](social-plan.md) (follows, feed, Q&A). Both are beyond the MVP spec and need explicit sign-off before any app code or migration lands. No schema change has been made for either.

The venues-plan §3 discovery sweep HAS been run (2026-08-15) — `scripts/venues/` + `data/venues/`, results in [data/venues/SWEEP-FINDINGS.md](../data/venues/SWEEP-FINDINGS.md). Read it before touching venue data: it found that `seed.sql`'s "NBC Homebush" is stale, that `venues.google_place_id` uniqueness does not stop duplicate venues (NULL place_id on the 8 seeded rows), and that venue matching must never merge on proximity alone.

Testing locally: log in with `test@smashio.dev` / `Test1234!` (email/password form, no Google needed) against the hosted project — seeded test accounts + games, see backend-plan.md's "Test data & local login" section.

## Rules

- Sport must stay a config/data concern, not hardcoded — badminton ships first but engine assumes more sports later.
- Don't add scope beyond the MVP spec (docs/mvp-spec.md) without asking.
- Business/legal facts (ABN, ASIC name status) belong in docs/business-context.md — keep updated if they change, don't duplicate elsewhere.
- Stack is decided (docs/tech-stack.md: React Native/Expo + Supabase + Google Maps, chat in-house on Supabase Realtime, AI calls server-side only). Changing it needs explicit user sign-off.
- AI features must go through a server-side proxy — never call the LLM API directly from the client app.
