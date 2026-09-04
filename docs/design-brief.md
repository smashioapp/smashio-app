# SMASHIO — Claude Design brief

Paste-ready prompts for the claude.ai/design project (`23bc2cae-5ee1-4648-a0f1-15a9412f2b1b`,
synced from `ui/` — see [memory: smashio-design-sync]). Feed them **in order**; each builds on the
previous. Prompt 1 sets the system, 2 modernises what exists, 3 is the venue destination, 4 is the
unbuilt social layer.

---

## Prompt 1 — Brand, theme, type system

```
You are the design partner for SMASHIO, a badminton player-matching app for the Australian market
(Sydney first). Think Playo (India) crossed with CRED's visual bar. It is NOT a court-booking app —
the core action is finding people to play with; the venue is a detail on the game.

Platform: iOS + Android only, React Native + Expo. No web app. smashio.com.au is a marketing page
only, and it must match whatever system we land here.

This project already has SMASHIO's real component library imported (51 React Native components:
GameCard, PlayerCard, TabBar, HoldButton, Burst, ReliabilityGauge, VenueCourtHeader, MapSheet,
Sheet, Chip, Badge, TierBadge, EmptyState, etc.). Build on those, do not invent a parallel kit.

=== WHAT I WANT FROM YOU IN THIS FIRST PASS ===
1. A refreshed type system (font pairing + scale + usage rules).
2. A wordmark treatment for the logo.
3. A tightened, modernised design-system sheet: color roles, elevation, radii, spacing, motion.
Deliver as visual specimens I can look at, not just a list of names.

=== LOGO — DO NOT REDESIGN THE MARK ===
The mark is a stylised shuttlecock: four overlapping feather blades fanning up-right from a rounded
cork base, in acid lime (#D6FF3F → #AEE62A), on near-black. Flat, no gradients inside the blades,
thin black gaps between blades. It stays exactly as is. It is also the app icon and splash.

What changes: the WORDMARK next to it. "SMASHIO" is currently set in Bricolage Grotesque ExtraBold
with -0.02em tracking. I want something bolder and more distinctive — it should read athletic and
premium, not startup-generic. Show me 4-6 wordmark options on dark, lockup horizontal + stacked +
icon-only, at app-icon size and at hero size. Cover: all-caps tight-tracked grotesque, a slightly
condensed/expanded sports display, and one with a subtle custom cut (e.g. an angled terminal on the
S or a shuttle-blade-derived detail). Show each in lime-on-black and white-on-black.

=== TYPEFACE CHANGE (whole app + website) ===
Current: Bricolage Grotesque (display) + Manrope (body). I want to move to something nicer.
Hard constraint: it must be loadable via @expo-google-fonts (Google Fonts) OR be a variable font I
can bundle as a .ttf, and it must have 400/500/600/700/800 with tabular figures (we render scores,
countdowns, prices, odometer stats).

Propose a primary pairing and one alternate. Strong candidates to compare, but argue for your pick:
- Display/headline: Archivo (incl. Expanded), Space Grotesk, Familjen Grotesk, Clash Display,
  Instrument Sans, Anybody.
- Body/UI: Geist, Instrument Sans, Plus Jakarta Sans, Figtree, Satoshi, General Sans.
Show a real specimen: a game card, a stat block with big numbers, a long paragraph of venue notes,
a button label, and a 3-line empty-state, all in each candidate pairing, side by side on dark.

Then give me a full type scale as tokens (name, size, line-height, weight, tracking) covering:
display-hero, display-lg, title, section-header, card-title, body, body-sm, label, caption,
numeric-lg (odometer/stat), numeric-sm.

=== CURRENT COLOR TOKENS (dark-only, keep the DNA, modernise the application) ===
base #0A0A0B · base-alt #08080A · surface #141416 · surface-alt #1F1F24
card #18181C · card-alt #0E0E10 · border rgba(255,255,255,0.08)
accent #D6FF3F · accent-2 #AEE62A · accent-soft #EBFF7A · accent-3 #9FE020
text #F5F5F7 · text-dim #C7C7CE · text-secondary #96969E · text-tertiary #7A7A82 · text-muted #5C5C64
skill tiers: beginner #6FCBFF · intermediate #35D6A6 · advanced #FFB648 · pro #C08CFF
danger #FF6767
Gradients in use: [accent-soft → accent-2], [accent-soft → accent-3], [card → card-alt].
Radii: cards ~20-24, pills 100.

The lime-on-near-black identity stays. What I want reviewed: we lean on lime too hard and
everything is a rounded dark card on a dark background, so hierarchy is flat and screens read
samey. Give me a documented elevation/surface ladder (5 steps), rules for when lime is allowed
(I suspect: one primary action per screen, plus data emphasis, nothing else), a secondary/tertiary
button treatment that isn't lime, and a texture/depth strategy (grain, court-line motifs, subtle
inner strokes, glow) that adds richness without a re-skin.

=== MOTION LANGUAGE (already built, extend it, don't replace) ===
Springs: pop (overshoot, hero moments), settle (damped, arrivals), press (0.96 tight).
Haptics: tap, tick, ramp (escalating during a hold), burst (Heavy→Heavy→Medium→Light).
Sound: pop, whoosh, chime, thunk, sparkle.
Hero interaction is HoldButton — press-and-hold ~600ms with a filling ring, haptic ramp, then a
radial particle Burst. Used for the highest-commitment actions. Reduce-motion is honoured.
Reference: (Not Boring) apps' layered feedback — 6 channels at once on hero moments, restraint
everywhere else.

Deliverable for this prompt: a design-system page — wordmark lockups, the chosen font pairing with
specimens, the type scale table, the color-role and elevation ladder, radii/spacing, and motion
tokens. Ask me to pick between options before moving on.
```

---

## Prompt 2 — Everything that exists today, and the modernisation

```
Here is the complete feature map of SMASHIO as it ships today (private beta, Sydney, TestFlight).
Backend is fully live: Supabase (Postgres + PostGIS, Auth with email/Google/Apple, Realtime chat,
Storage, Edge Functions), Expo push, Google Maps with a custom brand Map ID.

Go through every screen below and redesign the layout for a modern 2026 feel. Keep the components,
the dark/lime identity, and the information — change the composition, hierarchy, density, and how
much the screen is willing to say with one strong element instead of six equal cards.

--- NAVIGATION ---
Floating pill bottom tab bar with blur: Discover · My Games · [+ host FAB, centre] · Chat · Profile.
Unread dot on Chat, pending-join-request dot on My Games/Profile. Icons spring-pop on switch.

--- 1. ONBOARDING ---
Landing → login (email, Google, Apple) → profile photo → skill level. Shared step-progress bar.
Branded launch: shuttlecock splash that hands off to a "smash-in" reveal with a haptic landing.

--- 2. DISCOVER (home) ---
Nearby games as a list, with a map as a switchable layer (not a separate tab).
- Filters: sport (badminton only for now), date, skill level, distance radius.
- Horizontal rails for cuts like "tonight", "near you", "beginner-friendly".
- Trust/vetting strip: host reliability signals surfaced before you tap in.
- GameCard: venue name, suburb + distance, date/time, skill pill, joined/max with avatar stack,
  per-player cost, a live countdown chip that pulses under 1 hour, verified-booking badge.
- Map layer: Google Maps, brand-styled, clustered pins. Game pins vs dim "venue with no games" pins.
  Tapping a pin opens a bottom sheet with a horizontal carousel of cards for that venue.
- Heatmap of activity. Notification-settings bell. Host FAB.
- Empty states use a floating shuttlecock illustration + motivational copy + a CTA, never a flat line.

--- 3. CREATE A GAME (5-step wizard) ---
Sport → venue (search: our curated venues first, Google Places fallback) → date/time → skill level,
max players, cost split → review + publish. Optional: upload a booking confirmation to earn a
"verified" badge (with OCR auto-fill as a planned path). Publish fires the full hero treatment:
court lines sweep in, checkmark stamps, radial burst, haptic burst, sparkle sound.

--- 4. GAME DETAIL ---
Venue + time header over a court-graphic backdrop, roster avatar stack, skill level, cost split,
host card, "view venue" row, directions, share deep-link. Join is a HOLD button (hero moment):
on success a burst fires, the new avatar slams into the stack, the joined count ticks over.
Host console: incoming join requests with swipe-right-to-approve / swipe-left-to-decline, plus
tap buttons. Edit game. Leave/cancel with a confirm and notice rules.

--- 5. MY GAMES ---
One agenda (not tabs-per-status): day headers, a "next up" hero card for the day-of game, upcoming
below, past history further down. Host console entry for games you run.

--- 6. CHAT ---
Per-game group chat, joined players only, Supabase Realtime. Chat list with unread state and
skeleton rows. Thread: pinned event header (venue, time, countdown), images with a lightbox,
a details sheet, system timeline events (X joined, host moved the time), host broadcast mode,
per-thread notification control.

--- 7. POST-GAME ---
Rate the players you played with (star row with cascading fill, per-star haptic), mark complete.
Then a held reveal: stats roll up as odometers, reliability gauge refills, streak flame scales,
and a tier level-up (Bronze/Silver/Gold) gets a full-screen celebration with confetti.

--- 8. PLAYER CARD (/player/[id]) ---
Reliability gauge (0-100, banded Excellent/Good/Fair/Needs work), skill tier badge, behaviour
badges, rating distribution bars, games played, member since.

--- 9. PROFILE + SETTINGS ---
Stats, host/player tier with progress ring to next tier, reliability with an explainer sheet,
"member since" as a flex stat, referral entry point, edit profile, notification settings
(per-type toggles), settings, in-app account deletion.

=== WHAT I THINK IS WRONG — CHALLENGE OR CONFIRM ===
1. Every screen is a vertical stack of similar dark rounded cards. Little rhythm, no anchor element.
2. Discover is a list of near-identical cards; nothing communicates "this is the one to join".
3. Data density is low — a game card takes a lot of height to say very little.
4. The map is treated as a mode rather than as the primary spatial view it wants to be.
5. Lime is used for so many things it no longer signals "act here".
6. Typography carries almost no hierarchy work; size does it all.

Deliver: redesigned layouts for Discover (list + map), GameCard (2-3 density variants), Game Detail,
My Games agenda, Chat thread, Profile. Show light-touch before/after reasoning per screen. Mobile
frames, 393×852 and 430×932. Dark only.
```

---

## Prompt 3 — Venue as a destination

```
Venues are a directory we curate — 56 Sydney venues live, all 37 priority leads enriched, ~51 more
queued. This is deliberately NOT a booking product: we never take payment, we deep-link out.

Data we hold per venue:
- Identity: name, suburb, state, address, region, lat/lng, slug.
- Facility: badminton court count vs total court count, dedicated-vs-multipurpose, surface
  (mat / synthetic / timber).
- Bookability: public | club_only | members_only | unknown. A lot of Sydney badminton happens in
  school and community halls that an individual CANNOT book — those must never show a "Book" CTA;
  they show a club contact instead. This distinction has to be legible at a glance, including on
  the map pin.
- Links: booking URL (deep-links out to the operator's system), website, phone.
- Opening hours per weekday (may be unknown, or explicitly closed).
- Pricing bands: label (Off-peak/Peak/Casual), days, time window, price, unit
  (per court-hour / per person-hour / per person-session), notes. Zero bands = "Pricing not listed",
  never a guess.
- Amenities, each with availability (yes / no / paid / nearby / unknown) plus a free-text note,
  grouped: essentials (toilets, parking, drinking water, change rooms, showers, lockers) ·
  gear (racquet hire, shuttle hire, racquet retail, shuttle retail, stringing, pro shop) ·
  comfort (air conditioning, spectator seating, cafe, vending, wifi) ·
  access (step-free, accessible toilet, public transport nearby, after-hours access, coaching,
  casual social sessions).
- Photos: user-uploaded, moderated, approved-only. Fallback today is a procedurally generated
  gradient court header — replace that with something better when there is no photo.
- Trust metadata per field: data source, confidence (high/medium/low), verified_at date. Anything
  older than 180 days flips to "may be out of date" and HIDES the price. Low-confidence fields
  render dimmed or hidden. A "Something wrong here?" correction affordance sits on the screen.
- Live activity: upcoming game count at this venue, next game time.

Current section order on /venue/[id]: photo header → name/suburb/distance → actions (Directions,
Book, Call, Share) → at-a-glance chips (courts, surface, dedicated) → Play here (upcoming games +
"Host a game here") → pricing table with "as at <date>" → amenity grid by category → hours →
access notes → report.

Design:
1. The venue screen, modernised. Make it feel like a real place, not a spec sheet. Solve the
   freshness/confidence problem visually — users must be able to tell verified data from
   community-reported data without reading a legend.
2. The amenity grid: yes / paid / nearby / no / unknown are five states, not two. Currently bold /
   muted / struck / hidden. Do better.
3. The pricing table across the messy real cases: peak vs off-peak, per-court vs per-person,
   "not listed", and "stale, hidden".
4. Three venue-card variants for the directory: a 16-court dedicated centre, a 4-court community
   hall, a club-only school hall.
5. Map pin states: has games · venue only · club-only · selected · clustered.
6. A "Courts near me" browse surface — the directory as a scrollable destination with filters on
   amenities, court count and bookability.
7. Empty/unknown states — many venues have partial data. Absent data must never look like a bug.
```

---

## Prompt 4 — The social layer (not built — design it first)

```
This part does not exist yet. Design it before we build it.

Problem: SMASHIO is transactional. Open app → find game → join → play → close. If nobody near you
hosted this week, there is zero reason to open it, and no way to become the reason. The social layer
exists to fix exactly three things — it is not a general social network:
  (a) supply cold-start — a post is a game that hasn't been created yet;
  (b) retention between games;
  (c) trust before you join a stranger's game.
The failure mode to design against is an empty feed tab that makes the app look dead.

--- THE FEED IS PRE-FILLED BY THE SYSTEM ---
Before anyone writes a post, auto-generated cards already fill it, so a brand-new user with zero
follows sees a live local feed on day one. Card types, in order of volume:
  · "Game at NBC South Granville, Thu 8pm — 3 spots" (a game was published)
  · "Ajay played at BadmintonWorx Botany" (a game completed)
  · "5 games at Five Dock this week" (venue activity rollup)
  · "New venue: Alpha Badminton Centre — 10 courts, pro shop"
  · "Ravi hit 10 games hosted" (achievement)
These must look clearly system-generated but not like spam, and must not drown user posts.

--- POST TYPES ---
1. text — plain.
2. looking_for_players — THE most important object in this feature. Carries a venue, a date/time
   window and a skill tier, and renders a "Turn this into a game" button that opens the create
   wizard prefilled. This conversion is the metric the whole feature is judged on. Design this card
   so the button is unmissable without it feeling like an ad.
3. question — Q&A. Answers are comments; the author can mark one as the accepted answer. A Q&A view
   is just a filtered feed.
4. system — the auto cards above.
Posts can carry a venue, a game, images, one reaction type (a like — no emoji palette), comments,
and a distance ("~3 km away", never a map pin and never coordinates).

--- THREE FEEDS ---
· Home — people I follow + posts near me + system posts for games near me. Ranked by a legible
  heuristic: engagement, followed author, venues I've played at, distance decay, time decay.
  Early on, freshness wins and score only breaks ties.
· Venue feed — a tab on the venue screen. "Who's playing at Five Dock tonight" is the highest-signal
  question we can answer.
· Profile feed — a player's posts + public history, turning the player card into a destination.

--- GRAPH ---
Follow is asymmetric and public, Twitter-shaped, no accept step. Follower/following counts render on
every profile card. Blocks are bidirectional in effect: blocked users vanish from feeds, rosters and
search, and cannot request to join your games.
Onboarding should end with ~5 suggested follows (people from games you've played, then active hosts
near you) — a user who finishes onboarding with zero follows is a churned user.

--- MODERATION IS A RELEASE GATE, NOT A SETTING ---
Apple Guideline 1.2 and Google Play's UGC policy require all of: a content filter, a report
mechanism with timely response, a block capability, and published contact info. Design every one of
these as a first-class surface, not a hidden menu item:
· Report on every post, comment, profile and photo, with reason selection (spam, harassment, hate,
  sexual, violence, misinformation, other).
· Block on every profile, with a clear "what happens when I block" explanation.
· Automated pre-publish filter — borderline posts land in a "pending review" state. Design what the
  author sees when their own post is held.
· Community guidelines + EULA surfaces.
· Rate limits — design the message a user sees when they hit one, without making them feel accused.

--- PRIVACY (non-negotiable) ---
Never expose a user's home location. Distance buckets only. Profile visibility is public /
players-only (people I've shared a game with) / private, and existing accounts default to
players-only — we do not silently make anyone public. Sharing completed games is one toggle to kill.
Design the privacy settings screen so these are understandable, not legalese.

--- NOTIFICATIONS ---
New follower, reply, answer to your question, accepted answer, someone you follow posted a
"looking for players" near you, mention. Per-type toggles from day one, conservative defaults
(mentions + direct replies on; "someone you follow posted" off). Weekly digest ("3 new games near
you this week") over a firehose.

--- COLD START ---
Launching to a few hundred Sydney players. One city, one sport. Design the feed for THIN — 20 posts
a week has to feel like a scene, not a ghost town. Show me the feed at 3 posts, at 20, and at 200.

Deliver:
1. Feed tab layout + the full card taxonomy (system card, text, looking_for_players, question,
   photo post) at consistent width, with clear visual separation between system and human content.
2. The looking_for_players composer and its "Turn this into a game" conversion flow.
3. Post detail with comments and accepted answer.
4. Venue feed tab, integrated into the venue screen from the previous prompt.
5. Profile feed + follow/unfollow states + follower lists + suggested-follows at onboarding.
6. The full moderation surface set: report sheet, block confirmation, held-post state, guidelines.
7. Privacy settings screen.
8. Where the feed lives in navigation — we have 4 tabs plus a host FAB and I do not want a 5th tab
   without an argument. Propose the nav change and defend it.
```

---

## Prompt 5 — Profile, player card & reputation

```
This part IS built and live — you are redesigning it, not inventing it. Same rules as Prompt 2:
keep the components, the dark/lime identity and every piece of information; change composition,
hierarchy, density and IA. Inherit the type scale and elevation ladder from Prompt 1.

--- THE THESIS ---
A SMASHIO profile is a CLAIM you make about yourself, backed by EVIDENCE other people generated.
Reputation is by definition something someone else reads. The single highest-stakes decision in
this product is a host deciding a join request from a stranger, and that decision is made by
reading a profile. Design for the reader first, the owner second.

Four readers, roughly:
  · Host vetting a join request (~30% of profile views) — "will this person turn up, are they my
    level?" Needs: photo, tier, games played, reliability, behaviour badges, games-together.
  · Player sizing up a host (~25%) — "is this legit?" Needs: hosted count, rating, verified marks.
  · Self-checker (~25%) — "how am I doing, did that game count?" Needs: streak, tier progress,
    what changed since last time.
  · New user (~10%) — "why is nobody approving me?" Needs: what is missing and what it costs.

--- WHAT EXISTS TODAY (three routes, one identity — this is the main thing I want challenged) ---

1. PROFILE TAB (/(tabs)/profile) — the "me" view:
   · TierRing: 132px SVG progress ring + avatar + name + "N more games to Silver" subtitle.
     Games-played tiers are Bronze (0) / Silver (10) / Gold (25). Tapping it opens Edit profile.
   · Reliability card: big number in band colour + "Reliability · Excellent" + a ledger line
     ("No late cancellations in 14 games") + a "What's this? ›" explainer sheet.
   · A "12 games played" line + behaviour badge chips.
   · Then rows: Stats & achievements › | Edit profile › | Notifications (unread count) ›
     | Notification settings › | Invite friends (EARN BADGES pill) | Settings › | Delete account ›

2. STATS & ACHIEVEMENTS (/profile-stats) — everything the v2 anchor displaced:
   · The full PlayerCard in "me" mode, wrapped in a screenshot-to-share view.
   · Rating distribution bars (1-5 star histogram).
   · Peer-perceived skill line: "You say Advanced · your co-players say Intermediate".
   · Week-streak card (flame + "3 week streak").
   · Activity tiles: this month · regular spot (most-played venue) · usual time (most-played night).
   · 12-week calendar heatmap.
   · Regulars list: "Sam 5× · Priya 4×", each tappable through to their card.
   · Achievements: 8 fixed chips, locked/unlocked — first game, first hosted, 10/25/50 played,
     4-week streak, 5 different venues, first 5-star. Plus a Bronze/Silver/Gold TierBadge.
   · Profile completeness meter: photo, suburb, tier, email verified, first game.
   · "Share my card" — renders the card to a PNG and opens the OS share sheet.

3. PUBLIC PLAYER CARD (/player/[id]) — the "them" view, same component in a different mode:
   · Avatar, name, verified tick, suburb, tier pill, "Member since 2026".
   · "You've played together 3×" lime strip (only when > 0).
   · Two StatTiles: games played · games hosted.
   · Reliability BAND ONLY (dot + "Excellent"), never the raw number.
   · Rating average + count, but ONLY once the player has 5 or more ratings; below that it reads
     "New player". Individual ratings and who gave them are NEVER shown to anyone.
   · Behaviour badge counts, and per-sport tier pills when a profile has more than one sport.

4. EDIT PROFILE (/profile-edit) — photo upload, display name, suburb (free text), skill tier picker.
5. SETTINGS (/settings) — sign-in method, email + verification, notification prefs entry, legal,
   and a visually separated danger zone (log out, delete account).
6. VETTING STRIP — a compact inline reputation summary rendered on join-request rows in Game
   Detail's host console: tier, games played, reliability band, "played together 3×".

--- THE EXACT DATA WE HAVE (do not design for data we cannot supply) ---
One RPC returns, for any profile id: display name, photo, suburb (text only), member-since,
games played, games hosted, reliability 0-100 + band, rating average + count, games-together
with the viewer, behaviour badge counts, and per-sport tier.
Behaviour badges are a FIXED four-item vocabulary, collected one-tap at post-game:
Punctual · Good sport · Strong player · Settled up.
Reliability is a real formula: starts at 100, minus 5 per game you leave after it has already
started, recomputed nightly, floored at 0. Bands: 90+ Excellent, 75+ Good, 50+ Fair, else Needs
work. Peer-perceived tier is derived from co-player star ratings — one vote per rater, latest
only, last 25 — mapped Beginner/Intermediate/Advanced/Pro. Also available: week streak,
this-month count, most-played venue, most-played night, 12 weeks of played-dates, regulars with
counts, distinct venue count, 1-5 star distribution, late-leave count, email-verified flag.

--- BENCHMARKS (mechanics, not screenshots — argue with these) ---
· Playo — skill is what your co-players say it is: an anonymous distribution across Beginner to
  Pro, weighted to your recent games, one vote per rater, framed explicitly as what gets you
  accepted into games. Plus behaviour badges. This is our exact product one market over.
· Playtomic — a numeric level PLUS a "reliability %" that is the system's own CONFIDENCE in that
  level, climbing as you play. The confidence-alongside-the-number idea is the transferable part.
· DUPR / UTR-P — one portable rating that clubs accept; identity travels with the player.
· Strava — the profile IS the history: calendar widget as the spine, four most recent trophies
  pinned with a full trophy case behind them, rolling stats at three time horizons.
· GoodRec — "Player of the Match" peer vote and host reviews as the reputation primitives.
· Duolingo — badges pulled OUT of the buried profile and made shareable; friend-streak as the
  social hook.
· Airbnb — trust is stacked signals, and the profile openly names which one you are missing.

--- WHAT I THINK IS WRONG — CHALLENGE OR CONFIRM ---
1. Three routes for one identity. Profile tab, /profile-stats and /player/[id] each render a
   different composition of the same person. The split was a spacing fix, not an IA decision.
   Give me a defended answer: one scrolling profile, a segmented profile, or keep the split.
2. "me" and "them" have drifted into two visual identities — the tab leads with a progress ring,
   the public card leads with stat tiles. Same human, two designs.
3. Reputation — the entire point — sits one tap DOWN behind a "Stats & achievements ›" row, while
   Notification settings sits above the fold. Inverted hierarchy.
4. The profile tab bottoms out as a settings list. Six rows of identical weight, one of which
   deletes the account.
5. Achievements are eight flat chips at 50% opacity when locked. No sense of a case, a set, a
   next target, or anything worth screenshotting.
6. Reliability is the most decision-relevant number we hold and renders as a plain integer.
7. "Share my card" is a screenshot of a scrolling screen, not a designed shareable object.
8. The host-vetting strip — our highest-stakes read — has never had a dedicated design pass.

--- HARD CONSTRAINTS ---
· Dark only. Mobile only, 393×852 and 430×932. No web profile.
· NO ELO / numeric skill level. Casual badminton produces no match scores; peer-perceived tier
  (Playo's model) is the ceiling until we ship ladders.
· NO followers/following, NO city leaderboards, NO paid or purchasable badges. Every badge is
  earned by playing. (The follow graph belongs to Prompt 4's social layer and is unapproved
  scope — do not assume it here.)
· PRIVACY IS NOT NEGOTIABLE. Never show another player: email, phone, exact location, the raw
  reliability integer, individual ratings, or who rated them. Suburb is text, never a pin.
  Ratings stay hidden entirely below 5 of them. Rating is always anonymous.
· Sport is a data concern — badminton ships first but the design must hold 2-4 sports per profile
  without a redesign.
· No new visual language, no new colour ramp. Existing kit only.

--- USE THE REAL COMPONENTS ---
TierRing, PlayerCard, ReliabilityGauge, BehaviourBadges, RatingDistributionBars, Heatmap,
CompletenessMeter, StatTile, TierBadge, SkillPill, Avatar, ListRow, Chip, Badge, Sheet,
RollingNumber, Burst, EmptyState, Skeleton, VettingStrip, SegmentedToggle, Button.

--- DELIVER ---
1. A defended IA for the profile area: how many routes, what lives where, and where settings go.
2. The "me" profile at three life stages: 0 games (day one, nothing earned), 12 games (Silver,
   a few badges, one streak), 60 games (Gold, full trophy case, long history). The zero state
   must sell the first game, not display a row of zeros.
3. The "them" public player card in two contexts: opened from a roster avatar, and opened by a
   host mid-decision on a join request. Show what changes between them.
4. The vetting strip in situ on a join-request row, at a density a host can scan five of.
5. The reputation block redesigned as one system — reliability, rating, peer-perceived tier and
   behaviour badges are FOUR SEPARATE SIGNALS and must not read as one blob.
6. The trophy case / achievements surface, with a visible next target.
7. History-as-identity: heatmap, streak, regulars and activity stats composed as one habit
   surface rather than four stacked cards.
8. The shareable player card as a designed 1:1 and 9:16 export object, not a screenshot.
9. Edit profile and Settings, including the danger zone, and the completeness meter wherever you
   decide it belongs.
10. States: loading skeletons, failed-fetch error (a network error must never render as
    "reliability 0"), new player with no ratings, and a player with a poor reliability band —
    show me how we render bad news without shaming someone into churning.
```

## Prompt 6 — Create a game, v3 (the draft card)

Run **after** prompt 1. Redesign of shipped code, not greenfield — read
[create-game-plan.md](create-game-plan.md) first, especially §0 (what already shipped, don't
re-propose it) and §1 (the diagnosis this prompt is answering). Every structural decision below
is already signed off; the prompt states them as constraints, not options.

```
You are redesigning SMASHIO's create-a-game flow. This is the host's core action and it is
currently the weakest surface in the app. Read the constraints as settled decisions — I am not
asking you to re-open them, I am asking you to design inside them brilliantly.

=== CONTEXT ===
SMASHIO is a badminton player-matching app for Sydney. Hosts are NOT booking a court through us.
They already booked and paid for court time, and they are selling their spare slots to cut their
own cost. So a "game" is: a court booking that already exists, plus the people the host wants in
it. The app's one real differentiator is that a host can upload their booking confirmation (photo
or PDF), an LLM reads it, and the game publishes as VERIFIED — we can vouch that the court is
genuinely booked. No competitor in this market has that.

Dark only. There is no light mode. Tokens (use these exactly):
  base #0A0A0B · baseAlt #08080A · surface #141416 · surfaceAlt #1F1F24
  card #18181C · cardAlt #0E0E10 · cardBorder rgba(255,255,255,0.08)
  accent (lime) #D6FF3F · accentSoft #EBFF7A · accent2 #AEE62A
  text #F5F5F7 · textSecondary #96969E · textTertiary #7A7A82 · textMuted #5C5C64
  tier colors: Beginner #6FCBFF · Intermediate #35D6A6 · Advanced #FFB648 · Pro #C08CFF
  danger #FF6767
  24px screen gutter. Radii: hero 26 · card 18 · rail 16 · sheet 28 · tile 16.
  One lime "hero" anchor per screen, never two.
This project already has SMASHIO's real component library imported. Build on GameCard, Sheet,
Chip, Badge, TierBadge, Button, HoldButton, Burst, StepProgress, EmptyState, Avatar. Do not
invent a parallel kit.

=== WHAT'S BROKEN TODAY (design against this) ===
1. Six wizard steps. After venue and date the host meets FIVE +/- steppers in a row — total
   players, reserved spots, courts, duration, price. A big lime numeral between two grey circles,
   five times. That is the entire interaction model.
2. The host never sees what they're making. The GameCard other players will see is not on screen
   at any point during creation.
3. Ten fields, nine of them numbers, none of them the host's voice. Two games at the same venue
   on the same night are visually identical.
4. "Reserved spots" is an integer. The host thinks "me, Mia, Raj and three strangers" and we make
   them convert that to the number 2, then find a different screen after publish to name them.
5. The host is not in their own roster. The header counts them, the avatars don't.

=== SETTLED STRUCTURE — TWO STEPS, THEN ONE CARD ===
STEP 1 — the fork. Unchanged in function, restyled: "Got a booking confirmation?" with a primary
upload action and a quiet "I'll type it in instead". The upload action must offer BOTH camera and
file (images or PDF) — hosts are often standing at the venue desk holding a printed receipt.
This screen is the best thing in the current flow. Make it feel like the front door of the whole
product, not a modal question.

STEP 2 — THE DRAFT CARD. One scrolling screen. No more steppers, no page pushes.
At the top, a LIVE PREVIEW of the actual GameCard that players will see on Discover — cover art,
venue, time, tier, fill state — re-rendering as the host edits. This is the single most important
idea in the redesign: the host edits the artifact, not a form about it. Luma's model.

Below the preview, four required rows, each tap-to-expand IN PLACE (inline accordion or bottom
sheet, your call — argue for one and use it consistently):
   WHERE  venue
   WHEN   date, start time, duration
   WHO    lineup strip + skill range
   COST   price per player
Then ONE collapsed row: "More options", showing a summary of its current defaults so the host can
see it's already answered — e.g. "Social · Public · Auto-approve · You bring shuttles". Opening it
reveals: host note (280 chars, free text — the only field where the host has a voice), format
(social / competitive / drills / doubles rotation), visibility (public / link-only), auto-approve
join requests (on by default), shuttles (who brings, feather or nylon), court number (optional
text, e.g. "Court 3"). EVERY one of these ships with a sensible default pre-selected. A host must
be able to publish having never opened this row.
Publish button always visible and never gated behind a Continue chain. When it can't fire, it says
why inline ("Pick a venue first"), it does not just grey out.

=== THE RECEIPT PATH, AND THE VERIFIED MOMENT ===
When step 1 got a document, the parse fills WHERE and WHEN before the host sees the card, and the
preview is ALREADY stamped verified. Design that stamp — it is the payoff for the whole feature
and today it gets no moment at all.
  · Parsed rows carry a "from your confirmation" provenance tag, and a thumbnail of the source
    document is one tap away (a trust badge that links to its evidence is materially more
    credible than a static seal).
  · Fields the model read with HIGH confidence are LOCKED — read-only, lock glyph, provenance tag.
    Medium and low confidence stay editable with the tag showing. Design all three treatments so
    they are distinguishable without reading.
  · Every locked row carries "Doesn't match my booking?" → a sheet with two exits: re-upload a
    different document, or unlock this one field. Design that sheet. A locked wrong time sends
    players to the wrong court, so the escape hatch must be findable, not hidden.
  · Design the parsing state (2–5 seconds, document already picked) and the "that's not a booking
    confirmation" bounce. Neither may dead-end — both land in a working flow.

=== THE LINEUP STRIP — the centrepiece, design it first ===
Replaces the wrapped avatar grid AND the separate "Held for friends" section. It appears in
exactly two places: the WHO row of the draft card, and the game detail screen. NOT on Discover
cards, NOT on the share/invite page. Same component in both places.

For games of 8 players or fewer, render every slot. Five states, each readable at a glance
without labels:
  HOST          Smashimal bust, solid, LIME CROWN RING, caption "You" (or the host's first name
                for everyone else). The host is slot one. Always.
  JOINED        Smashimal bust, solid ring.
  NAMED HOLD    initial on the spot's assigned colour, DASHED ring, small person/link glyph.
  ANON HOLD     blank silhouette, dashed ring, "held".
  OPEN          SMASHIMAL HEAD SILHOUETTE — an empty outline in the exact head shape of our
                shipped busts (ears, snout, the lot), dotted ring at ~40% opacity, "open".
                Not a generic person glyph. This is a brand asset nobody else in the market has.
Order is stable and never re-sorts under the viewer: host → joins in join order → holds → open.
Filling reads left to right like a progress bar.
Group the slots by players-per-court (4 for badminton) with a hairline divider, so an 8-player
2-court game visibly reads as two courts — which is what the host booked and what players will
walk into. Above 8 players the strip collapses to a row of dots plus "+4" with a tap-through.
One line of copy beneath replaces three separate counters that exist today: "3 in · 1 held ·
4 open · $6 each".

THE STRIP IS THE EDITOR. In the create flow, tapping an open slot opens "add someone": one search
field, three outcomes, no mode switch — pick a matching SMASHIO player (they get an invite), or
"just hold a spot for 'Raj'" (named hold + share link), or hold it unnamed. Design that picker.
If the game is full and the host adds another person, the total bumps and the strip says so
inline ("Bumped to 6 so Raj fits") — never silently.
On the game detail screen the same strip is the roster: filled slot → player card peek, held slot
→ host names/invites/releases, open slot → share sheet for the host, Join for everyone else.
Cancelled game → whole strip desaturates, never disappears.
Motion: a slot filling pops; the LAST open slot going solid is the "we're on" moment and fires a
burst — reuse the publish stamp's vocabulary. Everything respects reduce-motion.

=== THE COST ROW ===
Price is capped at $20 per player per hour and is the one field a receipt CANNOT answer — what
the host paid is not what the host charges. So when a receipt gave us a total, the row opens on a
SUGGESTION the host must confirm or change: "Your booking was $44. At 6 players that's $8 each,
you'd cover it." Never pre-applied, never silently defaulted. Design how a suggestion looks
different from an answered field. Show the host their own break-even as they change headcount —
this is the number that decides whether they host again.

=== DURATION ===
Duration is moving from whole hours to 15-minute steps (1h30 is the most common Sydney block).
Design a duration control that handles 1h00–6h00 in quarter hours without becoming a spinner.

=== EDIT IS THE SAME CARD ===
The host's edit screen reuses this draft card against a published game. Design that variant:
venue row locked with a reason (venue cannot change after publish — people agreed to a place),
a persistent line saying joined players will be notified of changes, and a save affordance that
is clearly not "publish". One component, two modes.

=== PUBLISH AND AFTER ===
Keep the existing publish celebration — two lines sweeping in, a checkmark stamping with
overshoot, a burst at peak, the summary sliding up from underneath. It is good. What changes is
where it lands: the success screen must lead with GET PEOPLE IN — share link, "invite from your
last game", copy-for-WhatsApp — not a summary and a "Let's go!" that sends you back. Design it as
a distribution moment.
Also design one lightweight post-publish nudge: a game whose host note is still empty gets a
gentle prompt on its own page ("Say something about this game — it's the difference between four
identical listings"). One surface, not a nag campaign.

=== COPY TONE ===
Casually Australian and human. Contractions fine. Light Aussie phrasing where it lands naturally
("no worries", "keen", "sorted") but clarity beats personality. Never "An error has occurred" —
say "Something's gone wrong, give it another go." NEVER use em dashes in user-facing text; use a
comma or a full stop. Write every string in the designs as real copy, not lorem.

=== NOT IN THIS PASS ===
· Verifying an ALREADY-PUBLISHED game by uploading a receipt (its own pass later).
· Recurring / weekly games.
· Saved squads or named reusable rosters.
· In-app payment.
· The lineup strip on Discover cards or the public invite page.

=== DELIVER ===
Artboards for every screen and every state, PLUS the reusable pieces specced as components with
all their states — matching how the component library is already organised.
1. Step 1 fork, and its camera-vs-file affordance.
2. Parsing state, and the not-a-confirmation bounce.
3. The draft card, receipt path: verified stamp, locked / editable / low-confidence rows, the
   "doesn't match my booking?" sheet.
4. The draft card, manual path: same card, nothing pre-filled, so I can see how it degrades.
5. Each expanded row in place — where, when, who, cost — and the More options sheet.
6. LINEUP STRIP as a component: all five slot states, 2 / 4 / 6 / 8 players, the >8 collapse, the
   court grouping, the add-someone picker, the cancelled state.
7. The strip in situ on the game detail screen, with the host as slot one.
8. Edit mode of the draft card.
9. Publish celebration → the share-first success screen.
10. The empty-note nudge.
11. States throughout: loading, offline mid-parse, validation ("that time's already passed"),
    venue unresolvable, and a host who has published nothing before.
```

## Prompt 6a — Host a Game v3, revision pass

Run against the existing `SMASHIO v3 - Host a Game.html`. It is good and mostly correct — this
is a targeted revision, not a redo. Findings recorded 2026-09-01 after reading the file back
through the design MCP.

```
Revising SMASHIO v3 - Host a Game. The file is strong: structure, the fork, the parse ladder,
the strip, edit mode, the share-first landing and the edge states are all right and should not
be redrawn. Nine specific changes below. Keep everything not named here exactly as it is.

=== BLOCKING — three fields the flow cannot ship without ===

1. TOTAL PLAYERS IS NOT SETTABLE.
The expanded WHO row is lineup strip + skill range. There is no control for max_players (range
2–16, and the host counts as one of them). Today a host can only grow the game by adding a
person and letting it auto-bump; a host who wants a 4-player game cannot shrink the default.
Add the control to the expanded WHO row, above the skill range. It must not be another +/-
stepper in a card — that is the pattern this whole redesign exists to kill. Consider sizing the
strip itself: drag the strip's end, or tap a "+ slot" / "− slot" affordance on the strip's tail,
so the count and the thing being counted are one object. Show what happens at both ends of the
range, and show a strip at 2, 6 and 16 (16 is the collapsed dot row).

2. COURTS BOOKED IS MISSING ENTIRELY.
`courts_booked` is a real field (1–10), it is read off the receipt, and the strip's own court
grouping depends on it. The file currently derives courts from headcount — the 8-player artboard
is captioned "2 COURTS". That is wrong: 8 players on ONE court in rotation is completely normal
badminton, and it is a different game from 8 players across two courts. Add courts to the
expanded WHEN row (it is a property of the booking, alongside duration), receipt-fillable with a
provenance tag like the rest. Then make the strip's grouping follow courts_booked, not
players ÷ 4, and show the case the current file cannot express: 8 players, 1 court, no divider,
with a line saying they are rotating.

3. THE COST ROW WEARS THE LOW-CONFIDENCE COSTUME.
The cost row uses `.acc.low` and `.prov.low` — the exact amber treatment the confidence key
defines as "the model wasn't sure, check this". But cost is not a badly-read field. It is a
deliberate suggestion the host must accept, and price is the one thing a receipt genuinely
cannot answer (what the host paid ≠ what the host charges). Same amber, two meanings, in the
same card. Give the suggestion its own treatment — it should read as an offer, not a warning.
The lime accent is a candidate since it is the app's "this is good, take it" colour, but only if
it does not fight the Publish button for the screen's one hero. Show the suggestion state and
the accepted state side by side.

=== NEEDED — one missing screen, one wrong assumption ===

4. THE SOURCE DOCUMENT IS NEVER VIEWABLE.
Every provenance tag says "FROM YOUR CONFIRMATION · view", and the whole trust argument rests on
a badge that links to its evidence. There is no artboard for what "view" opens. Design it: the
receipt/screenshot at readable size, pinch-zoomable, with the field it was read for called out
on the image if that is feasible. Reachable from any provenance tag and from the mismatch sheet.

5. PDF HAS NO VISUAL.
The parsing state makes the document its own hero — "it stays on-screen, slightly desaturated,
while the ring spins over it". That works for a photo. A PDF emailed by the venue has no
thumbnail without extra work, and PDF is a first-class input in this flow (venues email them
constantly). Design the PDF variant of the parsing state, of the draft card's provenance
thumbnail, and of the source-document viewer from item 4. A filename and a page count in a
document-shaped frame is fine; guessing at a render is not.

=== ALIGNMENT — four things that drift from what was signed off ===

6. FILLED SLOTS SHOULD BE SMASHIMALS, NOT INITIALS.
Host and joined slots are currently a coloured circle with a letter. Every SMASHIO account has a
Smashimal bust avatar — 28 shipped characters — and the open slot you drew is already their head
silhouette, which is exactly right. Filled slots should be the bust itself, so filling a slot
reads as the silhouette resolving into a character. Initials stay as the fallback for named
holds (a held spot has a name but no account, so there is no bust to show) — that also makes
"held" visually distinct from "joined" by more than a dashed ring.

7. NO MEDIUM-CONFIDENCE ROW APPEARS IN ANY REAL CARD.
Only high-confidence fields lock; medium and low stay editable. The confidence key panel shows
all three treatments correctly, but in the actual draft card both WHERE and WHEN are locked. The
mixed card is the COMMON case and the one where the three treatments have to be told apart at a
glance. Redraw the main receipt draft with WHERE locked (high) and WHEN editable-with-tag
(medium), so the contrast is visible where it matters.

8. "SAVE & EXIT" IMPLIES SOMETHING WE DO NOT HAVE.
The draft card header has "Save & exit". There is no draft persistence in the product — wizard
state is in-memory and resets, and an abandoned parsed receipt is swept after 24 hours. Either
change it to "Cancel" / "Discard", or, if you think saved drafts are worth having, design the
whole idea: where a saved draft lives, how it is found again, what it looks like in a list, and
what happens to its attached receipt. Do not leave the affordance implying a feature.

9. THE PREVIEW MUST NOT USE THE LINEUP STRIP.
The draft card's live GameCard preview shows "You · M · +4" and the artboard's component list
names LineupStrip. The strip is scoped to exactly two surfaces — the WHO row and the game detail
roster — and never to a Discover card. The preview IS a Discover card. Make it explicit that the
preview uses AvatarStack, the existing component, so the build cannot accidentally ship the strip
onto every list surface.

=== SMALL ===
· The strip's collapse threshold is shown at >8, but 2 and 6 player variants are missing from
  the component sheet. Add them.
· "✓ VERIFIED BOOKING" on the draft cover vs "✓ VERIFIED" on game detail. Pick one and use it
  everywhere, including the Discover card.
· Edit mode shows "6 in · 0 held · 2 open". What happens when a host drags max_players below the
  number of people already in? Show the blocked state and its copy.
· The camera path has no permission-denied state. One inline row is enough.
· Step affordance: the flow is described as two steps but nothing on either screen says so. Either
  add a minimal 1-of-2 marker to the draft card header, or drop the two-step framing from the
  narration and call it what it is — one decision, then one card. Argue for whichever you think is
  right; do not leave it ambiguous.

=== DO NOT CHANGE ===
The fork screen and its action sheet. The parsing state's document-as-hero idea. The bounce and
offline states. The mismatch sheet's two-exit structure. The More options sheet and its defaults
summary. Edit mode's locked-venue reason and amber banner. The publish celebration and the
share-first landing, including the first-time-host variant. The empty-note nudge. All edge states
in band 11. The copy throughout — it is on tone and should survive verbatim wherever the layout
does not force a change.
```

## Prompt 6b — Host a Game v3, polish pass

Run after 6a. Everything from 6a landed correctly; these are the four nits left over plus one
judgement call. Small pass, no structural change.

```
Final polish on SMASHIO v3 - Host a Game. The 6a revision landed correctly — max_players sizing,
courts_booked, the offer treatment, the source-document viewer, the PDF variants, busts in filled
slots, the mixed-confidence card, the step marker and AvatarStack are all right. Four small things
left. Change only these.

1. COURTS STOPS AT "4+".
The chips read 1 / 2 / 3 / 4+ but the real range is 1 to 10. Show what "4+" opens — a compact
numeric entry, a longer chip row, whatever fits the row without turning into a stepper — and show
the selected state for a value above 4, so the row can say "6 courts" without a mystery chip.

2. REMOVING A SLOT IS AN INVISIBLE AFFORDANCE.
Adding a slot is a visible dashed tile. Removing one is long-press on the last open slot, which
nobody will find. Either give the last open slot a visible remove affordance that appears once the
strip is above its minimum, or design a one-time hint that teaches it. Adding and removing should
not have wildly different discoverability.

3. NUMBER BOTH SCREENS OR NEITHER.
"STEP 2 OF 2" appears on both draft cards. The fork screen has no marker at all, so the host meets
"step 2" having never seen a step 1. Add the matching marker to the fork, or drop the numbering
from the draft card and let the flow read as one decision then one card. Pick one, apply it to
every artboard.

4. TWO AVATAR LANGUAGES ON ONE SCREEN.
The lineup strip now renders busts. The GameCard preview directly above it renders initials in
AvatarStack ("You / M / +4"). Same screen, same people, two visual languages. AvatarStack should
render the same busts at its smaller overlapped size, with initials only as the fallback for a
player with no avatar. Update it wherever the preview appears.

JUDGEMENT CALL, tell me what you think rather than just changing it:
The offer treatment (.acc.offer) is a lime-bordered tint, and the Publish button is a lime fill on
the same screen. The design system says one lime hero per screen. I think a tint and a fill are
different enough, and the offer scrolls while Publish is pinned — but you drew it, so look at it at
real size and tell me whether it holds or whether the offer needs a different accent.

OPTIONAL, your call:
Courts now sits under a row labelled WHEN, which reads "Sat 6 Sep · 7:00–8:30pm · 2 courts". It is
a booking property like duration so it belongs there, but the label is a stretch. Either rename the
row to something that covers time and court allocation, or leave it. Say which you chose and why.

Everything else in the file stays exactly as it is.
```

---

## Prompt 7 — Game detail, v3 (the page everything links to)

Run **after** prompt 1, and after `SMASHIO v3 - Host a Game.html` exists (this page reuses its
lineup strip verbatim). Redesign of shipped code — read `ui/app/game/[id].tsx`,
[post-game-plan.md](post-game-plan.md) and [create-game-plan.md](create-game-plan.md) §9 first.
Reserved spots and edit/manage are **already designed and built** (Prompt 6/6a/6b) — this pass
does not re-open them.

```
You are redesigning SMASHIO's game detail screen. Every push notification, share link, Discover
card, My Games row and calendar entry lands here. It is the highest-traffic screen in the app and
the only one where a stranger decides whether to hand a stranger money and an evening.

=== CONTEXT ===
SMASHIO is a badminton player-matching app for Sydney. The host already booked and paid for court
time somewhere else and is selling spare slots to cut their own cost. A host can upload their
booking confirmation, an LLM reads it, and the game publishes as VERIFIED. max_players INCLUDES
the host. Games are indoor, so weather is irrelevant, do not design for it.

Dark only. There is no light mode. Tokens (use these exactly):
  base #0A0A0B · baseAlt #08080A · surface #141416 · surfaceAlt #1F1F24
  card #18181C · cardAlt #0E0E10 · cardBorder rgba(255,255,255,0.08)
  accent (lime) #D6FF3F · accentSoft #EBFF7A · accent2 #AEE62A
  text #F5F5F7 · textSecondary #96969E · textTertiary #7A7A82 · textMuted #5C5C64
  tier colors: Beginner #6FCBFF · Intermediate #35D6A6 · Advanced #FFB648 · Pro #C08CFF
  danger #FF6767
  24px screen gutter. Radii: hero 26 · card 18 · rail 16 · sheet 28 · tile 16.
  One lime "hero" anchor per screen, never two.
Build on the imported SMASHIO component library: GameCover, CourtBackdrop, Badge, TierBadge,
CountdownChip, StatTile, ListRow, Avatar/AvatarStack, LineupStrip, Button, HoldButton, Sheet,
SwipeToDecide, VettingStrip, Burst, EmptyState, Skeleton. Do not invent a parallel kit.

=== ALREADY DESIGNED, DO NOT REDRAW ===
· The LINEUP STRIP and its five slot states, court grouping and >8 collapse. Place it, reuse it,
  do not restyle it.
· Reserved-spot management (name / invite / release / hold expiry) and the manage-in-place sheet.
· The host's edit/manage flow — it is the Prompt 6 draft card in edit mode. From this screen it is
  one entry point, not a second editor.

=== WHAT SHIPS TODAY (this is the baseline you are improving) ===
Hero 300px with cover art or an animated court backdrop, back / edit / share icons, countdown or
Cancelled badge, Verified or Pending badge, venue name, "2 courts · Sat 6 Sep · 7:00pm".
Then: cancelled banner · avatar stack + "3 spots left · 5/8 joined" · three stat tiles
($ per player / spots left / skill) · host row with a reliability line and a Message button ·
a stack of grey ListRows (venue & directions, open chat, add to calendar, share link, duplicate) ·
host-only join requests with swipe-to-approve · lineup strip + one summary line · reserved spots ·
a cost card (courts × duration, if-full total, your share) · and a pinned bottom button whose label
is the membership state (Hold to join · $8 / Request sent / Leave game / On the waitlist · #2 /
Hold to join waitlist / Take my spot / Manage this game / Game cancelled).

=== WHAT'S BROKEN (design against this) ===
1. THE HOST HAS NO VOICE ON THEIR OWN PAGE. The host note, format (social / competitive / drills /
   doubles rotation), shuttles (who brings, feather or nylon), court number and skill RANGE are all
   captured at creation and NONE of them render here. Two games at the same venue on the same night
   are still identical. This is the single biggest fix.
2. NO LIFECYCLE. status is published / cancelled / completed and the screen only knows two of them.
   There is nothing for "starts in 40 minutes, leave now", nothing for a game happening RIGHT NOW,
   and a finished game renders exactly like an upcoming one, with a live Join button and no route
   to rating the people you just played with.
3. VENUE IS A GREY LIST ROW. No map, no photo, no distance, no travel time, no amenities, on an app
   whose Discover surface is a map and whose venue directory already holds parking, showers, racquet
   hire and pricing. The one question every player asks, where is it and how long will it take me,
   is answered by a chevron.
4. TRUST IS A STATIC SEAL. "Verified" is a badge with nothing behind it. The booking confirmation
   that earned it is one tap away in the data and zero taps available in the UI.
5. CHAT IS A DEAD ROW. No unread count, no last message, no sense that anything is happening.
6. NO SOCIAL PROOF. No "you've played with Mia before", no mutuals, no host track record beyond one
   reliability number.
7. FULL IS A DEAD END. Waitlist or leave. No route to a game you could actually get into.
8. NO SAFETY EXIT. Blocking and reporting exist in the product but not on the page where you meet
   a stranger. Report / block must be reachable here.
9. FIVE FLAT LIST ROWS carry actions of wildly different weight, and share appears twice.
10. NO STICKY CONTEXT. Scroll past the hero and you lose the venue, the time and the price while
    you are reading the roster that decides whether you want them.

=== SETTLED STRUCTURE — ONE SPINE, FOUR LIFECYCLE MODES ===
Same screen, four modes, one component: UPCOMING · IMMINENT (T-90min to start) · LIVE (start to
end) · DONE (after end, with cancelled as its own terminal state). Mode changes the status band and
the pinned CTA. It must NOT re-order the page. A player who knows this screen must still know it an
hour later.

Order, top to bottom, and argue if you disagree:
  1. HERO — keep the cover / court backdrop, keep the title block. Add a collapsing sticky header
     that appears on scroll carrying venue · time · price · a compact CTA.
  2. STATUS BAND — the one line that changes with mode. "Starts in 3 days" → "Leave in about 15
     min, it's 22 min away" → "On now, court 3" → "Wrapped up Saturday night". This replaces the
     countdown chip doing all the work alone.
  3. THE PITCH — host note in the host's own words, format chip, skill RANGE as a band not a single
     tier, shuttles, court number. The differentiator block. If the note is empty the host, and only
     the host, sees an inline prompt to write one; everyone else sees the block degrade gracefully,
     never an empty card.
  4. LINEUP — the existing strip, its summary line, plus one line of social proof ("You've played
     with Mia and 2 others here"). Reserved spots keep their current placement under it.
  5. VENUE — a real card: static map thumbnail, distance and travel time, top three amenities from
     the venue directory, Directions and Venue page as distinct actions.
  6. COST — keep the current card, it is good. Add how the host wants to be paid, and for the host
     their own break-even as the roster fills.
  7. GOOD TO KNOW — auto-approve on or off, public or link-only, what happens if you drop out, what
     to bring. Plain rows, low contrast, scannable.
  8. HOST — promote it, with track record: games hosted, reliability band, typical reply speed,
     Message. It currently sits between two list rows and reads like one.
  9. CHAT — a live strip: last message, sender avatar, unread pill. Not a chevron row.
 10. SAFETY — quiet text link at the very bottom: Report this game · Block host.
 11. HOST-ONLY join requests keep swipe-to-approve, but design where they sit so a host arriving
     from a push lands on them without hunting.

=== THE PINNED CTA LADDER ===
One pinned bar. Design every state, including the ones that do not exist yet:
  not joined, open        Hold to join · $8   (hold-to-confirm, existing pattern)
  not joined, full        Hold to join waitlist, plus a secondary route out of the dead end
  requested               Request sent, with what happens next and how to withdraw
  waitlisted              On the waitlist · #2, and say honestly what #2 means
  invited (named hold)    Decline / Take my spot · $8
  approved, upcoming      the quiet state. Leave game must not be the loudest thing here
  approved, imminent      directions-forward
  approved, live          I'm here / running late
  done, rateable          Rate your crew  ← the page's most valuable unbuilt state
  done, rated             Rebook this game
  host, any mode          Manage this game
  cancelled               terminal, with the reason and a route to something else
Leaving a game is destructive and reversible only by asking to rejoin. Design that confirmation.

=== THE VERIFIED MOMENT, PART TWO ===
Prompt 6 designed the stamp at creation. Here it has to survive contact with a sceptic. Tapping
Verified opens a sheet: what we checked, when, and a thumbnail of the booking confirmation. Design
the three states: verified, pending (submitted, not yet read), and none (the host typed it in,
which is NORMAL and must not read as suspicious).

=== THE DONE MODE — design this properly, it does not exist today ===
After the last point: attendance (the host marks who showed), an aggregate of how it went, the route
into rating, and rebook. Host and players see different things. A no-show cannot rate and is not
rateable. Ratings are immutable and there is no deadline, so this state has to be re-enterable weeks
later and still make sense. Read post-game-plan.md D1-D12 before drawing it.

=== COPY TONE ===
Casually Australian and human. Contractions fine. Light Aussie phrasing where it lands naturally
("no worries", "keen", "sorted") but clarity beats personality. Never "An error has occurred", say
"Something's gone wrong, give it another go." NEVER use em dashes in user-facing text, use a comma
or a full stop. Write every string as real copy, not lorem.

=== NOT IN THIS PASS ===
· The lineup strip's own states, the reserved-spot manager, and the host's edit card (all done).
· In-app payment or split-payment tracking. The cost card states an amount, it does not move money.
· Recurring / weekly games.
· Comments or reactions on a game. That is the feed, and it is held.
· Weather. Indoor sport.
· Verifying an already-published game by uploading a receipt later.

=== DELIVER ===
Artboards for every screen and state, plus the reusable pieces specced as components with all their
states, matching how the library is already organised.
1. Full page, UPCOMING, viewer not joined, game half full. The reference artboard.
2. Same page for: approved player · host · invited player · waitlisted · requested.
3. IMMINENT, LIVE and DONE modes, and cancelled.
4. DONE mode both ways: host with attendance to mark, player with people to rate.
5. The sticky collapsed header, at the scroll position where it takes over.
6. STATUS BAND as a component, every mode.
7. THE PITCH block: full, minimal (note empty, viewer), and the host's own empty-note prompt.
8. VENUE card, and its degraded state when we have no map, no amenities and no address.
9. Verified sheet: verified with document thumbnail, pending, and none.
10. Chat strip: unread, read, and no messages yet.
11. The full-game dead end and whatever you put there instead.
12. Report / block sheet.
13. The pinned CTA as a component, every state in the ladder above.
14. States throughout: loading skeleton, game not found, offline, a logged-out visitor arriving on a
    share link (they must see enough to want in, and no roster identities), and a brand-new player
    who has joined nothing before.
```

## Prompt 7a — Game detail v3, revision pass

Run against the existing `SMASHIO Game Detail Redesign.html`. Findings recorded 2026-09-04 after
reading the file back through the design MCP. It delivers all 14 items of Prompt 7 plus three
extras (leave-game confirm sheet, already-rated re-entry, cancelled with the host's reason) — this
is a targeted revision, not a redo. The four blocking items are shipped features the redesign
dropped, not new scope.

```
Revising SMASHIO Game Detail Redesign. The file is strong and mostly right: the four lifecycle
modes, the status band, the CTA ladder, the pitch block, the venue card, the verified sheet, the
chat strip, the safety sheet, the similar-games fix for a full game, the DONE mode both ways, and
the edge states are all correct and should NOT be redrawn. Five changes below. Keep everything not
named here exactly as it is, including the section order and the scroll length.

=== BLOCKING — four shipped features the redesign dropped ===
The current app has these and the redesign has nowhere to put them. They are not new scope, they
are regressions. The five grey ListRows they used to live in are correctly dead, so decide where
they go now and show me.

1. ADD TO CALENDAR. Shipped today, two states: "Add to calendar" and "On your calendar, change".
   Only approved players and the host see it. This is the single highest-value action after
   joining and it is missing entirely.
2. SHARE GAME LINK. Shipped today in two places, and it is how games actually fill. Missing.
3. DUPLICATE THIS GAME. Host-only, seeds a new game from this one. Missing.
4. RESERVED SPOTS. The named-hold manager is shipped and designed, and my brief said it keeps its
   placement under the lineup. The redesign only shows "1 held" inside the summary line, with no
   way for the host to name, invite or release that hold. Put the existing block back under the
   lineup, unrestyled, and show its collapsed state for a non-host viewer.

Design ONE answer for where secondary actions now live, and use it consistently. Argue for it:
either a compact icon row pinned in the hero (share, calendar, overflow), or a low-contrast
utility row sitting between GOOD TO KNOW and HOST. Not both, and not a return to five grey rows.
Show the hero's own action affordances explicitly on the reference artboard, back included, so I
can see what a viewer can reach without scrolling.

=== BLOCKING — the host needs a full page, not a strip ===
Artboard 10's host view is join requests plus a CTA. Draw the host's FULL page in UPCOMING mode.
The host's job on this screen is GET PEOPLE IN, so it reads differently from a player's:
 · A fill state up top that reads as a job, not a stat: "3 spots to fill, 3 days out."
 · Share, invite from last game, copy for WhatsApp, reachable without opening the manage card.
 · The COST card in host mode: what they are covering, what they have recouped as the roster
   fills, and their break-even. My brief asked for this and the player-side card does not answer
   it. "Court's $44. 5 in at $8, you're $4 short of covering it, 3 spots left."
 · Reserved spots with the manage affordance.
 · Join requests where they already are.
 · Duplicate this game.
Then draw the host's DONE page in the same way, since it currently only exists as an attendance
card floating free of the page.

=== SHOULD FIX ===
The empty-note prompt (artboard 03) is right, but show it in situ on the host's full page too, so
I can see it does not shout over the fill job.

=== JUDGEMENT CALL, tell me what you think ===
Approved-upcoming is deliberately the quietest bar in the ladder, and I agree with that. But once
calendar and directions exist as real actions, the pinned bar for an approved player is arguably
carrying nothing while the two things they actually want sit up the page. Look at it at real size
and tell me whether the approved bar should hold "Add to calendar" as its action with "You're in"
as its label, or stay a soft confirmation with the utility row doing the work. Pick one and say
why.

Everything else in the file stays exactly as it is.
```

---

## Notes for whoever runs these

- Prompt 1 must settle **before** 2-5 — everything downstream inherits the type scale and the
  elevation ladder.
- Font pick has a hard implementation constraint: `@expo-google-fonts` package or a bundled
  variable `.ttf`, weights 400-800, tabular figures. Same family must work on the static website.
- The mark itself is frozen. Only the wordmark typeface is in play.
- Prompt 5 is a redesign of shipped code, not greenfield — read [profile-plan.md](profile-plan.md)
  (P0-P6 all landed) before running it, so the agent is not handed problems we already fixed.
- Prompt 6 is next in build order, after the feed. Its structural decisions were settled
  2026-09-01 and are recorded in [create-game-plan.md](create-game-plan.md) §9 — read that before
  changing anything in the prompt, and don't re-open: two steps not six, high-confidence-only
  locking, extra fields behind one collapsed row with defaults pre-picked, the lineup strip as the
  people editor on exactly two surfaces, edit reusing the draft card, verify-an-existing-game out
  of scope.
- Prompt 7's output is `SMASHIO Game Detail Redesign.html` (all 14 deliverables landed). Prompt 7a
  is the revision pass against it — its four blocking items are shipped features the redesign
  dropped (calendar, share, duplicate, reserved-spot manager), not new scope.
- Prompt 7 (game detail) runs after prompt 6's file exists — it reuses that lineup strip verbatim
  and must not restyle it. Reserved spots and edit/manage are shipped design, out of its scope.
- Social (prompt 4) is unapproved scope — see [social-plan.md](social-plan.md) §11. Designing it is
  cheap; building it needs sign-off.
