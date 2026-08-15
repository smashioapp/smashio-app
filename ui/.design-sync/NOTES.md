# design-sync notes — ui/ (SMASHIO app)

## Repo shape

This is an Expo/React Native app (`ui/`), not a published component library —
no `dist/` build, no `main`/`module` export, `package.json` scripts are
`start/android/ios/web` only. Sync runs in `shape: package`, synth-entry mode
(`srcDir: components`), against `ui/components/*.tsx` directly.

## Deliberate scope (first sync, 2026-08-15)

Chose **unstyled shells, floor cards everywhere** over full styled fidelity:

- **No styling.** nativewind (v4) styles `className` at compile time via a
  babel plugin (`nativewind/babel`) run by Metro/Expo — a plain esbuild
  bundle skips that transform entirely, so `className` props are inert here.
  Getting real styled previews would mean forking the bundler to route
  through `babel-preset-expo` + `nativewind/babel` and wiring nativewind's
  web runtime as `cfg.provider` — real engineering, not attempted this pass.
  If that's ever wanted, this is the starting point.
- **No authored preview galleries.** All 52 components ship the converter's
  default floor card (crash-prevention props, real component code) rather
  than curated `.design-sync/previews/<Name>.tsx` compositions. Authoring
  can happen incrementally on any future sync — nothing here blocks it.

## Known render warns (triaged, non-blocking)

Render check flags these `bad`/`thin` — genuinely blank/empty renders, not
crashes. Root cause is the "no styling" choice above (text with no color,
icons with no stroke color, gauges with no fill) — expected, not chased:

- `BackButton`, `DayHeader`, `ReliabilityGauge`, `RollingNumber` — RENDER_BLANK
- `ShuttlecockGlyph` — RENDER_THIN (SVG icon, paints nothing unstyled)

## Forked lib files (`.design-sync/overrides/`, see `cfg.libOverrides` for why)

- **`bundle.mjs`** — esbuild has no built-in `react-native` →
  `react-native-web` resolution. Added `rnWebAliasPlugin` (Node-resolution
  based, not esbuild's own resolver) + `RN_WEB_EXTENSIONS` (`.web.tsx` etc.
  preferred, mirrors Metro's platform resolution). Also added a browser
  runtime shim for globals RN/Metro normally injects that don't exist in a
  plain browser bundle: `process` (RN/Expo code reads far more than
  `NODE_ENV` — `process.platform`, `EXPO_PUBLIC_*` env vars), `__DEV__`
  (set `false`, not `true` — `true` pulls in react-native's own dev-mode HMR
  bootstrap which expects Metro-injected globals and throws), `global` →
  `globalThis`. Plus a `node:async_hooks` shim (expo-font's server-only code
  path; real Node module obviously unavailable in a browser bundle) and
  loader entries for RN asset `require()`s esbuild has no default loader for
  (`.ttf`/`.wav` → dataurl, `.js` → jsx for `@expo/vector-icons`'s untranspiled
  JSX-in-`.js` files).
  - **`EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` placeholders** in the shim are
    the documented `supabase start` local-dev defaults from
    `ui/.env.example` (same value on every machine, not a secret) —
    `lib/supabase.ts` throws at module init if unset, which took down every
    component that transitively imports it (nearly all of them, via
    `lib/session.tsx` etc.). Sentry DSN / Google Maps key stay blank, same
    as `.env.example`'s own defaults.
- **`source-kit.mjs`** — two fixes, both specific to synth-entry mode with
  zero `.d.ts`:
  1. Upstream only runs the derive-from-src component-discovery fallback
     when `!components.length`. With zero `.d.ts`, ANY `componentSrcMap`
     pin (we have one: `GameMap` → `GameMap.web.tsx`) already makes
     `components.length` non-zero from the pin alone, silently skipping
     derivation for every other component. Fixed to derive first, fold
     pins in after.
  2. A `componentSrcMap` pin only relabeled enrichment metadata — it didn't
     stop the barrel (`.pkg-entry.mjs`, `export * from` every file under
     `components/`) from ALSO including whatever file the plain name-match
     heuristic would've picked, running that file's top-level side effects
     regardless. `GameMap.tsx` (real `react-native-maps`, native-only —
     `GameMap.web.tsx` is the repo's own pre-existing web-safe variant)
     was still being bundled and crashing (`codegenNativeComponent is not
     a function`) even though the pin correctly labeled `GameMap.web.tsx`
     for docs/enrichment. Fixed: barrel generation now excludes the
     name-matched default file whenever a pin points elsewhere.
     **Generalizes**: any future `<Name>.web.tsx` pin needs no extra care —
     this fix already covers it.

## Re-sync risks

- The "no styling" and "no authored previews" choices are both easy to
  silently go stale in the wrong direction: a future re-sync with different
  flags/config could accidentally start authoring previews against
  `nativewind`-styled expectations that still won't render (the babel-plugin
  gap above isn't fixed by anything in this config — it needs the bundler
  fork described above, not attempted).
- `.design-sync/overrides/bundle.mjs`'s `EXPO_PUBLIC_*` placeholders will
  silently go stale if `ui/.env.example`'s documented local-dev defaults
  ever change — no automated link between the two.
- `node_modules/ui` junction (self-reference, needed so `PKG_DIR` resolves
  without a real published/workspace-linked package) and
  `.design-sync/node_modules` symlink (converter deps, for the forked
  `bundle.mjs`'s bare `esbuild` import) are both machine-local and
  regenerated — see the fresh-clone setup note in the base skill's
  Troubleshooting section (`ln -sfn`/junction recreation is part of that,
  not automated by any sync script here).
