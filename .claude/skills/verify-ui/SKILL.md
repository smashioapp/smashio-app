---
name: verify-ui
description: Visually verify a UI change in the web preview at phone size (375x812), screenshot it and check the console. Use after editing ui/ screens or components.
argument-hint: "[route or screen to check]"
---
# Verify UI in the Browser pane

Needs local backend: `supabase start` (ui/.env already points at it).

1. `preview_start` with name `smashio-web-alt` (port 8083). Reuse if running.
2. `resize_window` preset `mobile` (375x812). Reset to `desktop` when done.
3. Log in if needed: `test@smashio.dev`, password in `supabase/seed.sql`. Email/password works in the pane via scripted DOM events (`form_input` or set value + dispatch `input`/`change`). Google OAuth does not, skip it.
4. Navigate to the changed route (`$ARGUMENTS` if given), exercise the interaction with `computer`/`find`/`read_page`.
5. `read_console_messages` (onlyErrors) and `preview_logs` level error. Any new error = fix before claiming done.
6. `computer` screenshot as proof.

Limits, state them in the report: web is an experimental preview. No native blur, haptics, or real Google Maps tiles when `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is blank (grey map, no venue search). Not a substitute for an iOS/Android check. Also run `cd ui && npx tsc --noEmit`.
