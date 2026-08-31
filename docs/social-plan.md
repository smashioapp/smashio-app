# Community & platform plan — from "find a game" to "everything badminton in Sydney"

Originally written 2026-08-15 as a feed-and-follows proposal. **Rewritten 2026-08-31** after two
things changed: parts of it shipped under other plans without this doc being updated, and the
product ambition widened from "match players for a game" to **"everything badminton in Sydney,
eventually including the booking"**.

Filename kept because [AGENTS.md](../AGENTS.md), [gtm-plan.md](gtm-plan.md) §3.3 G12,
[venues-plan.md](venues-plan.md) §3 and [quick-wins.md](quick-wins.md) all link to it.

Read [mvp-spec.md](mvp-spec.md), [business-context.md](business-context.md),
[gtm-plan.md](gtm-plan.md) and [venues-plan.md](venues-plan.md) first. §0 is the state audit — read
it before quoting any schema in §5, because three of the original doc's tables shipped in a
different shape under a different migration.

Status: **partially signed off 2026-08-31.** Decisions are recorded in §17 — read that first, it
overrides anything in the body that still reads as a proposal. In short: positioning split and its
trigger **approved**; **a text feed with the composer approved** (B0, B0.5, B1, B2, B5, B7, N1 —
§13.1, ~12.5 d), with images, comments and reactions cut out of v1; **Chat merges into My Games and
the feed takes the freed tab slot** (§13.5); clubs approved as **seed-only for now (C0)**;
moderation owner **named**; booking outreach **deferred entirely**.

An earlier read-only-checkpoint plan was approved and then reversed the same day — §13.2 records
why, and the reasoning matters more than the outcome.

The rest of the doc — §2's surface map, §5's schema beyond the approved slice, §6's later feeds,
§7's full club entity, §12's booking ladder — remains **proposed, not approved**.

---

## 0. State audit — what the 2026-08-15 doc proposed vs what actually exists

Audited against the repo 2026-08-31. The original doc read as if none of it was built. Three
pieces shipped inside `20260822000000_profile_settings.sql` (the Settings IA slice), which cited
this doc as its spec and then diverged from it. That divergence is now the source of truth.

| Original § | Proposed | Actual state 2026-08-31 |
|---|---|---|
| §3.1 `follows` | table + denormalised counts | **Not built.** No `follows` anywhere in `supabase/migrations/`. |
| §3.1 `blocks` | table, bidirectional effect | **Shipped** (`20260822000000`). Row is one-directional (who pressed), enforcement is bidirectional via `blocked_between(a,b)` — `security definer`, because the reverse row is exactly what RLS hides from the caller. Wired into `player_card`, `nearby_games`, `request_to_join`. UI: `ui/app/settings/blocked.tsx`. |
| §3.2 `posts` | table + geo point + system kinds | **Not built.** |
| §3.3 comments / reactions / media | three tables | **Not built.** |
| §3.4 Q&A | `kind='question'` + accepted answer | **Not built.** |
| §3.5 `content_reports` | one table, 5 subject types | **Shipped narrower** as `user_reports` — **profile subject only**. Reasons are `harassment/no_show/unsafe/fake_profile/spam/other`, not the proposed set. Insert is RPC-only (`report_user()`) with a 1-per-target-per-day rate limit; no update policy; only `service_role` reads the queue. Venue data corrections have their own separate path (`report_venue_correction`, `20260815000900`). |
| §3.6 RLS | per-table policies | **Partial** — exists for `blocks`, `user_reports`, `profile_private`. Nothing for the unbuilt tables. |
| §4 feeds | `feed_home` / `feed_venue` / `feed_profile` | **Not built.** |
| §5 notifications | new social types | Pipeline **shipped** (`notifications` P0–P3, `notification_prefs` with 7 category toggles + `marketing` + quiet hours + `profiles.timezone`). **No social types.** |
| §6 profile visibility | `public` / `players_only` / `private`, default `players_only` | **Shipped two-valued**: `profiles.profile_visibility` is `everyone` \| `players_only`, **default `everyone`**, plus a separate `show_suburb` boolean. `private` never shipped. A deliberate **host carve-out** lets a host read a `players_only` profile that has asked to join their game — asking to join is the consent. UI: `ui/app/settings/visibility.tsx`. |
| §6 deletion tombstoning | extend `delete_account` | **Partially shipped** — `delete_account` now also clears `blocks` (both directions), reports *filed by* the user, `profile_private`, `notification_prefs`, `chat_prefs`, `notifications`, `rating_tags`. Posts/follows/club memberships still to add when those tables exist. |
| §8 seeded follows at onboarding | suggest 5 follows | **Not built.** |

### 0.1 Corrections the audit forces

1. **"Achievements are already computed" (old §2) was wrong.** `ui/lib/achievements.ts` is a pure
   client-side `check(ctx)` array rendered on the profile tab — there is no achievements table, no
   awarded-at timestamp, and no server event. An "X hit 10 games hosted" system post therefore
   needs a **server-side achievement award table first**, not just a feed writer. Budget it (§13).
2. **Report and block are the two hardest App Store 1.2 requirements, and both already exist.**
   §10's release gate is materially cheaper than the original doc priced it. What is still missing
   is *content-level* reporting, the pre-publish filter, and the human queue.
3. **The privacy default is the opposite of what this doc asked for.** Shipped default is
   `everyone`. §9 has to argue from that starting point, not from `players_only`.
4. **One reports queue is still the right call** — but the way to get there now is to *widen*
   `user_reports` in place, not to add a second `content_reports` table (§5.4).

### 0.2 Adjacent things that shipped and change this plan's assumptions

- **Anonymous Discover** (`nearby_games_public`, `20260831000000`; gtm G5). Session-less users now
  browse Discover. Any feed RPC must decide anon-or-not explicitly — §9 says **no**.
- **Server-rendered web pages** (`website/api/game/[id].js`, `website/api/venue/[slug].js`, the
  `/sydney` hub, a dynamic sitemap; gtm G3/G11) backed by anon-safe RPCs (`game_preview`,
  `venue_seo_detail`, `venue_seo_directory`). "Web is marketing-only" is now a statement about
  *interactivity*, not about content. §16 restates the boundary.
- **Waitlist** (`game_players.status = 'waitlisted'`, `20260830235900`) and **referral priority
  credits** (`profiles.referral_priority_credits`, `20260831010000`). Both are new demand signals a
  feed can surface ("this game filled in 20 minutes").
- **Analytics exists** (`ui/lib/analytics.ts`, PostHog, 11 events). None of them are social. §14
  names the ones to add.
- **`ai-proxy` is confirmed working in production** (gtm G4). The §10 pre-publish filter has a live
  server-side path to run on.

---

## 1. Positioning — the product widens, the message narrows

The stated destination is that a Sydney badminton player manages **everything** to do with the
sport inside Smashio: who they play with, where, when, at what level, in which club, in which
ladder, and eventually the court booking itself.

That destination contradicts three checked-in lines today:

- [business-context.md](business-context.md): *"Core loop is social matchmaking, not venue
  booking/inventory."*
- [gtm-plan.md](gtm-plan.md) §1: *"Anti-message: never say book courts."*
- [AGENTS.md](../AGENTS.md): *"Not a venue-booking app."*

**The resolution is a split, and it is the most important decision in this doc:**

> **The roadmap is "everything badminton". The launch message stays "there's a game tonight, near
> you, at your level, with spots left."**

They are not the same thing, and conflating them is how this fails. Reasons, in order of force:

1. **Liquidity is the only thing that matters right now.** gtm-plan §0 is unambiguous: the wedge is
   *supply*, sports is the most expensive Apple Ads category measured in 2026 (~$26.81 CPI), and
   the north star is **weekly liquid suburbs**, not installs. Breadth added before liquidity just
   gives a user more tabs to find empty.
2. **"Everything badminton" is a category claim, not a message.** Nobody downloads an app because
   it does ten things. They download it because it does the one thing they needed at 6pm on a
   Tuesday. Breadth is what makes them *keep* it, not what makes them get it.
3. **"Book courts" specifically loses.** Say it and the comparison set becomes YepBooking and the
   venue's own page, which are better at booking and will stay better until §12 rung 3. Say "find a
   game" and the comparison set is a WhatsApp group, which Smashio genuinely beats on skill
   matching and no-shows.

**Trigger to widen the message — DECIDED 2026-08-31:** **≥8 weekly liquid suburbs** *and* **≥30
hosts publishing weekly**. Until both hold, the anti-message stands and every new surface in §2 is
judged on whether it produces or fills games, not on whether it makes the app look complete.

Neither number is new: "weekly liquid suburbs" is already gtm-plan's north star (≥1 game published
*and* filled to ≥75% capacity in the trailing 7 days), and 30 weekly-publishing hosts is verbatim
gtm §4.1's Tier A target. Nothing extra to instrument. Eight suburbs is roughly two to three liquid
suburbs in each of gtm §2.2's three clusters — the claim becomes true across the geography being
marketed into, not just in one pocket of Auburn.

**What the trigger governs, and what it does not.** It governs *one sentence*: the App Store
subtitle, the website hero, and the top line of paid and community-channel creative. It does **not**
gate shipping any feature here, telling a recruited host the roadmap, or opening venue partner
conversations. Three reasons it exists at all:

1. **A category claim is judged in one screen.** "Everything badminton in Sydney" promises clubs,
   ladders, tournaments and games on open. A player in Hurstville who sees two games 15 km away
   does not read that as "early app", they read it as a lie. "There's a game tonight at your level"
   becomes true the moment one game exists near them.
2. **The claim picks the comparison set.** Claim everything and you are measured against WeChat
   groups *plus* Badminton NSW *plus* the venue's booking page, combined — a comparison you lose for
   years. Claim "find a game at your level" and you are measured against one WhatsApp group, which
   you beat on skill matching, no-shows and reliability.
3. **Rework was just paid for.** Store name, subtitle, keywords and the `zh-Hans` localisation all
   landed 2026-08-31 (gtm G10). Changing the pitch means redoing store copy, homepage and creative,
   and discarding accumulated keyword ranking. Do it once, when it is true.

The honest counter-argument, recorded because it may still win later: in RED and WeChat posts,
breadth may be exactly what separates Smashio from a group chat, and 8 + 30 could be six months
out. If that turns out to bind, the thing to revisit is the *numbers*, not the existence of a
trigger — without one, "everything badminton" leaks into a flyer, then the subtitle, then the
homepage, ahead of the product, and nobody ever makes the decision.

**Amendment to [business-context.md](business-context.md)** (one line, proposed): record the
long-run destination as *"category ambition: the badminton layer for Sydney — games first, clubs
and competition next, booking only as a partner integration"*, while the "core loop is matchmaking,
not inventory" line stays as the near-term operating rule. Do not rewrite gtm-plan §1.

### 1.1 The comparable, and why not to copy its order

Playtomic is proof the destination exists: ~16,000 courts, >2M players, with court booking, open
matches you can join to fill a single spot, an ELO-style level, a reliability percentage, and club
leagues all in one app. That is the shape being described here.

But it reached that shape **booking-first**, by selling club-management software (Playtomic
Manager) into venues and inheriting their inventory. Smashio's supply is player-hosted and its
venue relationships are informational (56 enriched rows), not contractual. **Copy the destination,
not the order.** For Smashio the order is games → clubs → competition → booking, and §12 explains
why the last rung may correctly never be climbed all the way.

---

## 2. What "everything badminton" decomposes into

The point of listing all ten surfaces is to be able to say *no* to seven of them credibly.

| # | Surface | Who owns it in Sydney today | Call |
|---|---|---|---|
| 1 | Player-hosted games | WhatsApp / WeChat / Meetup groups | **Shipped.** The core loop. |
| 2 | Venue directory | badmintoncourt.au, venue Facebook pages | **Shipped.** 56 enriched, 51 still in the P2 queue ([venues-plan.md](venues-plan.md) §8). |
| 3 | **Clubs / groups** | The groups themselves; Badminton NSW's affiliated list | **Build — §7.** This is gtm G12, deferred there and owned here. |
| 4 | **Feed / Q&A / "who's playing tonight"** | Group chats, Facebook groups | **Build — §3–§6.** Phase 1. |
| 5 | **Ladders, results, ELO** | Rankat, Ranking, Playtomic; locally, mostly nothing | **Build later — §13 C2.** Strongest weekly-return loop available and badminton-native. Gated behind clubs. |
| 6 | Tournaments & pennant calendar | Badminton NSW / Badminton Australia (Tournament Software, revolutioniseSPORT) | **Aggregate, don't own.** Read-only calendar, deep-link out. Entries, fees and draws stay with the association — owning them means owning refunds and disputes for no strategic gain. |
| 7 | Coaching | Individual coaches, centre programs, RacketPal | **Directory later, marketplace not yet.** A listing is cheap. Taking payment makes Smashio a marketplace with a duty of care and Working With Children Check exposure for junior coaching in NSW. Do not cross that line casually. |
| 8 | Stringing, gear, second-hand rackets | Facebook Marketplace, centre pro shops | **Defer.** Classifieds have the worst moderation-cost-to-value ratio of anything here — scams, payment disputes, a whole new report category — for content that does not produce a game. |
| 9 | Pro content, BWF scores, highlights | Badminton4U (BWF's own app) | **Never build.** Link out. Competing with the federation's own app for content nobody switches apps to get. |
| 10 | **Court booking** | YepBooking, ActiveCarrot, HelloClub, Zest, SportLogic, PerfectGym/PerfectMind, council systems | **Integrate in rungs — §12.** Not rebuild. |

Everything marked **Build** appears in §13's order. Everything else is a link, a read-only
aggregation, or a no — and each of those is a decision, not an omission.

---

## 3. Why the feed is still phase 1

Unchanged from the original doc, and the audit strengthens it. Today the retention loop only fires
when *someone else* has hosted. A player in a suburb with no host this week has no reason to open
the app, and no way to *become* the reason.

Three specific jobs, none of which is "be a social network":

1. **Supply cold-start.** A post — "anyone free at NBC Thursday 8pm?" — is a game that hasn't been
   created yet. **Converting posts into games is the single highest-value flow in this plan**, and
   the only one whose failure kills the phase (§14).
2. **Retention between games.** A reason to open on a non-play day.
3. **Trust before the game.** Join decisions currently rest on a display name and a reliability
   band. History, posts and shared venues make the decision easier, which lifts join-rate on supply
   that already exists.

And one new job the widened vision adds:

4. **The feed is the connective tissue.** Clubs, venues, ladders and games are separate nouns until
   something renders them in one stream. Without it, "everything badminton" is a tab bar with seven
   tabs — which is the failure mode, not the goal.

**The failure mode to design against** is unchanged: a generic feed nobody posts in, sitting in a
tab, making the app look dead. Every mechanic below produces content as a *by-product of playing*.

---

## 4. Content that writes itself

Before any user-composed post, the feed must already be full. Sources, in order of volume:

| Auto-generated card | Trigger | Exists today? |
|---|---|---|
| "Game at NBC South Granville, Thu 8pm — 3 spots" | game published | yes, the host flow |
| "Ajay played at BadmintonWorx Botany" | game completed | yes, `games.status = 'completed'` |
| "This one filled in 20 minutes, 4 on the waitlist" | game reaches capacity | yes, `game_full` notification + `waitlisted` status |
| "5 games at Five Dock this week" | venue activity rollup | derivable |
| "New venue: Alpha Badminton Centre, 10 courts, pro shop" | `venue_profiles` row added | yes |
| "Sky Hawks are playing Thursday at Roketto" | club game published | **needs §7 clubs** |
| "Ravi hit 10 games hosted" | achievement awarded | **needs a server-side awards table, §0.1** |

These are rows in `posts` with `kind='system'` and a `payload jsonb`, written by triggers as
service role, never by the client. A brand-new user with zero follows sees a full local feed on day
one; user posts then land *into* an alive surface instead of an empty one.

---

## 5. Schema

Delta only. `blocks` and the reports table already exist (§0) — do not re-create them.

### 5.1 Graph

```sql
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows(followee_id);
```

Follow is **asymmetric and public** (Twitter-shaped, not Facebook-shaped) — no accept step, which
removes a whole request/notification/state surface. Denormalised `follower_count` /
`following_count` on `profiles`, maintained by trigger: the counts render on every profile card and
a `count(*)` per card is an N+1 waiting to happen.

`follows` must respect the existing block — a `blocked_between()` guard on insert and the same
predicate in every read. Reuse the shipped function; do not write a second block check.

### 5.2 Posts

```sql
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete cascade,   -- null for system posts
  kind text not null check (kind in ('text','question','looking_for_players','system')),
  body text,
  sport_id uuid references public.sports(id),
  venue_id uuid references public.venues(id) on delete set null,
  game_id uuid references public.games(id) on delete set null,
  club_id uuid references public.clubs(id) on delete set null,       -- §7
  point extensions.geography(Point, 4326),   -- copied from venue or author home_point at write
  payload jsonb,                             -- system-post render data
  accepted_answer_id uuid,                   -- questions only, FK added after comments exists
  reply_count int not null default 0,
  reaction_count int not null default 0,
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index posts_feed_idx   on public.posts (created_at desc) where status = 'visible';
create index posts_point_idx  on public.posts using gist (point);
create index posts_venue_idx  on public.posts (venue_id, created_at desc);
create index posts_club_idx   on public.posts (club_id, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
```

`point` is denormalised at write time so the local feed is one GiST range query, not a join through
`venues` per row — the same trade `nearby_games` already makes. **`point` is never returned to a
client** (§9); it is a filter input only.

`kind='looking_for_players'` is the supply-conversion post type: it carries a venue, a date/time
window and a skill tier, and renders with a **"Turn this into a game"** button that opens the create
wizard prefilled. That button is the point of the whole feature. `ui/lib/pendingGame.ts` already
models a deferred wizard prefill — reuse it rather than inventing a second path.

### 5.3 Comments, reactions, media

```sql
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  created_at timestamptz not null default now()
);

create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null,
  width int, height int,
  ordinal int not null default 0
);
```

One reaction type (a like), not an emoji palette. Chat v2 already ships an image pipeline
(`20260815000700_chat_v2.sql`) — `post_media` reuses that bucket and upload code rather than
inventing a second one.

**None of these three are in the approved v1** (§13.1). Comments and reactions are held because
every comment is another reportable object; `post_media` is held because feed images are the one
place in this plan where a stranger's photo reaches a stranger's screen, and the §10 filter only has
a text path today. All three land in B3 (§13.4).

### 5.4 Reports — widen `user_reports`, do not add a second table

The original §3.5 argued for one queue, one SLA, one place to prove compliance. That argument still
holds; what changed is that half of it shipped as a profile-only table. Adding `content_reports`
alongside it would create exactly the two queues the argument was against.

```sql
alter table public.user_reports
  add column subject_type text not null default 'profile'
    check (subject_type in ('profile','post','comment','photo','message','club')),
  add column subject_id uuid;

update public.user_reports set subject_id = reported_id where subject_id is null;
alter table public.user_reports alter column reported_id drop not null;
```

`reported_id` survives as **"the account responsible"**, which is what repeat-offender counting
actually needs, while `subject_id` points at the thing. Reasons widen to add
`hate`/`sexual`/`violence`/`misinformation`. A `report_content(subject_type, subject_id, reason,
detail)` RPC mirrors the shipped `report_user()` and shares its rate-limit shape. No rename, no data
migration, one queue.

### 5.5 RLS

- `posts` / `post_comments`: `select` where `status='visible'` **and** `not blocked_between(...)`;
  `insert` own row; `update`/`delete` own row only. `kind='system'` inserts rejected from
  `authenticated` — triggers write those as service role.
- `post_reactions`: `insert`/`delete` own row.
- `follows`: `insert`/`delete` own follower row; `select` open (counts are public).
- Everything `authenticated`-only. **No anon grants on any feed table or RPC** (§9).

The block check belongs in the RLS policy, not the client query — a client-side filter is a
workaround, not a block. `blocked_between()` is already `security definer` and granted to
`authenticated`; use it.

---

## 6. Feeds

Four RPCs, all keyset-paginated on `(created_at, id)` — no `offset`.

### 6.1 `feed_home(p_lat, p_lng, p_radius_m, p_sport_slug, p_cursor, p_limit)`

**Signature decided 2026-08-31 — takes a centre and a sport, mirroring `nearby_games`.** It does
*not* read `home_point` server-side. That was the original design and it was broken:
`onboarding/nearby.tsx` is *"a pre-prompt, not a gate"* where **"Not now" is a real answer**, so a
null `home_point` is a supported state — and a location-less new user would have had zero follows
*and* no local posts, i.e. an empty feed, contradicting §4's whole premise. Taking the centre as a
parameter deletes the null case: the client passes whatever it already uses for Discover, falling
back to `DEFAULT_LAT` / `DEFAULT_LNG` (`ui/lib/queries/games.ts:14`).

**Use the same fallback constant as Discover, not a badminton-denser one.** `DEFAULT_LAT/LNG` is
Sydney CBD; gtm §2.2 puts actual demand west and south-west (Auburn, Granville, Lidcombe). Tempting
to centre the feed there instead — don't. A location-less user seeing Auburn games in the feed and
CBD games in Discover is incoherent. If the default should move, move it **once, for both surfaces**,
which is a Discover decision and belongs in [discover-plan.md](discover-plan.md).

`p_sport_slug` exists because AGENTS.md requires sport to stay config, not code. Badminton is the
only value today (`SPORT_SLUG` in `games.ts:17`); the parameter is what stops that becoming a
hardcoded predicate inside the RPC.

Union of: posts by people I follow, posts within `p_radius_m` of that centre, posts from clubs I
belong to, and system posts for games near me. Ranked by a decayed score computed in SQL:

```
score = ln(1 + reaction_count + 2*reply_count)
      + 2.0 * (author is followed)
      + 1.8 * (club is one I'm in)
      + 1.5 * (venue is one I've played at)
      - 0.6 * ln(1 + distance_km)
      - 1.2 * hours_since_post / 24
```

Deliberately a hand-tuned heuristic, not a model: inspectable, one query, weights legible enough to
argue about. **Freshness beats relevance early** — while local post volume is low, sort by recency
and let the score break ties.

### 6.2 `feed_venue(p_venue_id, …)`

Posts and system cards for one venue, rendered as a tab on `ui/app/venue/[id].tsx`. Highest-signal
feed available — "who's playing at Five Dock tonight" is a real question with a real answer — and it
turns the venue directory from reference-only into retention-generating.

### 6.3 `feed_profile(p_profile_id, …)`

A player's posts plus public history. Turns the player card (`20260815000100`) into a destination.
Must honour `profile_visibility` exactly the way `player_card` does, host carve-out included.

### 6.4 `feed_club(p_club_id, …)` — §7

Same shape as `feed_venue`, anchored on the club. This is the surface a recruited group actually
wants: their sessions, their people, their thread, in one place.

---

## 7. Clubs — promoted from "not doing" to a real entity

The original doc listed clubs under "not doing" but recorded that the evidence had shifted. It has
shifted further, and gtm-plan G12 explicitly parks the problem here.

**The evidence:**

- [data/venues/clubs-badminton-nsw.json](../data/venues/clubs-badminton-nsw.json) — **56 Badminton
  NSW affiliated clubs, ~46 in Sydney**, most with a named hall and weekly session times.
- venues-plan §3 axis 3: **a club is not a venue.** The club-plus-host-venue pair recurs (Avalon BC
  / Avalon Rec Centre), and **Muirfield High School, North Rocks hosts four different clubs** — the
  densest hall found. One venue, four social objects.
- gtm-plan §2.1: Sydney plays as named groups ("Sky Hawks" — Roketto Mon, Alpha Auburn Thu, Roketto
  Sat). gtm §4.1's entire Tier A strategy is hand-recruiting ~30 such organisers.
- gtm G12: *"A recruited host's group has no object to own, so it can't bring its identity across."*

A host recruited under gtm §4.1 is being asked to move a group that has a name, a history and a
reputation into an app that models none of them. `games.club_id` is the single column that fixes it.

```sql
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sport_id uuid not null references public.sports(id),
  home_venue_id uuid references public.venues(id) on delete set null,
  suburb text,
  point extensions.geography(Point, 4326),
  bio text,
  photo_path text,
  cover_key text,                            -- reuse 20260824000300 covers
  contact_url text,
  affiliation text check (affiliation in ('badminton_nsw','university','independent','commercial')),
  visibility text not null default 'public' check (visibility in ('public','unlisted')),
  member_count int not null default 0,
  claimed_by uuid references public.profiles(id) on delete set null,  -- null = seeded, unclaimed
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','organiser','member')),
  status text not null default 'active' check (status in ('pending','active','removed')),
  created_at timestamptz not null default now(),
  primary key (club_id, profile_id)
);

alter table public.games add column club_id uuid references public.clubs(id) on delete set null;
```

Design notes, each load-bearing:

- **A club is not a venue and never becomes one.** `home_venue_id` is a hint for the club page and
  the map, not an identity. Muirfield is the counter-example that makes this non-negotiable.
- **Seed all 56 unclaimed.** Rows land from the Badminton NSW JSON with `claimed_by = null`. An
  unclaimed club page is still useful: it is SEO inventory for the G11 web surface, and it is the
  thing a recruiter points an organiser at ("your club already has a page, claim it"). Claiming is
  manual verification — the same white-glove motion gtm §4.1 already commits to.
- **`games.club_id` is nullable and stays nullable.** Solo hosts are the majority and must never be
  forced through a club to publish.
- **Membership is not approval to play.** Joining a club does not auto-approve you into its games;
  the host still decides. Conflating them would quietly delete the join-request flow the whole trust
  model rests on.
- **Blocks apply.** `blocked_between()` filters club member lists and club feeds, same as everywhere
  else.
- **Clubs multiply the moderation surface** — a club bio, a club photo, a member list. `subject_type`
  in §5.4 already carries `'club'` for exactly this.

---

## 8. Notifications

Reuse `push_dispatch` and the shipped `notifications` table. **Do not add a second delivery path.**

New types: new follower, reply to your post, answer to your question, accepted answer, mention,
someone you follow posts a `looking_for_players` near you, club invite, club game published.

Two new `notification_prefs` columns matching the existing shape: `social` and `club`. Defaults
conservative — **mentions and direct replies on; "someone you follow posted" off.** A social layer
that pushes aggressively is how a useful app gets uninstalled. Quiet hours already exist and apply.

**Digest, not firehose:** "3 new games near you this week" as one scheduled push beats three
individual ones. `pg_cron` already runs `recompute-reliability` and `purge-confirmations`, so the
scheduling primitive exists.

---

## 9. Privacy

A public feed changes the privacy posture of an app people currently use semi-privately. The shipped
baseline is `profile_visibility` defaulting to **`everyone`**, so these are constraints on top of a
more open default than the original doc assumed.

Non-negotiables:

- **Never expose `home_point` or `posts.point`.** Feeds return distance buckets ("~3 km away"),
  never coordinates, and never a raw suburb for a user with `show_suburb = false`. `point` is a
  filter input, never a returned column.
- **Feeds are `authenticated`-only.** Anonymous Discover now exists (`nearby_games_public`) and is
  deliberately stripped of organiser PII and exact addresses. A feed row carries an author identity
  *and* a location, which is a different risk class. No anon grant, no SEO exception.
- **Keep two visibility levels, not three.** Do not add `private`. A private profile in a matchmaking
  app is a contradiction, and the shipped `players_only` plus host carve-out already covers the fear
  it was meant to address. `feed_profile` must apply the same gating as `player_card`, carve-out
  included.
- **Posting is opt-in by action.** No auto-posting a user's completed games to a wider audience
  without a setting; the day-one default for "share my completed games" is on for the *local* feed
  and off for anything wider, and it is one toggle to kill.
- **Blocked users** disappear from feeds, rosters, club member lists, search, and cannot request to
  join your games. Enforcement is `blocked_between()` in RLS, as shipped.
- **Deletion tombstones posts, comments, reactions, follows and club memberships** the way
  `delete_account` already tombstones blocks and reports. Ship it in the same slice as the tables,
  not after — the shipped function is the pattern, extend it.

Any bug that leaks coordinates is P0.

---

## 10. Moderation — a release gate, not a nice-to-have

App Store Review Guideline 1.2 requires apps carrying user-generated content to have **all** of: a
filter for objectionable content, a report mechanism with timely response, the ability to block
abusive users, and published developer contact info. Google Play's UGC policy is equivalent.
**Shipping a feed without these is a rejection, plausibly a removal.** Play submission is already
blocked on device verification (see memory: Play Store blocker); a second rejection reason is not
affordable.

Already shipped — the two hardest items:

1. ✅ **Block** on every profile, enforced in RLS via `blocked_between()`.
2. ✅ **Report a player**, rate-limited, RPC-only, service-role queue.

Still required before user-authored content reaches TestFlight:

3. **Content-level report** on every post, comment, photo and club — the §5.4 widening.
4. **Automated pre-publish filter.** Route post and comment bodies through `ai-proxy` (server-side
   only, per [tech-stack.md](tech-stack.md); confirmed working in production per gtm G4) for a
   classification pass. Hard-block the obvious; queue the borderline as `status='hidden'` pending
   review. Fail **open with a queue entry**, not closed — an LLM outage must not silently eat every
   post, but it must leave a trail.
5. **Human queue + SLA.** A Supabase dashboard view is enough at first, plus a committed 24-hour
   response target. Someone has to own this daily.
6. **Published contact plus in-app community guidelines / EULA** with a no-tolerance clause for
   objectionable content — Apple asks for this explicitly.
7. **Rate limits** at the RPC layer, decided 2026-08-31: **10 posts/day, 30 comments/day, 50
   follows/day, per user.** Reports keep the shipped `report_user()` limit of 1 per target per day.
   Loose enough that no legitimate user meets them, tight enough to cap a spam run at a volume one
   person can clear by hand. Spam is the likeliest first abuse, well before harassment.

**Filter timing — synchronous, decided 2026-08-31.** The composer blocks on the `ai-proxy`
classification with a **2-second timeout**, then fails open per item 4 (publish + queue entry). A
sub-second spinner on submit is an ordinary interaction, and it means a post is **never visible to
anyone before it has been cleared**. The optimistic alternative — publish immediately, classify
after — either shows unvetted content to others or makes a post appear and then vanish, which reads
as a bug rather than as moderation. **Instrument classification latency from day one**: if p95
exceeds ~1.5 s the trade flips, and the upgrade path is an author-visible-only `pending` status
rather than true optimistic publish.

**Enforcement point — corrected 2026-09-01.** As first shipped, item 4 lived entirely in the
composer client (it called `ai-proxy` classify, then `create_post`). Testing found that skipped
the filter completely for anyone calling `create_post` directly with a valid session JWT — no
`ai-proxy` call, no `moderation_flags` trail, nothing; the RPC itself never checked. `create_post`
now calls `ai-proxy` itself via Postgres's `http` extension, authenticated by a shared secret in
Vault (`ai_proxy_service_key`) rather than a user JWT — same pattern as `push_dispatch_key`
(backend-plan.md). The composer's own pre-call was removed (redundant, was double-billing Gemini).
**The 2-second timeout above is `ai-proxy`'s internal Gemini budget only** — the RPC's own HTTP
timeout to `ai-proxy` is 8 s, wide margin over that 2 s so Postgres doesn't give up on a slow-but-
real classification before it lands (a 3 s RPC timeout raced ai-proxy's 2 s and fail-opened a
Gemini-flagged spam post through once during testing — this is why the margin is wide, not tight).

**Owner — DECIDED 2026-08-31: Ajay, daily, 24-hour response SLA.** Realistic at private-beta volume
in one city, and it is a named commitment rather than a role to be filled later. **Hand-off
trigger:** if the queue exceeds ~10 open items in any week, or a day is missed twice in a month,
that is the signal to recruit a moderator (a Founding Host or trusted regular) rather than let the
SLA quietly lapse. Apple wants a developer-side mechanism with a response commitment, so this stays
owned here even after clubs exist — club owners moderating their own club content is additive, never
a replacement.

**Items 3–7 are on the critical path from the first release** — the approved slice (§13.1) includes
the composer, so B5 ships with or before B2. An earlier plan deferred this by holding the composer
back; that was reversed (§13.2).

Worth stating plainly, because it is the fact that makes this tractable: **1.2 already applies to
Smashio today.** In-game chat with image upload has shipped since chat v2. Posts widen an obligation
already carried, they do not create a new one — which is why items 1 and 2 were already built before
this plan existed.

---

## 11. Cold start

The feed launches to a private beta of a few hundred Sydney players. Plan for thin:

- **Seed with system posts** (§4) so the feed is never empty.
- **Geo-scope hard.** One city, one sport. A national empty feed feels dead; a Sydney feed with 20
  posts a week feels like a scene. Match gtm §2.2's three clusters, not "Sydney".
- ~~**Seed follows at onboarding**~~ — **deferred out of v1** (§13.6). auth-onboarding-plan rules it
  out by name, and P4 deliberately collapsed onboarding to one screen. Returns later as an inline
  "people you've played with" card on first feed visit. **Consequence to hold onto:** v1 users start
  with zero follows, so system posts (§4) and seeded clubs (C0) carry the entire cold-start load.
  If the feed reads as empty in testing, this is the first thing to reinstate.
- **Seed clubs, not just posts** (§7). 56 unclaimed club pages is a populated directory on day one
  and a recruiting artefact on day two. Approved as C0 (§13.2) and sequenced *ahead* of the full
  club entity for exactly that reason.
- **Recruit ~20 posters by hand** from the beta and from the club list. Community products are
  started by people, not algorithms.
- **Reuse the shipped cold-start pattern.** `ColdStartEmpty` in `ui/app/(tabs)/discover.tsx` (gtm
  G14) already solves "widen silently, show the nearest real thing, offer an alert, offer to host".
  The feed's empty state should be that same ladder, not a new invention. `EmptyState.tsx` and the
  smashimals cast ([smashimals-plan.md](smashimals-plan.md)) own the illustration side.

---

## 12. The booking ladder — direction only, not scoped work

"Manage everything badminton inside the app" ends at booking a court. This section exists so that
ambition has a shape instead of a vibe. **None of it is in §13's budget.**

**What the repo already knows.** `venue_profiles` carries `bookability`
(`public`/`club_only`/`members_only`/`unknown`), `booking_platform` and `booking_url`, populated
across the 56 enriched venues. Those URLs show the Sydney booking layer is **concentrated, not
fragmented**: `*.yepbooking.com.au` appears for NBC South Granville, Alpha Auburn and StarSmash;
then ActiveCarrot, HelloClub, Zest, SportLogic and PerfectGym/PerfectMind; then council systems
(City of Sydney, Campbelltown, Inner West, Willoughby) and institutional ones (Y NSW, PCYC, SUSF and
university sport). Re-derive exact counts from the live `venue_profiles` table before acting — the
seed migrations are not a census.

That concentration is the whole opportunity: **one platform integration covers many venues**, the
same leverage venues-plan §3 found for chains ("one operator conversation covers many venues").

| Rung | What it is | State | What it costs |
|---|---|---|---|
| **0** | Link out. `booking_url` on the venue screen; `bookability` stops a `club_only` hall rendering a "host here" CTA. | **Shipped** | done |
| **1** | **Availability read.** "3 courts free at Alpha tonight" surfaced in Discover and on the venue page, from partner-supplied availability. | Not started | One integration per platform, starting with YepBooking. Needs an operator agreement or a supported API — **scraping a booking system is fragile and legally unattractive; go through the operator.** |
| **2** | **Assisted booking.** Deep-link into the venue's own flow prefilled with the wizard's date/time/court count, then attach the resulting confirmation to the game via the existing `game_confirmations` + verified-badge path. | Not started | Mostly client work once rung 1 exists. **No money changes hands** — this rung gets ~80% of the felt benefit for ~10% of the risk. |
| **3** | **Booking in app.** Smashio takes payment. | Not started | Merchant of record, refunds, per-venue cancellation policy, inventory sync, and a source-of-truth fight with the venue's existing system. This is where Smashio stops being an app and becomes a payments business. |

**The honest read:** rung 3 competes head-on with SportLogic, Daifo, YepBooking and PerfectGym, who
own the venue relationship, the front-desk workflow and the money. Playtomic only got there by
*becoming* the club software first. The realistic Australian path is **rung 1 + rung 2 as the
permanent product**, with rung 3 attempted only alongside 2–3 anchor venues under a signed revenue
share who have *asked* for it. Gate rung 3 on demand from venues, never on product ambition.

**The marketing constraint holds throughout:** even at rung 2 the message is "your game, sorted",
not "book courts" (§1).

**DECIDED 2026-08-31: deferred entirely.** No YepBooking or other operator outreach for now — not
even the zero-cost first email. This section stays recorded direction only. When venue conversations
do start, gtm §4.3 already plans them (QR posters, verified venue pages, off-peak fill), and the
booking-platform question folds into those rather than running as a separate track. Revisit after
liquidity.

---

## 13. Build order

Estimates are working days. Restructured twice on 2026-08-31 — first around a read-only checkpoint,
then **revised to include the composer** after that checkpoint was reconsidered and rejected. §13.2
records why, because the reasoning is the useful part.

### 13.1 Approved — text feed with composer (~11.5 d + 1 d)

| Slice | Scope | Est. |
|---|---|---|
| **B0** | `follows` + counts + follow/unfollow on the player card + follower lists. **No onboarding step** — see §13.6. | 2 d |
| **B0.5** | Server-side achievement awards table + backfill, so §4's achievement cards have a trigger (§0.1). Server becomes the single source of truth; `ui/lib/achievements.ts` keeps the labels and icons but renders awarded rows. | 1 d |
| **B1** | `posts` + system-post triggers (§4) + `feed_home` + feed surface. | 3 d |
| **B2** | Composer, **text only**: `looking_for_players` first, then plain `text`. **"Turn this into a game"** → prefilled wizard via `ui/lib/pendingGame.ts`. Rate limits at the RPC layer. | 3 d |
| **B5** | Moderation (§10 items 3–7): widen `user_reports` with `subject_type`/`subject_id`, `report_content()` RPC, `ai-proxy` pre-publish text classification, Supabase-view admin queue, community guidelines + EULA. | 2 d |
| **B7** | Privacy: distance buckets, `feed_profile` visibility gating, deletion tombstoning for the new tables. | 1.5 d |
| **N1** | Nav: merge Chat into My Games, feed takes the freed tab slot — see §13.5. **Blocks B1**, which has nowhere to render until this lands. | 2 d |
| **C0** | Clubs, seed-only — see §13.3. | 1 d |

Total ~12.5 d for the feed release, plus 1 d for C0 which ships separately and first. See §13.6 for
the order and the reasoning behind the two-ship split.

Three scope cuts inside this slice, each carrying real risk reduction:

- **Text only. No `post_media` in v1.** Images are where 1.2 risk actually concentrates — a text
  classifier through `ai-proxy` is a solved problem, an image one is not. `post_media` (§5.3) moves
  to B3 and is not built here.
- **No comments, no reactions in v1.** Every comment is a separate reportable object; they multiply
  the moderation surface for far less value than the composer itself. Also B3.
- **`looking_for_players` ships before plain `text`.** It is the supply-conversion type — the one
  that carries a venue, a time window and a tier, and renders the "Turn this into a game" button.
  Build the flow that justifies the feature first, not the generic one.

**B5 ships with or before B2, not after.** The first user-authored post must not reach TestFlight
without content-level reporting and the pre-publish filter in place. B7 ships with B1 so deletion
handling lands with the tables that need it.

### 13.2 Why the read-only checkpoint was rejected

Recorded because the argument generalises. The earlier plan approved B0+B0.5+B1+B7 only — a feed of
auto-generated cards, no composer — on the reasoning that it dodged the App Store 1.2 gate and
cheaply tested whether a feed retains. Both halves turned out to be weak:

1. **1.2 already applies to this app.** In-game chat with image upload has shipped since chat v2, so
   Smashio has been carrying user-generated content the whole time. That is precisely why `blocks`
   and `user_reports` exist (§0) — the Settings IA slice built them because chat's "Report" action
   had been an `Alert` with no network call. Of 1.2's four requirements, block, report-a-person and
   published contact are all done. Adding posts widens an existing obligation; it does not cross a
   new threshold. The remainder is B5, two days, half of it mechanical.
2. **A system-post feed is largely Discover re-skinned.** Game published, game completed, game
   filled, venue rollups, new venue — a Sydney user can already see nearly all of it in Discover. If
   that feed underperformed, the lesson would be "system cards don't retain", which says nothing
   about whether user posts would. The checkpoint would have cost 7.5 days to answer a question
   adjacent to the one that matters.
3. **The composer *is* the thesis.** §3 names supply cold-start as job #1 and §14 names post → game
   conversion as the metric that decides the phase. Both live entirely in B2. Holding it holds the
   bet.

**What that costs, stated plainly:** the daily moderation queue (§10) is now on the critical path
from the first release, not deferred. At private-beta scale — a few hundred users, one city, text
only — that is a handful of items a week, which the named 24-hour SLA absorbs comfortably. It stops
being comfortable if the beta widens faster than the hand-off trigger in §10 gets acted on.

### 13.3 C0 — clubs, seed-only

Approved as the cheap way out of the circularity in §17 decision 4: full clubs are gated on
liquidity, but the host recruiting that *creates* liquidity is the thing clubs would help most.

Scope: the `clubs` table and the seed from
[data/venues/clubs-badminton-nsw.json](../data/venues/clubs-badminton-nsw.json) — 41 unique clubs
plus 2 venue-only rows with no club name attached (43 rows; the doc's earlier "56-row" figure did
not match the source file), plus anon-safe
`club_seo_detail` / `club_seo_directory` RPCs and `website/api/club/[slug].js`, reusing the exact
pattern `website/api/venue/[slug].js` already established (gtm G11). Sitemap and the `/sydney` hub
pick them up.

**Explicitly not in C0:** `club_members`, `games.club_id`, any in-app club screen, `feed_club`, the
claim flow. Those are C1.

Three constraints, all load-bearing:

- **Thin pages stay `noindex`.** G11 already established that unenriched venues hurt more than they
  help. Same rule: only clubs with a named hall *and* session times from the JSON get indexed; the
  rest exist as rows and as a recruiting artefact, not as search inventory.
- **The page must be honest about what it is.** An unclaimed club page has no games attached — there
  is no `games.club_id` yet. It renders what the Badminton NSW data actually supports (hall, suburb,
  session times, a link to the venue page, contact) and a "get the app" CTA. It must not imply live
  sessions it cannot show. Its real job is the recruiting line — *"your club already has a page,
  claim it"* — and secondarily the "sky hawks badminton sydney" long-tail query.
- **Takedown path on every club page — decided 2026-08-31.** A visible *"This is our club — update
  or remove this page"* link to a contact address. These are pages about real organisations,
  published from public directory data without asking them first; republishing is defensible, but
  having no route to object is not. It doubles as a recruiting inbox — an organiser who writes in to
  correct their session time is an organiser who has just started a conversation.

  Shipped alongside it, because it is the same page furniture and near-zero cost: a visible
  **"last checked <date>"** stamp, sourced from the sweep date rather than hardcoded. The data is
  from the 2026-08-15 sweep and session times drift; a stamp lets a reader judge the age instead of
  assuming it is live. **Re-verifying the 56 rows before publishing was considered and not done** —
  the stamp plus the takedown link is the cheaper honest treatment. If a club's times turn out to be
  wrong in a way that matters, that is what the link is for.

### 13.4 Held — not approved

Sized here so each is a small decision when its turn comes.

| Slice | Scope | Est. | Gate |
|---|---|---|---|
| **B3** | `post_comments`, `post_reactions`, **`post_media`**, `feed_profile`. Media and comments were cut out of B2 (§13.1) and land here. | 3 d | after B2 is live and measured |
| **B4** | Q&A (`kind='question'`, accepted answers) + `feed_venue` on the venue screen. | 2 d | — |
| **B6** | Social + club notification types, per-type toggles, digest cron. | 2 d | — |
| **C1** | Clubs, full: `club_members`, `games.club_id`, in-app club page, `feed_club`, manual claim flow on top of C0's rows. | 3 d (was 4 — C0 does the seed) | §1 trigger |
| **C2** | Ladders: opt-in match results + ELO, scoped to a club. | 4 d | after C1 |
| **D1** | Tournament / pennant calendar aggregation, read-only, deep-linked out. | 2 d | §1 trigger |
| **D2** | Coaching directory, listings only, no payments. | 2 d | §1 trigger |

**B3 carries the image risk that B2 deliberately avoided.** Before it ships, the §10 pre-publish
filter needs an image path, not just the text one — `ai-proxy` classifying a photo is a different
problem from classifying a sentence, and `post_media` is the first surface where a stranger's image
reaches a stranger's feed. Chat images are scoped to an approved roster of about eight people who
have met or are about to; feed images are not. Do not treat B3 as a continuation of B2's approval.

### 13.5 N1 — where the feed lives

**Decided 2026-08-31: merge Chat into My Games; the feed takes the freed tab slot.** Tab set becomes
`Discover | Feed | My Games | Profile` — still four items, so [nav-plan.md](nav-plan.md)'s measured
constraints (56×52 targets, always-visible labels, validated at 375 pt / fontScale 1.3) hold
unchanged. Read nav-plan and [my-games-plan.md](my-games-plan.md) before touching this.

**Why Chat is the tab to give up:**

- **Chat has no independent existence.** Threads are per-game and joined-players-only. There are no
  DMs and §16 says there never will be, so a top-level Chat tab advertises a messaging product that
  does not exist.
- **The thread set is already the agenda.** `20260824000200_close_chat_on_cancel_complete.sql`
  closes threads on cancel and completion, so live threads ≈ My Games' upcoming list. The merge is
  a near-exact overlap, not a compromise.
- **my-games-plan already asked for it.** Its §2 synthesis lists *"every commitment shows a human
  (host, faces, thread)"* and *"actions live on the card, not one screen deeper"* among the five
  things good "my stuff" screens share, and its §3 records that My Games has none of the five.

**Why not the alternatives**, recorded so they are not re-proposed:

- **Move My Games under Profile** (the original suggestion). Rejected: My Games is ~95% future-facing
  per my-games-plan §1 (Attendee 55%, Day-of 20%, Host 20%, Returner 5%). Burying it costs the
  day-of cohort its *"zero taps to navigate"* success criterion, orphans the pending-request badge
  (`TabBar.tsx:137`) onto a surface where a badge means "something about me", re-creates nav-plan
  defect #3 for a destination phase 1 just finished labelling, and strands `HostFab`, which nav-plan
  2a mounts on Discover and My Games precisely because it is noise on Profile.
- **A fifth tab.** Overrides nav-plan phase 1's validated four-item layout for no gain once Chat's
  slot is available.
- **Feed as a Discover segment.** Cheaper (~0.5 d) and the conservative shape for an unproven
  surface — it stays subordinate to the core loop. Passed over in favour of giving the feed a real
  home and its own badge. **This remains the rollback**: if §14's kill criterion fires, demote the
  feed to a Discover segment rather than defending a dead tab.

**Scope of N1:** `(tabs)/chat.tsx` (184 lines) becomes a `/chat` route reachable from My Games rows
and from the thread entry point on each game card; `chat/[id].tsx` is untouched. Unread count moves
from the Chat tab badge to a per-row badge on My Games plus a tab-level rollup. `useTabBarSpace()`
and the `BottomRail` slots are unaffected — `HostFab` stays mounted on Discover and My Games.

**Anon behaviour — decided 2026-08-31: the Feed tab walls to `/onboarding` on press.** Session-less
users land on Discover (gtm G5) and can see the whole tab bar, but §9 keeps every feed RPC
`authenticated`-only, so there is nothing to render for them. Walling matches what Map, alerts, Host
and every non-Discover tab already do — one pattern, not a new one — and it avoids building a
signed-out teaser for a surface whose value is entirely personalised. The signed-out hook stays the
web pages (gtm G3/G11), which is where a stranger actually arrives from.

**The cost, stated plainly:** chat unread is a high-frequency return trigger and this adds taps for
the most engaged users. Mitigated by push deep-linking straight to `chat/[id]`, so the tab was never
the main entry path — but instrument chat-open rate before and after, because this is the change
most likely to quietly reduce engagement while looking like an IA improvement.

### 13.6 Implementation sequence

§13.1 lists *what*; this is the order and why. It splits into **two ships**, which matters — C0 has
no app surface at all.

**Ship 1 — C0, standalone, ~1 d.** A migration plus a web deploy. No app release, no dependency on
anything below. It should go **first and immediately**, because its whole value is serving gtm §4.1
host recruiting *now* ("your club already has a page, claim it"), and that recruiting is the live
activity. Waiting ~13 days for the app work would waste the only slice with immediate outside value.

**Ship 2 — the feed, one app release, ~12.5 d.** Everything else lands together. B0 never ships
alone (§17.1), and N1 must not reach users before there is something in the new tab, so the release
boundary is all-or-nothing.

Dev order inside ship 2, ordered by dependency and by how cheaply each step can be verified:

| # | Slice | Why here |
|---|---|---|
| 1 | **B0** — `follows` | `feed_home` unions "posts by people I follow" and scores "author is followed", so the table has to exist before the RPC can be written. Verifiable in SQL alone. |
| 2 | **B0.5** — achievement awards | Same reason: §4's achievement system-post trigger needs an award event to fire on. Also pure data, verifiable without UI. |
| 3 | **B1 + B7** — `posts`, system triggers, `feed_home`, privacy, deletion tombstoning | The data layer, complete. B7 rides with B1 deliberately (§13.1) so deletion handling lands with the tables it covers rather than trailing them. At the end of this step the feed is queryable and correct with no screen attached. |
| 4 | **N1** — nav | Put it on screen only once there is real data behind it, so the nav change is verified against a populated feed instead of a placeholder. Chat-merge UI is fiddly; it should not be the last thing touched before a release. |
| 5 | **B5** — moderation | Must precede the composer, never follow it. Widening `user_reports` is independent and could go earlier, but the `ai-proxy` filter is only testable once posts exist (step 3) and only meaningful once users can write (step 6). |
| 6 | **B2** — composer | Last. Riskiest UI, and it benefits from everything under it being stable. `looking_for_players` before plain `text` (§13.1). |

**Two things to capture before step 4 ships**, both unrecoverable afterwards: **chat-open rate and
messages-per-active-game** as the N1 before/after baseline (§14, §15), and **`ai-proxy`
classification latency** from step 5 onward, which decides whether the synchronous filter (§10)
stays the right call.

**Deferred out of B0: suggested follows at onboarding.** [auth-onboarding-plan.md](auth-onboarding-plan.md)
already rules it out by name — *"No suggested-follows step; social-plan.md is unapproved and it
would re-inflate onboarding"* — and its P4 deliberately collapsed onboarding to a single setup
screen. Not worth reopening for v1. When it comes back it should be an inline "people you've played
with" card on first feed visit, which gets the same outcome without touching onboarding at all.
§11's "finish onboarding with five follows" goal is therefore **not met in v1**; the cold-start
burden falls entirely on system posts (§4) and seeded clubs (C0).

**Not doing, decided 2026-08-31: no Realtime on the feed.** Pull-to-refresh plus TanStack Query
invalidation, same as Discover. Supabase Realtime stays chat-only — a feed is not a conversation,
and a live-updating list reorders under the reader's thumb.

Booking (§12) is deferred entirely (§17 decision 6) and is not in any budget here.

---

## 14. Metrics

Instrument from day one. `ui/lib/analytics.ts` currently has eleven events and none of them are
social; add `feed_viewed`, `post_created`, `post_to_game_converted`, `follow_added`, `club_joined`,
`club_game_published`.

**The metric that decides whether phase B worked:** `looking_for_players` → published game
conversion. Everything else is secondary.

Also capture **chat-open rate and messages-per-active-game before N1 ships** (§13.5) — that baseline
is unrecoverable afterwards.

**Kill criterion, agreed up front:** if after 8 weeks weekly-posting users are under 5% of MAU *and*
post→game conversion is under 10%, demote the feed from a tab to a Discover segment (§13.5) rather
than defending a dead tab.

**Read every number here as iOS-only.** The measurement cohort is the TestFlight beta; Android
cannot ship until gtm G2 closes, and it is ~40–45% of AU handsets skewed toward the student and
subcontinental/SE-Asian cohorts gtm §2.1 names as the core badminton audience. That is not a reason
to wait — §17.1 settles that Android gates public launch, not feature work — but it does mean a weak
result is weaker evidence than it looks, and a strong one is not yet proof it generalises. If the
kill criterion lands close to its thresholds, re-measure after Android rather than deciding on the
iOS read alone.

**Phase C gate:** C1 ships only once §1's liquidity trigger holds. C2 (ladders) ships only if ≥5
claimed clubs are publishing weekly — a ladder with nobody in it is worse than no ladder.

---

## 15. Risks

- **Dead feed.** Biggest one. Mitigated by §4, §11, and the §14 kill criterion.
- **Super-app dilution.** The new risk this rewrite introduces. Ten surfaces on a base with no
  liquidity is a tab bar full of empty rooms. Mitigated by §1's message/product split and the hard
  gates in §13 — if the gates get waived, this is what goes wrong.
- **Cannibalising the core loop.** If the feed out-competes Discover for attention without producing
  games, it is a net negative. That is exactly what §14's conversion metric measures. Sharpened by
  §13.5: the feed now gets a **tab** before it is proven, which is the least conservative shape
  available. Accepted deliberately, on two conditions — instrument from day one (§14), and treat
  demotion to a Discover segment as a live rollback rather than an admission of failure.
- **Quietly losing chat engagement.** N1 moves chat one level deeper for the most engaged users.
  Push still deep-links to `chat/[id]`, so the tab was never the main path, but this is the change
  most likely to reduce engagement while looking like an IA improvement. **Capture chat-open rate
  and messages-per-active-game before N1 ships**, or the before/after is unrecoverable.
- **Moderation burden on a small team**, now larger than the original doc priced it because clubs
  add bios, photos and member lists. Mitigated by the automated pre-filter and narrow scope (one
  city, one sport). Still a real ongoing cost — accept it consciously.
- **Privacy regression.** A location-aware social feed is a stalking vector, and anonymous Discover
  means the surrounding app is more open than it was in August. §9's distance-bucket and
  authenticated-only rules are the mitigations.
- **Booking overreach.** §12 rung 3 attempted without venue demand burns capital against incumbents
  who own the relationship. The rung structure exists to make that a deliberate choice.
- **Scope.** This is a large addition beyond [mvp-spec.md](mvp-spec.md). Per AGENTS.md it needs
  explicit sign-off before B0 starts — this doc is the proposal, not the approval.

---

## 16. Not doing

- **Direct messages between users who haven't shared a game.** Game chat stays the messaging
  surface; open DMs are a harassment vector and a support load we cannot staff. Club membership does
  **not** unlock DMs either.
- **Gear, stringing and second-hand classifieds** (§2 row 8). Worst moderation-cost-to-value ratio
  available, and it produces no games.
- **Pro content, scores and highlights** (§2 row 9). Badminton4U is the BWF's own app. Link out.
- **Owning tournament entries, draws or fees** (§2 row 6). Aggregate the calendar, deep-link the
  entry.
- **A coaching marketplace that takes payment** (§2 row 7). A directory is fine; payments bring a
  duty of care and NSW Working With Children obligations for junior coaching.
- **A third `private` profile visibility level** (§9).
- **Algorithmic ranking beyond §6.1's heuristic.**
- **Creator or monetisation anything.**
- **An interactive web feed.** The boundary has moved and needs restating precisely: `website/` now
  server-renders real content (game previews, 56 venue pages, a `/sydney` hub, a dynamic sitemap)
  from anon-safe RPCs — that is **indexable content, not app functionality**. Club pages may join
  that set. **Posts and profile feeds may not**, per §9. Nothing on web ever writes.

---

## 17. Decisions taken 2026-08-31

All open items were resolved. These override anything in the body that still reads as a
proposal.

1. **Positioning split — APPROVED.** Roadmap widens to "everything badminton"; the launch message
   stays "there's a game tonight, near you, at your level". **Trigger to widen: ≥8 weekly liquid
   suburbs *and* ≥30 hosts publishing weekly** (§1). gtm-plan §1's "never say book courts"
   anti-message stands until then.
2. **business-context.md amendment — APPROVED as written.** The category-ambition line ("the
   badminton layer for Sydney — games first, clubs and competition next, booking only ever as a
   partner integration") sits below the unchanged near-term operating rule. Note it says *only ever*
   — that deliberately forecloses §12 rung 3 in the doc that governs positioning. Reopening rung 3
   later means amending business-context.md first, on purpose.
3. **Phase B — text feed *with* the composer approved.** B0 + B0.5 + B1 + B2 + B5 + B7 (§13.1),
   ~12.5 d including N1, plus 1 d for C0 shipping separately. Images (`post_media`), comments and reactions are cut from v1 and held in B3;
   `looking_for_players` ships before plain `text`. **Superseded an earlier same-day decision** that
   approved a read-only checkpoint and held the composer — reversed once it became clear that 1.2
   already applies to the app via chat, and that a system-post-only feed is largely Discover
   re-skinned. §13.2 has the full reasoning.
4. **Clubs — seed-only (C0) approved, full entity held.** §13.2. Breaks the circularity: full clubs
   were gated on liquidity, but host recruiting is what creates liquidity and is happening now. C0
   gives a recruiter "your club already has a page, claim it" for about a day of work. C1 still
   waits on the §1 trigger. This partially closes gtm-plan G12.
5. **Moderation queue owner — Ajay, daily, 24-hour SLA** (§10), with a named hand-off trigger rather
   than an open-ended commitment.
6. **§12 booking outreach — deferred entirely.** No operator contact, not even the zero-cost first
   email. Folds into gtm §4.3's venue conversations whenever those start.
7. **Nav — Chat merges into My Games; the feed takes the freed tab slot** (§13.5, slice N1, 2 d).
   Tab set becomes `Discover | Feed | My Games | Profile`, still four items, so nav-plan's measured
   layout holds. My Games stays where it is. Demoting the feed to a Discover segment is the
   documented rollback if §14's kill criterion fires.
8. **Seven implementation calls**, all 2026-08-31:
   - **`feed_home` takes `(p_lat, p_lng, p_radius_m, p_sport_slug, …)`**, not a server-side
     `home_point` read — location is optional by design, and the original shape gave a
     location-less new user an empty feed (§6.1). Fallback centre is `DEFAULT_LAT`/`DEFAULT_LNG`,
     the *same* constant Discover uses, deliberately not a badminton-denser point.
   - **Sport stays a parameter.** Badminton is the only value for now; the param is what keeps it
     out of the RPC body, per AGENTS.md.
   - **`ai-proxy` filter is synchronous**, 2 s timeout, fail open with a queue entry (§10).
   - **Rate limits: 10 posts / 30 comments / 50 follows per user per day** (§10).
   - **No Realtime on the feed** — pull-to-refresh and query invalidation only (§13.6).
   - **Suggested follows at onboarding is deferred**, and v1 therefore starts every user at zero
     follows (§13.6).
   - **Two ships, not one**: C0 goes standalone and first; the feed is a single all-or-nothing app
     release (§13.6).
9. **Feed tab walls to `/onboarding` for session-less users** (§13.5) — the pattern Map, alerts and
   Host already use, rather than a signed-out teaser. The web pages stay the signed-out hook.
10. **C0 club pages carry a takedown link and a "last checked" stamp** (§13.3); the 56 seeded rows
    are published **without** re-verification, with the link as the correction path.

### 17.1 Still open

**Nothing here blocks implementation any more.** Every gate is resolved; what remains is either a
later decision or a caveat to carry.

- ~~**Anon handling on the Feed tab.**~~ **Resolved 2026-08-31** — walls to `/onboarding` on press,
  matching Map, alerts and Host. See §13.5.
- ~~**C0's club pages: freshness and consent.**~~ **Resolved 2026-08-31** — takedown link plus a
  "last checked" stamp on every page; the 56 rows are **not** re-verified before publishing. See
  §13.3.
- ~~**Sequencing against Android.**~~ **Resolved 2026-08-31 — not a blocker for this plan.** gtm G2's
  *"Nothing else here matters more"* is scoped to **public launch**, not to feature work. The app is
  in private beta on iOS TestFlight, which is a perfectly good surface to build and measure the feed
  on. Nothing here waits on Play Console.

  One caveat to carry into §14, though: the numbers come from an **iOS-only cohort**. Android is
  ~40–45% of AU handsets and skews toward exactly the student and subcontinental/SE-Asian cohorts
  gtm §2.1 identifies as the core badminton audience. So a weak feed result on iOS beta is weaker
  evidence than it looks, and a strong one is not yet proof it generalises. Read the kill criterion
  with that in mind rather than treating it as a clean read on the whole market.
- **B3 and downstream** (§13.4) — decided after B2 is live and post→game conversion is measured.
  B3 specifically needs an image-classification path before it can ship (§13.4).
- **Everything in §2 marked Build-later, and all of §12**, which remain proposed.

Two calls made in passing, recorded so they are not re-litigated: **B0 never ships alone** (follows
with nothing to consume is a dead feature — the whole §13.1 slice releases as one build), and the
**server achievement awards table is the single source of truth**, with `ui/lib/achievements.ts`
keeping its labels and icons but rendering awarded rows. Two independent computations of "10 games
hosted" drift, and the visible failure is a feed post congratulating someone whose profile still
shows nine.
