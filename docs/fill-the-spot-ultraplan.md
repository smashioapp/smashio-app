# Fill-the-spot ultraplan: post in 30 seconds, join in one tap

Written 2026-09-27. **Status: proposed.** Nothing here is approved or built.

Serves [gtm-strategy.md](gtm-strategy.md) §1 (the promise), §2.2 (message house: Real court,
Real level, Real players, Fast), §4 (flywheel: a booker only comes back if the spot fills) and §9
(promise metric: median time-to-fill). Builds on, and does not re-propose, what shipped in
[short-a-player-plan.md](short-a-player-plan.md) (S1-S8), [short-a-player-ux-plan.md](short-a-player-ux-plan.md)
(U0-U6) and [create-game-plan.md](create-game-plan.md) (v3 draft card).

Method: hands-on walk of both flows in the local app (`supabase start` + `npm run web`, 375x812,
logged in as `test@smashio.dev`), then reading the code and migrations behind each screen.
Web can't show native pickers, camera, blur or real pushes, so those parts were judged from code.

---

## 0. The two jobs, in one line each

1. **Host (supply):** "I've got a court and I'm one short. Post it before I lose interest, and tell
   me it's working."
2. **Player (demand):** "Tell me about a real game near me, at my level, with the price, without
   spamming me. If I'm keen, one tap gets me in and I can talk to the host."

Every change below is judged against those two sentences.

---

## 1. Scorecard (today, 2026-09-27)

| # | Step | Score | One-line verdict |
|---|---|---|---|
| **Host** | | | |
| H-a | Entry: "Got a court booked?" fork | 8 | Right question, right copy, three honest exits |
| H-b | Snap the booking (parse) | 8 | Strong on paper (PDF, lock-on-high-confidence, past-date guard). Not device-tested here |
| H-c | Draft card defaults | 7 | "3 in · Needs 1 · doubles" is spot on. Time default and picker are not |
| H-d | Setting WHEN | 4 | Full inline calendar + spinner to say "tonight 7pm" |
| H-e | Publish moment | 6 | Nice stamp, but the promise ("giving nearby players a heads up now") can be false |
| H-f | After publish: filling it | 4 | No feedback on pings. Four overlapping share buttons. Break-even maths is wrong |
| **Host overall** | | **6** | Posting is good. The *filling* part, which is the product, is silent |
| **Player** | | | |
| J-a | The alert itself | 5 | Good cap (2/day) and quiet hours. Missing price and distance. Drops, never defers |
| J-b | Game page as a decision screen | 5 | Answers when/where/price. "Who" and "is it real" sit at the bottom |
| J-c | The join tap | **2** | Page says "Auto-approved", tap says "Request sent". Trust breaker (§2 F1) |
| J-d | After joining: coordination | 5 | Chat exists. No "you're in" moment, no pay/meet info, noisy inbox |
| J-e | "It's not fake" feeling | 5 | Court booked + reliability exist but aren't on the decision path |
| **Player overall** | | **4.5** | The engine is there. The experience around it isn't yet |
| **Combined** | | **5.5 / 10** | |

---

## 2. Findings, with evidence

Severity: **P0** breaks the promise or trust, fix before any real user. **P1** costs fills.
**P2** polish.

### Player side

| # | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | **P0** | **`auto_approve` is stored and advertised but never enforced.** Every join lands as `requested`. Game page says "Joining: Auto-approved", the player taps Join and gets "Request sent", and the host (who chose auto-approve so they wouldn't have to) gets an approve/decline push. Default is `true`, so this hits nearly every game. It also makes the spot-alert action "Ask to join" a request by design. | `request_to_join` in `20260831010000_referral_priority.sql` has no reference to `auto_approve`; only `create_game` writes it (`20260901120000_host_a_game_v3.sql`). Reproduced on game `44444444-...0001`: `auto_approve = t`, row `status = requested`. UI string at `ui/app/game/[id].tsx:649` |
| F2 | P1 | **Spot alert omits price and distance.** Push reads "1 spot, tonight 7:00 pm at Test Courts" / "Intermediate, court's booked. Keen?". The two things a player weighs first (how much, how far) need a tap to find. | `spotOpenBody`, `supabase/functions/push-dispatch/format.test.ts:585` |
| F3 | P1 | **Alerts in quiet hours are dropped, not deferred.** `spot_open_recipients` excludes anyone in 22:00-07:00 and nothing re-sends at 07:00. A host posting at 10:30pm for a 9am game reaches nobody. | `20260924000000_spot_alerts.sql`, `time_in_window` clause in `spot_open_recipients` |
| F4 | P1 | **Games posted more than 24h out never ping at publish**, and nothing pings them when they cross into the window. Only saved `game_alerts` fire. Hosts who plan ahead (the recurring group, gtm §2.4) get the least help. | `trigger_spot_open_on_game`: `spot_open_eligible(new.id, interval '24 hours')` on insert only |
| F5 | P1 | **Trust signals are below the fold.** On a 375x812 screen the first view is cover, title, a date pill that repeats the title, format chips and an empty lineup. Host name, "Reliability 100", "Message" are the last block before Share. For "is this real?" that's the wrong order. | `get_page_text` on the game page: HOST block after COST and GOOD TO KNOW |
| F6 | P1 | **No "you're in" moment.** After joining, the button changes state and nothing else: no summary of when/where/how to pay, no calendar or directions prompt, no nudge to say hi in chat. | Screenshot after join: page unchanged except the footer |
| F7 | P2 | **How to pay is only in the confirm sheet** ("You sort it with Ava Chen on the day"). Not on the page, not after joining. Players want to know cash vs transfer before they commit. | Join sheet copy |
| F8 | P2 | **Inbox noise.** Three identical "Badminton at PCYC Auburn · 3 new messages" rows, and titles that say "Badminton at X, Tue 3:12 am" instead of leading with the venue and a friendly time. | `/notifications` page text |
| F9 | P2 | Stray player name ("Ben") rendered under the lineup summary on the player view. Seen once, needs a check. | `get_page_text` on game `...0001` |

### Host side

| # | Sev | Finding | Evidence |
|---|---|---|---|
| F10 | **P0** | **Break-even card is wrong and alarming.** With no court cost entered it invents one ($8 x 4 = "$32 total"), then ignores the 2 held friends who are paying: "1 in at $8, that's $8. You're $24 short of covering it". Real answer: 3 of 4 paying, $8 short. | Host game page, fresh game with 2 held spots |
| F11 | **P0** | **Success screen promises pings that may not happen.** "We're giving nearby players at your level a heads up now" shows even when the game is >24h out (F4), it's quiet hours (F3), or `fire_spot_open` returned 0 recipients. The first time a host notices nobody came, we've lost them (gtm §4). | `ui/app/wizard.tsx` success copy vs `fire_spot_open` return value, which is never surfaced |
| F12 | P1 | **Host gets no feedback while the spot is open.** `spot_openings.recipients` is counted but never shown. No "23 players pinged, 6 looked, 1 keen". The host's only move is to go back to WhatsApp, which is the habit we're trying to break. | Host game page: no alert status anywhere |
| F13 | P1 | **Too many ways to share.** "Find a sub", "Share link", "Invite from last game", "Copy for WhatsApp" as chips, plus "Share" and "Duplicate" at the bottom and a share icon in the header. Share link and Copy for WhatsApp are the same job. | Host game page |
| F14 | P1 | **WHEN is the slowest field for the most common case.** Default is tomorrow 9am. Native UI is an inline month calendar plus a time spinner. "Tonight 7pm" should be two taps. | `renderDateTimePicker`, `ui/app/wizard.tsx:754` |
| F15 | P2 | **Rows don't advance.** Picking a venue leaves WHERE open. The host has to find and tap WHEN. | Wizard, after picking "MUSAC" |
| F16 | P2 | **No reach preview before publishing.** "Nearby players at your level get pinged" with no number. A number is what makes a host trust the app over the group chat. | WHO row copy |
| F17 | P2 | **Intent lost through sign-in.** A guest taps +, signs in, and lands back on Discover, not in the host flow. | Walked as guest, then logged in |
| F18 | P2 | Redundant date: header "Mon, 28 Sept · 9:00am-10:30am", pill "Tomorrow, 9am", status card "Needs 1, tomorrow". Three lines, one fact. | Host and player game pages |

---

## 3. What 10/10 looks like (prior art, and what we take)

| Pattern | Who does it well | What we take |
|---|---|---|
| **Instant book vs request** as a clear, honest switch | Airbnb, ClassPass | Auto-approve means *you're in*. Request mode says "Ava approves requests, usually within 20 min" |
| **Live matching status** so waiting feels like progress | Uber ("finding your driver"), Deliveroo tracker | A fill tracker on the host's game: pinged, looked, keen, filled |
| **Reach preview before you post** | LinkedIn/Meta ads ("estimated audience") | "About 20 Intermediate players within 10 km" before Publish |
| **One card answers the decision** (price, time, place, people, proof) | Playo game card, Airbnb listing header, Hinge profile | A "spot card" above the fold with all five answers |
| **Relevance over volume** in pushes | Hinge "Most Compatible" once a day, Strava | Rank candidates, send the best 2 a day, defer quiet-hours sends to 7am |
| **Actionable notifications** | iOS rich notifications, Uber Eats | "I'm in" straight from the push for auto-approve games |
| **Paste what you already wrote** | Splitwise receipt scan, Google Calendar from Gmail | Paste the WhatsApp "need 1 for dubs" message, we build the game |
| **Day-of coordination card** | Airline boarding pass, Uber pickup screen | Game-day card: court number, meet point, who's there, how to pay |

The bar: **host posts in under 30 seconds and sees a live number within a minute. Player decides
from the lock screen and is in with one tap, then knows exactly what happens next.**

---

## 4. The plan

Six phases. P0 is correctness and ships first regardless of what else is approved.

### Phase P0: tell the truth (about 1.5 d, one migration + JS)

1. **Enforce `auto_approve` (F1).** In `request_to_join`: when `open_spots > 0` and the game's
   `auto_approve` is true and the player isn't blocked by the host, insert as `approved` with
   `decided_at = now()`. Waitlist path unchanged. Existing approval triggers (chat membership,
   `spot_filled`, notifications) already key off `approved`, check each one fires on insert, not
   only on `requested → approved` update. Host gets "Jay joined your game" (not an approve push).
   pgTAP case for both modes. `rules/supabase-db.md` grants apply.
2. **Join button tells the truth.** Auto-approve: "Join · $12" → "You're in". Request mode:
   "Ask to join · $12" → "Asked. Ava usually replies in about 20 min" (median host response time,
   hidden until there's data). Spot-alert push action label follows the same rule.
3. **Break-even (F10).** Show it only when the host entered the court cost. Count host + joined +
   held as paying. Copy: "Court's $35. 3 of 4 paying, you're $9 short until the last spot fills."
4. **Honest success screen (F11).** Use `fire_spot_open`'s return (expose via `create_game`'s
   result or a follow-up read of `spot_openings`). Three states:
   - Sent: "We've pinged 23 players near MUSAC at your level."
   - Scheduled (quiet hours or >24h out, after P4 lands): "We'll ping nearby players at 7am."
   - Nobody yet: "No one nearby has alerts on yet. Share it to your group, that's the quickest fill."
5. **Intent through sign-in (F17).** Store `returnTo` before redirecting to onboarding.
6. Fix the stray lineup label (F9) and collapse the three date lines into one (F18).

### Phase P1: host posts in 30 seconds (about 2.5 d, JS only, OTA-safe)

1. **Smart WHEN (F14).** Replace the calendar-first UI with chips: **Tonight · Tomorrow ·
   Sat · Sun · Pick a date**, then time chips seeded from the venue's popular start times
   (fallback 6pm, 7pm, 8pm, 9pm) plus "Other". Default: if it's before 5pm, today at the next
   common slot; after, tomorrow 7pm; if the host has a previous game, their usual day/time.
   Native picker stays behind "Pick a date" / "Other".
2. **Rows auto-advance (F15)** after a valid pick, with the draft card preview animating the change.
3. **Reach preview (F16).** New RPC `spot_reach_estimate(venue_id, tier_min, tier_max, starts_at)`
   returning a rounded count (floor to 5, "5+" below 5, never exact, never identities). Shown under
   the Publish button: "About 20 players near MUSAC get pinged". Aggregate only, `authenticated`
   grant only.
4. **One-line summary on the Publish button area:** "Need 1 for doubles · MUSAC · tonight 7pm · $9".
   This is also the default share text.
5. **"Same as last time" on +.** When the host has a past game, the fork screen gets a top card:
   "Rebook: MUSAC, Tue 7pm, 3 in, need 1". One tap into the draft with everything filled
   (duplicate already exists, this surfaces it at the moment of intent).

### Phase P2: the spot card and a better alert (about 3 d, JS + push-dispatch)

1. **Richer alert (F2).** Title: "1 spot tonight 7pm · MUSAC". Body: "$9 · 4 km · doubles,
   Intermediate. Court's booked." (drop the clause when not booked, per "no negative badges").
   Keep the 2/day cap. Actions by mode: auto-approve **"I'm in"**, request **"Ask to join"**,
   plus **"Not for me"** (feeds P4 relevance, never shown as a count).
2. **Spot card (F5).** The first screen of the game page for a non-member becomes a single card
   that answers the five questions in this order:
   - **When**: "Tonight 7pm, 90 min" with a countdown when under 6h.
   - **Where**: venue, suburb, distance, "Court booked" tick.
   - **How much**: "$9 each, pay Ava on the day" (P2.4).
   - **Who**: host avatar + first name + "Turns up 98%" + hosted count, then the lineup with voted
     levels (U3 D-U2 `game_lineup_public`, already decided yes).
   - **Real?**: the TrustRow ("Court booked · Level voted by 7 · Turns up 98%").
   Everything else (venue map, good-to-know, cost maths) moves below. Redundant date pill goes.
3. **"You're in" sheet (F6).** After joining: stamp animation (reuse `PublishStamp` pattern),
   summary, three actions: **Say hi** (opens chat with a quick reply pre-typed: "Hey, keen for
   tonight"), **Add to calendar**, **Directions**. Request mode shows the same sheet with
   "Ava will confirm" and the chat preview locked.
4. **How to pay (F7), decision D3.** Optional host field in More options: "How do people pay you?"
   with chips **Cash on the day · Bank transfer · I'll sort it in chat**, plus optional
   free-text handle. Shown on the spot card and the you're-in sheet. This is information, not
   payments (payments stay in "Not doing").

### Phase P3: the fill tracker (about 2 d, JS + one read RPC)

1. **Fill tracker on the host's game page (F12).** Replaces the chip cloud at the top:

   ```
   Needs 1 · tonight 7pm
   ● Pinged 23 nearby   ● 6 had a look   ● 1 keen
   [ Share to group chat ]        Ping wider (15 km)
   ```
   Data: `spot_openings.recipients`, views from a new lightweight `game_views` counter
   (per-profile dedupe, host sees only the count), joins from `game_players`. Updates over
   Realtime. When it fills: "Filled in 38 min" with a small celebration, which also feeds the
   §9 promise metric.
2. **One share action (F13).** "Share to group chat" opens the native share sheet with the
   P1.4 one-liner + link (rich preview already exists via website share pages). "Copy for
   WhatsApp" and "Share link" merge into it. "Invite from last game" moves under a "More ways
   to fill" row with "Ping wider" and "Hold a spot".
3. **Host pushes that matter:** "Jay joined. You're full, game on" and, if still open at T-3h,
   "Still 1 short for tonight. Ping 15 km out?" with the action inline (reuses `find_a_sub`).
   This replaces the generic `nudge_underfilled` copy for games with an open spot.

### Phase P4: smart delivery, "not too much" (about 2 d, backend)

1. **Defer, don't drop (F3).** Quiet-hours recipients go into a `spot_open_deferred` queue that a
   cron flushes at each recipient's quiet-end, if the game is still eligible.
2. **Ping when the window opens (F4).** A cron picks up games that crossed into the 24h window
   without a default-ring send and fires once. Planning-ahead hosts get the same help.
3. **Relevance.** When a player has more candidate games than cap, rank by: distance, level fit
   (centre of range beats edge), time-of-week match to their past games, host reliability, court
   booked. "Not for me" on a venue or time slot lowers that pattern for 30 days. Never raise the cap.
4. **Weekly health check:** alert mute rate per week (target under 5%) goes on the gtm §9 scorecard.

### Phase P5: game-day coordination (about 2 d, JS + push-dispatch)

1. **Game-day card** at T-2h in My Games and as the 2h reminder push: court number (host adds
   "Court 3" in chat or a field, `court_label` exists), meet point, who's confirmed, how to pay,
   host's "I'm here" status.
2. **Quick replies** in game chat on game day: "On my way", "Running 10 late", "Here, at
   reception" (`ChatQuickReplies` exists, needs game-day set).
3. **Inbox hygiene (F8):** coalesce chat rows per game into one ("PCYC Auburn · 3 new"), titles lead
   with venue and a human time ("MUSAC, tomorrow 9am").

### Phase P6: later, once P0-P3 prove out

- **Paste from WhatsApp.** Host pastes "need 1 for dubs 7pm alpha auburn $10 each" and `ai-proxy`
  `parse` fills the draft. Same lock/provenance rules as the booking snap. Meets hosts where they
  already are (gtm §1: "stuck in WhatsApp").
- **Venue QR deep link** straight into the host flow with the venue pre-filled (`hostHereSeed`
  exists), for the gtm §7.2 poster.
- **Live Activity** for game day (notifications-v2 V2.4, held).

---

## 5. Targets (add to the gtm §9 scorecard)

| Metric | Today | Target |
|---|---|---|
| Time to post (tap + → published), median | not tracked | under 30 s manual, under 20 s rebook |
| Publish → first join, median | not tracked | under 60 min for games inside 24h |
| Spots opened → filled before start | S8 tracks | 50%+ (gtm §9 #3) |
| Alert → join conversion | not tracked | 5%+ |
| Alert mute/disable rate, weekly | not tracked | under 5% |
| Joins needing host action on auto-approve games | **100% (F1)** | 0% |

New PostHog events: `host_flow_started`, `host_published` (with `ms_to_publish`, `path`),
`spot_card_viewed` (with `source: push|discover|link`), `join_tapped`, `youre_in_action`.

---

## 6. Order and effort

| Phase | Effort | Ships via | Depends on |
|---|---|---|---|
| P0 truth | 1.5 d | 1 migration + OTA | none, do first |
| P1 30-second post | 2.5 d | OTA + 1 RPC | none |
| P2 spot card + alert | 3 d | OTA + push-dispatch deploy | U3 `game_lineup_public`, D3 |
| P3 fill tracker | 2 d | OTA + 1 migration | P0.4 |
| P4 smart delivery | 2 d | migrations + cron | none |
| P5 game day | 2 d | OTA + push-dispatch | P2.4 |
| **Total** | **about 13 d** | | P0-P3 before the 2 Nov go/no-go (gtm §7.3) |

Push action "I'm in" is a JS category change, OTA-safe (short-a-player §8.2 precedent).

---

## 7. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| D1 | Auto-approve on by default, and truly instant? | **Yes.** It's already the default; the promise is "fills fast". Request mode stays one toggle away |
| D2 | Show hosts a reach number before publishing? | **Yes, rounded to 5, "5+" floor.** No names, aggregate only |
| D3 | Add a "how do people pay you" field? | **Yes, info only**, chips + optional handle. No money moves through Smashio |
| D4 | "I'm in" directly from the push on auto-approve games? | **Yes for games with a cost under $20**, otherwise open the spot card with the confirm sheet |
| D5 | Defer quiet-hours alerts to 7am instead of dropping? | **Yes**, only if the game is still eligible at send time |
| D6 | Track game views for the host tracker? | **Yes**, count only, per-profile dedupe, host sees totals never names |

---

## 8. Not doing

| | Why |
|---|---|
| In-app payments, deposits, wallets | gtm §2.3 and short-a-player §5: pulls us toward booking and Jigsaur's lane |
| Court booking or availability | Never pitch booking (gtm §1) |
| Raising the 2/day alert cap | "Not too much" is the point; relevance does the work instead |
| Negative trust badges ("Unverified host") | short-a-player §5: absent signal is omitted |
| Showing who viewed a game | Creepy. Counts only |
| Rebuilding the draft-card wizard | It's the right shape (create-game-plan §3). P1 tunes it |

---

## 9. Verification per phase

- `supabase db reset`, pgTAP for `request_to_join` in both modes, `npx tsc --noEmit`.
- Web preview at 375x812 for layout (`verify-ui`), Maestro smoke for join (`e2e-smoke`).
- Device check on iOS + Android for push copy, actions and the you're-in sheet (web can't).

---

## 10. Status (2026-09-28)

D1-D6 settled by adopting every recommendation above. Working on branch `feat/fill-the-spot`.

**P0: implemented locally, committed, not deployed.**
- Migration `20260928000000_fill_the_spot_p0.sql`: `request_to_join` auto-approves on `auto_approve` games (host gets a `player_joined` push, `game_full` when it fills, chat "joined" message fires on the direct-approve path), `games.court_cost_cents`, `create_game_with_spots(p_court_cost_cents)`, `spot_open_reach(game_id)` (organizer only). pgTAP: 356 pass, new `request_to_join_auto_approve_test.sql`.
- push-dispatch: `player_joined` copy, routing and `requests` channel.
- Client: break-even card uses the real court cost (hidden when unknown), F18 date line removed, Ask-to-join labels, "Asked. {host} will reply soon", guest "+" saves `/wizard` as the pending path, wizard passes the existing court total (F16) as `courtCostCents`, success screen reads `spot_open_reach` so copy is honest.
- Skipped: F9 stray "Ben" label (needs live repro), court cost on the edit-game screen, "Scheduled" success state (waits for P4).

**P1: implemented locally, not deployed, not visually verified (no Docker on this machine, so no `supabase start`, pgTAP or web preview).**
- Migration `20260928000100_fill_the_spot_p1_reach.sql`: `spot_reach_estimate(venue, tier_min, tier_max)`, aggregate rounded to 5 (5 = "5+", 0 = nobody), authenticated only. pgTAP `spot_reach_estimate_test.sql` written, unrun. `ui/lib/db.types.ts` hand-edited for the new RPC, regenerate when Docker is up.
- Wizard: WHEN is Day chips (Tonight/Tomorrow/Sat/Sun/Pick a date) + time chips (6-9pm/Other), native pickers behind the last chip. Default slot: before 5pm next common slot today, else 7pm tomorrow. Venue pick auto-opens WHEN, a time chip collapses it. Summary line + reach line above Publish. "Same as last time" card on the fork from the host's latest past game.
- Skipped: venue-specific popular start times (no data yet, fixed 6-9pm), host's usual day/time default (rebook card covers it), summary line as the default share text (post-publish share copy unchanged).

**P2: implemented locally, not deployed, not verified (no Docker, no device).**
- Migration `20260928000200_fill_the_spot_p2.sql`: `games.payment_method` (cash/transfer/chat) + `payment_handle`, on `games_public` and `create_game_with_spots`; `push_game_summary` gains `auto_approve`. No pgTAP added for it yet.
- push-dispatch: alert is now "1 spot tonight 7:00 pm · MUSAC" / "$9 each · Intermediate, court's booked. Keen?". Category per game (`spotOpenCategory`): instant under $20 = "I'm in", instant $20+ = "Have a look" (opens the spot card), request mode = "Ask to join". Deno tests pass (74).
- Client: `SpotCard` (when, where, how much, who, real) replaces the status pill and trust rows for non-members. `YoureInSheet` after a join (instant: chat, calendar, directions; request mode: "Asked, will confirm"). Wizard More options has "How do people pay you?" chips. New categories registered in `lib/notifications.ts`.
- Skipped: distance in the alert (per-recipient, the copy is built once per game), "Not for me" action (feeds P4), lineup strip moved into the spot card (still below it), pre-typed "Hey, keen for tonight" in chat (chat screen has no draft param), payment field on the edit-game screen, PublishStamp animation on the sheet.
- Old app builds don't know the two new categories, so they get the push without buttons until they update.

**P3: implemented locally, not deployed, not verified (no Docker, no device).**
- Migration `20260928000300_fill_the_spot_p3.sql`: `game_views` (service-side only) + `record_game_view`, `game_fill_status` (organizer only: pinged, viewed, keen, open spots, fill time), `dispatch_still_short` cron (T-3h, once per game, `still_short` push). pgTAP `fill_status_test.sql` written, unrun.
- push-dispatch: `still_short` copy ("Still 1 short for tonight") with a `short_actions` "Ping wider" category calling `find_a_sub`. Deno tests pass (75).
- Client: `FillTracker` on the host's game page (pinged / had a look / keen, "Filled in 38 min" once full), one "Share to group chat" button (copy + share sheet), "Ping wider (15 km)", invite-from-last-game demoted to a "More ways to fill" link. Non-hosts record a view once per open. `player_joined` and `still_short` got inbox icons.
- Skipped: Realtime (the tracker polls every 20s while a spot is open), "Hold a spot" under More ways (ReservedSpots already sits lower on the page), small celebration animation on fill, price in the default share text, "Jay joined. You're full, game on" is already covered by P0's `player_joined` + `game_full`.
- Fill time is publish to last approval, so it includes hosts who filled it from their own group, not just alert joins.

**P4-P6: not started.**

**Deploy order:** `supabase db push` (all three migrations), deploy `push-dispatch`, then JS/OTA.
