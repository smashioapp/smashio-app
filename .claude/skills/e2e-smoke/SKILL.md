---
name: e2e-smoke
description: Run the Maestro smoke subset (flows tagged `smoke`) on the local Android emulator against the local Supabase stack. Use after UI changes to login, Discover, My Games or the join flow, when the web preview isn't enough proof.
argument-hint: "[--no-reset]"
---
# Maestro smoke run (local Android)

Needs: Docker + `supabase start`, Android SDK with the `Pixel_6_API35` AVD (API 35, not 36+, see the comment at the top of `ui/scripts/e2e.sh`), Maestro in `~/.maestro/bin`.

1. From `ui/`: `E2E_TAGS=smoke bash scripts/e2e.sh` (pass `$ARGUMENTS`, e.g. `--no-reset`, straight through). The script boots the emulator, sets the Sydney geo fix, disables animations, resets the local db (fixture), builds the dev client and runs only flows tagged `smoke`.
2. Smoke flows today: `login-form`, `auth-persists-relaunch`, `discover-load`, `my-games-and-join`, `join-request`. To add one, put `tags: [smoke]` in its header (above `---`).
3. A first run includes a full `expo run:android` build and takes a while; run it in the background and wait for completion rather than polling.
4. Report pass/fail per flow with Maestro's output. On failure, read the failing step and screenshot Maestro saved, fix the cause, rerun that single flow with `maestro test .maestro/<flow>.yaml` before rerunning the subset.

Never run this against the hosted project; `ui/.env` points at local and should stay that way.
