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

## Notes for whoever runs these

- Prompt 1 must settle **before** 2-4 — everything downstream inherits the type scale and the
  elevation ladder.
- Font pick has a hard implementation constraint: `@expo-google-fonts` package or a bundled
  variable `.ttf`, weights 400-800, tabular figures. Same family must work on the static website.
- The mark itself is frozen. Only the wordmark typeface is in play.
- Social (prompt 4) is unapproved scope — see [social-plan.md](social-plan.md) §11. Designing it is
  cheap; building it needs sign-off.
