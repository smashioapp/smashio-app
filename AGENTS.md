# AGENTS.md

Guidance for AI agents working in this repo. Area-specific rules (venues, social, website, post-game, short-a-player, smashimals, supabase migrations, iOS build/deps) live in `.claude/rules/*.md` and load only when you touch matching files. History and dated corrections live in the plan docs, not here.

## Project state

- Backend live in production (Supabase: Postgres/PostGIS, Auth, Realtime, Storage, Edge Functions). All 10 slices shipped; see docs/backend-plan.md but read its 2026-09-07 amendment (nothing is "stubbed" any more; `ai-proxy` runs on **Gemini**, not Anthropic).
- `ui/` is a complete Expo Router app on real data, no mocks. Design authority: docs/v2-design-plan.md (tokens, type) and docs/design-brief.md (v3 per-screen passes).
- Private beta (Sydney): **iOS via TestFlight, Android via Play internal testing** (100-account allowlist, not a public listing; production track unshipped). Android stays internal until further notice; never write copy claiming open Android access. **Public launch target: November 2026, both stores.** Beta metrics before 2026-09-10 are iOS-only.
- Builds: iOS and Android ship from self-managed GitHub Actions, **not EAS**. EAS is only for OTA JS updates.
- Tech stack is decided (docs/tech-stack.md). Don't change it unprompted, ask first.
- Some plan docs still carry a "proposed" header for shipped work. If a doc's header and body disagree, the dated amendment at the top of the section is the current read.

## What this app is

SMASHIO: player-matching app for Australia, badminton first, multi-sport by design. Core action: find/match with players for a game. Not a venue-booking app; booking confirmation is a trust signal only. iOS/Android only. `website/` (smashio.com.au) is marketing, store links and read-only SEO/share pages, **no in-app functionality on web**.

Read before proposing features: [README.md](README.md), [docs/mvp-spec.md](docs/mvp-spec.md), [docs/business-context.md](docs/business-context.md), [docs/tech-stack.md](docs/tech-stack.md). Backend work: [docs/backend-plan.md](docs/backend-plan.md).

## Read the area's plan doc before touching it

| Area | Doc |
|---|---|
| Discover / My Games / bottom nav / map / auth+onboarding | discover-plan, my-games-plan, nav-plan, map-plan, auth-onboarding-plan (diagnosis and "not doing" sections explain why the code looks the way it does) |
| Create game | create-game-plan.md |
| Venues | venues-plan.md (see rules/venues.md) |
| Ratings / capacity / reserved spots | post-game-plan.md (see rules/post-game.md) |
| Spot alerts / trust / `game_preview` | short-a-player-plan.md (see rules/short-a-player.md) |
| Feed / clubs / moderation | social-plan.md, image-moderation-plan.md (see rules/social.md) |
| Website | website-plan.md (see rules/website.md) |
| Smashimals art | smashimals-plan.md |
| Notifications | notifications-plan.md, notifications-v2-plan.md (V2.4 Live Activity held) |
| Store builds | store-readiness-plan.md |
| RPC grants | rpc-exposure-plan.md |
| Security | security-audit-2026-09-11.md (local only, gitignored, not in the public repo) |

## Go-to-market

[docs/gtm-strategy.md](docs/gtm-strategy.md) (2026-09-25) is **the authority** for all GTM work: own the small game ("got a court, short a player"), launch in suburb clusters, grow via venues and group chats, no paid before liquidity, never pitch booking. Read §1-§5 before any marketing/growth/positioning proposal. Launch date, clusters and budget still open (§13). Every new plan doc should say which gtm-strategy section it serves. docs/gtm-plan.md is history plus the G1-G15 gap audit (§3), superseded where they disagree. [docs/quick-wins.md](docs/quick-wins.md) is the unapproved ≤1-day backlog: check it before proposing a small improvement, add to it rather than starting a new doc.

## Testing locally

Log in with `test@smashio.dev`, password in `supabase/seed.sql`. Local dev/e2e run against `supabase start` via `ui/.env`. Hosted testing uses a separate per-person account; never put a hosted credential in docs (backend-plan.md "Test data & local login", security-audit H1).

## Rules

- Sport stays a config/data concern, never hardcoded.
- No scope beyond docs/mvp-spec.md without asking.
- Business/legal facts (ABN, ASIC name status) go in docs/business-context.md only.
- AI features go through a server-side proxy (`ai-proxy`), never from the client.
- New `ui/package-lock.json` changes moving any `expo-*` package are native changes; see rules/ios-build-and-deps.md before committing one.
- New DB functions get no `anon`/`authenticated` EXECUTE by default; see rules/supabase-db.md.
