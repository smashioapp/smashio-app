# Post-game plan — attendance, ratings, reserved spots

Status: **approved 2026-08-24**. Supersedes the post-game half of backend-plan.md slice 6 and
profile-plan.md P2. Read this before touching `ratings`, `rating_tags`, `game_players`,
`games.reserved_spots`, or `ui/app/post-game/[id].tsx`.

## Diagnosis — why the old flow never worked

Post-game rating shipped in slice 6 and has been broken or hollow ever since:

1. **The host was never rateable.** `usePastGameDetail` built its roster from `game_players`
   only. Organizers have zero `game_players` rows (confirmed 0 across every prod game), so the
   host simply never appeared on anyone's rating screen. The RLS was fixed 2026-08-23
   (`20260823000100_ratings_organizer_fix.sql`) but the screen still didn't list them.
2. **No host dimension.** A host is two things at once — a player you rallied with and the
   person who booked the court, priced it, and set the skill level. One 1-5 star scale
   collapsed both.
3. **The host didn't occupy a slot.** `approved_count` counts non-host rows only and capacity
   was `max_players - approved - reserved`, so a `max_players = 4` game could seat 4 joiners
   plus the host — 5 people on a doubles court. `decide_join_request` also ignored
   `reserved_spots` entirely, so the host could approve strangers into spots held for friends.
4. **Reserved spots were an anonymous integer.** A host holding a spot for a friend had no way
   to invite that friend, and if the friend did join through the front door they consumed an
   *open* spot while the reserved one stayed held.
5. **No attendance.** Nothing recorded who actually turned up. No-shows sat in everyone's
   rating list, and the only no-show signal in the product was a `report` reason.
6. **Skill was inferred, never asked.** `starsToTier` guessed a tier from the star average.
   The single most useful post-game fact — "he said Intermediate, he plays Beginner" — had
   nowhere to go.
7. **Ratings were attributable.** `ratings` was readable by rater *and ratee*, so a player
   could query exactly who gave them 2 stars. Honest downward skill marking does not survive
   that.

## The model

Host's flow: books a court elsewhere → creates the event → **the host always occupies one of
`max_players`** → optionally holds N reserved spots, each of which can be named, invited, or
left anonymous → strangers request and are approved into what's left → after the game the host
marks who showed up → everyone rates everyone who showed.

Open spots for strangers:

```
open = max_players - 1 (host) - approved_count - max(0, reserved_spots - claimed_reserved)
```

A reserved spot that gets claimed converts into an `approved` roster row, so it moves from the
reserved pool to `approved_count` — net zero, capacity stays honest.

## Decisions (2026-08-24)

| # | Decision |
|---|---|
| D1 | `max_players` includes the host. `4` means host + 3 others. |
| D2 | Reserved spots support **both** an anonymous count and named spots — a named spot can be direct-invited to an existing user or shared as a single-use invite link. |
| D3 | An unclaimed reserved spot stays held forever. Only the host releases it, by editing the count down or deleting the named spot. No placeholder person, nothing to rate. |
| D4 | Host marks no-shows post-game. A no-show is not rateable **and cannot rate**. If the host never marks attendance, we can't know who showed, so after a fallback window everyone rates everyone. |
| D5 | Everyone (host and players) votes on each other's skill tier. It never overwrites `profile_sports` — the player keeps authority on their own tier. Used later to nudge them. |
| D6 | The host is rated twice: as a player (stars + player tags, same as anyone) and as a host (stars + host tags). |
| D7 | No rating deadline. The window stays open. |
| D8 | Ratings are **aggregate-only** to the ratee. A rater can read their own rows (so "Rated ✓" works); nobody can see who rated them what. |
| D9 | Attendance push to host at `ends_at + 30min`; if still unmarked at `ends_at + 3h`, the rate-everyone prompt goes to all. Host marking early fires the rate prompt immediately. |
| D10 | Direct-add creates an `invited` row the person must accept. Nobody is silently added to a game they owe $11 for. |
| D11 | Invite links are one single-use token per reserved spot, regenerable by the host. |
| D12 | Explicit skill votes are the only peer-skill signal. `starsToTier` is deleted — a star average was never a skill statement. |

## Schema

New/changed, in `20260824000000_host_slot_reserved_spots.sql` and
`20260824000100_post_game_ratings.sql`:

- `games.reserved_spots` check tightens to `<= max_players - 1` (host's slot is not reservable).
- `games.attendance_marked_at timestamptz` — null means "host never told us who showed".
- `game_players.status` gains `'invited'`.
- `game_players.attended boolean` — null unknown, true showed, false no-show.
- `game_reserved_spots` — one row per *named* reserved spot: optional `label`, optional
  `invited_profile_id`, single-use `invite_token`, `claimed_by` / `claimed_at`. Row count is
  trigger-capped at `games.reserved_spots`; the difference is the anonymous remainder.
- `ratings` / `rating_tags` gain `dimension text ('player'|'host')`, folded into the unique key
  so a host carries one of each. Host tags: `organised_well`, `skill_level_accurate`,
  `court_as_described`, `fair_cost_split`, `responsive_in_chat`.
- `skill_votes (game_id, rater_id, ratee_id, skill_tier_id)` — references `skill_tiers`, so
  sport stays a data concern.

Key functions: `claimed_reserved_count`, `open_spots`, `can_rate_in_game`, `mark_attendance`,
`add_reserved_spot` / `remove_reserved_spot` / `invite_to_reserved_spot` /
`create_reserved_spot_invite` / `claim_reserved_spot`, `respond_to_game_invite`,
`post_game_roster`, and the aggregate readers `rating_summary` / `host_rating_summary` /
`peer_skill_vote`.

## Not doing

- **No self-rating and no host self-no-show.** The host hosted; they showed.
- **No backfill of existing over-capacity games.** The new guard blocks new approvals; live
  games that already seat `max_players + 1` are left alone. Beta, handful of games.
- **No rating edits.** Ratings stay immutable, as they always have been.
- **No attendance for unclaimed reserved spots.** Nobody in the app is that person.
- **No no-show reliability penalty in this pass.** `recompute_reliability_scores` keeps its
  late-leave formula; folding attendance in is a follow-up once real no-show data exists.
