#!/usr/bin/env bash
# Boots the local Android emulator if needed, installs+launches the dev build,
# then runs the Maestro flows in .maestro/. Run from ui/ (npm run test:e2e).
set -euo pipefail

# AVD is API 35, not API 37/36 — Maestro's inputText hangs ~10s/keystroke on API 36+
# dev clients (splash-dismissal animation never signals complete, maestro/#2718, still
# open/unfixed as of PR #3334 draft). Animation scale 0 removes the rest of Maestro's
# animation-idle waits. GPU is swiftshader (software), not host: -gpu host under Windows'
# WHPX backend intermittently stalls the renderer after a clearState relaunch — app never
# gets past a black frame (JS thread parked pre-bootstrap, no crash, no logcat output) —
# confirmed by 3 stress-run clean passes on swiftshader vs. repeated hangs on host.
AVD_NAME="${AVD_NAME:-Pixel_6_API35}"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$LOCALAPPDATA/Android/Sdk}}"
export ANDROID_HOME="$ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_SDK"
export PATH="$PATH:$HOME/.maestro/bin:$ANDROID_SDK/platform-tools:$ANDROID_SDK/emulator"

# Seeded test account (see CLAUDE.md) — read by lib/session.tsx to auto sign-in on
# __DEV__ launch so Maestro flows don't type credentials at all. Override by exporting
# these yourself (e.g. from .env.local) before calling this script.
export EXPO_PUBLIC_E2E_EMAIL="${EXPO_PUBLIC_E2E_EMAIL:-test@smashio.dev}"
export EXPO_PUBLIC_E2E_PASSWORD="${EXPO_PUBLIC_E2E_PASSWORD:-Test1234!}"

# gradlew resolves the SDK from android/local.properties on Windows if ANDROID_HOME
# isn't inherited by the spawned process — write it so the build doesn't depend on env.
if [ -d android ] && [ ! -f android/local.properties ]; then
  echo "sdk.dir=$(cygpath -m "$ANDROID_SDK" 2>/dev/null || echo "$ANDROID_SDK")" > android/local.properties
fi

if ! adb devices | grep -q "device$"; then
  echo "No emulator running — booting $AVD_NAME..."
  emulator -avd "$AVD_NAME" -gpu swiftshader_indirect -no-boot-anim > /tmp/emulator.log 2>&1 &
  adb wait-for-device
  echo "Waiting for boot to finish..."
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    sleep 2
  done
  sleep 5
fi

echo "Disabling animations (removes Maestro animation-idle stalls)..."
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

echo "Installing + launching dev build..."
npx expo run:android

echo "Running Maestro flows..."
maestro test .maestro
