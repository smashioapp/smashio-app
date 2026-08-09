# Store Readiness Plan — SMASHIO

Written 2026-08-09, from a full local audit: built + ran the app on Android emulator (SMASHIO_Test, API 35) via `expo run:android`, confirmed welcome → sign-in flow renders and navigates correctly (Not Boring polish intact, Google/Apple/email auth all present), then walked `app.config.js`, `eas.json`, the generated `android/` project, and `expo-doctor` for anything that blocks App Store / Play Store submission.

Fixed in passing: missing `expo-asset` peer dep (required by `expo-audio` — app would crash outside Expo Go without it). Already installed, in `package.json`.

## Blockers — must fix before submitting

- [ ] **No Android submit config.** [eas.json](../ui/eas.json) has `submit.production.ios` only. Add `submit.production.android` with a `serviceAccountKeyPath` (Play Console service account JSON) or `eas submit -p android` has nothing to work with.
- [ ] **Google Maps API key unrestricted.** Flagged by the code's own comment in [app.config.js:57-58](../ui/app.config.js). Key `AIzaSyCfkTj1lK6qi96EkN_bVwLyA3WXbu4DUBA` is live and open in Google Cloud Console — restrict by Android package name + SHA-1 and iOS bundle ID before shipping, or it's quota-drain/abuse bait.
- [ ] **Sentry org/project not configured.** `expo-doctor` and the Gradle build both warn: `Missing config for organization, project`. Falls back to env vars at build time, but crash reporting needs verifying end-to-end before launch — otherwise first prod crashes go unseen.
- [ ] **`SYSTEM_ALERT_WINDOW` permission in the generated manifest.** Present in [android/app/src/main/AndroidManifest.xml](../ui/android/app/src/main/AndroidManifest.xml), almost certainly from expo-dev-client (dev-only overlay bubble). Confirm it drops from the release/production build — if it ships, Play Console requires a special-access-permission justification and may flag the app.
- [ ] **Bundle ID mismatch across platforms.** iOS `com.smashio.app` vs Android `com.ajayaradhya.smashio` ([app.config.js:13,16](../ui/app.config.js)). Not a hard submission blocker (each store only cares about its own value) but inconsistent branding — fix now, changing an Android `applicationId` post-launch means a new listing.

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
