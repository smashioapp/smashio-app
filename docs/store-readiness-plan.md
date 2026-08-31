# Store Readiness Plan — SMASHIO

Written 2026-08-09, from a full local audit: built + ran the app on Android emulator (SMASHIO_Test, API 35) via `expo run:android`, confirmed welcome → sign-in flow renders and navigates correctly (Not Boring polish intact, Google/Apple/email auth all present), then walked `app.config.js`, `eas.json`, the generated `android/` project, and `expo-doctor` for anything that blocks App Store / Play Store submission.

Fixed in passing: missing `expo-asset` peer dep (required by `expo-audio` — app would crash outside Expo Go without it). Already installed, in `package.json`.

## Blockers — must fix before submitting

- [ ] **No Android release path.** Play Console isn't set up and the `ANDROID_*` signing secrets don't exist, so [build-android.yml](../.github/workflows/build-android.yml) can't get past the keystore step. Needs a Play Console account, an upload keystore, and those secrets. (The old `eas.json` `submit.production.android` gap is moot now that releases go through GitHub Actions — see [Release pipeline](#release-pipeline--updated-2026-08-15).)
- [x] ~~**Google Maps API key unrestricted, and publicly leaked.**~~ Old key (flagged by the code's own comment in [app.config.js:57-58](../ui/app.config.js)) was committed in plaintext and got flagged in a public GitHub issue. Rotated 2026-08-18 — new key set in `ui/.env` (gitignored) and the GitHub Actions secret. Still TODO: delete old key from GCP Console, and restrict new key by Android package name + SHA-1 and iOS bundle ID before shipping.
- [x] ~~**Sentry is inert — both halves missing.**~~ Fixed 2026-08-24, confirmed 2026-08-31. `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` both exist as GitHub secrets; `SENTRY_ORG`/`SENTRY_PROJECT` are hardcoded in [build-ios.yml](../.github/workflows/build-ios.yml) and [build-android.yml](../.github/workflows/build-android.yml). No `SENTRY_DISABLE_AUTO_UPLOAD` remains in either workflow, so symbol upload runs.
- [ ] **`SYSTEM_ALERT_WINDOW` permission in the generated manifest.** Present in [android/app/src/main/AndroidManifest.xml](../ui/android/app/src/main/AndroidManifest.xml), almost certainly from expo-dev-client (dev-only overlay bubble). Confirm it drops from the release/production build — if it ships, Play Console requires a special-access-permission justification and may flag the app.
- [x] ~~**Bundle ID mismatch across platforms.**~~ Resolved — both platforms now use `com.smashio.app` ([app.config.js](../ui/app.config.js) `ios.bundleIdentifier` and `android.package`). Verified 2026-08-15.

## Release pipeline — updated 2026-08-15

**iOS ships from GitHub Actions, not EAS.** [.github/workflows/build-ios.yml](../.github/workflows/build-ios.yml) prebuilds, archives, exports, and uploads to TestFlight via `fastlane pilot`. First green run uploaded build 1019 and it installed on a real device.

Signing is now self-managed, which changes the recovery story:

- The distribution certificate and its private key are **held locally by the user**, outside this repo. EAS previously held the key on Expo's servers, so when the project moved off EAS that key was unrecoverable and a fresh certificate had to be issued.
- Losing the local key means regenerating certificate *and* provisioning profile from scratch — a profile embeds a specific certificate, so replacing one forces replacing the other.
- Certificate revocation is invisible to `security find-identity` (macOS soft-fails revocation checks) but hard-fails in `xcodebuild`. To check a certificate directly: `openssl ocsp -issuer <wwdr>.pem -cert <cert>.pem -url http://ocsp.apple.com/ocsp03-wwdrg305 -header "Host=ocsp.apple.com" -noverify`.
- Build numbers are offset `+1000` from `GITHUB_RUN_NUMBER` in both build workflows. The EAS era reached build 17, and Apple and Play both require each upload to be strictly higher than the last. The offset is computed in a shell step because GitHub Actions expressions have no arithmetic operators.

Android has no Play Console setup and no `ANDROID_*` secrets, so [build-android.yml](../.github/workflows/build-android.yml) cannot succeed yet — it builds artifacts only and has never run in CI.

## Fixed 2026-08-12 — account deletion

Play's User Data policy (enforced since April 2024) requires both halves for any app with accounts. Both now exist:

- **In-app** — Profile tab → **Delete account** → [ui/app/delete-account.tsx](../ui/app/delete-account.tsx). Two-step confirm (screen, then a destructive `Alert`), spells out what goes and what stays, and warns with a live count when the user is hosting upcoming games.
- **Web** — [website/delete-account.html](../website/delete-account.html), now leading with the in-app path. This is the URL to paste into the Play Console **Data deletion** field.
- **Server** — [supabase/functions/delete-account/index.ts](../supabase/functions/delete-account/index.ts) (JWT-authed, service role, deletes only the caller) over `public.delete_account` in [20260812000200_account_deletion.sql](../supabase/migrations/20260812000200_account_deletion.sql). Upcoming hosted games are cancelled and the joined players pushed; the profile row survives as a scrubbed tombstone so other players' chat and finished games stay readable.

**Deployed to production (`ajbsvsfwjfeofvjuhzrw`) 2026-08-12** — `db push` (this migration plus the two pending My Games M1 ones) and `functions deploy delete-account`. Verified live end-to-end against two disposable accounts: profile scrubbed to a tombstone (`display_name = 'Deleted user'`, photo/suburb null, score 100, `deleted_at` stamped), satellite rows gone, auth user deleted, the old JWT 401s, and unauthenticated calls 401 at the gateway.

Still to do, in the consoles:

- [ ] Paste `https://smashio.com.au/delete-account.html` into the Play Console **Data deletion** field.
- [ ] Answer App Store Connect's account-deletion question with the same URL.
- [ ] Three throwaway tombstone rows from the live test sit in `profiles` (`63e63b09…`, `576359a3…`, `9fa3b5c5…`). Harmless — no auth user, no games — but clear them next time the table is touched.

Found while testing 2026-08-15, fixed same day, confirmed live 2026-08-31: **`service_role` had no PostgREST table grants on this project** — every `/rest/v1/<table>` call as service_role returned 403 `permission denied`. `delete-account` was unaffected (it only calls a function granted to `service_role`), but `ai-proxy` and two branches of `push-dispatch` read tables that way and were silently failing in production. Fixed by [20260815000400_service_role_grants.sql](../supabase/migrations/20260815000400_service_role_grants.sql) — `supabase migration list` confirms it's applied on the remote project.

## Verified good

- Icons: `icon.png` is 1024×1024, no alpha channel (App Store compliant). Android adaptive icon (foreground/background/monochrome) and all notification-icon densities present and wired in the manifest.
- Permission strings (location, photos) present and user-facing descriptive, via `expo-location` / `expo-image-picker` plugin config.
- Apple sign-in implemented via Supabase OAuth (web-based, [lib/auth.ts:52](../ui/lib/auth.ts)) — satisfies App Store Guideline 4.8 (must offer Sign in with Apple if offering Google) without needing the native `expo-apple-authentication` SDK.
- `versionCode 1` / `versionName "1.0.0"` — fine defaults for a first submission.

## Can't verify from repo — do in the store consoles

- [ ] Play Console **Data Safety** form — declare what's collected (location, email, photos) and why.
- [ ] App Store Connect **App Privacy** nutrition label — same data categories, Apple's format.
- [ ] Privacy policy + support URLs for both listings (not in-app config, pure store metadata).
- [x] Booking-confirmation photos are sent to **Google Gemini** (`gemini-flash-latest`, see
      `supabase/functions/ai-proxy/index.ts`) for parsing, and stored for up to 7 days after the
      game completes (`purge-confirmations-cron` — `supabase/migrations/20260815000600_purge_confirmations_cron.sql`).
      `website/privacy.html` updated 2026-08-31 to disclose this (What we collect / Who we share
      it with / Data retention sections). Store console answers still need to be pasted in by
      hand — ready-to-paste copy below.

  **Play Console → Data Safety** (paste as-is):
  - Data type: **Photos**
  - Collected: **Yes**
  - Shared: **Yes** — with Google Gemini, for processing only (not for advertising or any purpose
    outside the app's function).
  - Purpose: **App functionality** — "Used to auto-fill game details (venue, time, cost) from a
    booking confirmation screenshot the host uploads."
  - Is data processing ephemeral: **No** (the photo itself persists up to 7 days, so answer No —
    Play's "ephemeral" checkbox is for data never written to disk/DB, which doesn't apply here).
  - Data retention: **Yes, can request deletion earlier** is not applicable; use "Data deleted
    after X" → **7 days**, and add a comment: "Photo is auto-deleted 7 days after the game
    completes. The extracted booking details (venue, time, cost) are retained as part of normal
    game history."
  - Is this data required or optional: **Optional** — hosts can fill in game details manually
    instead of uploading a confirmation.

  **App Store Connect → App Privacy nutrition label** (paste as-is):
  - Data type: **Photos or Videos**
  - Used to Track You: **No**
  - Linked to You: **Yes** (linked to the host's account/game)
  - Purpose: **App Functionality**
  - Third-party disclosure note (in the "Data Use" description field, optional but recommended):
    "Booking confirmation photos are sent to Google Gemini for one-time parsing to auto-fill game
    details. The photo is deleted 7 days after the game ends; the extracted text (venue, time,
    cost) is kept as part of the game's history."

## Next session — pick up here

1. Restrict the Maps API key (Google Cloud Console: package name + SHA-1 for Android, bundle ID for iOS).
2. Add `submit.production.android` to `eas.json` (needs a Play Console service account key).
3. Confirm `SYSTEM_ALERT_WINDOW` doesn't survive into a release build — check via `eas build --profile production` or a local release Gradle build, not just the debug manifest read here.
4. Decide whether to reconcile the iOS/Android bundle IDs before first submission.
5. Wire Sentry org/project so crash reporting is live pre-launch.
