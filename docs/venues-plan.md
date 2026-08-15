# Venues plan — from "a name and a pin" to a facility directory

Written 2026-08-15. Covers Phase A of the venue-data work. Phase B (social layer) lives in
[social-plan.md](social-plan.md) and depends on this doc's `venue_id` being a real, stable,
de-duplicated entity.

Read [backend-plan.md](backend-plan.md) and [map-plan.md](map-plan.md) first — this plan
extends `public.venues`, `venues_near`, and the Discover map, and deliberately does not touch
their existing contracts except where called out.

**Status 2026-08-15.** Proposed, not approved. No migration written, no code changed. The §3
discovery sweep **has been run** — results and the corrections it forced on this plan are in
[data/venues/SWEEP-FINDINGS.md](../data/venues/SWEEP-FINDINGS.md). Read that before starting A0;
it changes §2, §6 and §8.

**Where to start.** A0 is done in substance (sources gathered, 88-venue queue built,
`scripts/venues/` exists). The next unblocked work is either **A6** (fill the enrichment queue —
manual, no code) or **A1** (write the migrations so enriched data has a destination). They are
independent; A2 needs both.

---

## 1. What's wrong today

`public.venues` (20260807000500) is an identity + geo table and nothing else:

| Column | Purpose |
|---|---|
| `name`, `suburb`, `state`, `address` | display strings |
| `location` | PostGIS point — powers `nearby_games`, `venues_near` |
| `google_place_id` | dedupe key for `upsert_places_venue` |
| `source` | `user` \| `places` \| `partner` |

Consequences:

1. **Nothing to show.** A game card says "NBC Homebush" and a distance. It can't answer "does it
   have parking?", "can I hire a racquet?", "how much is a court there?", "is it 24/7?".
   `VenueCourtHeader` draws a *procedurally generated gradient* because there is no venue imagery
   or data to draw instead.
2. **Two competing venue populations.** `supabase/seed.sql` has 8 hand-typed "partner" venues with
   approximate coords and **no `google_place_id`**. Every host-created venue arrives via
   `upsert_places_venue` with a `google_place_id`. A host searching "Alpha Badminton Centre" in the
   wizard creates a *second* Alpha row, because the unique constraint is on `google_place_id`
   and the seed row's is `NULL`. Uniqueness on NULL is not enforced in Postgres — duplicates are
   already possible today.
3. **Places overwrites on every upsert.** `upsert_places_venue` does
   `on conflict (google_place_id) do update set name/suburb/state/address/location`. Any curated
   field we add *directly to `venues`* gets clobbered the next time a host picks that venue.
   Curated data must live in a sibling table.
4. **The map has dumb pins.** `map-plan.md` §5.10 ships dim "no games here" venue pins whose only
   job is a "host one here" funnel. With facility data those pins become a reason to open the app
   when nobody is hosting — the directory *is* retention.
5. **No venue as a destination.** There is no `ui/app/venue/[id].tsx`. Venues appear only as a
   string inside a game.

## 2. The source data

`data/venues/sydney-badminton-facilities.raw.csv` — 15 facilities, columns: Facility Name,
Location, Full Address, Pin Code, Booking Platform, Number of Courts, Booking Amount, Washroom,
Parking, Water, Racquet Rental, Shuttle Rental, Stringing Services, Comments.

It is a good skeleton and a bad database — and after the §3 sweep it is no longer the primary
source, just the first one. It covers 15 of the ~88 venues now in the queue, misses the largest
operator almost entirely, and has at least one wrong street address. Treat it as a starting list
with useful amenity columns, not as truth.

Findings from reading it:

| # | Issue | Fix |
|---|---|---|
| 1 | **No coordinates.** Every row is a street address only. | Geocode via Places Text Search at ingest; store `google_place_id` as the dedupe key. |
| 2 | **Alpha Badminton row is internally inconsistent** — Facility Name says "Rookwood / Lidcombe", Location says "Lidcombe, NSW", Full Address says "46 Industrial Dr, **Silverwater** NSW 2128". The sweep then showed the address is also simply **wrong** (Places has 46 **Egerton St**) and that Alpha runs **three** sites: Egerton St, Auburn, and Slough Ave. | Address does *not* win — nothing in this row is reliable. Re-source from the operator; split into three venues. |
| 3 | **Prices are point-in-time strings** — `"$29.50/hr (Off-peak Mon-Fri 6am-4pm), $39.50/hr (Peak Mon-Fri 4-10pm, Sat-Sun)"`, and Oran Park mixes a per-hour and a per-person rate in one cell. | Parse into structured `venue_pricing_bands` rows; keep the original string as `price_notes`; stamp `verified_at` and show "as at <date>" in the UI. |
| 4 | **Amenity cells are prose, not booleans** — `"Yes (Paid on-site / P3 car park)"`, `"No (Retail purchase at front desk)"`, `"Retail purchase available at reception"`. Note the racquet-rental "No (Available for retail purchase…)" cells: the answer to *rental* is no, but the cell also carries a *retail* fact. | Split into `availability` enum (`yes`/`no`/`paid`/`nearby`/`unknown`) + free-text `note`. Retail-vs-rental becomes two separate amenity slugs. |
| 5 | **`Pin Code` is redundant** — derivable from the address, and it's a postcode, not a pin code. | Drop; keep `postcode` off the schema entirely (address string suffices for display). |
| 6 | **Incomplete vs our own seed.** The CSV omits NBC Homebush, MUSAC, PCYC Marrickville, Sydney Badminton Hurstville, and Australian Badminton Academy North Parramatta — all already in `seed.sql`. It also lists "NBC South Granville" and "NBC Silverwater" which the seed doesn't have. The sweep settled it: **NBC runs 7 Sydney sites** and the CSV had 2, while `seed.sql`'s "NBC Homebush" is **not among the current 7** and is stale. | Neither list was authoritative. Both superseded by the §3 queue. |
| 7 | **Oran Park is not Sydney metro** (Camden LGA, ~55 km from the CBD). Not wrong, but it will surface in nobody's default radius. | Keep. Tag `region` so we can reason about coverage rather than silently carrying dead rows. |
| 8 | **Court counts conflate "courts in the building" with "badminton courts bookable"** — Concord Oval's own comment says badminton is "set up on Full Courts 3 and 4", yet the count column says 8. | Two fields: `courts_total` and `courts_badminton`; `dedicated` boolean for purpose-built venues. |
| 9 | **No opening hours, phone, website, or booking URL** — the single most-wanted fields for "can I play tonight?". | Add in §3 research. |
| 10 | **No provenance.** We can't tell which cells were verified against an operator site and which were inferred. | Every profile row carries `data_source` + `confidence` + `verified_at`. Low-confidence fields render dimmed or hidden. |

### Legal constraint on Places data — read before designing ingest

Google Maps Platform terms permit caching `place_id` **indefinitely**, but other Places content
(name, address, hours, ratings, photos) only for a **limited period** (30 days), and prohibit
using it to build a competing/standalone directory. So:

- **Places is a resolver, not a source.** Use it to get `place_id` + lat/lng, and nothing else.
- **Curated facility data comes from the operator** — their own site, phone call, or a partner
  agreement — and that is what we store long-term.
- `venues.name/address` already hold Places-derived strings today for host-created venues; that's
  the display-of-fetched-data path and stays as-is. New curated columns must not be backfilled
  from Places.

## 3. Research & expansion — how we get from 15 to "all of Sydney"

**Discovery: DONE 2026-08-15. Enrichment: not started.** Axes 1–3 have been run; full results,
costs and the plan corrections they forced are in
[data/venues/SWEEP-FINDINGS.md](../data/venues/SWEEP-FINDINGS.md). Headline: 361 places found →
332 in Greater Sydney → **88 venues in the P1+P2 enrichment queue**
(`data/venues/leads-to-enrich.csv`, gitignored, regenerate with `scripts/venues/triage.mjs`).
None of them are verified. What remains is the per-lead checklist below, which is manual.

Four discovery axes, run in this order. Output of each is a lead list, not a venue row.

1. **Places sweep (automated, cheap, wide) — RUN.** Text Search over a 10 km grid covering
   Greater Sydney (−34.15…−33.55 lat, 150.65…151.35 lng), two passes: `"badminton"` (high
   precision, 95 hits) then five generic venue queries (low precision, 308 hits). ~516 requests,
   ≈A$16. Implemented as `scripts/venues/places-sweep.mjs` + `scripts/venues/triage.mjs`.
   Two gotchas worth keeping: Text Search treats `location`+`radius` as a **bias, not a filter**
   (results leaked in from Newcastle and the Central Coast — the triage re-applies the bbox), and
   `next_page_token` is not valid immediately, so pagination needs backoff rather than a fixed
   sleep.
2. **Operator families (manual, high yield) — RUN.** Sydney's court supply is concentrated in a
   handful of operators. In-area chain counts from the sweep: Council/leisure 91, PCYC 26, YMCA 9,
   **NBC 7**, University 7, Alpha 3, BadmintonWorx 2, The Badminton Club 2, PlayPoint 2, Sydney
   Sports Club 2. Grouping by chain matters because **one operator conversation covers many
   venues** — and because NBC and BadmintonWorx turn out to share a booking backend
   (`*.yepbooking.com.au`), so one `booking_url` pattern covers the two largest operators.
3. **Community sources (manual) — PARTIALLY RUN.** The Badminton NSW affiliated-club directory
   was captured to [data/venues/clubs-badminton-nsw.json](../data/venues/clubs-badminton-nsw.json)
   (56 clubs). It is the highest-value axis and the one Places structurally cannot replace: it
   surfaced **9 school and community halls** hosting weekly badminton with zero commercial
   listings, including **Muirfield High School, North Rocks — 4 clubs, the densest hall found**.
   Not yet run: Facebook groups and Meetup.

   Two structural lessons from this axis:
   - **A club is not a venue.** The club-plus-host-venue pair recurs (Avalon BC / Avalon Rec
     Centre, Speedy Bunnies / PCYC Hawkesbury, Let's Badminton / Riverstone Sports Centre). Model
     the hall as the venue; the club belongs in [social-plan.md](social-plan.md). Ingesting both
     fills the map with duplicate pins.
   - **Club halls are not bookable.** They are club-hired, so they need `booking_url = null` and
     an access note pointing at the club — see `bookability` in §4.2. Presenting a school hall as
     court hire would send users to a locked door.
4. **User-submitted (continuous, post-launch).** Every `upsert_places_venue` from the host wizard
   is a lead. Anything with ≥1 published game and no profile row goes into a review queue.

### Per-lead enrichment checklist

For each confirmed badminton venue, collect: `courts_badminton`, `courts_total`, `dedicated`,
`surface` (mat/synthetic/timber), booking platform + **booking URL**, `phone`, `website`,
`opening_hours`, price bands (peak/off-peak, per-court-hour vs per-person), and the amenity set
in §4.3. Record the source URL and date on every field batch.

**Verification rule:** a field is `confidence='high'` only if it came from the operator's own
site/booking system with a URL and a date. Anything from a third-party listing or inference is
`medium`. Anything from the raw CSV that we haven't re-checked is `low` and does not render
without a "reported by community" caveat.

**Cadence:** re-verify prices and hours **quarterly**; a `verified_at` older than 180 days flips
the UI to "may be out of date" and hides the price. Prices we display and get wrong are a
trust-killer and, if a user relies on them, a consumer-law exposure — the disclaimer is not
optional.

## 4. Schema

Five new tables. `public.venues` is **not** modified except for one nullable `slug` — everything
curated hangs off `venue_id` so `upsert_places_venue` can keep clobbering the Places-derived
columns without touching our data.

### 4.1 `venues` — one additive change

```sql
alter table public.venues add column slug text unique;
alter table public.venues add column region text;  -- 'inner-west','north-shore','south-west',…
```

`slug` is the stable natural key for curated rows (`nbc-south-granville`), so the ingest
migration is idempotent and re-runnable even before a `google_place_id` is resolved. It also
fixes finding #2 in §1: the seed's NULL-place_id rows get slugs and can be matched.

### 4.2 `venue_profiles` — 1:1 curated detail

```sql
create table public.venue_profiles (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  courts_badminton int,
  courts_total int,
  dedicated boolean not null default false,
  surface text check (surface in ('mat','synthetic','timber','other')),
  -- Added after the §3 sweep: a large share of Sydney badminton happens in school and community
  -- halls that cannot be booked by an individual at all. Without this the UI has no way to say
  -- "you can't just turn up here" and would send users to a locked door.
  bookability text not null default 'unknown' check (bookability in ('public','club_only','members_only','unknown')),
  club_contact text,            -- club_only venues: who to actually contact
  booking_platform text,
  booking_url text,             -- null whenever bookability <> 'public'
  website_url text,
  phone text,
  opening_hours jsonb,          -- {"mon":[["06:00","22:00"]], …}; null = unknown, [] = closed
  access_notes text,            -- "24/7 keycode PIN entry", "shared with futsal timetable"
  summary text,                 -- one-line editorial blurb, ours, not scraped
  data_source text not null check (data_source in ('csv','operator','partner','user','places')),
  source_url text,
  confidence text not null default 'low' check (confidence in ('high','medium','low')),
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);
```

`opening_hours` is `jsonb` not a table: it's read whole, written whole, never queried by field.

### 4.3 `amenity_types` + `venue_amenities`

```sql
create table public.amenity_types (
  slug text primary key,
  label text not null,
  icon text not null,          -- lucide/ionicons name the RN app maps
  ordinal int not null,
  category text not null       -- 'essentials','gear','comfort','access'
);

create table public.venue_amenities (
  venue_id uuid references public.venues(id) on delete cascade,
  amenity_slug text references public.amenity_types(slug),
  availability text not null check (availability in ('yes','no','paid','nearby','unknown')),
  note text,
  primary key (venue_id, amenity_slug)
);
```

Seed amenity set — the six from the CSV plus the ones §3 research adds:

| Category | Slugs |
|---|---|
| essentials | `toilets`, `parking`, `drinking_water`, `change_rooms`, `showers`, `lockers` |
| gear | `racquet_hire`, `shuttle_hire`, `racquet_retail`, `shuttle_retail`, `stringing`, `pro_shop` |
| comfort | `air_conditioning`, `spectator_seating`, `cafe`, `vending`, `wifi` |
| access | `step_free_access`, `accessible_toilet`, `public_transport_nearby`, `after_hours_access`, `coaching`, `casual_social_sessions` |

The enum is what makes the CSV's prose cells lossless: Sydney Olympic Park's parking becomes
`(parking, 'paid', 'On-site, P3 car park')`; Five Dock's racquet cell becomes
`(racquet_hire, 'no', null)` **and** `(racquet_retail, 'yes', 'Front desk')`.

### 4.4 `venue_pricing_bands`

```sql
create table public.venue_pricing_bands (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  label text not null,                    -- 'Off-peak', 'Peak', 'Casual per person'
  days smallint[] not null,               -- ISO 1=Mon…7=Sun
  starts_time time, ends_time time,       -- null,null = all day
  cents int not null,
  unit text not null check (unit in ('court_hour','person_hour','person_session')),
  notes text
);
```

Everything the app quotes derives from these rows; `venue_profiles.summary` never contains a
price. A venue with zero bands shows "Pricing not listed", not a guess.

### 4.5 `venue_photos` and `venue_corrections`

```sql
create table public.venue_photos (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  storage_path text not null,             -- Supabase Storage 'venue-photos' bucket
  credit text,
  uploader_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  ordinal int not null default 0,
  created_at timestamptz not null default now()
);

create table public.venue_corrections (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  field text not null,                    -- 'price' | 'hours' | 'amenity:parking' | 'closed' | …
  suggested_value text,
  note text,
  status text not null default 'open' check (status in ('open','accepted','rejected')),
  created_at timestamptz not null default now()
);
```

Photos are the fix for `VenueCourtHeader`'s procedural gradient. They stay `pending` until
approved — an unmoderated photo bucket is the same App Store UGC problem as the feed
(see [social-plan.md](social-plan.md) §7), just earlier.

### 4.6 RLS

- `venue_profiles`, `venue_amenities`, `venue_pricing_bands`, `amenity_types`: `select` to
  `authenticated`, no client writes. Curation is seed/admin (service role) only.
- `venue_photos`: `select` where `status='approved'`; `insert` own row with `status='pending'`
  forced by a trigger (don't trust the client).
- `venue_corrections`: `insert` own row; `select` own rows only. Nobody browses other people's
  reports.

## 5. API surface

### 5.1 `venue_detail(p_venue_id uuid)` — one round trip for the detail screen

Returns a single `jsonb`: venue identity + lat/lng + profile + amenities array + pricing bands +
approved photo paths + `upcoming_game_count` + `next_game_at`. `security invoker`, `stable`.
One RPC beats five `select`s on a screen that opens from a map pin.

### 5.2 `venues_near` — extend, don't replace

Add `courts_badminton`, `dedicated`, `bookability`, `has_profile`, `amenity_flags text[]` to the
return type so map pins can differentiate a 16-court dedicated centre from a 4-court community
hall, and so the map can filter on amenities without an N+1. `bookability` is on the pin path
because a `club_only` hall must never render the "host a game here" CTA.

Per the repo's own convention (see the comment in `20260814000000_courts_hours_perplayer_price.sql`),
changing a function's return type means `drop function` then `create` — `create or replace` can't
do it. `venues_near` has no dependent views, so this is safe.

### 5.3 `venue_search(q text, lat, lng)` — the wizard's cold start

Curated venues ranked by trigram similarity on name + distance, returned *before* the Places
network call. Hosts pick a venue we already have data for, which is both faster and keeps the
directory from fragmenting into Places duplicates. Falls back to Places only on zero hits.
Needs `pg_trgm` (already available via the `extensions` schema) and a GIN index on `venues.name`.

### 5.4 `report_venue_correction(p_venue_id, p_field, p_suggested_value, p_note)`

`security definer`, rate-limited to 10/user/day. Powers the "Something wrong here?" affordance.

## 6. Ingest pipeline

Because production is live, ingest is **not** `supabase db reset`. It is a generated, idempotent
migration.

```
data/venues/sydney-badminton-facilities.raw.csv   ← source of truth, hand-edited
        │
        ├─ scripts/venues/normalize.ts   parse cells → typed records, emit warnings for
        │                                 unparseable prices/amenities (fail loud, don't guess)
        ├─ scripts/venues/geocode.ts     Places Text Search → place_id + lat/lng, cached to
        │                                 data/venues/.geocode-cache.json (place_id only —
        │                                 §2's caching rule)
        ├─ scripts/venues/match.ts       resolve against existing venues:
        │                                   1. google_place_id exact
        │                                   2. slug exact
        │                                   3. name trigram ≥0.6 AND within 80 m
        │                                   4. otherwise → new venue
        │                                 never auto-merges on proximity alone; ambiguous
        │                                 matches print and stop the run
        └─ scripts/venues/emit-sql.ts    → supabase/migrations/<ts>_venue_directory_seed.sql
                                           all upserts, on conflict do update, re-runnable
```

**The 300 m rule was wrong — corrected to 80 m after the sweep.** Sydney's badminton centres
cluster in the same industrial estates, so proximity is a weak identity signal. The sweep found
**Ace Badminton Sydney, "Alpha Slough", and NBC Silverwater all within 250 m of each other** on
Slough Ave, Silverwater — three different operators, not one venue. A proximity-led matcher would
have silently merged three competitors into one row. Distance may only ever *confirm* a name
match, never substitute for one, and every cluster goes to a human.

Rules the generated SQL must follow:

- Upsert `venues` on `slug`; **never** overwrite an existing `google_place_id` with `NULL`.
- Backfill slugs onto the 8 existing `seed.sql` partner rows in the same migration — that's the
  fix for the duplicate-Alpha bug in §1.2, and it must land before any new insert.
- Delete-and-reinsert `venue_amenities` / `venue_pricing_bands` per venue (they're derived data,
  a diff is not worth it); never touch `venue_photos` or `venue_corrections`.
- Every row gets `data_source='csv'`, `confidence='low'`, `verified_at=null` until §3's research
  upgrades it. Shipping the CSV as-is at `high` confidence would be lying to users.

### Pre-flight, before A2 writes anything to production

The sweep turned up specific data defects that must be resolved first — these are not
hypotheticals, they are known-bad rows:

1. **`seed.sql`'s "NBC Homebush" is stale.** Not among NBC's current 7 sites. Determine whether it
   was renamed (probably NBC Olympic Park) or closed, then merge or retire it. If any published
   game references it, migrate the reference — do not delete a venue out from under a game.
2. **Alpha is three venues, not one**, and the CSV's street address matches none of them.
   Re-source from the operator before inserting.
3. **Run the duplicate report first.** `scripts/venues/triage.mjs` already detects same-site
   clusters; eight exist in the current queue and only some are true duplicates. Human sign-off on
   the cluster list is a gate on A2, not a follow-up.
4. **Decide `bookability` per venue.** Anything sourced from the club directory defaults to
   `club_only` until proven otherwise — the safe default is the one that doesn't send someone to a
   locked door.

## 7. UI

### 7.1 `ui/app/venue/[id].tsx` — the venue screen

Sections, in order: photo header (approved photos, carousel; falls back to today's
`VenueCourtHeader` gradient) → name/suburb/distance → primary actions (**Directions** via the
existing `openDirections`, **Book** → `booking_url`, **Call**, **Share**) → at-a-glance chips
(courts, surface, dedicated/multi-purpose) → **Play here** (upcoming games at this venue + "Host
a game here" CTA, prefilling the wizard's venue step) → pricing table with "as at <date>" →
amenity grid by category (`yes` bold, `paid`/`nearby` muted, `no` struck, `unknown` hidden) →
hours → access notes → "Something wrong here?" → (Phase B) venue feed tab.

### 7.2 Entry points

- Map pin callout → venue screen (today it only offers "host here").
- `MapCarouselCard` / `GameCard` venue name → tappable.
- Game detail's venue block → "View venue" row.
- Wizard venue step → curated results show a courts/amenity subtitle.
- New Discover tab or filter: **Courts near me** — the directory as a browsable surface.

### 7.3 Query layer

Extend `ui/lib/queries/venues.ts` with `useVenueDetail(id)` (`staleTime` 1 h — facility data
barely changes), `useVenueSearch(q)`, `useReportCorrection()`. Regenerate `ui/lib/db.types.ts`
after the migrations land.

## 8. Build order

| Step | Scope | Est. | Status |
|---|---|---|---|
| **A0** | Discovery sweep, triage, lead queue, `scripts/venues/*` + `data/venues/*`. No DB change. | 0.5 d | **done 2026-08-15** |
| **A1** | Migrations: `venues.slug/region`, `venue_profiles` (incl. `bookability`), `amenity_types` + seed, `venue_amenities`, `venue_pricing_bands`, RLS. | 0.5 d | not started |
| **A2** | `normalize`/`match`/`emit-sql` scripts + generated seed migration + slug backfill on the 8 `seed.sql` rows. **§6 pre-flight is a gate.** | 1 d | blocked on A1 + some of A6 |
| **A3** | `venue_detail` RPC + `ui/app/venue/[id].tsx` + entry points from map/game/card. | 2 d | blocked on A1 |
| **A4** | `venues_near` extension, richer map pins, amenity + `bookability` filter, "Courts near me". | 1.5 d | blocked on A1 |
| **A5** | `venue_photos` bucket + moderation, `venue_corrections` + report UI, freshness/staleness rules. | 1.5 d | blocked on A1 |
| **A6** | Fill the §3 enrichment checklist for the 88 P1+P2 leads to `medium`+ confidence. Manual. | 3–5 d | **not started — the long pole** |

A1 → A3 is the minimum that makes venues feel real, and A1 is the only thing blocking three
parallel tracks — write it first even if enrichment is the bigger job.

**A6 is the critical path and needs no code.** It can start immediately and run alongside
everything else; it's data entry against a schema. A2 only needs the venues you've actually
enriched, so partial A6 unblocks a partial ingest — do the P1 chains first (NBC's 7, Alpha's 3,
BadmintonWorx's 2, The Badminton Club's 2 = 14 venues from four operator conversations).

## 9. Risks

- **Price/hours staleness.** Mitigated by `verified_at`, the 180-day hide rule, an explicit "check
  with the venue" line, and user corrections. Never present a price as bookable-through-us.
- **Places ToS.** §2's rule (place_id + coords only) is a design constraint, not a preference.
  If we ever want richer imported data, that's a partner conversation with each operator.
- **Duplicate venues in production.** Real today. A2 must run a pre-flight report of
  name-similar venues within 300 m before it writes anything.
- **Curation cost.** 80 venues × quarterly re-verification is a standing chore. Mitigate with
  corrections-driven prioritisation (re-check what users flag first) and, later, operator
  self-service claims ("claim this venue").
- **Scope creep into booking.** We are not a booking platform ([AGENTS.md](../AGENTS.md)). `booking_url`
  deep-links out. Do not build a cart.

## 10. Not doing

- In-app court booking or payment.
- Real-time court availability (needs per-operator integrations; revisit only with partners).
- Venue ratings/reviews in Phase A — reviews are UGC and belong with the moderation stack in
  [social-plan.md](social-plan.md) §7.
- Cities beyond Sydney. Schema is city-agnostic; the data is not.
