# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Backend (Supabase, local):
```bash
supabase start                        # boots Postgres/Auth/Realtime/Storage/Edge Functions in Docker
supabase db reset                     # replays supabase/migrations/*.sql in order, then seed.sql
supabase functions serve              # serve ai-proxy / push-dispatch / delete-account locally
supabase db push                      # apply migrations to the linked hosted project
supabase functions deploy ai-proxy push-dispatch delete-account
```

Mobile app (`ui/`):
```bash
npm install
npm start          # Expo dev server (scan QR / press i / a)
npm run ios        # open iOS Simulator
npm run android    # open Android emulator
npm run web        # experimental web preview, not a shipped platform
npx tsc --noEmit   # type check (strict mode; no lint/test scripts configured)
```

Visual verification of UI changes: `npm run web` + Browser pane at the mobile viewport preset (375x812) is the fastest way to eyeball a change without a simulator — not a substitute for a real iOS/Android check before shipping, since `web` is unshipped and can diverge (e.g. no native blur/haptics). `.claude/launch.json` has `smashio-web-alt` (port 8083) preconfigured for this.

`ui/.env` is checked in pointing at the local `supabase start` stack — `npm start` / `run:ios` / `run:android` / jest / Maestro e2e all use it, no setup needed. `ui/.env.production` (gitignored) holds the hosted project's URL/key for `eas build`/`expo export` only — real device/store builds always use it, local dev never does. `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` blank = grey map tiles + no venue search in the wizard. Test login: `test@smashio.dev` / `Test1234!` (email/password, no Google needed) — seeded into both the local db (`supabase/seed.sql`) and the hosted project.

Store builds run in **self-managed GitHub Actions, not EAS** (corrected 2026-09-07 — the EAS line here was stale since 2026-08-15). iOS: `.github/workflows/build-ios.yml` (`workflow_dispatch` or a published release) prebuilds, archives, exports and uploads to TestFlight via `fastlane pilot`. Android: `.github/workflows/build-android.yml` (`workflow_dispatch`, apk or aab). `ui/eas.json` still exists but nothing in the release path reads it. **EAS is still used for OTA JS updates** — `.github/workflows/ota-update.yml` runs `eas update` on every push to `main` touching `ui/**`. Before touching the iOS runner image, the Xcode version, or the `expo-modules-jsi` pin, read [store-readiness-plan.md](docs/store-readiness-plan.md) §"iOS runner image / Xcode / expo-modules-jsi".

AI calls go through `supabase/functions/ai-proxy`, which runs on **Google Gemini** (`gemini-flash-latest`, `GEMINI_API_KEY`), not Anthropic — two modes, `parse` (booking confirmations) and `classify` (post moderation). The rule that matters is unchanged: server-side only, never from the client.

## Architecture

```
ui/            Expo Router app (React Native, TypeScript) — the only client
  app/         file-based routes: (tabs) = discover/feed/my-games/profile, game, chat, wizard,
               onboarding, post-game, venue(s), player, post, compose, settings/*, notifications
  components/  shared UI components
  lib/         supabase client, react-query hooks (lib/queries/), zustand store, helpers
supabase/
  migrations/  ordered SQL — schema, RLS, RPCs (source of truth for DB shape; read before writing queries)
  functions/   ai-proxy, push-dispatch, delete-account (Deno Edge Functions)
  seed.sql     local dev seed data
website/       marketing site (smashio.com.au) — static HTML, no build step, plus `api/` Vercel
               serverless functions server-rendering /game/:id, /venue/:slug, /club/:slug,
               /sydney and /sitemap.xml from anon-safe RPCs. Still no app functionality on web.
               docs/website-plan.md is the v2 plan — read its §5 before exposing any new data
               to anonymous callers.
docs/          product/tech/business plan docs — read the relevant one before touching that area
```

State: TanStack Query owns server cache (`ui/lib/queries/*.ts`, one file per domain: games, gamePlayers, messages, profile, ratings, sports, venues, account, alerts, plus achievements, feed, follows, notifications, notificationPrefs, reservedSpots, settings). Zustand (`ui/lib/store.ts`) owns client/UI state. `ui/lib/session.tsx` holds auth session context.

Data flow: client → `supabase-js` for Postgres/Auth/Realtime/Storage directly (RLS-enforced), except AI calls, account deletion, and push dispatch, which go through JWT-authed Edge Functions. Chat is Supabase Realtime channels (no third-party chat SDK). The Discover map is Google Maps (`react-native-maps`) on both platforms with a cloud-styled brand Map ID — not Apple Maps.

Sport is a config/data concern throughout (badminton ships first, schema and query layer assume more sports later) — don't hardcode sport-specific logic outside config.

`ui/lib/db.types.ts` mirrors the Postgres schema; regenerate (`supabase gen types typescript --local > ui/lib/db.types.ts`) rather than hand-edit after a migration changes shape.

## Copy / user-facing text tone

All user-facing strings (screen text, buttons, alerts, errors, empty states, placeholders) should read casually Australian and human, not corporate or robotic. Contractions are fine ("you're", "don't"), light Aussie phrasing where it fits naturally ("no worries", "keen", "reckon", "sorted"), but don't overdo the slang to the point copy gets unclear, clarity beats personality. Avoid stiff phrasing like "An error has occurred" or "Please try again later", prefer plain warm phrasing like "Something's gone wrong, give it another go." Never use em dashes in user-facing text, use a comma or full stop instead. Formal/legal text (privacy, terms, account deletion) stays accurate first, warmed up second. This does not apply to code comments, log messages, or internal/dev-facing strings.
