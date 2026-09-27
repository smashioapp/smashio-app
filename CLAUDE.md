# CLAUDE.md

@AGENTS.md

## Commands

Backend (Supabase, local):
```bash
supabase start                        # Postgres/Auth/Realtime/Storage/Edge Functions in Docker
supabase db reset                     # replay supabase/migrations/*.sql, then seed.sql
supabase functions serve              # ai-proxy / push-dispatch / delete-account locally
supabase db push                      # apply migrations to linked hosted project
supabase functions deploy ai-proxy push-dispatch delete-account
supabase gen types typescript --local > ui/lib/db.types.ts   # after any schema-shape migration; don't hand-edit
```

Mobile app (`ui/`):
```bash
npm install
npm start          # Expo dev server
npm run ios | android
npm run web        # experimental preview, not a shipped platform
npx tsc --noEmit   # type check (strict); no lint/test scripts
```

- `ui/.env` is checked in and points at the local `supabase start` stack; no setup needed. Test login: `test@smashio.dev` (password in `supabase/seed.sql`).
- Blank `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` = grey map tiles + no venue search in the wizard.
- Visual check: `npm run web` (`.claude/launch.json` has `smashio-web-alt`, port 8083) in the Browser pane at 375x812. Not a substitute for a real iOS/Android check (no native blur/haptics).

## Architecture

- `ui/` Expo Router app (React Native, TypeScript), the only client. `app/` file-based routes, `components/`, `lib/` (supabase client, `lib/queries/` react-query hooks one file per domain, zustand `store.ts`, `session.tsx`).
- `supabase/migrations/` is the source of truth for DB shape (schema, RLS, RPCs); read before writing queries. `supabase/functions/`: `ai-proxy`, `push-dispatch`, `delete-account` (Deno).
- `website/` static marketing site plus `api/` Vercel functions. `docs/` plan docs.
- State: TanStack Query owns server cache, Zustand owns UI state.
- Data flow: client uses `supabase-js` directly (RLS-enforced) for Postgres/Auth/Realtime/Storage. AI calls, account deletion and push dispatch go through JWT-authed Edge Functions. Chat is Supabase Realtime, no third-party SDK.
- `ai-proxy` runs on Gemini (`gemini-flash-latest`, `GEMINI_API_KEY`), modes `parse` and `classify`. Server-side only, never from the client.
- Discover map is Google Maps (`react-native-maps`) on both platforms with a cloud-styled Map ID, not Apple Maps.
- Sport is config/data, not hardcoded.

## Copy tone (user-facing strings only)

Casual Australian, human, not corporate. Contractions fine, light slang where natural ("no worries", "keen", "sorted"); clarity beats personality. Prefer "Something's gone wrong, give it another go." over "An error has occurred". **Never use em dashes**, use a comma or full stop. Legal text (privacy, terms, account deletion) is accurate first, warm second. Doesn't apply to code comments, logs or dev strings.
