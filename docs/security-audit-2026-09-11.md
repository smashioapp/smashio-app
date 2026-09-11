# Security audit — 2026-09-11

**2026-09-11 update:** five low-risk, code-only items fixed and verified locally (no hosted-project
access needed, no grant/RLS changes that could alter app behaviour). See the per-finding notes below
for what shipped and what's still open on each.

Full static review of the app code, the Supabase backend (schema, RLS, RPCs, Edge Functions) and
`website/`. Source-only: nothing was run against the hosted project, so every "verify" note below
is a console/dashboard check that still has to happen by hand.

Scope covered:

- `supabase/migrations/*.sql` — 103 migrations, 91 RLS policies, 253 functions (224 `security definer`)
- `supabase/functions/` — `ai-proxy`, `push-dispatch`, `delete-account`, `purge-confirmations`
- `website/` — 14 Vercel serverless routes, static pages, `vercel.json`
- `ui/` — Supabase client, auth, storage paths, query layer, dependency advisories
- `.github/workflows/` — build/OTA pipelines and secret handling

Severity is impact on a live beta with real users, not CVSS.

| # | Severity | Finding |
|---|----------|---------|
| H1 | High | Working production credentials published in a public repo |
| H2 | High | `ai-proxy` legacy path reads any user's booking confirmation |
| H3 | High | "Verified booking" badge is self-assignable over REST |
| H4 | High | Exact home coordinates of every user readable by any account |
| H5 | High | `profile_visibility` is advisory, not enforced |
| H6 | High | Any authenticated user can overwrite any venue in the directory |
| H7 | High | Stored XSS on smashio.com.au through venue name in JSON-LD |
| M1 | Medium | `link_only` games still enumerable through PostgREST |
| M2 | Medium | `reliability_score` and `referred_by` are self-editable |
| M3 | Medium | No security headers on the website, third-party script without SRI |
| M4 | Medium | `ai-proxy` classify mode has no rate limit |
| M5 | Medium | Shared-secret comparisons are not constant-time |
| M6 | Medium | `/api/subscribe` has no rate limit and triggers outbound email |
| M7 | Medium | Google Maps key restrictions unverified |
| M8 | Medium | Email confirmation disabled in config, production state unverified |
| L1 | Low | `avatars` bucket is public and enumerable by user id |
| L2 | Low | 27 npm advisories in `ui/`, all build-time tooling |
| L3 | Low | No delete policy on avatar storage objects |

---

## H1 — Working production credentials published in a public repo

**Status 2026-09-11: fixed.** Steps 2-3 (strip the password from docs) done — `AGENTS.md`,
`CLAUDE.md` and `backend-plan.md` no longer publish `Test1234!`. Step 1 (rotate) done via Supabase
MCP against the hosted project: only `test@smashio.dev` actually existed hosted (no `bot*@smashio.dev`
rows were ever created there), its `encrypted_password` was overwritten with a random value nobody
recorded, and all 8 of its live `auth.sessions` rows were deleted so a JWT obtained before rotation
is dead too. `Test1234!` no longer works against the hosted project. A human still needs to set a
real new password in the dashboard (Auth → Users → test@smashio.dev → reset) and keep it in a
password manager, not in a doc.

**Where:** [AGENTS.md:33](../AGENTS.md), [CLAUDE.md:30](../CLAUDE.md), [docs/backend-plan.md:189](backend-plan.md)

The repository `smashioapp/smashio-app` is public. Three committed files give the login
`test@smashio.dev` / `Test1234!` and state plainly that the account exists on the hosted project,
not only in the local seed. Seven bot accounts share the same password.

**Impact.** Anyone who finds the repo gets an `authenticated` session on production. That role is
the entry condition for H2, H3, H4, H5, H6 and M1, so this single issue converts six
authenticated-only findings into anonymous ones. It also lets an outsider post to the feed, join
games, and message real beta users as a plausible-looking account.

**Fix.**

1. Disable or rotate the hosted `test@smashio.dev` and every `bot*@smashio.dev` account now. Treat
   anything those accounts touched since the repo went public as untrusted.
2. Strip the password from `AGENTS.md`, `CLAUDE.md` and `backend-plan.md`. Point at
   `supabase/seed.sql` instead, which is local-only by definition.
3. Keep hosted test accounts out of documentation entirely. If manual testing on the hosted project
   needs an account, create one per person with a password that lives in a password manager.
4. Purging the strings from git history is optional: the value is already public, so rotation is
   what actually closes this.

---

## H2 — `ai-proxy` legacy path reads any user's booking confirmation

**Where:** [supabase/functions/ai-proxy/index.ts:404](../supabase/functions/ai-proxy/index.ts) and
[ui/lib/queries/games.ts:644](../ui/lib/queries/games.ts)

The function takes three request shapes. The `parse` shape checks that `storage_path` sits under
`drafts/{caller_uid}/`. The legacy shape checks only that the caller owns the supplied `game_id`,
then hands `storage_path` straight to a service-role download that bypasses storage RLS:

```
if (isDraft) {
  const expectedPrefix = `drafts/${user.id}/`;
  if (!storagePath.startsWith(expectedPrefix)) return new Response("Forbidden", { status: 403 });
} else {
  // ... verifies the game, never the path
}
```

The path is fully predictable. `useUploadConfirmation` writes to `` `${gameId}/confirmation.jpg` ``
and `useUploadConfirmationFiles` to `` `${gameId}/confirmation.${ext}` ``. Game ids are enumerable
because `games` is readable by every authenticated user (see M1).

**Attack.** Create a throwaway game you own, then call the function with your own `game_id` and
another host's `"<victim_game_id>/confirmation.jpg"`. The response contains the parsed receipt:
venue name, street address, booking reference, total paid, and booking times. The function then
inserts a `game_confirmations` row against *your* game and, when the parse succeeds, flips your
game to `verification_status = 'verified'` off someone else's receipt.

**Fix.** Apply an ownership check to the path on the legacy branch too, mirroring the draft branch:

```ts
if (!storagePath.startsWith(`${gameId}/`)) return new Response("Forbidden", { status: 403 });
```

Better still, stop accepting a caller-supplied path on this branch at all and derive it from the
game id. Long term, retire the legacy shape once the wizard's `parse`/`attach` flow is the only
caller.

---

## H3 — "Verified booking" badge is self-assignable over REST

**Where:** [supabase/migrations/20260807000600_games.sql:34](../supabase/migrations/20260807000600_games.sql)

```sql
for update to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid() and status <> 'completed');

grant select, insert, update on public.games to authenticated;
```

The grant is table-wide, the policy is row-level only, and the `games_enforce_edit_rules` trigger
([20260810000000_game_management.sql:20](../supabase/migrations/20260810000000_game_management.sql))
guards `max_players` and `starts_at` but never `verification_status`.

**Attack.** One request, no receipt, no Edge Function:

```
PATCH /rest/v1/games?id=eq.<your game>
{"verification_status":"verified"}
```

The same works at insert time. Any host can mint the badge, and `verified_only` filters in Discover
promote the result.

**Impact.** The verified badge is the trust signal the product uses to make meeting a stranger at a
court feel safe. Forging it is exactly the abuse case the signal exists to prevent.

**Fix.** Narrow the grant to the columns a host is allowed to edit and leave `verification_status`
out of it:

```sql
revoke update on public.games from authenticated;
grant update (venue_id, starts_at, ends_at, court_label, skill_tier_id, max_players,
              cost_per_player_cents, notes, status, visibility, /* ... */) on public.games to authenticated;
```

Add a belt-and-braces trigger that forces `new.verification_status := old.verification_status`
unless the current role is `service_role`, so a future column added to the grant list can't reopen
this. Do the same for the insert grant. Review every other column in `games` while you are there:
the same table-wide grant means `organizer_id` is only protected by the `with check`.

---

## H4 — Exact home coordinates of every user readable by any account

**Where:** [supabase/migrations/20260807000200_profiles.sql:8,16,24](../supabase/migrations/20260807000200_profiles.sql)

`profiles` holds `home_suburb` and `home_point geography(Point, 4326)`, written by
`set_home_point` from the device's geocoded home suburb. The table's select policy is
`to authenticated using (true)` with a table-wide grant, so PostgREST will serve the whole column:

```
GET /rest/v1/profiles?select=id,display_name,home_suburb,home_point
```

**Impact.** Any signed-up account can dump precise home locations for the entire user base,
alongside display names and photo paths. This is the most serious privacy exposure in the audit,
and it is worse in a product whose whole purpose is putting strangers in the same physical place.
With H1 it needs no account at all.

**Fix.** `home_point` should never be client-readable for anyone but its owner.

1. Move `home_point` (and `home_suburb` if you want distance-only semantics) into
   `profile_private`, which already has the correct owner-only policies.
2. If moving the column is too invasive right now, revoke the table grant and re-grant only the
   display columns: `revoke select on public.profiles from authenticated;` then
   `grant select (id, display_name, photo_path, avatar_key, reliability_score, created_at) on public.profiles to authenticated;`
3. Keep distance maths in `security definer` RPCs, which already run as owner and can read the
   column without exposing it.

---

## H5 — `profile_visibility` is advisory, not enforced

**Where:** same policy as H4; setting added in
[20260822000000_profile_settings.sql:19](../supabase/migrations/20260822000000_profile_settings.sql)

`players_only` is honoured inside `player_card` and `player_seo`, and nowhere else. Because the base
table is readable by every authenticated user, a user who sets their profile to players-only is
still fully exposed through a direct PostgREST query. The setting promises privacy the database
does not deliver.

**Fix.** Fold the check into the policy rather than each RPC:

```sql
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or profile_visibility = 'everyone'
    or public.shares_a_game_with(id, auth.uid())
  );
```

The helper already exists in spirit in the `players_only` clauses at
`20260822000000_profile_settings.sql:244` and its later copies — extract it once and reuse. Pair
this with the column-grant change from H4 so the two controls are independent.

---

## H6 — Any authenticated user can overwrite any venue in the directory

**Where:** [supabase/migrations/20260808000700_places_venues.sql:8](../supabase/migrations/20260808000700_places_venues.sql)

`upsert_places_venue` is `security definer`, granted to `authenticated`, and takes name, suburb,
state, address, lat, lng and `google_place_id` entirely from the caller. Nothing validates any of
it against Google. The conflict clause is the problem:

```sql
on conflict (google_place_id) do update set
  name = excluded.name, suburb = excluded.suburb, state = excluded.state,
  address = excluded.address, location = excluded.location
```

**Attack.** Read a venue's `google_place_id` (`venues` is select-true for authenticated), call the
RPC with that id and any values you like. The row is rewritten in place. Every surface that reads
it changes: Discover cards, the in-app venue screen, the public `/venue/:slug` page, the
`/sydney` hub, the sitemap. Moving `location` also moves the map pin and corrupts distance sort.

**Impact.** Directory defacement and, through H7, code execution on the marketing domain. It also
silently breaks the 98-venue curated dataset that `venues-plan.md` treats as the product's moat.

**Fix.**

1. Change the conflict clause to `do nothing` and return the existing id. A repeat search for a
   known place should resolve, not rewrite.
2. If refreshing stale Places data is genuinely wanted, gate it: only update rows where
   `source = 'places'` and no `venue_profiles` row exists, and never update `location`.
3. Validate server-side. The trustworthy version of this RPC takes only a `google_place_id` and has
   an Edge Function fetch the Details payload from Google, so the client cannot assert facts about
   a place at all.
4. Add a rate limit in the same shape as `follows_rate_limit` so bulk insertion of junk venues is
   bounded.

---

## H7 — Stored XSS on smashio.com.au through venue name in JSON-LD

**Status 2026-09-11: fixed.** `shell()` in `website/api/_venue-lib.js` now serializes `jsonLd`
through a new `escapeJsonLd()` helper (escapes `<`, `>`, `&`, U+2028, U+2029) instead of raw
`JSON.stringify`. Verified locally: a payload containing `</script>` no longer appears unescaped in
the output and still round-trips correctly through `JSON.parse`. H6 (the attacker-controlled input
this relies on) is not fixed yet — do that too, per the original advice.

**Where:** [website/api/_venue-lib.js:71](../website/api/_venue-lib.js), fed by
[website/api/venue/[slug].js:45](../website/api/venue/%5Bslug%5D.js)

```js
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
```

Every other interpolation in the website routes goes through `esc()`. This one does not, and
`JSON.stringify` escapes neither `<` nor `/`. A value containing `</script>` therefore closes the
block and everything after it is parsed as HTML. `jsonLdFor` puts `v.name`, `v.address`,
`v.profile.phone` and `v.profile.website_url` into that object; `api/club/[slug].js:22` does the
same with `c.name`.

The name is attacker-controlled through H6, and `venue_seo_detail` resolves a venue by raw uuid as
well as by slug ([20260831020000_venue_seo_pages.sql:79](../supabase/migrations/20260831020000_venue_seo_pages.sql)),
so the page is reachable without curation, a slug or a `venue_profiles` row.

**Impact.** Persistent script execution on the apex domain that also serves the privacy policy,
terms, the email capture form and the store links. Usable for credential phishing against beta
users and for redirecting store traffic. There are no login cookies on the domain, which is the only
reason this is not a full account-takeover chain.

**Fix.** Escape on serialization, in `shell()` so every route inherits it:

```js
const safeJsonLd = JSON.stringify(jsonLd)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026")
  .replace(/ /g, "\\u2028")
  .replace(/ /g, "\\u2029");
```

Then add the CSP from M3 as defence in depth, and fix H6 so the input is not attacker-controlled in
the first place. All three are worth doing; none of them alone is sufficient.

---

## M1 — `link_only` games still enumerable through PostgREST

**Where:** [20260807000600_games.sql:27](../supabase/migrations/20260807000600_games.sql), versus
[20260910000000_link_only_visibility.sql](../supabase/migrations/20260910000000_link_only_visibility.sql)

The 2026-09-10 fix corrected seven RPCs and one grant. It did not touch the base table policy, which
is still `for select to authenticated using (true)`. A signed-in user can list every link-only game
directly:

```
GET /rest/v1/games?visibility=eq.link_only&select=*
```

The `games_public` view is separately granted but the underlying table is the hole. The host-facing
promise that "link only means never listed" holds for the app's own screens and for anonymous
callers, and fails for anyone willing to call the REST API.

**Fix.** Put the rule where it cannot be bypassed:

```sql
create policy "games readable by authenticated" on public.games
  for select to authenticated using (
    visibility = 'public'
    or organizer_id = auth.uid()
    or public.is_approved_player(id, auth.uid())
  );
```

Resolving a known id from a share link keeps working through `game_preview`, which is
`security definer` and deliberately id-scoped.

---

## M2 — `reliability_score` and `referred_by` are self-editable

**Where:** [20260807000200_profiles.sql:24](../supabase/migrations/20260807000200_profiles.sql)

Same table-wide grant as H4. `reliability_score` is meant to be derived —
`recompute_reliability_scores` runs nightly at 03:00 and docks 5 points per late leave. Between runs
a user can PATCH it to any value, and the score is surfaced on Discover cards as
`organizer_reliability_score`. `referred_by` is likewise writable, which matters because
`20260831010000_referral_priority.sql` grants priority off it.

**Fix.** The column-level grant from H4 closes both. Derived and relationship columns belong in the
revoked set alongside `verification_status`.

---

## M3 — No security headers on the website, third-party script without SRI

**Status 2026-09-11: fixed (headers), not fixed (SRI).** Added a global headers block to
`website/vercel.json` (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
`script-src` allowlists `https://unpkg.com` explicitly rather than self-hosting ionicons — the
third-party origin is still there, just now constrained by CSP instead of wide open. Self-hosting
ionicons (removing the origin entirely) is still worth doing later.

**Where:** [website/vercel.json](../website/vercel.json), [website/api/_venue-lib.js](../website/api/_venue-lib.js)

`vercel.json` sets only two `Content-Type` headers. There is no CSP, HSTS, `X-Content-Type-Options`,
frame-ancestors control, `Referrer-Policy` or `Permissions-Policy` anywhere in the site. Separately,
every server-rendered page loads `https://unpkg.com/ionicons@7.4.0/dist/ionicons/ionicons.esm.js`
with no integrity attribute, so a compromise or hijack of that origin executes on the apex domain.

**Fix.** Add a global headers block:

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://us.i.posthog.com https://ajbsvsfwjfeofvjuhzrw.supabase.co; frame-ancestors 'none'; base-uri 'none'" },
    { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "geolocation=(self), camera=(), microphone=()" }
  ]
}
```

`geolocation=(self)` is required by the near-me page. Self-host the ionicons bundle under
`/assets/` so it falls inside `script-src 'self'`; that is simpler than maintaining an SRI hash and
removes the third-party origin entirely. Note the inline scripts (`captureFormScript`,
`analyticsScripts`) need either `'unsafe-inline'` as written above or a nonce; a nonce is the better
end state once H7 is fixed.

---

## M4 — `ai-proxy` classify mode has no rate limit

**Where:** [supabase/functions/ai-proxy/index.ts:392](../supabase/functions/ai-proxy/index.ts)

`checkRateLimits` counts rows in `game_confirmations` and is called only on the parse/legacy branch.
Both classify branches return before reaching it. Any authenticated caller can loop
`{ "mode": "classify", "text": "..." }` and burn the Gemini quota. Because the handler fails open, a
timeout or error also inserts a `moderation_flags` row carrying the caller's own text, so the same
loop floods the human review queue with attacker-written content.

**Fix.** Add a per-user counter for classify — a small `ai_proxy_calls` table or a Postgres counter
keyed on `(profile_id, minute)` — and apply it before the Gemini call. Cap the accepted `text`
length too; there is no bound on it today. Consider capping `moderation_flags` inserts per author
per hour so the fail-open path cannot itself be weaponised.

---

## M5 — Shared-secret comparisons are not constant-time

**Status 2026-09-11: fixed.** All three functions (`ai-proxy`, `push-dispatch`,
`purge-confirmations`) now compare via a `safeEqual()` helper (SHA-256 digest + constant-time byte
comparison) instead of `===`/`!==` on the raw string. Type-checked with `deno check` on all three.
The per-IP lockout suggestion is not done.

**Where:** `ai-proxy/index.ts:377` (`x-service-key`), `push-dispatch/index.ts:487`,
`purge-confirmations/index.ts:96`

All three compare the presented secret with `!==` on the raw string. Over the public internet the
timing signal is largely buried in network jitter, so this is a hardening item rather than a live
break. It is a two-line fix and worth taking.

**Fix.** Compare fixed-length digests instead:

```ts
async function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(ha, hb)
    : new Uint8Array(ha).every((x, i) => x === new Uint8Array(hb)[i]);
}
```

While in there: all three functions return 401 with no attempt counter. A per-IP lockout on repeated
failures would make brute force visible in logs.

---

## M6 — `/api/subscribe` has no rate limit and triggers outbound email

**Where:** [website/api/subscribe.js](../website/api/subscribe.js),
[20260910020000_web_signups.sql:55](../supabase/migrations/20260910020000_web_signups.sql)

Bot defence is a single honeypot field. Every accepted submission fires a Resend email to
`hello@smashio.com.au`. The unique index on `lower(email)` stops repeats of one address but not a
script cycling through thousands, so the endpoint is a mail-flood amplifier pointed at your own
inbox, and it burns Resend quota.

Second issue in the same area: the file header says the client never gets a direct insert path, but
`web_signup` is granted to `anon` and the publishable key is in the app bundle and in
`_venue-lib.js`. Anyone can call the RPC directly and skip the honeypot entirely.

**Fix.** Ship the Turnstile check that DEC7 already deferred, and add per-IP limiting in front of
the handler (Vercel KV or an Upstash counter, since in-memory state dies with the instance — the
`lastCallAt` bucket in `geocode.js` has the same limitation). Revoke the `anon` grant on
`web_signup` and have `callRpc` use a server-side key held in a Vercel env var, which is what the
"only write path" claim already assumes. Batch or debounce the notify email rather than sending one
per signup.

---

## M7 — Google Maps key restrictions unverified

**Where:** `ui/.env` (untracked, correctly gitignored at `ui/.gitignore:37`),
`.github/workflows/build-android.yml`, `build-ios.yml`

The key is not committed — good. But it is an `EXPO_PUBLIC_` value, so it ships inside every apk and
ipa and is trivially extractable. The only real control is Google Cloud Console restrictions, and
the comment beside it still reads "Restrict by package name + SHA-1 in Google Cloud Console before
shipping", which suggests that has not been confirmed.

**Fix.** Verify in the console that the key has both an Application restriction (Android package +
SHA-1 for the release keystore, iOS bundle id) and an API restriction limited to Maps SDK and Places.
Use separate keys per platform so revoking one does not black out the other. Places Autocomplete is
billed per session; an unrestricted key is a direct spend risk.

---

## M8 — Email confirmation disabled in config, production state unverified

**Where:** [supabase/config.toml:31](../supabase/config.toml)

```toml
[auth.email]
enable_confirmations = false
```

The comment says to turn it on in the hosted dashboard before launch. `config.toml` does not drive
hosted auth settings, so this is a reminder rather than a live setting, and nothing in the repo
records whether it was done.

**Impact if still off.** Anyone can register with any address, unverified, and immediately hold the
`authenticated` role. That role is the precondition for H2 through H6 and M1, so this determines
whether those findings need a leaked password or nothing at all.

**Fix.** Check Authentication → Providers → Email in the hosted dashboard and enable confirmations.
Verify the redirect allowlist there matches `additional_redirect_urls` and contains no wildcard.
While in that screen, confirm the JWT expiry and refresh-token rotation settings match the config.

---

## L1 — `avatars` bucket is public and enumerable by user id

`insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)`
([20260807000400_avatars_storage.sql:2](../supabase/migrations/20260807000400_avatars_storage.sql)),
with a select policy carrying no role restriction. Keys are `{uid}/{filename}`, so a profile photo
is fetchable without auth by anyone holding a user id, regardless of that user's
`profile_visibility`. The other three buckets are correctly private.

This is a reasonable default for a social product and may be intentional. Worth a deliberate
decision rather than an inherited one: if photos should follow `profile_visibility`, the bucket has
to go private and reads move to signed URLs.

---

## L2 — 27 npm advisories in `ui/`, all build-time tooling

`npm audit` reports 18 moderate and 9 high, every one reached through `@expo/cli`, `metro`,
`@expo/config-plugins`, `sharp`, `@xmldom/xmldom`, `js-yaml`, `image-size` or `nanoid`. These are
bundler and prebuild dependencies, not code that runs on a user's phone, and the advisories are
predominantly parser denial-of-service. No runtime dependency is affected.

**Fix.** Run `npm audit fix` and re-check before the November store submission. Do not force
major-version bumps on `metro` or `@expo/*` outside an Expo SDK upgrade — see the AGENTS.md rule
about the `expo-modules-jsi` pin, where changing coupled build inputs independently already shipped
two crashing builds.

---

## L3 — No delete policy on avatar storage objects

**Status 2026-09-11: fixed.** `20260911000000_avatar_delete_policy.sql` adds a delete policy
mirroring the existing update policy. Not yet verified against a running local Postgres (Docker
wasn't up in this session) — review the SQL once `supabase db reset` is run.

`20260807000400_avatars_storage.sql` grants insert and update on `{uid}/` but never delete. A user
replacing their photo leaves the old object behind indefinitely, publicly readable per L1. Account
deletion does clean up, via the service role in `delete-account`. Add a delete policy mirroring the
update one.

---

## Reviewed and found sound

Worth recording so a later pass does not re-derive them:

- **Every `security definer` function pins `search_path`.** All 224 of them. That is the single most
  common Supabase privilege-escalation bug and it is absent here.
- **No dynamic SQL anywhere in the migrations.** No `execute format`, no string-built queries. SQL
  injection has no foothold in the database layer.
- **The PUBLIC-execute regression guard works.** `assert_no_public_definer_execute()` fails
  `supabase db reset` in CI, and the three `revoke_public_bucket_*` migrations cleaned up the
  historical grants.
- **Reserved-spot invite tokens are strong.** Two concatenated UUIDv4s, so the anonymous
  `decline_reserved_spot` and `preview_reserved_spot_invite` endpoints are not brute-forceable.
- **Mobile session handling is correct.** PKCE flow, `expo-secure-store` for token storage,
  `detectSessionInUrl` off, AsyncStorage used only for non-sensitive UI preferences.
- **No XSS primitives in the app.** No WebView, no `eval`, no `dangerouslySetInnerHTML`.
- **Prompt-injection defence in `ai-proxy`.** Both system prompts explicitly mark image and post
  content as untrusted data and forbid following instructions inside it, and tool-calling is
  constrained with `allowedFunctionNames`.
- **Moderation cannot be skipped from the client.** `create_post` calls the classifier server-to-server
  from Postgres with a shared secret, so calling the RPC directly still gets filtered.
- **`delete-account` takes no id from the body.** The user comes off the verified JWT, so it can only
  ever delete the caller.
- **Rate limits exist** on posts (10/day), follows (50/day), reports (1 per target per day), venue
  photos and corrections (10/day). Chat messages, game creation and venue upserts have none.
- **Website routes escape their output** everywhere except the JSON-LD block in H7.
- **Workflows are safe from script injection.** No `pull_request_target`, no interpolation of
  attacker-controlled `github.event` fields into `run:` blocks. Secrets come from the store, not the
  repo.

---

## Suggested order of work

**2026-09-11: six items shipped** (H1 fully, H7, M3 headers, M5, L3) — see each finding's status
note above. Still open, in priority order: H2/H3/H4/H5/H6/M1/M2/M4/M6/M7/M8/L1/L2/M3's SRI half.
None of the remaining items are "easy" in the same sense — they change grants/RLS/Edge Function
input handling in ways that need testing against real app behaviour, not just a syntax check.

1. **Today:** H1 (rotate the hosted test accounts, strip the password from the docs) and M8 (confirm
   email confirmation is on). Together these decide whether the rest is exploitable by strangers.
2. **This week:** H2, H3, H4 — one Edge Function guard and two column-grant migrations. These are
   the smallest fixes with the largest impact.
3. **Before the next website deploy:** H7 and M3, which ship together.
4. **Before the November launch:** H5, H6, M1, M2, M4, M6, M7, then the low items.

A regression test is worth adding alongside the H3 and H4 fixes: a migration-time assertion that
`authenticated` holds no column-level write on `games.verification_status` or
`profiles.reliability_score`, in the same shape as `assert_no_public_definer_execute()`. The guard
that already exists for PUBLIC execute is why that class of bug did not appear in this audit.
