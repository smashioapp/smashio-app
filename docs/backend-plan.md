# Backend Plan — SMASHIO

Written 2026-08-07. Covers building the Supabase backend and replacing the mocked UI prototype with real data.

Stack is already decided in [tech-stack.md](tech-stack.md) — this doc is the *how*, not a re-decision.

## Starting point

- `ui/` — complete Expo Router prototype, all screens built, **100% mocked**. Data comes from `ui/lib/mockData.ts`; all state (including chat and ratings) lives in `ui/lib/store.ts` (Zustand).
- No backend code exists. No Supabase project provisioned.
- Every screen in the MVP spec has a UI: onboarding (3 steps), discover, my-games, chat list + thread, game detail, create wizard, post-game.

## Decisions made 2026-08-07

| Decision | Choice | Why |
|---|---|---|
| Auth for MVP | Email + Google + Apple | Supabase Auth native, no per-message cost. Apple sign-in is App Store mandatory anyway. Phone OTP deferred (needs SMS provider + AU sender ID + per-SMS billing). |
| Repo layout | Keep `ui/`, add `supabase/` at root | No tooling churn, `.claude/launch.json` and existing paths stay valid. Monorepo restructure only if a second app appears. |
| Integration order | Vertical slices | Each slice ships one flow end-to-end and deletes its mock data. First working flow lands early instead of after a full schema build. |

## Target repo layout

```
smashio-app/
  ui/                      # Expo app (unchanged location)
    lib/supabase.ts        # new — client singleton
    lib/db.types.ts        # new — generated, do not hand-edit
    lib/queries/           # new — TanStack Query hooks, one file per domain
  supabase/
    config.toml
    migrations/            # timestamped SQL, forward-only
    functions/             # edge functions (Deno)
    seed.sql               # dev seed: sports, tiers, venues, test users
  docs/
```

## Data model

Sport stays **data, not code** (AGENTS.md rule). Badminton is one row.

### Reference tables

- `sports` — `id`, `slug`, `name`, `is_active`
- `skill_tiers` — `id`, `sport_id`, `slug`, `label`, `ordinal`. Tiers are per-sport; badminton seeds Beginner/Intermediate/Advanced/Pro. Tier *colors* stay client-side in `ui/lib/theme.ts`.

### Core tables

- `profiles` — `id` (FK `auth.users`), `display_name`, `photo_path`, `home_suburb`, `home_point geography(Point,4326)`, `reliability_score`, `created_at`
- `profile_sports` — `profile_id`, `sport_id`, `skill_tier_id` (a user has a skill level *per sport*)
- `venues` — `id`, `name`, `suburb`, `state`, `address`, `location geography(Point,4326)`, `google_place_id`, `source` (`user` | `places` | `partner`)
- `games` — `id`, `sport_id`, `venue_id`, `organizer_id`, `starts_at timestamptz`, `ends_at`, `court_label`, `skill_tier_id`, `max_players`, `cost_total_cents`, `status` (`published` | `cancelled` | `completed`), `verification_status` (`none` | `pending` | `verified`), `created_at`
- `game_players` — PK (`game_id`, `profile_id`), `status` (`requested` | `approved` | `rejected` | `left` | `removed`), `requested_at`, `decided_at`
- `game_confirmations` — booking-confirmation uploads: `game_id`, `storage_path`, `uploaded_by`, `parsed` jsonb, `review_status`
- `messages` — `id`, `game_id`, `sender_id`, `body`, `created_at`, `deleted_at`
- `message_reads` — `game_id`, `profile_id`, `last_read_at` (drives unread badge on chat tab)
- `ratings` — `game_id`, `rater_id`, `ratee_id`, `stars`, unique on all three
- `push_tokens` — `profile_id`, `expo_token`, `platform`, `updated_at`

Money in **integer cents**, never float. Times in `timestamptz`, formatting is client-side — the prototype's `date: "Sat, 8 Aug"` / `time: "7:00–9:00 PM"` strings are display artifacts and die with the mock data.

### Views / functions

- View `games_public` — game joined to venue + tier + `approved_count`, so the client never counts rows itself.
- RPC `nearby_games(lat, lng, radius_m, sport_slug, from_ts, to_ts, tier_slugs[])` → rows + `distance_m`. Backs the discover list and map. GIST index on `venues.location`.
- RPC `decide_join_request(game_id, profile_id, approve bool)` — `SECURITY DEFINER`, takes a row lock on the game, re-checks capacity inside the transaction, then flips status. Prevents two simultaneous approvals overfilling a game. This is a DB function, not an edge function — cheaper and atomic.
- RPC `leave_game(game_id)` — records the leave and its notice window (feeds reliability score).

### Cost split

MVP: even split, derived (`cost_total_cents / max_players`), matching the prototype's `perPlayerCost`. Organizer-set shares stays an open question in the MVP spec — schema stores the total only, so adding a `game_player_shares` table later is additive.

## Security (RLS)

RLS on **every** table, no exceptions.

- `profiles` — public read of display fields, self-write only.
- `games` — read: anyone authenticated (discover is public within the app). Write/update: organizer only. No client-side status transitions to `completed`.
- `game_players` — insert own row with `status='requested'` only. Update restricted to the RPC. Read: organizer + members of that game.
- `messages` — read/insert only if caller is an **approved** player on that game. Enforced by a `SECURITY DEFINER` helper `is_approved_player(game_id, uid)` used in the policy, so joins don't recurse into RLS.
- `ratings` — insert only after game `status='completed'`, only rater = self, only for co-players of that game.
- Storage buckets: `avatars` (public read, self-write path `{uid}/…`), `confirmations` (private, organizer + reviewer read).

Service-role key never ships to the client. Anon key + RLS is the client's entire access surface.

## Edge functions

Only where the DB can't do it:

- `ai-proxy` — the sole path to the Anthropic API. Auth-gated, rate-limited per user. `ANTHROPIC_API_KEY` lives in function secrets. Hard rule from AGENTS.md: the client never calls the LLM.
- `push-dispatch` — sends Expo push. Invoked by DB webhook (new message, join decision) and by cron.
- `ocr-confirmation` — deferred. Only if the verified-badge open question resolves to auto-parse.

## Scheduled jobs (`pg_cron`)

- Every 5 min: games starting in ~2 hours → enqueue reminder push (MVP spec §4).
- Hourly: games past `ends_at` → `status='completed'`, unlock rating flow.
- Nightly: recompute `reliability_score` from late cancels / no-shows / ratings. Formula is still an open question — ship a placeholder, isolated in one SQL function so it can change without touching anything else.

## Client integration

New deps in `ui/`: `@supabase/supabase-js`, `@tanstack/react-query`, `expo-secure-store`, `expo-image-picker`, `expo-notifications`, `react-native-maps`, `@sentry/react-native`.

**State split** — this is the core refactor:

- **TanStack Query** owns all server state: games, players, profile, messages, ratings.
- **Zustand (`store.ts`) shrinks to UI-only state**: `discoverView`, `activeFilter`, `myGamesTab`, and the create-game `wizard` draft. `chatMessages`, `ratings`, `hasOnboarded`, `name`/`suburb`/`skill` all move out — session and profile come from Supabase.
- Types come from `supabase gen types typescript` into `lib/db.types.ts`. Never hand-edited.

## Build slices

Each slice ends with: migration applied, RLS policies written, UI wired, that slice's mock data deleted, flow verified on device.

| # | Slice | Delivers |
|---|---|---|
| 0 | Foundation | Supabase project + local CLI, `supabase/` scaffold, PostGIS enabled, `supabase.ts` client, session provider, generated types, Sentry. No UI change. |
| 1 | Auth + onboarding | Email/Google/Apple sign-in, `profiles` + `profile_sports`, avatar upload to Storage. Wires `onboarding/*` and the `index.tsx` gate. Kills `hasOnboarded`/`name`/`skill` from the store. |
| 2 | Venues + discover list | `venues`, `games`, `nearby_games` RPC, seed venues. `discover.tsx` list view + filters on real data. Kills `GAMES`/`VENUES` mocks. |
| 3 | Create game | Wizard writes a real game; confirmation upload → `pending` verification. Kills `DATES`/`TIMES` mocks. |
| 4 | Join + organizer | Request to join, organizer approve/reject via `decide_join_request`, `my-games.tsx` all three tabs real. Kills `HOSTING`/`PAST`. |
| 5 | Chat | `messages` + Realtime channel per game, unread via `message_reads`. Kills `CHAT_SEED` and the store's chat slice. |
| 6 | Post-game | Auto-complete cron, ratings write, profile stats. Kills the store's `ratings` slice — mock data fully gone after this. |
| 7 | Map | `react-native-maps` pins from `nearby_games`, Places search, Directions deep-link. Debounce/cache calls — both APIs bill per request. |
| 8 | Push | `push_tokens`, `push-dispatch`, 2-hour reminder, join-decision and new-message notifications. |
| 9 | AI | `ai-proxy` + whichever feature scope is chosen. Blocked on the open question in mvp-spec.md. |

Slices 0–6 are the MVP loop. 7–8 are required for ship quality. 9 is optional for v1.

## Environment & secrets

- App (`EXPO_PUBLIC_*`, safe to bundle): Supabase URL, anon key, Google Maps API keys — **restrict Maps keys by bundle ID / SHA-1 before first release**.
- Server only (Supabase function secrets, never in the repo): service-role key, `ANTHROPIC_API_KEY`, Expo access token.
- Two Supabase projects: `dev` and `prod`. Migrations promote dev → prod; prod is never hand-edited in the dashboard.

## Open questions blocking parts of this plan

Carried from [mvp-spec.md](mvp-spec.md), unresolved:

1. Reliability score formula — slice 6 ships a placeholder.
2. Verified badge: manual review vs OCR — decides whether `ocr-confirmation` gets built.
3. Venue data source: user-submitted vs Places-backed vs partner — slice 2 seeds manually, so this can be answered late.
4. AI feature scope — blocks slice 9 entirely.
