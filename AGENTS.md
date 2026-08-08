# AGENTS.md

Guidance for AI agents working in this repo.

## Project state

UI prototype only. `ui/` is a complete Expo Router app but fully mocked (`ui/lib/mockData.ts`) — no backend exists yet. Tech stack decided (see docs/tech-stack.md) — don't scaffold code unprompted, ask first.

## What this app is

SMASHIO — player-matching app for Australia, badminton first, multi-sport by design. Core action: find/match with players for a game. Not a venue-booking app; venue booking confirmation is just a trust signal. iOS/Android app only — website (smashio.com.au) is marketing + store links only, no in-app functionality on web.

Read [README.md](../README.md), [docs/mvp-spec.md](mvp-spec.md), [docs/business-context.md](business-context.md), [docs/tech-stack.md](tech-stack.md) before proposing features. Backend/integration work: read [docs/backend-plan.md](backend-plan.md) first.

Testing locally: log in with `test@smashio.dev` / `Test1234!` (email/password form, no Google needed) against the hosted project — seeded test accounts + games, see backend-plan.md's "Test data & local login" section.

## Rules

- Sport must stay a config/data concern, not hardcoded — badminton ships first but engine assumes more sports later.
- Don't add scope beyond the MVP spec (docs/mvp-spec.md) without asking.
- Business/legal facts (ABN, ASIC name status) belong in docs/business-context.md — keep updated if they change, don't duplicate elsewhere.
- Stack is decided (docs/tech-stack.md: React Native/Expo + Supabase + Google Maps, chat in-house on Supabase Realtime, AI calls server-side only). Changing it needs explicit user sign-off.
- AI features must go through a server-side proxy — never call the LLM API directly from the client app.
