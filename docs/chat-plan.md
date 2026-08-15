# Chat Plan — the game thread

Status: proposed, 2026-08-15. Covers `ui/app/chat/[id].tsx`, `ui/app/(tabs)/chat.tsx`,
`ui/lib/queries/messages.ts`, `supabase/migrations/20260808000100_messages.sql` and the
`message` branch of `supabase/functions/push-dispatch`.

Whoever implements the list/keyboard work: read the Expo 57 docs (`ui/AGENTS.md`) before
writing it. Keyboard handling and list APIs both moved.

## Diagnosis

Chat was slice 5 of `backend-plan.md` and has not been touched since. It works, and that is
about all it does. Six problems, in the order a user hits them:

1. **The thread has no idea what game it is.** The header prints venue + "N players"
   ([chat/[id].tsx:39](../ui/app/chat/[id].tsx:39)). When, where exactly, which court, how much,
   who's hosting — all one screen away and never surfaced. Every real message in these threads is
   about those facts ("what time again?", "which court?"), so the chat spends its life
   re-answering what should be pinned above it.
2. **The host has no authority in a room they are responsible for.** Any approved player can
   post; the host has no way to say "announcements only" for a 12-person pickup game about to
   start, and no way to silence one person without removing them from the game itself.
3. **The notification says nothing.** `"Someone posted in your game chat."`
   ([push-dispatch/index.ts:74](../supabase/functions/push-dispatch/index.ts:74)) — no sender, no
   text. It is a notification whose only function is to make you open the app to find out whether
   it mattered. And it is all-or-nothing: no per-thread mute, no snooze.
4. **Nobody has a face.** Messages render a colored initial
   ([chat/[id].tsx:58](../ui/app/chat/[id].tsx:58)) even though `profiles.photo_path` exists,
   the `avatars` bucket is public-read, and `Avatar` already takes a `photoUri`. In a room of
   strangers you are about to play sport with, faces are the entire point.
5. **The thread is cold on arrival.** Approvals, joins, leaves, reschedules and cancellations all
   happen elsewhere and leave no trace here, so every new chat opens empty and most stay that way.
6. **The rendering is a prototype.** Index keys ([chat/[id].tsx:51](../ui/app/chat/[id].tsx:51)),
   a full refetch of the entire thread on every inbound realtime event
   ([messages.ts:58-72](../ui/lib/queries/messages.ts:58)), no pagination, no optimistic send, no
   day separators, no message grouping, no auto-scroll, `KeyboardAvoidingView` wired for iOS only
   ([chat/[id].tsx:35](../ui/app/chat/[id].tsx:35)). The thread list is worse: it pulls **every
   message of every game you belong to** with no limit, then keeps one
   ([messages.ts:133-138](../ui/lib/queries/messages.ts:133)).

What is already right and should not be re-litigated: RLS scopes reads and writes to organizer +
approved players ([20260808000100_messages.sql:17-31](../supabase/migrations/20260808000100_messages.sql:17)),
so **constraints 2 and 3 are already enforced at the database** — an unapproved user cannot read,
and a `removed`/`left` player stops satisfying `is_approved_player` the instant their status
changes. Avatars already deep-link to `/player/{id}` ([chat/[id].tsx:56](../ui/app/chat/[id].tsx:56)).
Thread titles already carry the game date (commit f1a4eb9).

## Prior art

| App | Pattern | What we take |
|---|---|---|
| WhatsApp — Group settings → Send messages → "Only admins" | composer is **replaced** by a fixed "Only admins can send messages" note, and a system row announces the change to everyone | exact model for broadcast mode: never a disabled-looking input, always an explanation |
| WhatsApp — mute 8 hours / 1 week / Always | mute is a *duration*, not a boolean, because "shut up until after this game" is the real request | our mute durations, plus an implicit one nobody else has: until the game ends |
| Slack — channel notification level: All / Mentions / Off, and `@channel` overrides mute | one axis for volume, one escape hatch so urgent posts still land | `All / Mentions only / Off`; a host announcement always overrides `Mentions only` |
| Discord — server mute with a duration dropdown, "Only @mentions" | same two-axis model, validated at scale | confirms the shape; no need to invent |
| Luma — Event Chat | hosts and approved guests auto-added, **auto-removed on cancellation**; host can *close* the chat, which blocks new messages while leaving history readable | membership is derived from RSVP state, never managed by hand (we already do this); the "closed, still readable" end-state for finished games |
| TeamSnap — team chat, per-conversation mute, org-level disable | in team sport the admin needs a kill switch, not just moderation | per-player posting toggle + close chat |
| Slack / iMessage — "N new messages ↓" jump pill | never auto-scroll a user who has scrolled up | scroll-anchoring rule below |
| Every mature messenger | system rows for join/leave/rename; grouped consecutive messages; day separators | the thread is a *timeline of the game*, not just typed text |

The common thread across all of them: **membership is derived, permission is explicit, and volume
is the reader's choice.** Membership we already derive. Permission and volume are what's missing.

## The idea

**The chat is not an inbox for a game. It is the game's timeline.**

Everything that happens to the game — created, receipt verified, Ravi approved, Sam left, moved to
8:00pm, cancelled — writes a row into the same thread as the typed messages, centered and quiet.
That single decision fixes problem 5 outright (a chat is never empty; it opens with the story of
the game so far), makes problem 1's pinned card feel like the header of a document rather than a
banner bolted on, and gives problem 2's host actions a natural place to be announced.

Three surfaces, in priority order:

```
┌──────────────────────────────────────────┐
│ ←  Olympic Park Badminton          ⋯     │  ← nav
├──────────────────────────────────────────┤
│ ▸ Thu 21 Aug · 8:00–10:00pm · Court 3    │  ← PINNED EVENT BADGE  (tap → /game/{id})
│   6/8 players · $11 each      [ 2h 14m ] │     collapses to one line on scroll
├──────────────────────────────────────────┤
│              ── Thursday ──              │  ← day separator
│        Ajay created this game            │  ← system row
│        Ravi joined                       │
│  ┌────┐                                  │
│  │ RA │ Ravi                             │  ← photo avatar, tap → /player/{id}
│  └────┘ which court is it                │
│         ┌──────────────────────────────┐ │
│         │ Court 3, near the far wall   │ │  ← grouped run: one avatar, one name
│         └──────────────────────────────┘ │
│                            Sam left  ──  │
├──────────────────────────────────────────┤
│  ⊕  Message the group…              ↑    │  ← or the announce-mode notice
└──────────────────────────────────────────┘
```

## Schema

One migration, `supabase/migrations/2026081600xxxx_chat_v2.sql`.

**Host control on the game**

```sql
alter table public.games
  add column chat_mode text not null default 'open'
    check (chat_mode in ('open', 'announce')),
  add column chat_closed_at timestamptz;

alter table public.game_players
  add column chat_muted_at timestamptz;   -- host-set, per player, per game
```

`announce` = broadcast: only the host posts. `chat_closed_at` = read-only forever (set by the host,
or by cron some days after `ends_at`). `chat_muted_at` is the host silencing one person **without**
removing them from the game — today the only tool for a disruptive player is `remove_player`, which
costs them their spot.

**Messages grow three kinds**

```sql
alter table public.messages
  add column kind text not null default 'text'
    check (kind in ('text', 'image', 'system')),
  add column image_path text,
  add column system_event text,      -- created | joined | left | removed | rescheduled
                                     -- | cancelled | verified | mode_changed | closed
  add column mentions uuid[] not null default '{}',
  add column client_id uuid;         -- optimistic-send dedupe key

alter table public.messages alter column sender_id drop not null;  -- system rows have no author
alter table public.messages alter column body set default '';       -- image-only posts
create unique index messages_client_id_idx on public.messages (client_id) where client_id is not null;
```

**One predicate owns "can this person post"**

```sql
create function public.can_post_in_chat(p_game_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_closed_at is not null) then false
    -- the host outranks announce-mode and mute, and is never in game_players
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.organizer_id = p_profile_id) then true
    when not public.is_approved_player(p_game_id, p_profile_id) then false
    when exists (select 1 from public.games g
                 where g.id = p_game_id and g.chat_mode = 'announce') then false
    when exists (select 1 from public.game_players gp
                 where gp.game_id = p_game_id and gp.profile_id = p_profile_id
                   and gp.chat_muted_at is not null) then false
    else true
  end;
$$;
```

The insert policy is replaced to use it, and to stop clients forging system rows:

```sql
create policy "messages insert by permitted posters" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and kind in ('text', 'image')
    and public.can_post_in_chat(game_id, auth.uid())
  );
```

The **select** policy is untouched — approved players + organizer, as today. That is constraints 2
and 3 already satisfied: approval grants read, removal/leaving revokes it on the next request, and
the thread drops out of the list because `useChatThreads` filters on `status = 'approved'`.

**Per-thread notification preference** (constraint 4)

```sql
create table public.chat_prefs (
  game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  level text not null default 'all' check (level in ('all', 'mentions', 'none')),
  muted_until timestamptz,          -- null = not snoozed; 'infinity' not used, see below
  primary key (game_id, profile_id)
);
-- RLS: self only, same shape as message_reads.
```

`level` is the standing choice (Slack/Discord). `muted_until` is the temporary one (WhatsApp) —
1 hour / 8 hours / until the game ends / until I turn it back on (`muted_until = ends_at + 1 day`
for the third, `null` level `none` for the fourth, so there is exactly one representation of
"permanently off").

**Host actions are RPCs, not client updates**, matching `decide_join_request`/`remove_player`:

```sql
set_chat_mode(p_game_id uuid, p_mode text)                      -- organizer only
set_player_chat_mute(p_game_id uuid, p_profile_id uuid, p_muted boolean)
close_chat(p_game_id uuid)
```

Each writes its own `kind = 'system'` row inside the same transaction, so the room always sees why
it changed. Same for the existing flows: extend the `decide_join_request`, `leave_game`,
`remove_player` and `enforce_game_edit_rules` paths to insert system rows for
`joined` / `left` / `removed` / `rescheduled` / `cancelled`.

**Thread list becomes one RPC.** `chat_threads()` returns, per game the caller belongs to: game id,
venue, `starts_at`, last message (body, kind, sender display name, `created_at`) and
`unread_count`. Replaces the three-query, unbounded-fetch client function in
[messages.ts:103-174](../ui/lib/queries/messages.ts:103).

## Notifications (constraint 4)

`push_recipients_for_game` is reused for game-level events; chat gets its own recipient function
that applies `chat_prefs`:

```
recipient gets the push if:
  it isn't their own message
  and chat_prefs.muted_until is null or in the past
  and ( level = 'all'
        or (level = 'mentions' and (they are @mentioned or the sender is the host)) )
  and level <> 'none'
```

The host-post exception is Slack's `@channel` rule: someone who chose "mentions only" still hears
the host say "running 15 min late". That is the message they cannot afford to miss, and the whole
justification for the mode existing.

Copy carries the content:

| | today | proposed |
|---|---|---|
| title | `New message · Olympic Park` | `Ravi · Olympic Park` |
| body | `Someone posted in your game chat.` | the message, truncated to ~140 chars |
| image | — | `📷 Photo` (+ caption if any) |
| announce mode | — | `📣 Ajay · Olympic Park` |
| data | `{screen: 'chat', game_id}` | unchanged — deep link already works |

Android: give chat its own notification channel so the OS-level controls match the in-app ones
([notifications.ts:31](../ui/lib/notifications.ts:31) currently registers one `default` channel).

## Client work

### The pinned event badge (constraint 7)

A `ChatEventHeader` component under the nav row, sourced from `useGameDetail` (already fetched by
the thread screen). Line 1: date · time range · court label. Line 2: `n/max players · $x each`,
with `CountdownChip` on the right inside the last 24 hours. Whole card is a `Pressable` →
`/game/{id}`. On scroll past ~40px it collapses to a single line (`date · time`) with a spring from
`SPRING.settle`; it never leaves. Cancelled games swap the accent border for `colors.danger` and the
copy for "Cancelled".

The `⋯` in the nav opens the **chat details sheet** (existing `Sheet` component):

- *Host sees:* Announcements only [toggle] · Notifications [All / Mentions / Off + snooze] ·
  Members (each row: avatar, name, "Can post" toggle, → profile, Remove from game) · Close chat
- *Player sees:* Notifications [All / Mentions / Off + snooze] · Members (avatar, name, → profile) ·
  Leave game

### Composer states

The composer is the honest signal of what you're allowed to do, so it never renders as a
greyed-out input:

| state | rendering |
|---|---|
| can post | input + `⊕` media button + send |
| announce mode, not host | centered `🔒 Only the host can post here` |
| host-muted | centered `The host has turned off your messages for this game` |
| chat closed | centered `This chat is closed` |
| announce mode, host | input with placeholder `Announce to 7 players…` and an accent left border |

### Message rendering

- Stable `keyExtractor={(m) => m.id}`; consecutive messages from one sender group into a run —
  avatar and name on the first, tail radius on the last, 2px gaps between.
- Both the avatar **and** the name are `Pressable` → `/player/{id}` (constraint 6). Long-press a
  message → sheet: View profile · Copy · Report · Delete (own message, or any message if host).
- Avatars pass `photoUri` from `profiles.photo_path` through the public `avatars` URL, falling back
  to today's initial + `avatarColor` when the profile has no photo (constraint 5 — see
  §Decisions taken).
- Day separators; `HH:mm` shown once per run, not per bubble.
- System rows: centered, `colors.textMuted`, 12.5px, no bubble. `rescheduled` and `cancelled` get a
  subtle accent/danger tint — they are the two nobody may miss.
- Host messages get a small `HOST` chip next to the name; in announce mode they render full-width
  with an accent left rule.

### Data layer

- Realtime patches the cache from the payload instead of invalidating the whole thread
  ([messages.ts:58-72](../ui/lib/queries/messages.ts:58)). Sender names come from a separate,
  long-`staleTime` `["chat_members", gameId]` query, so an unknown sender costs one small fetch
  rather than a full thread refetch.
- Optimistic send keyed by `client_id`: bubble appears instantly at 60% opacity, resolves to sent,
  or turns into a tappable "Failed — tap to retry". The unique partial index makes a retry
  idempotent.
- Page 50 at a time, older loaded on reaching the top.
- Scroll anchoring: if the user is within ~120px of the bottom, new messages auto-scroll; otherwise
  a floating `N new ↓` pill appears (Slack rule). Own sends always scroll.
- `last_read_at` is written on blur/background as well as mount — today it fires once on mount
  ([chat/[id].tsx:22](../ui/app/chat/[id].tsx:22)), so anything arriving while you read stays unread.
- Unread becomes a count, feeding a numeric badge on the chat tab.
- Keyboard: replace the iOS-only `KeyboardAvoidingView`. Check the Expo 57 docs first — this is the
  one item in the plan most likely to have a new recommended API.

## Phases

Each is independently shippable and independently useful.

**P0 — make the existing thread solid.** `chat_v2` migration's message columns + `chat_threads`
RPC. Id keys, realtime cache patching, optimistic send, pagination, scroll anchoring, read-tracking
fix, unread counts, keyboard fix. *No new features; the thread just stops being a prototype.*

**P1 — identity and context.** Pinned event badge. Photo avatars. Tappable name. Day separators,
grouping, long-press sheet. System rows for created/joined/left/removed/rescheduled/cancelled.
*This is the phase a user would notice most.*

**P2 — host control (constraint 1).** `chat_mode`, `chat_muted_at`, `close_chat`, the three RPCs,
`can_post_in_chat`, the new insert policy, chat details sheet, composer states, cron auto-close
after the game.

**P3 — notifications (constraint 4).** `chat_prefs`, recipient filtering, message text in the push,
snooze durations, Android channel, `@mentions` (autocomplete on `@`, chip rendering, `mentions[]`).

**P4 — images.** New private `chat-media` bucket, path `{game_id}/{uid}/{uuid}.jpg`, RLS mirroring
the messages select policy so a removed player also loses the photos. Reuse `imagePrep.ts`
(downscale to 1600px, JPEG 0.8). Inline bubble with blurhash-free skeleton, tap → lightbox with
pinch-zoom and share.

## Decisions taken

- **"Public photo" means "a photo is set".** Constraint 5 reads "profile picture if it's public
  will be visible in chat"; there is no per-profile visibility flag and none is being added.
  `avatars` is a public-read bucket ([20260807000400_avatars_storage.sql:4](../supabase/migrations/20260807000400_avatars_storage.sql:4))
  and every uploaded photo already shows on `/player/{id}` and the game roster, so chat is not
  exposing anything new — it is catching up to the rest of the app. Photo set → photo renders;
  no photo → initial + `avatarColor`, exactly as today. No schema change, no gating, and the same
  `Avatar` component everywhere so the fallback can never drift between surfaces.
- **Removal cuts history.** Luma leaves a closed chat readable to past participants; we do not.
  Constraint 3 says removal means removal, and a roster whose identities are already RLS-private
  ([game_players.sql:47](../supabase/migrations/20260808000000_game_players.sql:47)) should not
  leak backwards. A removed player's thread disappears from their list.
- **Two modes, not a permissions matrix.** `open` and `announce`, plus a per-player override.
  Telegram-style granular permission grids are the wrong tool for an 8-person pickup game.
- **The host cannot be muted or locked out of their own chat**, mirroring `remove_player`'s refusal
  to remove the organizer ([game_management.sql:68](../supabase/migrations/20260810000000_game_management.sql:68)).
- **System rows are real `messages` rows**, not a separate table or a client-side merge. They
  sequence correctly for free, ride the same realtime channel, and paginate with everything else.

## Not doing

- **Threaded replies.** Eight people coordinating one 2-hour booking do not need a reply tree. A
  quoted-reply (swipe-to-reply, `reply_to_id`) is the cheap 80% and is worth revisiting after P4;
  threads are not.
- **1:1 DMs.** A large surface (its own inbox, its own blocking and abuse story) and a different
  product. Everything here is scoped to a game.
- **Typing indicators and read receipts.** Both need a realtime presence channel; read receipts in
  particular set an expectation ("they saw it and didn't reply") that hurts more than it helps
  among strangers.
- **Reactions.** Genuinely nice, genuinely cheap, but they earn their place after P1 proves people
  are in these threads at all.
- **Message editing.** Delete + repost is enough at this size.

## Open questions

1. **Auto-close window.** Days after `ends_at` before the cron closes the chat. Suggest 7 —
   long enough for "great game, same time next week", short enough that dead threads stop
   generating notifications.
3. **Announce-mode default.** Always `open` (proposed), or `announce` for games above some size?
   Recommend always `open`; a host who wants quiet finds the toggle, and defaulting to silence
   would kill the coordination the chat exists for.
4. **Rate limiting.** No per-sender throttle exists. A trigger-level "max N messages per minute per
   game per sender" is cheap insurance before the app leaves private beta.
