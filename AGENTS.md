# AGENTS.md

Guidance for AI agents working in this repo.

## Project state

Docs-only stage. No code, no tech stack chosen yet. Don't scaffold code or pick a stack unprompted — ask first.

## What this app is

SMASHIO — player-matching app for Australia, badminton first, multi-sport by design. Core action: find/match with players for a game. Not a venue-booking app; venue booking confirmation is just a trust signal.

Read [README.md](../README.md), [docs/mvp-spec.md](mvp-spec.md), [docs/business-context.md](business-context.md) before proposing features.

## Rules

- Sport must stay a config/data concern, not hardcoded — badminton ships first but engine assumes more sports later.
- Don't add scope beyond the MVP spec (docs/mvp-spec.md) without asking.
- Business/legal facts (ABN, ASIC name status) belong in docs/business-context.md — keep updated if they change, don't duplicate elsewhere.
- No tech stack decision without explicit user sign-off — this is unresolved and load-bearing for all future structure.
