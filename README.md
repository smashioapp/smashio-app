# SMASHIO

Player-matching app, Australian market. Playo (India) style, multi-sport engine, badminton first.

Core action: find/match with players for a game (not venue booking — venue is a detail on the game, not the product).

## Status

- ABN registered — sole trader (Individual/Sole Trader subtype)
- Business name "SMASHIO" submitted to ASIC names determination — pending
- Tech stack: decided — see [docs/tech-stack.md](docs/tech-stack.md) (React Native/Expo + Supabase + Google Maps)
- Platform: mobile app only (iOS/Android), no web app
- Website: marketing/info only + store links, at smashio.com.au (not live yet) — no in-app flows on web, download required
- UI direction: CRED-style — dark theme, high creative/premium UX

## Docs

- [docs/mvp-spec.md](docs/mvp-spec.md) — MVP feature flow
- [docs/business-context.md](docs/business-context.md) — entity, naming, market context
- [docs/tech-stack.md](docs/tech-stack.md) — stack decisions

## Scope discipline

Sport engine built generic from day one (sport = config, not hardcode) but badminton only ships in MVP. Don't build multi-sport UI/features until badminton loop proven.
