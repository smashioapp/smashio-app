---
paths:
  - "ui/package.json"
  - "ui/package-lock.json"
  - ".github/workflows/**"
  - "ui/scripts/check-jsi-pin.js"
---
# iOS build / Expo pin

- Before touching the iOS runner image, Xcode version, or the `expo-modules-jsi` pin/patch, read [store-readiness-plan.md](../../docs/store-readiness-plan.md) §"iOS runner image / Xcode / expo-modules-jsi". They're one coupled decision; builds 1077/1079 passed CI then crashed on launch. Green iOS build does not prove the app launches.
- Any `ui/package-lock.json` change that moves `expo`, `expo-modules-core` or any `expo-*` is a native change coupled to the jsi pin (`npm audit fix`, `npm update`, fresh install re-resolving `~` ranges included). Build 1092 crashed this way (`expo-modules-core` 57.0.10 → 57.0.18 vs jsi pin 57.0.5). Diff installed `expo*` versions vs last good build before committing; if any moved, don't commit, or re-decide the pin deliberately.
- `ui/scripts/check-jsi-pin.js` (in `build-ios.yml`, `ota-update.yml`) catches range mismatch only.
- `runtimeVersion` = `appVersion`; a push to `main` touching `ui/**` OTAs to every installed binary before any store build exists. A bad lockfile hits current testers.

## Release pipeline (corrected 2026-09-07)

- iOS: `.github/workflows/build-ios.yml` (`workflow_dispatch` or published release) prebuilds, archives, exports, uploads to TestFlight via `fastlane pilot`.
- Android: `.github/workflows/build-android.yml` (`workflow_dispatch`, apk or aab).
- `ui/eas.json` exists but nothing in the release path reads it. EAS is used only for OTA: `.github/workflows/ota-update.yml` runs `eas update` on every push to `main` touching `ui/**`.
- `ui/.env.production` (gitignored) holds hosted URL/key for real device/store builds; local dev never uses it.
