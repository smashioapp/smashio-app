# Developer guide

Everything the [main README](../README.md) leaves out: environment, Edge Functions, deploying,
store builds, testing, and an index of every plan doc in this folder.

> Working on this repo with an AI agent? [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md)
> hold the current project state and the rules that aren't obvious from the code.

## Environment

| File | Tracked | Used by |
|---|---|---|
| `ui/.env` | yes | `npm start`, `run:ios`, `run:android`, jest, Maestro. Points at the local `supabase start` stack |
| `ui/.env.production` | no (gitignored) | `expo export` and store builds. Hosted project URL and anon key |
| `ui/.env.example` | yes | template with comments on every variable |
| `.env` (repo root) | no | optional, Supabase CLI `env()` substitutions for local Google OAuth (see `.env.example`) |

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | yes | `http://127.0.0.1:54321` locally |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | printed by `supabase start`, same on every machine for local dev |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | no | blank means grey map tiles and no venue search in the Host wizard |
| `EXPO_PUBLIC_SENTRY_DSN` | no | blank disables Sentry |

The brand Map ID is applied on iOS only (`ui/components/GameMap.tsx`); Android renders Google's
default style until an Android-restricted Maps key exists. Restrict production keys by bundle ID
/ package name + SHA-1, and use a separate key per platform rather than loosening one.

## Commands

```bash
# backend
supabase start                  # local stack in Docker
supabase db reset               # replay migrations, then seed.sql
supabase functions serve        # run Edge Functions locally

# app (from ui/)
npm start                       # Expo dev server
npm run ios | npm run android   # native dev build
npx tsc --noEmit                # type check (strict)
npm test                        # jest unit tests
npm run test:e2e                # Maestro flows in ui/.maestro (scripts/e2e.sh)
npm run web                     # quick visual check only, web is not a shipped platform
```

`ui/lib/db.types.ts` mirrors the schema. Regenerate it after a migration instead of editing it by
hand:

```bash
supabase gen types typescript --local > ui/lib/db.types.ts
```

## Edge Functions

| Function | Called by | Secrets |
|---|---|---|
| `ai-proxy` | the app with the user's JWT (`parse` booking confirmations, `attach`, `classify` text), or Postgres with a shared secret (`classify` inside `create_post`, `classify_image` for feed, chat and avatar photos) | `GEMINI_API_KEY`, `AI_PROXY_SERVICE_KEY` |
| `push-dispatch` | Postgres only (`pg_net` trigger / cron) | `PUSH_DISPATCH_KEY` (shared secret, not a JWT) |
| `delete-account` | the app, with the user's JWT | none beyond the defaults |
| `purge-confirmations` | cron, deletes booking confirmations after 7 days | none beyond the defaults |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

```bash
supabase secrets set GEMINI_API_KEY=... PUSH_DISPATCH_KEY=<random> AI_PROXY_SERVICE_KEY=<random>
```

## Deploying the backend

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy ai-proxy push-dispatch delete-account purge-confirmations
```

New functions get no `EXECUTE` for `anon` / `authenticated` by default
(`20260914000400_default_privileges_global_revoke.sql`). Grant explicitly. CI fails if any
`security definer` function in `public` is callable by `PUBLIC`. See
[rpc-exposure-plan.md](rpc-exposure-plan.md).

## CI and releases

| Workflow | Trigger | Does |
|---|---|---|
| [ci.yml](../.github/workflows/ci.yml) | push / PR | type check, Android bundle export, `supabase db reset`, RPC exposure check, jest |
| [build-ios.yml](../.github/workflows/build-ios.yml) | `workflow_dispatch` or published release | prebuild, archive, upload to TestFlight via `fastlane pilot` |
| [build-android.yml](../.github/workflows/build-android.yml) | `workflow_dispatch` (apk or aab) | prebuild, signed Gradle release build |
| [ota-update.yml](../.github/workflows/ota-update.yml) | push to `main` touching `ui/**` | `eas update` to every installed binary |

Store builds run on GitHub Actions, not EAS. EAS is only used for OTA updates, and
`ui/eas.json` is not read by the release path. Build numbers are `GITHUB_RUN_NUMBER + 1000`.

Two things that have bitten before:

- `runtimeVersion` is `appVersion`, so anything merged to `main` under `ui/` reaches current
  testers over OTA before a new store build exists.
- The iOS runner image, the Xcode version and the `expo-modules-jsi` pin are one decision, and
  any lockfile change that moves an `expo-*` package counts as a native change. A green iOS
  build does not prove the app launches. Read
  [store-readiness-plan.md](store-readiness-plan.md) §"iOS runner image / Xcode /
  expo-modules-jsi" before touching any of them.

## Docs index

Plan docs record the diagnosis, the decisions and the "not doing" list for an area. Several
carry dated amendments at the top of a section; where a header and an amendment disagree, the
amendment is current.

**Product and business**

- [mvp-spec.md](mvp-spec.md): MVP feature flow
- [business-context.md](business-context.md): entity, naming, market
- [tech-stack.md](tech-stack.md): stack decisions and rationale
- [short-a-player-plan.md](short-a-player-plan.md): the "short a player" promise, spot alerts, "Court booked" (shipped)
- [short-a-player-ux-plan.md](short-a-player-ux-plan.md): walkthrough fixes for that flow
- [gtm-strategy.md](gtm-strategy.md): go-to-market authority (suburb clusters, venues, group chats)
- [gtm-plan.md](gtm-plan.md): earlier GTM plan and the G1 to G15 gap audit
- [quick-wins.md](quick-wins.md): backlog of small items

**App surfaces**

- [discover-plan.md](discover-plan.md), [map-plan.md](map-plan.md), [discover-map-ux-plan.md](discover-map-ux-plan.md): Discover list and map
- [my-games-plan.md](my-games-plan.md): My Games agenda and host console
- [nav-plan.md](nav-plan.md): bottom nav
- [host-flow-plan.md](host-flow-plan.md), [create-game-plan.md](create-game-plan.md): hosting and the Host wizard
- [chat-plan.md](chat-plan.md): game chat
- [post-game-plan.md](post-game-plan.md): attendance, no-shows, ratings
- [profile-plan.md](profile-plan.md): player card, reputation, settings
- [auth-onboarding-plan.md](auth-onboarding-plan.md): sign-in and setup
- [notifications-plan.md](notifications-plan.md), [notifications-v2-plan.md](notifications-v2-plan.md): push and the activity inbox
- [social-plan.md](social-plan.md): feed, follows, clubs (read §17 first)
- [image-moderation-plan.md](image-moderation-plan.md): Gemini image classifier for feed and chat photos
- [venues-plan.md](venues-plan.md): venue directory

**Design**

- [v2-design-plan.md](v2-design-plan.md): design tokens and type, the source of truth
- [design-brief.md](design-brief.md): per-screen design prompts
- [ux-plan.md](ux-plan.md), [not-boring-plan.md](not-boring-plan.md): motion, haptics, sound
- [avatars-plan.md](avatars-plan.md), [smashimals-plan.md](smashimals-plan.md): avatars, cast, rig
- [../brand/README.md](../brand/README.md): logo master and icon generation

**Platform and web**

- [backend-plan.md](backend-plan.md): backend build plan (read its 2026-09-07 amendment)
- [rpc-exposure-plan.md](rpc-exposure-plan.md): function grants and anonymous exposure
- [store-readiness-plan.md](store-readiness-plan.md): store submission and the iOS build coupling
- [e2e-test-plan.md](e2e-test-plan.md): Maestro flows
- [website-plan.md](website-plan.md), [website-design-brief.md](website-design-brief.md), [home-redesign-plan.md](home-redesign-plan.md): smashio.com.au
