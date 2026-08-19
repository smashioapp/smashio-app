# My Games Plan — SMASHIO

Written 2026-08-12. Companion to [discover-plan.md](discover-plan.md), same method: who's on the screen, what the best products do, what's broken in our code today, then a phased plan judged on UX, UI, creativity, retention and information density.

Scope: [ui/app/(tabs)/my-games.tsx](../ui/app/(tabs)/my-games.tsx), [GameCard.tsx](../ui/components/GameCard.tsx), the `useMyJoinedGames` / `useMyHostingGames` / `useMyPastGames` hooks in [queries/games.ts](../ui/lib/queries/games.ts), and the roster/request hooks in [queries/gamePlayers.ts](../ui/lib/queries/gamePlayers.ts). One small migration (organizer identity on `games_public`); everything else is UI + existing tables.

---

## 1. Who is on this screen (HCD frame)

Discover is a **decision** surface — "should I join this?". My Games is a **commitment** surface — "what did I sign up for, is it still on, and what do I have to do?". Same cards will not serve both, and today we ship the Discover card here anyway.

| Mode | Share (est.) | Mental state | What they need | Success |
|---|---|---|---|---|
| **Attendee** | ~55% | "Wait — was it Thursday? Which court?" | When, where, is it still on, who's coming | Turned up, on time, right place |
| **Day-of player** | ~20% | "Leaving in 20 minutes." | Address + directions, chat, what to bring, live countdown | Zero taps to navigate |
| **Host** | ~20% | "Am I full? Who's waiting on me?" | Pending requests, fill state, share invite, verification | Roster decided in <1 min, game fills |
| **Returner** | ~5% | "That was good — do it again." | History, regulars, one-tap rebook, ratings owed | Rebooked the same slot |

**Design principle:** every element must answer *"is this still happening, and what do I do next?"*. Discover's grammar — spots left, price per player, request-to-join — is the wrong grammar here. You already decided. Scarcity is now noise; logistics are the product.

---

## 2. Benchmark — what the best "my stuff" screens do

| Product | Mechanic | Why it applies |
|---|---|---|
| **Airbnb Trips** | One upcoming list, not tabs per role. The imminent trip is a hero card with day-of actions (directions, message host, check-in details); everything else collapses to rows. | Our Joined/Hosting split forces the user to reassemble their own week from two tabs. Their calendar is one thing. |
| **Playtomic My Matches** | Bookings and open matches in one list; edit/cancel are two taps from the row; cancellation deadline is stated on the row itself. ([help](https://playerhelp.playtomic.com/hc/en-gb/articles/19832121593873-How-to-cancel-a-reservation), [policy](https://playerhelp.playtomic.com/hc/en-gb/articles/19831672824465-Cancellation-Policy-for-Open-Matches-Padel-Tennis)) | Our list is read-only — every action needs a trip into the detail screen. |
| **Apple Wallet / boarding passes** | The thing you need in the moment gets full screen at the right time and disappears after. | A game starting in 90 minutes should not render identically to one 11 days out. |
| **Meetup / Partiful "you're going"** | RSVP state, host identity, attendee faces, and a group thread are all on the same card. | We show a headcount number and no faces — on a screen where RLS *does* let us show the roster. |
| **Google Calendar agenda view** | Day-grouped, sticky headers, "today" pinned at top. | Exactly what D3 gave Discover. My Games is more calendar-shaped than Discover ever was and has none of it. |
| **Uber / DoorDash active order** | While the thing is happening, the screen becomes a live status surface. | "On now · ends 9:00pm" is real state we already have (`ends_at`) and never show. |
| **Strava activity history** | Past isn't a receipt list, it's an identity: totals, streaks, people you keep training with. | Our Past tab is two lines of text and a rating button, on a tab most users will find empty. |
| **Duolingo** | Streaks are the return mechanic. | Streak already computed (`useProfileStreak`) and shown only inside post-game and profile. |
| **Event-app UX writing** ([EventMobi](https://www.eventmobi.com/blog/best-practices-for-event-app-design/)) | Day-of screens strip to core actions — check in, navigate, join. | Our day-of card carries a price and a fill bar. Neither helps anyone at 6:40pm. |

**Synthesis — the five things they share:**
1. One agenda, roles as annotations, not as tabs.
2. The imminent item is privileged, in size and in actions.
3. Every commitment shows a human (host, faces, thread).
4. Actions live on the card, not one screen deeper.
5. History is an identity, not an archive.

We have none of the five.

---

## 3. Diagnosis — what's wrong today

Grounded in the current code, worst first.

**Truth bugs (these actively mislead):**
- **A join request disappears.** `useMyJoinedGames` filters `status = 'approved'` ([games.ts:295](../ui/lib/queries/games.ts#L295)). Between "Request to join" on Discover and the host approving, the game exists nowhere in the player's app. The one screen named "My Games" is silent about the game you just asked for.
- **Past history includes games you never played.** `useMyPastGames` reads `game_players` with no status filter ([games.ts:350](../ui/lib/queries/games.ts#L350)) — games you were rejected from, left, or were removed from all land in your history with a "Rate players" button.
- **A failed fetch renders as "Nothing on your calendar."** All three tabs are `isLoading ? skeleton : list`, so an error falls straight into `ListEmptyComponent`. Same lie D0 fixed on Discover; still shipping here.
- **Dangling separator on every card.** `toGameFromPublicRow` sets `distance: ""` ([games.ts:78](../ui/lib/queries/games.ts#L78)) and `GameCard` renders `{suburb} · {distance}` unconditionally ([GameCard.tsx:100](../ui/components/GameCard.tsx#L100)) → "Chatswood · " with a trailing dot.
- **No host on any card here.** `games_public` doesn't join `profiles`, so `organizerName` is undefined and the whole host row is skipped. You can be in a game and not see who's running it.
- **Stale after approval.** No focus-invalidate: `staleTime` is 30 s and React Query's window-focus refetch is inert in RN without a `focusManager`/AppState bridge. Approvals arrive by push while the screen is mounted; the list doesn't move.

**Wrong grammar (Discover's card on a commitment screen):**
- `GameCard` shows "2 spots left" + fill bar + `$8 / player` for a game you already joined. Scarcity is meaningless post-commitment; price is a memory, not a decision.
- No role marker. Hosting and Joined are distinguished only by which tab you happen to be on.
- No roster faces — and unlike Discover, RLS *permits* it here (`game_players readable by organizer and members`). The social proof we can't show on Discover we're also not showing where we can.
- No actions: no directions, no chat, no leave, no share. Everything is a trip to `/game/[id]`.

**Host gaps:**
- The tab-bar dot for pending requests points at My Games ([TabBar.tsx:137](../ui/components/TabBar.tsx#L137)), but My Games shows no pending count, per game or in total. The dot leads to a screen that doesn't explain it. Requests are only decidable inside `/game/[id]`.
- The hosting card is a *worse* card than the joined one — venue, date, badge, two buttons. No fill state, no roster, no countdown urgency about an unfilled game.
- **No path to verification after creation.** `useUploadConfirmation` is only wired into the wizard ([wizard.tsx:153](../ui/app/wizard.tsx#L153)). A host who skips it there can never upload later, so `verification_status` stays `none` forever — and Discover's verified filter permanently excludes them.

**Past tab gaps:**
- "Rate players" is always shown; nothing reads the `ratings` table, so a rated game looks identical to an unrated one and re-invites the same work.
- "Rebook" pushes `/wizard` with an empty draft ([my-games.tsx:166](../ui/app/(tabs)/my-games.tsx#L166)) — it books nothing, it just opens the host flow. The same lie exists on post-game's "Rebook this game".
- No stats, no faces, no venues, no streak. Everything the post-game reveal celebrates vanishes the moment it navigates here.

**Structure:**
- Three flat lists, no day grouping, no "next up", no month grouping in Past.
- Tab chips carry no counts, so the shape of your week is invisible until you tap.
- A cancelled joined game is a dead end — accurate, strikethrough, and then nothing. No replacement, no dismissal.
- Empty Upcoming is a wall with one CTA, while Discover has live supply we could inline.

---

## 4. The plan

Seven phases, sequenced by leverage.

### M0 — Truth & trust ✅

Nothing else matters while the screen lies. All UI + query fixes, no migration.

- [x] Surface **requested** games: `useMyJoinedGames` includes `status in ('approved','requested')` and the card shows an "Awaiting host" state with a withdraw action.
- [x] Fix `useMyPastGames` to `status = 'approved'` memberships (plus games you organized) — history stops counting games you never played.
- [x] Error state per tab: `isError` → "Couldn't load your games" + Retry, never the empty state.
- [x] Kill the dangling "· " — `GameCard` renders the distance segment only when non-empty.
- [x] Focus-invalidate `my_games` + `pending_requests_count` via `useFocusEffect`, so a push-driven approval is reflected when the user returns.
- [x] Counts on the segment chips ("Upcoming 3 · Past 12"), with a dot when a host decision is pending.

### M1 — One agenda + the commitment card ✅

The structural call: **merge Joined and Hosting into a single "Upcoming"**, role as an annotation on the card. Segments become **Upcoming · Past**.

- [x] Day-grouped sections with sticky shrinking headers — extract `DayHeader` out of [discover.tsx:59](../ui/app/(tabs)/discover.tsx#L59) into a shared component; `dayLabel()` gains a `todayLabel` option ("Today" reads right for a 9am game, "Tonight" does not).
- [x] Rebuild the card for commitment:
  - Role chip — **Hosting** / **Playing** / **Requested**.
  - **Roster faces** — a batched roster query (one `game_players` select across all my game ids, `status = 'approved'`, joined to `profiles`) feeding an avatar row with overflow count. Cheap, allowed by RLS, and the single biggest warmth upgrade on the screen.
  - Host row on games you joined — *Backend: `games_public` joins `profiles` for `organizer_display_name` / `photo_path` / `reliability_score`.* `profiles` is already readable by authenticated, and the view is `security_invoker`, so no policy change.
  - Replace scarcity with state: "You're in · 6 going" (player) / "6 of 8 in" (host). Fill bar stays for hosts only — for them it *is* the job.
  - Action row: **Directions** (lift `openDirections` out of [game/[id].tsx:30](../ui/app/game/[id].tsx#L30) into `lib/`), **Chat** with unread dot from `useChatThreads`, and Leave / Manage.
- [x] Cancelled card keeps its treatment, gains "Find a replacement" → Discover (host's own cancellation skips it — nothing to replace).

### M2 — Next up (the day-of surface) ✅

- [x] **Hero card** for the next game inside 24 h: large live countdown, address with one-tap directions, roster faces, chat, and "Bring $8".
- [x] **Live state** while `now` is between `starts_at` and `ends_at`: "On now · ends 9:00pm" with a pulsing dot. Data we already have and never render.
- [x] **Add to calendar** (`expo-calendar`) — the highest-utility, lowest-cost retention primitive available to this screen. Shipped 2026-08-19 as an explicit, account-choosing button (Game Detail row + NextUpHero third button), not the original silent-add-on-join. Silent add was removed: it fired a surprise permission prompt mid-join, wrote to whatever calendar happened to be default rather than one the user picked, and had no dedupe against a second join attempt.
- [x] Countdown escalates to accent/danger under 2 h, matching Discover's D6 rule.

### M3 — Host console ✅

Turns the tab-bar dot into something that pays off.

- [x] **Pending requests inline**: grouped counts (one `game_players` query over my hosted ids — no migration), rendered on the hosting card as a decide-in-place strip reusing [SwipeToDecide.tsx](../ui/components/SwipeToDecide.tsx). Approve/decline without opening the game.
- [x] **Fill health**: "2 spots open · 26 h to go" + Share invite (`shareGame` already exists) when a game is under-filled and close.
- [x] **Verification path after creation** — upload/re-upload the booking confirmation from the hosting card, closing the `verification_status = 'none'` trap. Reuses `useUploadConfirmation` as-is.
- [x] Cancel game from the card (hold-to-confirm via [HoldButton.tsx](../ui/components/HoldButton.tsx)) instead of a trip through Edit.

### M4 — Past as history worth keeping ✅

- [x] **Ratings owed**: read `ratings` for `rater_id = me` across past game ids (policy already permits) → "Rate 3 players" vs "Rated ✓". Stop re-inviting finished work.
- [x] **Rebook that rebooks**: prefill the wizard draft from the past game — same venue, tier, max players, cost, same weekday next week. The store already has `selectVenue` / `setStartsAt` / `selectWizardTier`; today's button just doesn't use them. Fix post-game's identical button in the same change.
- [x] **History header**: games played, week streak (`useProfileStreak`), most-played venue, and regulars ("You've played with Sam 5×") — all derivable from `game_players` + `games`.
- [x] Group past games by month; keep newest first.

### M5 — No dead ends ✅

- [x] Empty Upcoming isn't a wall: inline a live "Happening near you this week" rail (reuse [Rail.tsx](../ui/components/Rail.tsx) + `useDiscoverGames`) plus the alert primitive from [alerts.ts](../ui/lib/queries/alerts.ts).
- [x] After a cancellation: replacement suggestions at the same venue or the same night.
- [x] When the last upcoming game ends: "Rebook your regular slot" seeded from the most-played venue + weekday.

### M6 — Feel ✅

- [x] Segment switch cross-fades (same key-remount trick as Discover's `filterSignature`).
- [x] Roster avatars enter with a stagger; host spot-fill animates through [RollingNumber.tsx](../ui/components/RollingNumber.tsx).
- [x] Haptic tick on approve/decline; success burst when a hosted game reaches full.
- [x] Hero countdown ticks live (own interval in `NextUpHero`, not on parent re-render).

---

## 5. How we'll know it's the best

| Metric | Why | Target |
|---|---|---|
| No-show / late-leave rate | The screen's real job is getting people to turn up | ↓ |
| Host decision latency (request → decide) | M3's whole point | median <2 h |
| Requests abandoned by the requester | Today they're invisible in-app (M0) | ↓ |
| Rating completion on completed games | M4 | >50% |
| Rebook within 7 days of a past game | The returner loop | >25% |
| My Games sessions that end in an action (directions, chat, decide, rebook) | Is it a utility or a receipt? | >60% |
| Games with `verification_status = 'none'` | M3's upload path | ↓ |

---

## 6. Order of work

**M0 → M1 → M2 → M3 → M4 → M5 → M6.**

M0 stops the screen lying and unblocks nothing else — it's cheap and it's all bugs. M1 is the structural change everything after it sits on (one agenda, one card, roster faces), and carries the only migration. M2 is the highest-perceived-value phase for players, M3 for hosts — run whichever cohort matters more first. M4 makes a currently-dead tab worth opening. M5 and M6 trail.

**Backend touchpoints — one:** `games_public` joins `profiles` for organizer identity (M1). Everything else (roster batch, grouped pending counts, ratings read, stats) is existing tables under existing policies.

## 7. Not doing

- No payment tracking or "who's paid" ledger. Cost split stays informational; money in the app is a separate product decision.
- No QR/geofence check-in. It needs venue cooperation we don't have, and a self-serve "I'm here" button is a lie nobody verifies.
- No two-way calendar sync. One-way `expo-calendar` export only.
- No third role tab. If the agenda needs a filter, it's a chip, not a tab — the merge in M1 is the point.
- No new visual language. Dark/lime, existing component set, `reanimated` + `expo-linear-gradient` only — same constraint as [ux-plan.md](ux-plan.md) and [discover-plan.md](discover-plan.md).
