# Social plan — from "a booking tool" to a Sydney badminton community

Written 2026-08-15. Phase B. Depends on [venues-plan.md](venues-plan.md) landing `venue_id` as a
real entity — venues are the anchor most of this content hangs off.

Read [mvp-spec.md](mvp-spec.md), [business-context.md](business-context.md), and
[AGENTS.md](../AGENTS.md) first. This is the largest scope addition since launch and it changes
what the app *is*, so §1 argues for it before §3 designs it.

---

## 1. Why now, and what breaks without it

Today SMASHIO is transactional: open app → find game → join → play → close app. The retention
loop only fires when someone else has hosted. A player in a suburb with no host this week has
zero reason to open the app, and no way to *become* the reason.

The social layer exists to fix three specific things, not to be a social network:

1. **Supply cold-start.** A feed post ("anyone free at NBC Thursday 8pm?") is a game that hasn't
   been created yet. Converting posts → games is the single highest-value flow in this plan.
2. **Retention between games.** Follows + feed give a reason to open the app on a non-play day.
3. **Trust before the game.** Right now you join a stranger's game knowing a display name and a
   reliability score. A profile with history, posts, and shared venues makes the join decision
   easier — which raises join-rate on existing supply.

**The failure mode to design against:** a generic feed nobody posts in, sitting in a tab, making
the app look dead. Every mechanic below is chosen because it produces content as a *by-product of
playing*, not because it asks people to write posts.

## 2. Content that writes itself

Before any user-composed post, the feed must already be full. Sources, in order of volume:

| Auto-generated card | Trigger |
|---|---|
| "Game at NBC South Granville, Thu 8pm — 3 spots" | game published (the existing host flow) |
| "Ajay played at BadmintonWorx Botany" | game completed |
| "5 games at Five Dock this week" | venue activity rollup |
| "New venue: Alpha Badminton Centre — 10 courts, pro shop" | `venue_profiles` row added |
| "Ravi hit 10 games hosted" | achievement (`ui/lib/achievements.ts` already computes these) |

These are rows in `posts` with `kind='system'` and a `payload jsonb`, written by triggers, not by
the client. A brand-new user with zero follows sees a full local feed on day one. User posts then
land *into* an alive surface instead of an empty one.

## 3. Schema

### 3.1 Graph

```sql
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows(followee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
```

Follow is **asymmetric and public** (Twitter-shaped, not Facebook-shaped) — no accept step, which
removes a whole request/notification/state surface. Blocks are bidirectional in effect: a block
hides content both ways and blocks join requests between the two accounts.

Denormalised `follower_count` / `following_count` on `profiles`, maintained by trigger. The counts
render on every profile card; a `count(*)` per card is an N+1 waiting to happen.

### 3.2 Posts

```sql
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete cascade,   -- null for system posts
  kind text not null check (kind in ('text','question','looking_for_players','system')),
  body text,
  sport_id uuid references public.sports(id),
  venue_id uuid references public.venues(id) on delete set null,
  game_id uuid references public.games(id) on delete set null,
  point extensions.geography(Point, 4326),   -- copied from venue or author home_point at write
  payload jsonb,                             -- system-post render data
  accepted_answer_id uuid,                   -- questions only, FK added after comments exists
  reply_count int not null default 0,
  reaction_count int not null default 0,
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index posts_feed_idx on public.posts (created_at desc) where status = 'visible';
create index posts_point_idx on public.posts using gist (point);
create index posts_venue_idx on public.posts (venue_id, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
```

`point` is denormalised at write time so the local feed is one GiST range query — not a join
through `venues` per row. This is the same trade `nearby_games` already makes.

`kind='looking_for_players'` is the supply-conversion post type: it carries a venue, a date/time
window, and a skill tier, and renders with a **"Turn this into a game"** button that opens the
create wizard prefilled. That button is the point of the whole feature.

### 3.3 Comments, reactions, media

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
(`20260815000700_chat_v2.sql`) — `post_media` reuses that bucket + upload code rather than
inventing a second one.

### 3.4 Q&A

Questions are `posts` with `kind='question'`; answers are `post_comments`. `accepted_answer_id`
on the post, settable only by the author. No separate tables — a parallel Q&A stack would double
the moderation, notification, and feed surface for no user-visible gain. A Q&A tab is just a
filtered feed query.

### 3.5 Reports

```sql
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('post','comment','profile','photo','message')),
  subject_id uuid not null,
  reason text not null check (reason in ('spam','harassment','hate','sexual','violence','misinformation','other')),
  note text,
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

One reports table for every content type including chat messages and venue photos — one queue,
one SLA, one place to prove compliance in §7.

### 3.6 RLS

- `posts` / `post_comments`: `select` where `status='visible'` **and** neither party has blocked
  the other; `insert` own row; `update`/`delete` own row only. `kind='system'` inserts rejected
  from `authenticated` — triggers write those as service role.
- `post_reactions`: `insert`/`delete` own row.
- `follows`: `insert`/`delete` own follower row; `select` open (counts are public).
- `blocks`: full CRUD on own blocker row; `select` own only.
- `content_reports`: `insert` own; `select` own.

The block check belongs in the RLS policy, not the client query. A client-side filter is a
workaround, not a block.

## 4. Feeds

Three feeds, one RPC each, all keyset-paginated on `(created_at, id)` — no `offset`.

### 4.1 `feed_home(p_cursor, p_limit)`

Union of:

- posts by people I follow,
- posts within `radius_m` of my `home_point` (defaults to the Discover radius),
- system posts for games near me.

Ranked by a decayed score, computed in SQL:

```
score = ln(1 + reaction_count + 2*reply_count)
      + 2.0 * (author is followed)
      + 1.5 * (venue is one I've played at)
      - 0.6 * ln(1 + distance_km)
      - 1.2 * hours_since_post / 24
```

Deliberately a hand-tuned heuristic, not a model. It's inspectable, it's one query, and the
weights are legible enough to argue about. Revisit only when volume makes it obviously wrong.

Freshness beats relevance early: while total local post volume is low, sort by recency and let
the score break ties.

### 4.2 `feed_venue(p_venue_id, …)`

Posts + system cards for one venue, rendered as a tab on the venue screen from
[venues-plan.md](venues-plan.md) §7.1. This is the highest-signal feed we have — "who's playing at
Five Dock tonight" is a real question with a real answer — and it makes the venue directory
retention-generating instead of reference-only.

### 4.3 `feed_profile(p_profile_id, …)`

A player's posts + public history. Turns the existing player card
(`20260815000100_player_card.sql`) into a destination.

## 5. Notifications

Reuse `push_dispatch` (`20260808000500`) — do not add a second delivery path. New types: new
follower, reply to your post, answer to your question, accepted answer, someone you follow posts
a `looking_for_players` near you, and a mention.

Per-type toggles in settings from day one, defaults conservative (mentions and direct replies on;
"someone you follow posted" off). A social layer that pushes aggressively is how a useful app
gets uninstalled.

**Digest, not firehose:** "3 new games near you this week" as one scheduled push beats three
individual ones. `pg_cron` already runs `recompute-reliability` and `purge-confirmations`, so the
scheduling primitive exists.

## 6. Privacy

Adding a public feed changes the privacy posture of an app people currently use semi-privately.
Non-negotiables:

- **Never expose `home_point`.** Feeds return distance buckets ("~3 km away"), never coordinates,
  and never a raw suburb for a user who hasn't set one publicly.
- **Profile visibility setting**: `public` / `players_only` (people I've shared a game with) /
  `private`. Default `players_only` for existing accounts — do not silently make people public.
- **Posting is opt-in by action.** No auto-posting a user's completed games to a public feed
  without a setting; the day-one default for "share my completed games" is on for the *local*
  feed and off for anything wider, and it's one toggle to kill.
- Blocked users disappear from feeds, rosters, search, and cannot request to join your games.
- Account deletion (`20260812000200`) must be extended to tombstone posts/comments/follows the
  same way it tombstones profiles. Ship this in the same slice as posts, not after.

## 7. Moderation — a release gate, not a nice-to-have

App Store Review Guideline 1.2 requires apps with user-generated content to have **all** of:
a method to filter objectionable content, a mechanism to report offensive content with timely
responses, the ability to block abusive users, and published developer contact info. Google Play's
UGC policy is equivalent. **Shipping a feed without these is a rejection, and plausibly a
removal.** Google Play submission is already blocked on device verification
(see memory: Play Store blocker), so a second rejection reason is not affordable.

Minimum shipping set:

1. **Report** on every post, comment, profile, and photo → `content_reports`.
2. **Block** on every profile → `blocks`, enforced in RLS.
3. **Automated pre-publish filter.** Route post/comment bodies through the existing `ai-proxy`
   Edge Function (server-side only, per [tech-stack.md](tech-stack.md)) for a classification pass.
   Hard-block the obvious; queue the borderline as `status='hidden'` pending review. Fail **open
   with a queue entry**, not closed — an LLM outage must not silently eat every post, but it must
   leave a trail.
4. **Human queue + SLA.** A minimal admin surface (Supabase dashboard view is enough at first)
   and a committed 24-hour response target. Someone has to actually own this daily.
5. **Published contact + in-app T&Cs / community guidelines** and an EULA with a no-tolerance
   clause for objectionable content — Apple asks for this explicitly.
6. **Rate limits.** Posts, comments, follows, reports all capped per user per hour at the RPC
   layer. Spam is the likeliest first abuse, well before harassment.

Owner and daily process for the queue must be named before the feature ships. If nobody owns it,
the feature isn't ready regardless of code state.

## 8. Cold start

The feed launches to a private beta of a few hundred Sydney players. Plan for thin:

- **Seed with system posts** (§2) so the feed is never empty.
- **Geo-scope hard.** One city, one sport. A national empty feed feels dead; a Sydney feed with
  20 posts a week feels like a scene.
- **Seed follows at onboarding**: suggest people from games you've played, then active hosts near
  you. A user with zero follows should finish onboarding with five.
- **Recruit ~20 posters** from the beta by hand. Community products are started by people, not
  algorithms. The venue sweep produced a concrete starting list:
  [data/venues/clubs-badminton-nsw.json](../data/venues/clubs-badminton-nsw.json) holds **56
  Badminton NSW affiliated clubs**, ~46 of them in Sydney, most with a named hall and weekly
  session times. These are existing, organised communities with a contact point — a far better
  seed than cold-recruiting individuals.
- **Kill criterion, agreed up front:** if after 8 weeks weekly-posting users are under 5% of MAU
  *and* `looking_for_players` → game conversion is under 10%, cut the feed tab back to a venue-
  and profile-scoped surface rather than defending a dead home tab.

## 9. Build order

| Slice | Scope | Est. | Gate |
|---|---|---|---|
| **B0** | `follows`, `blocks`, counts, follow/unfollow UI on player card, follower lists, suggested follows at onboarding. No content yet. | 2 d | — |
| **B1** | `posts` + system-post triggers (§2) + `feed_home` + feed tab, read-only (no composer). | 3 d | — |
| **B2** | Composer: `text`, `looking_for_players`; "Turn this into a game" → prefilled wizard. Rate limits. | 3 d | **B5 must ship with or before this** |
| **B3** | `post_comments`, `post_reactions`, `post_media`, `feed_profile`. | 3 d | — |
| **B4** | Q&A (`kind='question'`, accepted answers), `feed_venue` on the venue screen. | 2 d | — |
| **B5** | Moderation: reports, blocks enforced in RLS, `ai-proxy` filter, admin queue, guidelines/EULA, contact. | 3 d | **release gate for B2+** |
| **B6** | Notifications + per-type settings + digest cron. | 2 d | — |
| **B7** | Privacy settings, deletion tombstoning, distance buckets. | 2 d | ship with B1 |

Rough total ~4 weeks. **B5 and B7 are not the tail** — B2 (the first user-authored content) must
not reach TestFlight before B5 exists, and B7's deletion handling must land with B1's tables.

## 10. Risks

- **Dead feed.** Biggest one. Mitigated by §2, §8, and the §8 kill criterion.
- **Moderation burden on a small team.** Mitigated by automated pre-filter + narrow scope (one
  city, one sport). Still a real ongoing cost — accept it consciously.
- **Cannibalising the core loop.** If the feed tab out-competes Discover for attention without
  producing games, it's a net negative. Instrument `looking_for_players` → game conversion from
  day one; it's the metric that decides whether this phase worked.
- **Privacy regression.** A location-aware social feed is a stalking vector. §6's distance-bucket
  rule and `players_only` default are the mitigations; treat any bug that leaks coordinates as a
  P0.
- **Scope.** This is a large addition beyond [mvp-spec.md](mvp-spec.md). Per AGENTS.md, it needs
  explicit sign-off before B0 starts — this doc is the proposal, not the approval.

## 11. Not doing

- Direct messages between users who haven't shared a game. Game chat stays the messaging surface;
  open DMs are a harassment vector and a support load we can't staff.
- Groups/clubs as first-class entities — **but note the evidence has shifted.** The venue sweep
  found 56 organised clubs, several running 4+ sessions a week across multiple halls, and the
  recurring "club hires a school hall" pattern means a lot of Sydney badminton is already
  club-shaped rather than venue-shaped. Venue feeds (§4.2) stay the cheap experiment that decides
  it, but expect clubs to come back as a real entity sooner than this line implies. See
  [venues-plan.md](venues-plan.md) §3 axis 3 for why "a club is not a venue" matters to the data
  model either way.
- Web feed. App-only stands ([AGENTS.md](../AGENTS.md)).
- Algorithmic ranking beyond §4.1's heuristic.
- Creator/monetisation anything.
