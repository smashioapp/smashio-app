# Auth & Onboarding Plan — SMASHIO

Written 2026-08-22. **Status: shipped (P0–P4), pending external console config (P2/P3 native providers).** Scope: the launch → sign-in → profile-setup sequence only — [`ui/app/onboarding/`](../ui/app/onboarding/), [`ui/lib/auth.ts`](../ui/lib/auth.ts), the routing gate at [`ui/app/index.tsx`](../ui/app/index.tsx), and the location bootstrap in [`ui/lib/location.ts`](../ui/lib/location.ts). Native only, dark only, tokens unchanged.

This is the surface [v2-design-plan.md](v2-design-plan.md) explicitly excluded (§9: "No restyle of … onboarding"). It is now the last unredesigned screen set, and it carried a real bug.

---

## 1. Audit — what was wrong

| # | Defect | Where it lived | Consequence |
|---|---|---|---|
| 1 | **Existing users forced back through profile setup** | `onboarding/login.tsx:45,58,71` pushed `/onboarding/profile-photo` unconditionally after any successful auth; `lib/session.tsx:40` did the same on web | A returning user with a complete profile walked the whole wizard on every sign-in — and `profile-photo.tsx:16` seeded the name from OAuth metadata rather than the profile row, so their saved name looked blank. `profile-skill.tsx:28` then re-upserted their sport. The gate at `index.tsx:14` already computed `onboarded` correctly and was simply never consulted. |
| 2 | **The landing/login split was fake** | `onboarding/index.tsx:32` — both "Get Started" and "I already have an account" called the same `goNext()` | Two screens, one destination. The second screen threw away every brand cue the first one established. |
| 3 | **iOS consent dialog on every social sign-in** | `lib/auth.ts:39,67` — `WebBrowser.openAuthSessionAsync` | "Smashio Wants to Use `<project>.supabase.co` to Sign In" is `ASWebAuthenticationSession`'s alert. Unavoidable on hosted OAuth; it makes a first-party app read as a third-party redirect. |
| 4 | **Provider buttons had the least visual weight on the screen** | `login.tsx:9-30` — two identical `surfaceAlt` pills, no marks | Google and Apple, the paths most users take, looked less actionable than a disabled "Continue". |
| 5 | **Suburb was typed** | `profile-photo.tsx:102-112` | Free-text `e.g. Bondi Junction NSW` into `profiles.home_suburb`, when the device already knows and `lib/location.ts:49` already reverse-geocodes for the Discover header. |
| 6 | **Multi-sport chips in a badminton-only app** | `profile-skill.tsx:55` — hardcoded `["Pickleball · soon", "Tennis · soon"]` | Off-message, and not driven by the `sports` table it sat next to. |
| 7 | **Two setup screens for four fields** | `profile-photo.tsx` + `profile-skill.tsx` | Only one of those fields (skill) is something the app can't derive. |
| 8 | **Location asked cold** | `lib/location.ts:15`, inside `useUserLocation`'s mount effect | The OS dialog fired silently on first Discover mount with no explainer and no denial recovery. A permission prompt is a one-shot. |
| 9 | **The label + input pair copy-pasted six times** | `login.tsx:101,117`, `profile-photo.tsx:98,110`, `profile-edit.tsx:118,135` | Same className, same inline style, no shared component. |

---

## 2. Research — how the good ones do it

- **The landing screen is the auth screen.** Strava, Hinge and Playtomic do not ship a hero screen whose only job is a button to a second screen.
- **Social-first, email demoted behind a disclosure.** Email-first layouts are a hangover from web signup.
- **Provider buttons are full-bleed and high-contrast**, distinct from form fields.
- **Auth resolves to a route decision, never a fixed route.** Known users are never re-onboarded.
- **Permission pre-prompts you control**, then the OS dialog.
- **Progressive profiling** — collect only what gates the core loop.

Constraint worth recording: **Apple's button is not restylable.** The HIG ships fixed types and styles; only `cornerRadius` is ours. Guideline 4.8 also requires Sign in with Apple wherever Google is offered ([store-readiness-plan.md](store-readiness-plan.md) §50).

---

## 3. What shipped

**P0 — routing.** All post-auth navigation now goes to `/` and lets [`app/index.tsx`](../ui/app/index.tsx) decide: no session → landing, session without a profile → `/onboarding/setup`, onboarded → Discover. `profile-skill`'s duplicate `consumePendingGame()` is gone — the gate has owned the deferred shared-game resume all along.

**P1 — merged auth screen.** `onboarding/login.tsx` is deleted; its job moved into [`components/AuthPanel.tsx`](../ui/components/AuthPanel.tsx), rendered inside the existing landing animation on the same `ctaIn` delay. The logo spring chain, impact ring, wordmark, underline and `CourtBackdrop` are untouched. Stack is Apple (iOS) → Google → `Continue with email` disclosure, which expands the form inline so the screen never navigates away from the brand. New [`components/Field.tsx`](../ui/components/Field.tsx) absorbs the six duplicated label+input call sites.

**P2/P3 — native providers.** [`lib/auth.ts`](../ui/lib/auth.ts) now uses `expo-apple-authentication` + `signInWithIdToken` (raw nonce to Supabase, SHA-256 digest to Apple) and `@react-native-google-signin/google-signin`. Both fall back to the old hosted-OAuth path when the native module or client IDs are absent, so web and Expo Go keep working. `signOut()` also clears native Google's own session — otherwise the next "Continue with Google" silently reuses the account just signed out of.

**P4 — one setup screen.** [`onboarding/setup.tsx`](../ui/app/onboarding/setup.tsx) replaces both wizard steps. Name (prefilled from the profile row, falling back to the provider) + skill tier. Photo is optional and best-effort — a failed upload never strands someone outside the app. The suburb input and the sport chips are gone; `SPORT_SLUG` replaces the hardcoded `"badminton"` string. Primary action is a `HoldButton`, per [not-boring-plan.md](not-boring-plan.md).

**P5 — location pre-prompt.** [`onboarding/nearby.tsx`](../ui/app/onboarding/nearby.tsx) explains the exchange before the OS dialog, states plainly that only the suburb is ever shown, and offers a real "Not now". On grant it writes `home_suburb` + `home_point` once, silently. `lib/location.ts` gained `requestLocation()` and `suburbForFix()` so the prompt owns the moment; `useUserLocation` is unchanged for its existing callers.

---

## 4. Apple's one-shot name

`credential.fullName` is returned on the **first authorisation for an Apple ID and never again, on any device**. `lib/auth.ts` writes it straight to `profiles.display_name` at that moment, guarded by `.eq("display_name", "")` so it can never overwrite a name the user chose. If this write is ever removed, Apple users will land on setup with an empty name field and no way to recover the real one.

---

## 5. External config still required

Native sign-in is code-complete but inert until these exist. Until then every attempt falls back to hosted OAuth, including the consent dialog.

| What | Where |
|---|---|
| Sign In with Apple capability on App ID `com.smashio.app` | Apple Developer portal |
| Bundle id `com.smashio.app` in Authorized Client IDs | Supabase → Auth → Providers → Apple |
| OAuth clients: iOS (bundle id), Web, Android (package + SHA-1 for **both** debug and the release keystore used by `plugins/withAndroidReleaseSigning`) | Google Cloud console |
| All three Google client IDs in Authorized Client IDs | Supabase → Auth → Providers → Google |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | `ui/.env.production` (and `ui/.env` for local native testing) |

Both providers need a fresh native build — iOS ships via GitHub Actions, not EAS.

---

## 6. Not doing

- No migration, RPC or schema change. `home_suburb`, `home_point` and `show_suburb` all already existed.
- No phone/OTP — still deferred ([backend-plan.md](backend-plan.md) §17: SMS provider + AU sender ID).
- No biometric unlock or "remember me" — `persistSession: true` makes it implicit and always-on.
- No suggested-follows step; [social-plan.md](social-plan.md) is unapproved and it would re-inflate onboarding.
- No change to the boot splash ([AnimatedSplash.tsx](../ui/components/AnimatedSplash.tsx)) or the landing animation — the parts that already worked.

---

## 7. Test coverage

- `.maestro/login-form.yaml` and `login-wrong-password.yaml` updated for the merged screen (`auth-email-disclosure` replaces `onboarding-get-started`; `login-email`/`login-password`/`login-continue` testIDs survive).
- `.maestro/login-no-reonboard.yaml` is new and locks down the P0 regression directly: typed sign-in as an existing user must reach Discover with setup never shown.
- **Gap:** the A6 new-user onboarding walk ([e2e-test-plan.md](e2e-test-plan.md)) still needs a profile-less auth user in the fixture before it can be rewritten for the single setup screen. Google/Apple remain manual-only — native SDKs don't make OAuth completable in the sandbox.
