---
name: release-check
description: Pre-release / pre-push check for the Expo app: jsi pin, lockfile native drift, OTA blast radius, which store build is live. Use before pushing ui/ changes to main or triggering a store build.
---
# Release check (read-only)

Background: `.claude/rules/ios-build-and-deps.md` and `docs/store-readiness-plan.md` §"iOS runner image / Xcode / expo-modules-jsi". Builds 1077/1079/1092 crashed on launch after CI went green, so green is not proof.

1. **jsi pin.**
   ```bash
   cd ui && node scripts/check-jsi-pin.js
   ```
   Needs `npm ci` state. Necessary, not sufficient (range check only).
2. **Native drift.** `git diff origin/main -- ui/package.json ui/package-lock.json`. Any move of `expo`, `expo-modules-core`, `expo-modules-jsi` or any `expo-*` is a native change: do not commit, or re-decide the pin deliberately. `npm audit fix` / `npm update` / fresh install count.
3. **OTA blast radius.** A push to `main` touching `ui/**` (excluding `ui/ios`, `ui/android`) runs `ota-update.yml` and publishes `eas update` to every installed binary with the same `runtimeVersion` (= `appVersion`, currently in `ui/app.config.js`). List the files that would ship: `git diff --stat origin/main -- ui`. Flag anything that needs a schema/function not yet on hosted (db push and function deploy must land first), or any native change (would break installed binaries).
4. **Which build is live.**
   ```bash
   gh run list --workflow build-ios.yml --limit 5
   gh run list --workflow build-android.yml --limit 5
   gh run list --workflow ota-update.yml --limit 5
   ```
   Report latest iOS (TestFlight) and Android (Play internal) build number/date, and last OTA. `versionCode` comes from `BUILD_NUMBER` in app.config.js. Android is internal-only; never imply public access.
5. **Verdict:** safe to push / hold, with the reason. Don't push or trigger builds yourself.
