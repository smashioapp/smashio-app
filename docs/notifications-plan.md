# Notifications plan

Status: **approved 2026-08-20. P0 shipped** (20260820000200_notifications_p0.sql, push-dispatch
rewrite, client routing + sign-out token delete). P1-P3 are still proposed; P2 needs its own
sign-off because an activity inbox is beyond [mvp-spec.md](mvp-spec.md).
Written 2026-08-20.

Scope: every push/in-app notification in SMASHIO — when it fires, who receives it, what it says,
where it lands on tap. Covers the two complaints that triggered this doc: a host is never told
that someone asked to join their game, and the copy on the notifications that do fire is thin.

Read alongside [backend-plan.md](backend-plan.md) (slice 8 built the push pipeline),
[chat-plan.md](chat-plan.md) (chat prefs already gate message pushes) and
[host-flow-plan.md](host-flow-plan.md) (cron→pg_net→edge-function pattern).

---

## 1. What exists today

Pipeline: DB trigger or `pg_cron` job → `public.notify_push(jsonb)` → `pg_net` HTTP POST →
`push-dispatch` edge function → Expo push API. Copy lives in
[format.ts](../supabase/functions/push-dispatch/format.ts), recipient logic lives in SQL.
That shape is right and this plan keeps it.

Six notification types ship today:

| Type | Fires on | Recipients | Source |
|---|---|---|---|
| `message` | `messages` insert, `kind in ('text','image')` | roster + host, minus sender, filtered by `chat_prefs` | [chat_v2.sql:409](../supabase/migrations/20260815000700_chat_v2.sql:409) |
| `join_decision` | `game_players` update to approved / rejected / removed | the affected player only | [game_management.sql:82](../supabase/migrations/20260810000000_game_management.sql:82) |
| `game_cancelled` | `games.status` → cancelled | approved roster, minus host | [exclude_organizer…sql](../supabase/migrations/20260811000000_exclude_organizer_from_cancel_push.sql) |
| `game_rescheduled` | `games.starts_at` changes | approved roster, minus host | same file |
| `alert_match` | `games` insert, status published | `game_alerts` owners inside sport + tier + radius | [game_alerts.sql](../supabase/migrations/20260811000300_game_alerts.sql) |
| `reminder` | cron `*/5`, games starting in 115–125 min | approved roster + host | [push_dispatch.sql](../supabase/migrations/20260808000500_push_dispatch.sql) |

Client: [ui/lib/notifications.ts](../ui/lib/notifications.ts) registers the Expo token on session
start and routes a tap to `/chat/:id` or `/game/:id`.
[ui/app/notification-settings.tsx](../ui/app/notification-settings.tsx) shows the OS permission
state and the saved Discover alerts — there are no per-category preferences.

### Note on message content

Message pushes **already carry the message text** — `messageBody` in
[format.ts](../supabase/functions/push-dispatch/format.ts) sets `title = "Sender · Venue"` and
`body = message.body.slice(0, 140)`, fed by `push_message_summary`
([chat_v2.sql:455](../supabase/migrations/20260815000700_chat_v2.sql:455)).
If text is missing on a real device, the cause is deployment, not design. **Verify first**
(§9) before rewriting anything: confirm the hosted project has the `chat_v2` migration applied and
that the currently deployed `push-dispatch` build is newer than it. The original slice-8
`push-dispatch` had no `push_message_summary` call at all, and a stale deploy would produce exactly
the reported symptom.

---

## 2. What is broken or missing

### Missing notifications

- **`join_request` → host. The headline gap.** There is no trigger on `game_players` INSERT at
  all — only an UPDATE trigger. A host learns about a request only by opening the game screen.
- **`player_left` → host.** `leave_game` flips approved → left. The host is never told a spot
  reopened, which is the one thing they can still act on.
- **`game_full` → host.** No signal that the roster closed.
- **`post_game_rate` → attendees.** `complete-past-games` flips games to completed hourly
  ([ratings_and_completion.sql:47](../supabase/migrations/20260808000200_ratings_and_completion.sql:47))
  and notifies nobody. The whole ratings and reliability system depends on a prompt that doesn't exist.
- **24-hour reminder.** Only T-2h exists — too late to arrange transport or bail politely.
- **Detail edits other than time.** Court label, per-player price and `max_players` can all change
  with no notification. Price especially: people budget for it.
- **Booking verified.** `verification_status` → verified is the app's core trust signal and is silent.
- **Host nudges.** Under-filled game approaching start; join requests left pending as the game nears.
- **Mentions are not distinguished.** `messages.mentions` gates *whether* a push is sent when
  `chat_prefs.level = 'mentions'`, but a mention gets identical copy and priority to any other message.

### Correctness bugs

1. **Pending requesters are told nothing when a game is cancelled or rescheduled.**
   `push_recipients_for_game` only unions `status = 'approved'` with the organizer. Someone with an
   open request will show up at a court for a game that no longer exists.
2. **A rescheduled game loses its reminder.** `games.reminded_at` is never cleared on reschedule
   ([push_dispatch.sql](../supabase/migrations/20260808000500_push_dispatch.sql)), so a game moved
   later after its reminder fired never reminds again.
3. **The reminder sweep is not self-healing.** The window is a hard 115–125 min band; one skipped or
   lagged cron tick drops that game's reminder permanently.
4. **Push tokens survive sign-out.** [notifications.ts](../ui/lib/notifications.ts) upserts a token
   and nothing ever deletes it — `signOut` in [auth.ts:79](../ui/lib/auth.ts:79) doesn't touch
   `push_tokens`. On a shared or resold device the previous account keeps receiving pushes,
   including chat message bodies. **This is a privacy bug, not just noise.**
5. **Dead tokens are never pruned.** Expo returns `DeviceNotRegistered` in receipts; `sendExpoPush`
   ignores the response entirely, so uninstalled devices accumulate forever.
6. **`notify_push` hardcodes the hosted project URL.** Local dev never dispatches, so no
   notification change can be exercised end-to-end locally, and a project-ref change silently
   breaks all push.
7. **Fire-and-forget with no retry.** A 5xx from the edge function, or `pg_net` back-pressure,
   loses the notification with no record that it was ever owed.
8. **`alert_match` doesn't exclude people already in the game** and has no per-user cap — one busy
   evening in a dense suburb can fan out many pushes to the same watcher.
9. **Sydney is hardcoded** in `shortTime`. Correct today, wrong the day the app opens a second city.

### Product gaps

- **No preferences.** Chat has `chat_prefs` per game; nothing else is tunable. The only control is
  the OS-level all-or-nothing switch, so a user annoyed by alert matches turns off cancellations too.
- **No quiet hours.** A 6:00 am game reminds at 4:00 am.
- **No coalescing.** Eight join requests are eight pushes; a lively chat is one push per message.
- **No badge, no in-app history.** `shouldSetBadge: false`, no `badge` field is sent, and a push
  dismissed from the lock screen is gone forever — there is no inbox to recover it from.
- **Thin tap routing.** Only `chat` and `game`. Nothing lands on the requests list, the post-game
  rating screen, or Discover.
- **Banner shows even when you're already in that chat.**

---

## 3. Principles

1. **Notify the person who can still do something.** Every notification names an action; if there
   is no action, it belongs in the inbox, not on the lock screen.
2. **Never notify someone about their own action.** Already honored for cancel/reschedule/message;
   extend it uniformly.
3. **Say the specific thing.** Every body carries sport, venue and Sydney-local time. Social events
   lead with the person's name. Never "You have an update."
4. **One event, one push.** Bursts coalesce server-side into a count.
5. **Transactional always delivers; discretionary respects quiet hours.** A cancellation wakes you.
   An alert match does not.
6. **A tap lands where the action is**, not on a generic screen.
7. **Sport stays config.** Copy interpolates `sports.name`; no badminton strings in code
   (AGENTS.md rule).

**Priority tiers** — drive Android channel importance, iOS `interruptionLevel`, sound, and
quiet-hours behaviour:

- **Critical** (sound, high importance, ignores quiet hours): `join_request`, `join_approved`,
  `game_cancelled`, `game_rescheduled`, `chat_mention`, `reminder_2h`.
- **Normal** (sound, default importance, ignores quiet hours): `message`, `join_declined`,
  `player_removed`, `player_left`, `reminder_24h`.
- **Low** (silent, respects quiet hours): `game_full`, `details_changed`, `booking_verified`,
  `post_game_rate`, `alert_match`, `nudge_*`.

---

## 4. The full event matrix

Time formatting is `shortTime` (Sydney-pinned). `{sport}`, `{venue}`, `{time}`, `{host}`,
`{actor}`, `{n}` interpolate from an extended `push_game_summary` (§6.1).

### A. Roster

| # | Event | Trigger | To | Title / body | Tap | Tier |
|---|---|---|---|---|---|---|
| A1 | **join_request** | `game_players` → `requested` (insert **or** reopen via `request_to_join`) | host | "{actor} wants to join" / "{sport} · {venue}, {time} · {n} of {max} spots filled" | game screen, requests section | Critical |
| A2 | **join_request (coalesced)** | ≥2 pending within 10 min | host | "{n} players want to join" / "{sport} · {venue}, {time} · tap to review" | requests section | Critical |
| A3 | **join_approved** | → `approved` | requester | "You're in — {time}" / "{sport} at {venue} with {host}. Chat is open." | game screen | Critical |
| A4 | **join_declined** | → `rejected` | requester | "Not this time" / "Your request for {sport} at {venue} wasn't accepted. Tap to find another game nearby." | Discover, filters prefilled from the game | Normal |
| A5 | **player_removed** | `approved` → `removed` | player | "Removed from a game" / "{host} removed you from {sport} at {venue}, {time}." | game screen | Normal |
| A6 | **player_left** | `approved` → `left` | host | "{actor} dropped out" / "1 spot open again on {sport} · {venue}, {time}." | game screen | Normal |
| A7 | **request_withdrawn** | `requested` → `left` | host | inbox only, no push | requests section | — |
| A8 | **game_full** | approved count reaches `max_players` | host | "Your game is full" / "{n} of {n} in for {sport} · {venue}, {time}." | game screen | Low |

A1 is the fix for the reported gap. It must fire on **both** paths: a first-time INSERT and the
`request_to_join` `ON CONFLICT DO UPDATE` reopen from `rejected`/`left`/`removed`
([request_to_join_rpc.sql](../supabase/migrations/20260819000000_request_to_join_rpc.sql)). A
trigger on INSERT alone silently misses every returning player.

### B. Game changes

| # | Event | Trigger | To | Title / body | Tap | Tier |
|---|---|---|---|---|---|---|
| B1 | **game_cancelled** | `published` → `cancelled` | approved **+ pending requesters**, minus host | "Game cancelled" / "{host} cancelled {sport} at {venue}, {time}. Your spot is released." | game screen | Critical |
| B2 | **game_rescheduled** | `starts_at` changes | approved **+ pending requesters**, minus host | "New time — {new_time}" / "{sport} at {venue} moved from {old_time}. Still in?" | game screen | Critical |
| B3 | **details_changed** | `court_label`, `cost_total_cents` or `max_players` changes | approved roster, minus host | "Game details updated" / "{court} · ${per_player} per player · {sport} at {venue}, {time}." | game screen | Low |
| B4 | **booking_verified** | `verification_status` → `verified` | approved roster, minus host | "Court booking confirmed" / "{host} uploaded the booking for {venue}, {time}." | game screen | Low |

B1/B2 widening to pending requesters closes bug #1. B2's copy needs the **old** time, so the trigger
must pass `old.starts_at` in the payload rather than let the edge function re-read the row.

### C. Time-based

| # | Event | When | To | Title / body | Tap | Tier |
|---|---|---|---|---|---|---|
| C1 | **reminder_24h** | T-24h | approved roster + host | "Tomorrow, {time}" / "{sport} at {venue} with {n} others. {court}." | game screen | Normal |
| C2 | **reminder_2h** | T-2h | approved roster + host | "Starts in 2 hours" / "{sport} at {venue}, {time} · {court} · {n} playing" | game screen | Critical |
| C3 | **post_game_rate** | T+2h after `ends_at`, game `completed`, ≥1 co-player | every approved attendee | "How was the game?" / "Rate the {n} players from {sport} at {venue}." | `/post-game/:id` | Low |
| C4 | **nudge_underfilled** | T-24h, approved < `max_players` | host | "{n} spots still open" / "Your game is tomorrow at {time}. Share it to fill up." | game screen, share sheet | Low |
| C5 | **nudge_pending** | request pending >12h and game <48h out | host | "{n} requests waiting" / "{sport} at {venue} is in {n} days — approve or decline." | requests section | Low |

C2 is suppressed between 22:00 and 07:00 Sydney; C1 covers those early games. C3 is the
highest-value addition after A1 — it feeds ratings, which feed reliability scores, which feed trust.

### D. Discovery

| # | Event | Trigger | To | Title / body | Tap | Tier |
|---|---|---|---|---|---|---|
| D1 | **alert_match** | new published game matches a `game_alerts` row | alert owners, minus host, **minus anyone already on the roster**, capped 3/day/user | "New {sport} game, {km} km away" / "{venue}, {time} · {tier} · ${per_player}" | game screen | Low |

### E. Chat

| # | Event | Trigger | To | Title / body | Tap | Tier |
|---|---|---|---|---|---|---|
| E1 | **message** | text/image insert | roster + host minus sender, per `chat_prefs` | "{actor} · {sport} at {venue}" / message text, 140 chars | `/chat/:id` | Normal |
| E2 | **message (coalesced)** | ≥3 unread from one game in 5 min | same | "{sport} at {venue}" / "{n} new messages" | `/chat/:id` | Normal |
| E3 | **chat_mention** | sender's message `mentions` recipient | mentioned only | "{actor} mentioned you" / message text | `/chat/:id` | Critical |
| E4 | **announce** | `chat_mode = 'announce'`, host posts | roster | "📣 {actor} · {sport} at {venue}" / message text | `/chat/:id` | Normal |
| E5 | system messages | — | nobody | — | — | — |

E1 keeps today's behaviour and fixes only the title (game identity, not bare venue). E3 is new.

### Never notified

Actor of their own action; players who `left`, were `rejected` or `removed` (they stop receiving
game updates entirely); anyone for a system chat row; rating recipients (ratings stay private —
telling someone they were just rated invites retaliation).

---

## 5. Phasing

**P0 — close the holes. Shipped 2026-08-20.** Triggers and copy only, no new tables. A1, A6, A8,
B1/B2 widened to pending requesters, C1, C3; bugs #1, #3, #4, #6; extended `push_game_summary`;
rewritten copy for every existing type; deep-link routing for the new destinations.

What landed, against what this section planned:

- Bug #2 was **already fixed** before this plan was written — `enforce_game_edit_rules`
  ([game_management.sql](../supabase/migrations/20260810000000_game_management.sql)) has cleared
  `reminded_at` on reschedule since slice 10. P0 extends that reset to the new `reminded_24h_at`
  column and keeps the pgTAP coverage.
- Bug #3's fix replaces the 115-125 minute band with "anything starting inside the next 2h05m
  that hasn't been reminded yet", which self-heals after any cron outage shorter than the window.
- C2's quiet-hours suppression (22:00-07:00 Sydney, §4C) landed with C1, since the two reminders
  share one sweep. The suppressed game is still stamped, so it can't fire late at 6am.
- Copy is deterministic-variant: `pick(variants, game_id)` in
  [format.ts](../supabase/functions/push-dispatch/format.ts) gives each game a stable voice while
  the inbox as a whole varies. `dayLabel` ("Today"/"Tomorrow"/weekday) keeps C1 honest when the
  self-healing sweep fires outside a literal 24 hours.
- Tiers drive the Expo payload now (`priority`, `sound`, `interruptionLevel`, per-category
  `channelId`), and the five Android channels are created client-side. The `notification_prefs`
  table and quiet hours for *low*-tier events remain P1.
- `?focus=requests` on the game screen scrolls to the join-requests section rather than adding a
  tab, which the screen doesn't have.

**Local end-to-end is now possible** (§6.7): `supabase/seed.sql` seeds `push_dispatch_key` and
`push_dispatch_url` pointing at `http://host.docker.internal:54321/functions/v1/push-dispatch`, so
`supabase functions serve` receives real trigger dispatches. Set `PUSH_DISPATCH_KEY` in the
gitignored `supabase/functions/.env` to `local-push-dispatch-key` to match the seeded secret.

**P1 — controls and hygiene.** `notification_prefs` table plus settings UI; quiet hours; Expo
receipt handling and dead-token pruning (#5); per-category Android channels; foreground suppression;
`profiles.timezone` to retire the hardcoded Sydney (#9).

**P2 — inbox, badge, coalescing.** Requires sign-off: an activity inbox is beyond
[mvp-spec.md](mvp-spec.md). `notifications` table as the source of truth (§6.2), badge counts,
A2/E2 coalescing, retry sweeper (#7), in-app inbox screen with Realtime.

**P3 — delight.** Notification actions (Approve/Decline from the tray, inline chat reply), B3, B4,
C4, C5, D1 improvements (#8).

---

## 6. Architecture changes

### 6.1 Richer summary RPC

`push_game_summary` returns three columns. Nearly every improved string above needs more. Replace with:

```
push_game_summary(p_game_id uuid) returns
  sport_name, venue_name, venue_suburb, starts_at, ends_at, court_label,
  host_name, max_players, approved_count, reserved_spots, spots_left,
  per_player_cents, tier_name, verification_status
```

One `stable security definer` query, service-role grant, same shape as today. Actor-name lookups
(`{actor}` in A1/A5/A6/E1) come from a small `push_actor_name(p_profile_id)` helper rather than
being stuffed into the game summary.

### 6.2 `notifications` table (P2)

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  game_id uuid references public.games(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  params jsonb not null default '{}',
  title text, body text,              -- stamped by push-dispatch after rendering
  priority text not null default 'normal',
  collapse_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz, read_at timestamptz
);
```

The trigger writes the row **transactionally with the event** and then calls `notify_push` with
just `{ ids: [...] }`. `push-dispatch` reads the rows, renders copy via `format.ts`, sends, and
stamps `title`/`body`/`sent_at`. This keeps one copy source of truth (TypeScript, unit-tested)
while giving the app rendered strings to display. A sweeper cron re-dispatches rows with
`sent_at is null and created_at < now() - interval '2 minutes'`, which fixes #7. Unread count per
profile drives the badge. `collapse_key` (`'join_request:' || game_id`) drives coalescing.

RLS: self-read, self-update of `read_at` only. No client insert.

### 6.3 `notification_prefs` (P1)

One row per profile, all defaulting true: `join_requests`, `roster_changes`, `chat`, `reminders`,
`game_changes`, `alerts`, `nudges`, plus `quiet_hours_enabled`, `quiet_start` (22:00),
`quiet_end` (07:00). Checked inside the recipient SQL functions so an opted-out user never even
reaches the edge function. Per-game chat muting stays in `chat_prefs` — this is the global layer
above it.

### 6.4 Recipient function rework

`push_recipients_for_game(p_game_id, p_exclude_profile)` grows two parameters:
`p_include_requested boolean` (B1/B2) and `p_pref_key text` (P1 preference gate).
`chat_push_recipients` gains the same `notification_prefs.chat` check on top of its existing
`chat_prefs` logic.

### 6.5 Quiet hours

Applied in the edge function, not the trigger, so the decision sees the recipient's timezone.
Low-tier notifications landing inside a recipient's quiet window are held: `sent_at` stays null and
a `deliver_after` timestamp is set to the window's end; the sweeper cron picks them up. Critical and
normal tiers ignore quiet hours entirely, with C2 as the single explicit exception (§4C).

### 6.6 Expo payload fields

Set per tier: `priority` (`high` for critical, `normal` otherwise), `channelId` (Android — one
channel per category, created client-side), `interruptionLevel` (iOS — `time-sensitive` for
critical, `passive` for low), `sound` (null for low), `badge` (per-recipient unread count, P2),
`categoryId` (P3 action buttons), and a `data` payload of
`{ type, screen, game_id, notification_id, params }`.

Android notification grouping needs a native `tag`/`group`, which the Expo push API does not
expose — so grouping is achieved by **server-side coalescing** (§6.2) rather than by client-side
stacking. Don't plan around a field that isn't there.

### 6.7 `notify_push` URL from Vault

Read `push_dispatch_url` from Vault alongside `push_dispatch_key`, defaulting to the hosted URL when
absent. Local `supabase start` sets it to the local functions URL, making push testable in
`supabase db reset` + `supabase functions serve`. Fixes #6.

---

## 7. Client changes

- **Sign-out deletes this device's token** before `supabase.auth.signOut()` in
  [auth.ts:79](../ui/lib/auth.ts:79), and on account deletion. Fixes #4. **P0.**
- **Foreground suppression**: `setNotificationHandler` compares `data.game_id` and `data.screen`
  against the active route; an already-open chat shows no banner.
- **Tap routing** ([notifications.ts:54](../ui/lib/notifications.ts:54)) extends to
  `/game/:id?tab=requests`, `/post-game/:id`, and `/(tabs)/discover` with prefilled filters.
- **Android channels** per category (`chat`, `requests`, `game-updates`, `reminders`, `discovery`)
  with importance matching the tier, replacing today's `default` + `chat` pair.
- **Notification settings screen** grows the per-category toggles and quiet-hours row above the
  existing alerts list.
- **Inbox** (P2): `ui/app/notifications.tsx`, Realtime-subscribed, unread bell in the header,
  `read_at` stamped on open.

---

## 8. Not doing

- **Email or SMS.** Push plus in-app only.
- **Notifying a ratee that they were rated.** Ratings stay private.
- **Social graph notifications** ("a player you've played with posted a game"). That's
  [social-plan.md](social-plan.md), which is itself unapproved.
- **Waitlists.** "Spot reopened → notify the people you declined" needs a waitlist concept the
  schema doesn't have. A6 tells the host; the host re-invites.
- **Per-notification snooze / digest mode.** Category toggles plus quiet hours are enough at
  private-beta scale.
- **Rich media pushes** (avatars, images in the notification). Needs a Notification Service
  Extension on iOS; not worth it before store launch.

---

## 9. Verification and testing

P0 status of this section: `format.test.ts` covers the new copy (42 cases, `deno test`) and
`push_dispatch_triggers_test.sql` covers the new triggers, recipient sets and sweeps (23 cases,
`supabase test db` — the whole 66-case suite passes; the fixture ids that collided with
`seed.sql`'s test user were re-prefixed to make it runnable on a seeded local db). The local
end-to-end path was exercised for real: a `game_players` insert reached a locally served
`push-dispatch` and returned 200. **Steps 1-3 below are still outstanding** — they need the hosted
project and two physical devices, neither reachable from a dev machine.

**Before writing code**, settle the message-content question (§1):

1. Confirm `20260815000700_chat_v2.sql` is applied on the hosted project.
2. Confirm the deployed `push-dispatch` is newer than that migration —
   `supabase functions deploy push-dispatch` if in doubt.
3. Send a chat message between two real devices and capture what actually lands.

Then:

- **`format.test.ts`** — one case per new copy function, including the coalesced variants, the
  140-char truncation boundary, and a DST-boundary case for any new time string (following the
  existing suite's pattern).
- **`push_dispatch_triggers_test.sql`** — extend the pg_net-queue assertions to cover A1 on both
  the INSERT and the `request_to_join` reopen path, A6, A8, and B1/B2 including a pending requester
  in the recipient set.
- **Reminder idempotency** — a test that reschedules a game after its reminder fired and asserts a
  second reminder is queued (bug #2).
- **Manual matrix** — pushes cannot be driven from Maestro; keep a checklist of the ~20 events run
  once per release against two physical devices (iOS + Android), since simulators have no APNs/FCM
  registration at all.
