# Tech Stack — SMASHIO

Decided 2026-08-07. Supersedes "tech stack: not decided" notes elsewhere — update those pointers, don't duplicate detail.

## Mobile app

- **Framework**: React Native + Expo (managed workflow, EAS Build/Submit for store releases)
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
