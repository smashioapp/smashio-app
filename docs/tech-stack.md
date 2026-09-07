# Tech Stack — SMASHIO

Decided 2026-08-07. Supersedes "tech stack: not decided" notes elsewhere — update those pointers, don't duplicate detail.

> **Amended 2026-09-07 (docs drift audit).** Four entries below went stale. The decisions
> themselves stand; these are corrections of fact, not changes of direction.
>
> 1. **AI provider is Google Gemini, not Anthropic.** `supabase/functions/ai-proxy/index.ts` calls
>    `generativelanguage.googleapis.com` with `GEMINI_API_KEY` on the `gemini-flash-latest`
>    **alias** — swapped in `071531e` (2026-08-15); the alias rather than a pinned version because
>    `2338911` fixed a production outage when `gemini-2.5-flash` was retired. There is no
>    `ANTHROPIC_API_KEY` in use anywhere. The *rule* under "AI features" — server-side only, key
>    never on the client — is unchanged and still enforced.
> 2. **AI feature scope is no longer TBD.** Shipped: booking-confirmation parsing
>    ([host-flow-plan.md](host-flow-plan.md), `f830a36`, `ai-proxy` `mode: 'parse'`) and post text
>    moderation ([social-plan.md](social-plan.md) B5, `ade2a78`, `mode: 'classify'` +
>    `20260901070000_server_side_moderation.sql`, enforced server-side after a client-only bypass
>    was found). "Smart match suggestions" was never built. Avatar and game-cover art are also
>    AI-generated but **offline** — `scripts/avatars/`, `scripts/smashimals/` produce bundled PNGs
>    in `ui/assets/`; nothing calls a model at runtime for them.
> 3. **Analytics is decided: PostHog.** `posthog-react-native` in `ui/package.json`,
>    `ui/lib/analytics.ts`, gated on `EXPO_PUBLIC_POSTHOG_KEY`. Shipped `4c658e9` (2026-08-31),
>    closing [gtm-plan.md](gtm-plan.md) G1 and [quick-wins.md](quick-wins.md) §1.4.
> 4. **Website framework is decided by default: static HTML on Vercel, plus serverless
>    functions.** No bundler, no build step, but `website/api/` now holds Node serverless functions
>    that server-render `/game/:id`, `/venue/:slug`, `/club/:slug`, `/sydney` and `/sitemap.xml`
>    from anon-safe RPCs (gtm-plan G3, G11, social-plan C0). "No in-app functionality on web" still
>    holds — nothing there lets you join or host — but "static site" is no longer the whole story.
>
> One item in "Mobile app" is right and worth not re-breaking: **iOS and Android both build in
> self-managed GitHub Actions, not EAS.** README.md's "App store builds" section and CLAUDE.md's
> "Store builds go through EAS" line were both still wrong on 2026-09-07 and are annotated there.
> EAS is still used for **OTA JS updates** (`eas update`, `.github/workflows/ota-update.yml`).

## Mobile app

- **Framework**: React Native + Expo (managed workflow; `expo prebuild` + GitHub Actions for store releases — see [store-readiness-plan.md](store-readiness-plan.md#release-pipeline--updated-2026-08-15). EAS Build/Submit was the original plan and is no longer used for iOS)
- **Language**: TypeScript
- **Navigation**: Expo Router
- **Styling/UI**: NativeWind (Tailwind for RN) + Reanimated + Moti for motion — dark theme first-class, CRED-style polish target
- **State**: TanStack Query (server state/cache) + Zustand (client/UI state)
- **Push notifications**: Expo Push → FCM (Android) / APNs (iOS)
- **Crash/error tracking**: Sentry (RN) — supports low-error/graceful-handling bar

## Backend

- **BaaS**: Supabase — Postgres (+ PostGIS for geo queries: nearby games, distance sort), Auth, Realtime, Storage (profile photos, booking confirmation uploads)
- **Group chat**: built in-house on Supabase Realtime (Postgres `messages` table + Realtime channels per game), not a 3rd-party chat SDK — chosen over Stream to keep single vendor + cost down; accept more custom build work for typing/read-receipts/offline sync
- **AI features**: server-side only — Supabase Edge Function (or small Node service) proxies calls to Anthropic API. Never call LLM directly from client; key stays server-side. Exact feature scope still TBD (see mvp-spec open questions)

## Maps

- **Provider**: Google Maps
- **Mobile SDK**: react-native-maps (Google provider)
- **Directions**: Google Directions API — current location → event
- **Search**: Google Places API (map search)
- Cost note: Directions/Places billed per call — cache/debounce on client, revisit if usage scales

## Website (smashio.com.au)

- Marketing/info only, no in-app functionality — static site, framework not yet decided (low priority vs app)
- Store links (App Store / Google Play) only CTA

## Open / not yet decided

- Exact AI feature scope (candidates: smart match suggestions, booking-confirmation OCR/auto-fill, chat moderation)
- Website framework (Next.js static export vs simple static site — low priority)
- Analytics tool (PostHog vs Amplitude vs none for MVP)
- OCR approach for booking-confirmation verified badge (if pursued)
