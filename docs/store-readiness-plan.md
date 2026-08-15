# Store Readiness Plan — SMASHIO

Written 2026-08-09, from a full local audit: built + ran the app on Android emulator (SMASHIO_Test, API 35) via `expo run:android`, confirmed welcome → sign-in flow renders and navigates correctly (Not Boring polish intact, Google/Apple/email auth all present), then walked `app.config.js`, `eas.json`, the generated `android/` project, and `expo-doctor` for anything that blocks App Store / Play Store submission.

Fixed in passing: missing `expo-asset` peer dep (required by `expo-audio` — app would crash outside Expo Go without it). Already installed, in `package.json`.

## Blockers — must fix before submitting

- [ ] **No Android release path.** Play Console isn't set up and the `ANDROID_*` signing secrets don't exist, so [build-android.yml](../.github/workflows/build-android.yml) can't get past the keystore step. Needs a Play Console account, an upload keystore, and those secrets. (The old `eas.json` `submit.production.android` gap is moot now that releases go through GitHub Actions — see [Release pipeline](#release-pipeline--updated-2026-08-15).)
- [ ] **Google Maps API key unrestricted.** Flagged by the code's own comment in [app.config.js:57-58](../ui/app.config.js). Key `AIzaSyCfkTj1lK6qi96EkN_bVwLyA3WXbu4DUBA` is live and open in Google Cloud Console — restrict by Android package name + SHA-1 and iOS bundle ID before shipping, or it's quota-drain/abuse bait.
- [ ] **Sentry is inert — both halves missing.** Two separate gaps, confirmed 2026-08-15. (1) `EXPO_PUBLIC_SENTRY_DSN` does not exist as a GitHub secret, so release builds ship with an empty DSN and report nothing at runtime. (2) No `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`, so `sentry-cli`'s debug-symbol upload failed the whole archive until it was disabled via `SENTRY_DISABLE_AUTO_UPLOAD` in both build workflows. Until both are fixed the `@sentry/react-native` plugin is pure build cost, and any crash that does get reported comes back unsymbolicated. Remove the `SENTRY_DISABLE_AUTO_UPLOAD` env var once the upload secrets exist.
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

Found while testing, unrelated and unfixed: **`service_role` has no PostgREST table grants on this project** — every `/rest/v1/<table>` call as service_role returns 403 `permission denied`. `delete-account` is unaffected (it only calls a function granted to `service_role`), but `ai-proxy` and two branches of `push-dispatch` read tables that way and are silently failing in production. See the follow-up task.

## Verified good

- Icons: `icon.png` is 1024×1024, no alpha channel (App Store compliant). Android adaptive icon (foreground/background/monochrome) and all notification-icon densities present and wired in the manifest.
- Permission strings (location, photos) present and user-facing descriptive, via `expo-location` / `expo-image-picker` plugin config.
- Apple sign-in implemented via Supabase OAuth (web-based, [lib/auth.ts:52](../ui/lib/auth.ts)) — satisfies App Store Guideline 4.8 (must offer Sign in with Apple if offering Google) without needing the native `expo-apple-authentication` SDK.
- `versionCode 1` / `versionName "1.0.0"` — fine defaults for a first submission.

## Can't verify from repo — do in the store consoles

- [ ] Play Console **Data Safety** form — declare what's collected (location, email, photos) and why.
- [ ] App Store Connect **App Privacy** nutrition label — same data categories, Apple's format.
- [ ] Privacy policy + support URLs for both listings (not in-app config, pure store metadata).

## Next session — pick up here

1. Restrict the Maps API key (Google Cloud Console: package name + SHA-1 for Android, bundle ID for iOS).
2. Add `submit.production.android` to `eas.json` (needs a Play Console service account key).
3. Confirm `SYSTEM_ALERT_WINDOW` doesn't survive into a release build — check via `eas build --profile production` or a local release Gradle build, not just the debug manifest read here.
4. Decide whether to reconcile the iOS/Android bundle IDs before first submission.
5. Wire Sentry org/project so crash reporting is live pre-launch.
