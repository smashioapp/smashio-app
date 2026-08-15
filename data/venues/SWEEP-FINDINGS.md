# Sydney venue sweep — results

Run 2026-08-15 against [venues-plan.md](../../docs/venues-plan.md) §3. Discovery only: **nothing
here is verified**. Every lead is `confidence='low'` until checked against the operator's own site
or phone per §3's verification rule.

## What was run

| Axis | Method | Cost | Output |
|---|---|---|---|
| 1a | Places Text Search, `"badminton"`, 49-cell 10 km grid over Greater Sydney | 196 requests | 95 places |
| 1b | Places Text Search, 5 generic venue queries, 16-cell coarse grid | 320 requests | 308 places |
| 2 | Operator families — NBC, BadmintonWorx, Alpha, The Badminton Club, council/YMCA/PCYC/university chains | web | chain rosters |
| 3 | Badminton NSW affiliated-club directory (56 clubs) | web | 9 halls + 14 venues Places missed |

~516 Places requests ≈ **A$16** at Text Search rates.

## Triage

361 unique places → 29 dropped as outside Greater Sydney (Text Search treats `location`+`radius`
as a *bias*, not a filter, so edge cells pulled in Newcastle and the Central Coast) → **332 in
area**.

| Priority | n | Definition |
|---|---|---|
| **P1** | 37 | name asserts badminton, or a second source (club directory) corroborates |
| **P2** | 51 | multi-purpose venue that hit the `"badminton"` query |
| P3 | 6 | stringing/retail — no courts, but feeds the `stringing`/`pro_shop` amenities |
| P4 | 238 | parked: generic-query-only hits, other sports, licensed clubs |

**P1 + P2 = 88 venues** is the manual enrichment queue → [leads-to-enrich.csv](leads-to-enrich.csv),
which carries the §3 checklist columns blank and ready to fill.

Chains in area: Council/leisure 91, PCYC 26, YMCA 9, **NBC 7**, University 7, Alpha 3,
BadmintonWorx 2, The Badminton Club 2, PlayPoint 2, Sydney Sports Club 2.

## Findings that changed the plan

1. **The matcher's 300 m rule was unsafe.** Ace Badminton Sydney, "Alpha Slough" and NBC
   Silverwater sit within 250 m of one another on Slough Ave, Silverwater — three separate
   operators in one industrial estate. Proximity-led matching would have merged competitors.
   §6 corrected to 80 m, name-match required, clusters always reviewed by a human.
2. **The source CSV missed the largest operator.** NBC runs **7** Sydney sites; the CSV had 2.
   Confirmed independently by the Places sweep and NBC's own booking portal.
3. **`seed.sql` carries a stale venue.** "NBC Homebush" is not among NBC's current 7 locations —
   renamed (probably NBC Olympic Park) or closed. Resolve before the A2 ingest writes anything.
4. **The CSV's Alpha address is wrong.** It says 46 Industrial Dr, Silverwater. Places has Alpha at
   46 **Egerton St** Silverwater, plus separate Auburn and Slough Ave sites — three sites, one CSV
   row, wrong street.
5. **Sydney's busiest badminton venue was absent from the CSV.** ATC Badminton, Alexandria (840
   ratings, ~2× the next). Also missing: Pro1 Bankstown, BadmintonWorx Norwest, Roketto Lidcombe,
   Yennora, KBC Camellia, APX Thornleigh, A1 Campbelltown.
6. **Two chains share one booking backend.** NBC and BadmintonWorx both run on
   `*.yepbooking.com.au`. One `booking_url` pattern covers the two largest operators.
7. **Places cannot see a large share of actual play.** The club directory surfaced 9 school and
   community halls hosting weekly badminton, none of which appear in any commercial listing.
   **Muirfield High School, North Rocks hosts 4 clubs** — the densest badminton hall found, and
   invisible to axis 1. These need `booking_url = null` and an access note; presenting them as
   court hire would be wrong.

## Same-site clusters needing human review

Eight pairs/triples within 250 m in the P1+P2 queue. Only some are genuine duplicates:

| Cluster | Likely reading |
|---|---|
| Ace Badminton Sydney \| Alpha Slough \| NBC Silverwater | **three distinct operators** — do not merge |
| Curl Curl Youth and Community Centre \| Curl Curl Sports Centre | probably one site, two Places records |
| Macquarie Fields Leisure Centre \| Macquarie Fields Fitness & Indoor Sports Centre | probably one site |
| Avalon Badminton Club \| Avalon Recreation Centre | club + its host venue |
| Speedy Bunnies BC \| PCYC Hawkesbury | club + its host venue |
| Let's Badminton \| Riverstone Sports Centre | club + its host venue |
| Pro1 Badminton Centre \| Entertainment Park | co-located, different businesses |
| Hurstville Aquatic Leisure Centre \| Johnny Warren Indoor Sports Centre | adjacent, verify |

The club-plus-host-venue pattern recurs: the club is not a venue. Model the hall as the venue and
the club as a future social-plan.md entity, or the directory fills with duplicate pins.

## Not done

The §3 enrichment checklist (courts, surface, booking URL, hours, phone, price bands, amenities)
is **unfilled** for all 88 leads. That is step A6 and it is manual — roughly 3–5 days. The sweep
produced the queue, not the data.

## Reproduce

The Places-derived working files (`places-sweep-pass*.json`, `leads.json`,
`leads-to-enrich.csv`) are gitignored — §2's caching rule means Places content stays local and
gets regenerated rather than committed. This findings doc, the club data, and the scripts are
what live in the repo. Regenerate the queue with:

```bash
node scripts/venues/places-sweep.mjs --pass=1 && node scripts/venues/places-sweep.mjs --pass=2 && node scripts/venues/triage.mjs
```
