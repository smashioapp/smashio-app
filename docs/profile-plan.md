# Profile Plan — SMASHIO

Written 2026-08-15. Companion to [discover-plan.md](discover-plan.md) and [my-games-plan.md](my-games-plan.md), same method: who's on the screen, what the best products do, what's broken in our code today, then a phased plan judged on UX, UI, creativity, retention and information density.

Scope: [ui/app/(tabs)/profile.tsx](../ui/app/(tabs)/profile.tsx), [profile-edit.tsx](../ui/app/profile-edit.tsx), [queries/profile.ts](../ui/lib/queries/profile.ts), [queries/ratings.ts](../ui/lib/queries/ratings.ts), a new `app/player/[id].tsx`, and the reputation surfaces that read them ([GameCard.tsx](../ui/components/GameCard.tsx), [game/[id].tsx](../ui/app/game/[id].tsx), [post-game/[id].tsx](../ui/app/post-game/[id].tsx)). Two migrations.

---

## 1. Who is on this screen (HCD frame)

Discover is a **decision** surface. My Games is a **commitment** surface. Profile is a **reputation** surface — and reputation is by definition something *other people read*. Today SMASHIO has no way for anyone to look at anyone. The profile tab is a private mirror bolted to a settings list.

| Mode | Share (est.) | Mental state | What they need | Success |
|---|---|---|---|---|
| **Host vetting a request** | ~30% of profile *views*, 0% today | "Who is this person and will they turn up?" | Photo, skill, games played, reliability, punctuality, shared history | Approve/decline in seconds, confidently |
| **Player sizing up a game** | ~25% | "Is this host legit? Is this my level?" | Host identity, hosted count, rating, verified | Requests to join instead of bouncing |
| **Self-checker** | ~25% | "How am I doing? Did that game count?" | Games played, streak, tier progress, rating, what changed | Comes back to play again |
| **Credibility builder (new user)** | ~10% | "Why is nobody approving me?" | What's missing, what raises trust, how to fix it | Completes profile, gets approved |
| **Settings-seeker** | ~10% | "Turn off notifications / log out / delete" | A boring, findable list | Task done, leaves |

**Design principle:** a profile is a **claim you make about yourself, backed by evidence other people generated**. Today we render the claim (self-declared tier, name, suburb) and hide the evidence (peer ratings are write-only), and the one person who can read it is the one who already knows it.

The second principle follows: **identity and account settings are different products**. Log out and Delete account sit two rows from your tier badge right now.

---

## 2. Benchmark — what the best profile screens do

| Product | Mechanic | Why it applies |
|---|---|---|
| **Playo** ([rating graph](https://blog.playo.co/playo-user-rating-graph/)) | Skill is what your *co-players* say it is — a distribution across Beginner→Pro, weighted ~90% to your last 25 games, only each rater's latest vote counts, all of it anonymous. Plus behaviour badges: *Punctual*, *Team Player*, *Particular on payments*. Explicitly framed as what gets you accepted into games. | This is our exact product, one market over. Our `profile_sports.skill_tier_id` is a self-claim nobody ever checks, and our `ratings` table is a black hole. |
| **Playtomic** ([levels](https://playtomic.com/blog/padel-levels)) | A 0–7 level in 0.25 steps, ELO-adjusted after every *competitive* match, plus a **reliability %** — the system's own confidence in your level, which climbs as you play. | The number-with-confidence idea is gold; the ELO engine is not portable — it needs recorded match results, which casual badminton doesn't produce. See §7. |
| **DUPR / UTR-P** ([DUPR](https://www.dupr.com/), [UTR-P](https://www.utrsports.net/pages/pickleball-app)) | One portable rating, updated on a fixed cadence, that clubs and tournaments accept. Identity travels with the player. | Long-game: the rating is the moat, not the listings. Design ours so it can become portable later. |
| **Strava** ([profile page](https://support.strava.com/en-us/articles/15402175-your-strava-profile-page)) | Profile = calendar heatmap + trophy case + photos + rolling stats (4-week averages, year, all-time). History *is* the identity. | We have games, venues, dates, co-players — and render a single integer. |
| **Duolingo** ([achievement badges](https://blog.duolingo.com/achievement-badges), [friend streak](https://blog.duolingo.com/friend-streak/), [case study](https://trophy.so/blog/duolingo-gamification-case-study)) | Badges pulled out of the buried profile and made shareable; the case study reports day-1 retention of 33.4% for learners who unlock one vs 20.4% who don't, and +22% daily-lesson completion for users with a friend streak. | We compute `useProfileStreak` already and never show it on Profile. Regulars ("you've played with Sam 5×") is our friend-streak analogue. |
| **Airbnb** ([ID verification](https://www.airbnb.com/help/article/1237)) | Trust is assembled from stacked signals — verified ID, reviews, completeness — and the profile openly tells you which ones you're missing. | Our only trust signal is an email-verified row that shows a state and offers no action. |
| **Letterboxd / Untappd** | The profile is a personal archive worth revisiting on its own. | Our Past tab got this treatment in [my-games-plan.md](my-games-plan.md) §M4; Profile never did. |

**Synthesis — the five things they share:**
1. The profile is public, and its main job is someone *else's* decision.
2. Skill is peer-validated, never purely self-declared.
3. Reputation is decomposed — skill, reliability and behaviour are separate signals, not one blob.
4. History is displayed as identity (streaks, heatmaps, trophies, regulars), not as a count.
5. Settings live somewhere else.

We have none of the five.

---

## 3. Diagnosis — what's wrong today

Grounded in the current code, worst first.

**The missing half — there is no public profile.**
- No `player/[id]` route exists anywhere in [ui/app](../ui/app). Roster avatars, organizer rows and rating lists are all inert.
- A host deciding a join request sees an initial in a coloured circle and a display name ([game/[id].tsx:379](../ui/app/game/[id].tsx#L379)) — no skill, no games played, no reliability, no history together. **The single highest-stakes decision in the product is made blind.** Meanwhile Discover's card *does* carry `organizerReliabilityScore` and `organizerHostedCount` ([GameCard.tsx:132](../ui/components/GameCard.tsx#L132)) — we vet hosts and not players.
- RLS is not the blocker: `profiles readable by authenticated` is `using (true)` ([profiles.sql:15](../supabase/migrations/20260807000200_profiles.sql#L15)).

**The reputation loop never closes.**
- Post-game asks every player to rate their co-players, `ratings` stores it — and nothing in the app ever reads `ratings` for display. [useMyRatedGameIds](../ui/lib/queries/ratings.ts#L6) reads *which games* you rated, never the stars. You can be rated fifty times and never see a number. The policy already permits it: `ratings readable by rater and ratee` ([ratings.sql:27](../supabase/migrations/20260808000200_ratings_and_completion.sql#L27)).
- `ratings.stars` is undimensioned — a 1–5 blob that can't separate "strong player" from "turned up on time". Playo splits exactly these.
- `reliability_score` only ever *falls*, 5 points per late leave, and returns to 100 the moment the late leave stops counting ([ratings.sql:53](../supabase/migrations/20260808000200_ratings_and_completion.sql#L53)). It's shown as a gauge out of 100 with an explainer that promises it "recovers slowly the more games you complete" ([theme.ts RELIABILITY_EXPLAINER](../ui/lib/theme.ts)). The copy describes a formula we don't run.

**Truth bugs:**
- **Silent skill downgrade on save.** `skill` initialises from `profileSports` before that query resolves ([profile-edit.tsx:26](../ui/app/profile-edit.tsx#L26)) and, unlike `name`/`suburb`, has no `touched` fallback. An Advanced player who opens Edit profile and saves without touching the tier list is written back as **Intermediate**. Silent data loss on the field that drives Discover's skill filter.
- **The tab-bar dot points here and dies.** `dotFor` lights Profile on pending join requests ([TabBar.tsx:143](../ui/components/TabBar.tsx#L143)), and Profile renders nothing about requests. My Games at least pays that dot off now (my-games M3); Profile is a pure dead end.
- **No loading or error state at all.** Every query is destructured bare (`const { data: profile }`). A failed fetch renders name `—`, suburb `—`, `0` games played and a reliability gauge at **0** — i.e. a network error is displayed to the user as "your reliability is zero".
- **No refresh, no focus-invalidate.** Play a game, come back, the stats are whatever React Query cached. My Games solved this with `useFocusEffect`; Profile didn't.
- **"Games played" counts games you hosted but never played.** `useProfileStats` adds every completed game you organised ([profile.ts:33](../ui/lib/queries/profile.ts#L33)) whether or not you were on the roster.
- **Email verified is a status with no verb.** The row shows `Unverified` and offers nothing — no email address, no resend, no explanation of what it gates.

**Wrong screen — identity vs account:**
- One undifferentiated list holds Invite friends (growth), Edit profile (identity), Notifications (settings), Email verified (status, non-interactive), Log out and Delete account (destructive) — same row height, same weight, 3.5px apart ([profile.tsx:145-205](../ui/app/(tabs)/profile.tsx#L145)).
- **Inverted hierarchy.** The single loudest element on the screen is a full-width lime gradient card that says **Member since 2026** ([profile.tsx:115](../ui/app/(tabs)/profile.tsx#L115)). It is the least actionable fact we hold. Reliability — the thing hosts judge you on — is a quarter-width tile.
- Sign-in method is invisible. A Google-authed user has no way to see how they log in.

**Thin identity:**
- `useProfileStreak` exists and is used by My Games and post-game — **not by Profile**.
- No venues, no regulars, no recent games, no calendar, no achievements. Post-game celebrates a tier-up and then the profile it points at shows one number.
- `profile_sports` is a multi-row table; the UI reads `profileSports[0]` and hardcodes `SPORT_SLUG = "badminton"` ([profile-edit.tsx:14](../ui/app/profile-edit.tsx#L14)). Multi-sport is the stated roadmap in [business-context.md](business-context.md) and the profile is where it will surface first.
- `profiles.home_point` is never written by the app — only by [seed-test-data.sql](../supabase/seed-test-data.sql). Suburb is free text, so "near me" can only ever mean device GPS, and a user with location denied has no fallback we could have had for free.
- Own avatar is hardcoded `colors.pro` purple ([profile.tsx:69](../ui/app/(tabs)/profile.tsx#L69)) while every other surface derives a stable colour via `avatarColor(id)`. You are a different colour to yourself than to everyone else.

---

## 4. The plan

Seven phases, sequenced by leverage.

### P0 — Truth & trust

No migration. All bugs.

- [ ] Fix the **skill downgrade**: `profile-edit` mirrors the `nameTouched` pattern for tier, or better — derive all three fields from the query with `useEffect` sync, and disable Save until `profileSports` has resolved.
- [ ] Loading and error states: skeletons while pending; `isError` → "Couldn't load your profile" + Retry. Never render `0` reliability for a failed fetch.
- [ ] `useProfileStats` counts hosted games only when you were also an approved player, or labels them separately ("38 played · 12 hosted"). Two honest numbers beat one wrong one.
- [ ] Pull-to-refresh + `useFocusEffect` invalidate of `profile`, `profile_stats`, `profile_streak`.
- [ ] Remove the pending-requests dot from Profile in [TabBar.tsx:143](../ui/components/TabBar.tsx#L143) — My Games owns it — **or** land P4's Requests entry point. One or the other, not neither.
- [ ] Own avatar uses `avatarColor(profile.id)` like everywhere else.
- [ ] Email row gains a verb: show the address, "Resend verification", and one line on what it unlocks.

### P1 — The player card (structural)

**The call: the profile becomes a two-sided object.** One component, two modes — `me` (editable, private rows) and `them` (read-only, public subset). New route `app/player/[id].tsx`; the Profile tab renders the same `PlayerCard` in `me` mode.

- [ ] *Backend:* `public.player_card(profile_id uuid)` — a `security definer` function returning display name, photo, suburb, tier, member-since, games played, games hosted, reliability band, rating average + count, badge counts, and `games_together` with the caller. Live, one round trip, no staleness. A view can't do it: `game_players` is readable only by organizer and members, so joined-game counts for an arbitrary player are invisible to a `security_invoker` projection. Mirrors the aggregate precedent already set by `organizer_hosted_count` in [games_public](../supabase/migrations/20260812000100_games_public_organizer.sql#L32).
- [ ] Wire every entry point that is currently inert: roster avatars and the **join-request rows** in [game/[id].tsx](../ui/app/game/[id].tsx), the organizer row on [GameCard.tsx](../ui/components/GameCard.tsx), My Games roster faces, chat thread headers, the post-game rating list.
- [ ] **Vetting strip on join requests** — the payoff. Each request row carries tier, games played, reliability band and "played together 3×" inline, with the full card one tap away. Hosts stop deciding blind.

**Privacy rules — what `them` mode shows:**

| Shown to others | Never shown |
|---|---|
| Name, photo, suburb (text, not `home_point`) | Email, phone, exact location |
| Tier (self + peer-perceived), member since | Raw reliability integer — band only ("Excellent") |
| Games played, games hosted | Which games, unless you shared one |
| Rating average + count once ≥5 ratings | Individual ratings, and always who gave them |
| Behaviour badges, games together with the viewer | Anything before the ≥5 threshold |

Anonymity and a minimum count are not optional — they're what makes honest rating possible ([Playo](https://blog.playo.co/playo-user-rating-graph/)).

### P2 — Reputation that exists

- [ ] **Your rating, visible.** Average + count + distribution bar, read straight from `ratings` where `ratee_id = me`. No migration — the policy already allows it. Ship this the day P1 lands.
- [ ] **Peer-perceived skill.** Render self-declared vs peer view: "You say Advanced · your co-players say Intermediate". Weighted to the last 25 games, one vote per rater (Playo's rule). Feeds Discover's skill filter as a *secondary* signal, never as an override.
- [ ] *Backend:* **behaviour badges** — a `rating_tags` table (`game_id, rater_id, ratee_id, tag`) with a fixed vocabulary: `punctual`, `good_sport`, `strong_player`, `settled_up`. Post-game adds a one-tap tag row under the stars. Cheap to collect, far more legible than a 1–5 blob, and the direct fix for undimensioned `ratings.stars`.
- [ ] **Reliability, explained.** Replace the gauge's mystery number with the actual ledger — "100 · no late cancellations in 14 games" — and make [RELIABILITY_EXPLAINER](../ui/lib/theme.ts) describe the formula we actually run, or change the formula to match the copy. Pick one; today they disagree.

### P3 — Identity worth keeping

- [ ] **Streak on Profile**, at last — `useProfileStreak` is already written and already used twice elsewhere.
- [ ] **Stat block:** games played, hosted, this-month count, week streak, most-played venue, most-played night. All derivable from `game_players` + `games` under existing policies.
- [ ] **Regulars** — "You've played with Sam 5× · Priya 4×", tapping through to their card. Our friend-streak analogue, and the strongest social hook available to a matchmaking app.
- [ ] **Calendar heatmap** of the last 12 weeks (Strava's widget, shrunk). Turns a count into a habit you can see.
- [ ] **Achievements**, shareable: first game, first hosted, 10/25/50 played, 4-week streak, 5 different venues, first 5-star. Reuse [TierBadge](../ui/components/TierBadge.tsx)'s ring-toward-next mechanic — the target you can see is the motivation.
- [ ] **Multi-sport ready:** render all `profile_sports` rows, per-sport tier and stats. Drop `profileSports[0]` and the hardcoded `SPORT_SLUG`.

### P4 — Settings leave the stage

- [ ] New `app/settings.tsx`; Profile keeps only identity + a single gear entry. Notifications, email/sign-in method, privacy, legal, and a visually separated **danger zone** (Log out, Delete account) move there. Delete account stays reachable in-app for Play's User Data policy — it just stops sitting next to your tier badge.
- [ ] Kill the **Member since** hero gradient; member-since becomes a line under the name. Promote reliability, rating and streak into the space it vacates.
- [ ] Invite friends becomes a proper growth card at the bottom, not a settings row.
- [ ] Header: photo, name, tier, suburb, verified marks, and — in `me` mode — Edit inline instead of a row three items down.

### P5 — Completeness & the growth loop

- [ ] **Profile completeness meter** with named gaps: photo, suburb, tier, email verified, first game. Airbnb's play — say which signal is missing and what it costs you.
- [ ] **Geocode the suburb** on save via [places.ts](../ui/lib/places.ts) → write `home_point`. Unlocks a distance fallback when location permission is denied, and a "games near home" default on Discover. The column has been sitting there since slice 1.
- [ ] Empty profile isn't a wall: a new user with 0 games sees "Play your first game" wired to Discover, not a row of zeros.
- [ ] Referral gets attribution — [shareReferral](../ui/lib/share.ts) currently shares a link with nothing to credit it to.

### P6 — Feel

- [ ] **Shareable player card** — render the card to an image and share it. Duolingo's badge-sharing drove referrals; ours is a screenshot people already want to take.
- [ ] Parallax header on scroll; stats stagger in; `RollingNumber` on every count (already imported, used once).
- [ ] Tier-up and achievement unlocks fire [Burst](../ui/components/Burst.tsx) + haptics, matching post-game's language.
- [ ] Rating distribution bars animate on mount; reliability gauge sweeps to value instead of appearing.

---

## 5. How we'll know it's the best

| Metric | Why | Target |
|---|---|---|
| Join-request approval rate | P1's vetting strip should raise it — hosts approve when they can see who's asking | ↑ |
| Host decision latency | Deciding blind is slow | ↓ vs my-games M3 baseline |
| Player-card views per session | Is the profile a public object yet? | >1.5 |
| Post-game rating completion | P2 gives ratings a destination; people rate when ratings are visible | >60% |
| Profile completeness (photo + suburb + tier) | P5 | >80% of active users |
| Approval rate for profiles with photo vs without | Proves the trust thesis, or kills it | measure first |
| 7-day return after viewing own profile | Is it identity or a settings drawer? | ↑ |
| Profiles with `home_point` set | P5's geocode | >70% of new signups |

---

## 6. Order of work

**P0 → P1 → P2 → P4 → P3 → P5 → P6.**

P0 is bugs and one silent data-loss defect — cheap, and the skill downgrade is corrupting the field Discover filters on right now. P1 is the structural change and the only phase that alters what the product *is*; everything after leans on the `player_card` function and the shared component. P2 is next because the rating data already exists and is currently worth nothing. **P4 jumps ahead of P3** — it's a day of work that fixes the hierarchy, and P3's stat block needs the space P4 frees. P3 is the retention phase, P5 the growth phase, P6 trails.

**Backend touchpoints — two:** `public.player_card(uuid)` security-definer function (P1), and the `rating_tags` table + policies (P2). Everything else — own ratings, streak, stats, venues, regulars — runs on existing tables under existing policies.

## 7. Not doing

- **No ELO / Playtomic-style numeric level.** It needs recorded match results; casual badminton in this product doesn't produce scores, and asking for them would tax every game to serve a minority. Peer-perceived skill (Playo's model) is the right fit until we have scored matches. Revisit if we ever ship ladders.
- **No public follower/following graph.** Regulars are derived from games actually played — real signal, zero social-status pressure, no follower-count vanity.
- **No city-wide leaderboards.** Corrosive for a beginner-friendly casual app; the whole positioning is "find people to play with", not "rank yourself against strangers".
- **No government-ID verification.** Real trust value, but KYC cost, liability and friction we can't carry pre-scale. Email + booking-confirmation verification stays the trust floor.
- **No paid or purchasable badges.** Every badge must be earned by playing, or the whole signal is worthless.
- **No web profile.** Native-only holds, same as [ux-plan.md](ux-plan.md); the website stays marketing.
- **No new visual language.** Dark/lime, existing component set, `reanimated` + `expo-linear-gradient` only.

---

Sources: [Playo rating graph](https://blog.playo.co/playo-user-rating-graph/) · [Playo karma](https://blog.playo.co/5-ways-to-earn-karma-on-the-playo-app/) · [Playtomic padel levels](https://playtomic.com/blog/padel-levels) · [DUPR](https://www.dupr.com/) · [UTR-P pickleball](https://www.utrsports.net/pages/pickleball-app) · [Strava profile page](https://support.strava.com/en-us/articles/15402175-your-strava-profile-page) · [Duolingo achievement badges](https://blog.duolingo.com/achievement-badges) · [Duolingo friend streak](https://blog.duolingo.com/friend-streak/) · [Duolingo gamification case study](https://trophy.so/blog/duolingo-gamification-case-study) · [Airbnb ID verification](https://www.airbnb.com/help/article/1237)
