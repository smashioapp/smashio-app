# RPC exposure plan — revoking PUBLIC execute across the Postgres function surface

**Status: implemented 2026-09-10.** All of B1-B5 shipped same day as migrations
`20260910030000`-`20260910070000`. B6 (hosted apply) is not done — these are local-only until
pushed. Three functions not in the original count below (`games_seo_at_venue`, `games_seo_feed`,
`city_seo_stats`, from `20260910010000_games_seo_feed.sql`, written the same day as this plan)
were caught by the regression-guard assertion and folded into bucket A's migration.

Owner area: `supabase/migrations/`. Nothing in `ui/` changes.

---

## 1. Diagnosis

Postgres creates every function with `EXECUTE` granted to `PUBLIC`. Supabase's `anon` role
inherits that. So `grant execute ... to authenticated` at the bottom of a migration does not
restrict anything, it is additive on top of a grant that is already there for everyone. A
`security definer` function with PUBLIC execute runs as its owner with RLS bypassed and can be
called by anyone holding the publishable anon key, which ships inside the app binary and is
hardcoded in `website/api/_venue-lib.js`.

This has now been found and patched twice, both times as a single-function fix:

- `20260904000000_sweep_holds_revoke_public.sql` closed `sweep_reserved_spot_holds()`, found in a
  security review. Its header states the general rule correctly and then fixes one function.
- `20260910000000_link_only_visibility.sql` §8 closed `feed_home`, found while fixing link-only
  game visibility. The whole feed was anon-readable.

Neither swept the rest. A database-wide audit says the pattern holds for **130 `security definer`
functions** in `public`. Two fixed, 128 open.

The recurrence is the actual problem. A third one-off fix leaves a fourth to be found.

## 2. What the anon key reaches today

Of the 130, **35 return `trigger`**. PostgREST does not expose trigger functions, so they are not
callable over the API and are out of scope. That leaves **95 callable functions**, in four buckets.

### Bucket A — anon by design (12)

Already carry an explicit `grant ... to anon`. Revoking PUBLIC changes nothing about who can call
them, it just removes a redundant grant.

```
claimed_reserved_count         club_seo_detail        club_seo_directory
decline_reserved_spot          game_preview           nearby_games_public
open_rateable_count            open_spots             post_preview
preview_reserved_spot_invite   venue_seo_detail       venue_seo_directory
```

This is the entire intended anon surface. Cross-checked against every anon caller in the repo:
`website/api/*` calls five of them, `website/api/game/[id].js` calls `game_preview`, and
`ui/lib/queries/games.ts` calls `nearby_games_public` and `game_preview` in the signed-out state.
No anon caller anywhere touches a function outside this list.

### Bucket B — reachable *only* through PUBLIC (32)

No grant to `anon` or `authenticated`. The only reason these are callable by anyone at all is the
default PUBLIC grant. This is the `sweep_reserved_spot_holds` class and the highest severity.

Twelve of them are wired to `cron.job` and are meant to run on a schedule and nowhere else:

```
auto_close_stale_chats           complete_past_games
dispatch_attendance_prompts      dispatch_game_reminders
dispatch_notification_retries    dispatch_nudge_pending_requests
dispatch_nudge_underfilled       dispatch_post_game_prompts
dispatch_post_reaction_digest    recompute_reliability_scores
notify_push                      trigger_purge_confirmations
```

The rest are internal helpers the dispatch path calls:

```
chat_push_recipients        delete_push_receipts        delete_push_token
enqueue_notifications       enqueue_post_game_rate      filter_quiet_recipients
notification_pref_enabled   prune_ready_receipt_batch   push_actor_name
push_actor_summary          push_game_summary           push_message_summary
push_post_game_recipients   push_post_summary           push_recipients_for_game
push_recipients_for_host    recompute_achievements      system_close_chat
```

Plus `approve_join_action` and `decline_join_action`, which are a special case — see §4.

### Bucket C — granted to `authenticated`, guarded internally (42)

These check `auth.uid()` directly, or call `assert_is_organizer` / `is_approved_player` /
`blocked_between`. Called as `anon`, `auth.uid()` is null and they either raise or return nothing.
Revoking PUBLIC removes the anon reach; behaviour for a signed-in user is unchanged. Lower
severity, but the revoke is close to free.

### Bucket D — granted to `authenticated`, no visible guard (9)

```
approved_player_count   blocked_between             can_rate_in_game
is_approved_player      notification_unread_count   peer_skill_vote
rating_summary          upsert_places_venue         waitlist_count
```

These need reading one at a time. Most are computed counts where anon reach is a minor leak, but
`upsert_places_venue` is a `security definer` **write** with no `auth.uid()` check anywhere in it,
so today anyone with the anon key can insert or overwrite rows in the venue directory. Given
`data/venues/SWEEP-FINDINGS.md` already records that `google_place_id` uniqueness does not stop
duplicate venues, that is a directory-poisoning path, not a theoretical one.

## 3. What this costs if left alone

Concretely, with nothing but the anon key:

- Fire `dispatch_game_reminders()` in a loop and push-spam every player with an upcoming game.
- Call `complete_past_games()` or `recompute_reliability_scores()` and move real reliability
  scores on demand.
- Call `auto_close_stale_chats()` and close chats out from under active games.
- Write junk into `venues` via `upsert_places_venue`.
- Read whatever bucket C leaks in the cases where `auth.uid()` being null widens a query rather
  than narrowing it. That is the part that has to be read, not assumed.

## 4. The fix

One migration per bucket, in this order, so a regression is attributable to one bucket.

**B first**, since it is the highest severity and the smallest blast radius. Revoking PUBLIC on a
bucket B function leaves `postgres` and `service_role`, and both callers survive: `cron.job` runs
as the job owner (`postgres`), and `supabase/functions/push-dispatch` authenticates as
`service_role`. Nothing else calls them.

**The two exceptions.** `approve_join_action` and `decline_join_action` sit in bucket B by ACL but
the app calls them for real, from `ui/lib/notifications.ts` behind the notification action
buttons. They are reachable today *only* because of the PUBLIC grant. A blanket revoke breaks the
approve and decline buttons in the notification tray. They need an explicit
`grant execute ... to authenticated` in the same migration, before the revoke. Both already check
`auth.uid()` internally, so the grant is safe. This is the kind of thing a bulk `revoke` generated
from a query would miss, which is why each bucket ships as an explicit list.

**A next**, a pure no-op that removes the redundant grant and puts the intended anon surface in one
readable list.

**C next**, a mechanical revoke of 42 names, with a read of each to confirm no anon caller exists.
The cross-check in §2 says there is none, but the read is what makes that a fact rather than a
grep result.

**D last**, one at a time, deciding per function whether it wants `authenticated` only or genuinely
wants anon. `upsert_places_venue` additionally needs a real guard inside it, not just a grant
change, and that decision belongs with venues-plan.md rather than here.

## 5. Regression guard

Without this the audit is worth one release. Two options, not mutually exclusive:

1. **A migration-time assertion.** A final migration adds a function that raises if any
   `security definer` function in `public` holds PUBLIC execute outside an explicit allowlist, and
   a CI step calls it after `supabase db reset`. Fails the build on the next migration that forgets
   the revoke.
2. **`alter default privileges ... revoke execute on functions from public`** for the migration
   role, which stops new functions being created with the grant at all. Cleaner, but it changes the
   behaviour of every future migration silently, and a developer who does not know it is set will
   write a function granted to nobody and debug a permission error instead. Worth doing, but only
   alongside a line in AGENTS.md.

Recommend both, with the CI assertion as the one that must land.

## 6. Sequence and effort

| Step | Work | Est. |
|---|---|---|
| B1 | Bucket B revoke + the two `authenticated` grants | 0.5 d |
| B2 | Bucket A revoke (no-op, documents the anon surface) | 0.25 d |
| B3 | Bucket C revoke, with a per-function read | 0.5 d |
| B4 | Bucket D, per-function decision; `upsert_places_venue` guard split out | 0.5 d |
| B5 | CI assertion + default privileges + AGENTS.md note | 0.5 d |
| B6 | Local verification, e2e run, apply to hosted | 0.25 d |

**~2.5 days.** B1 alone is 0.5 d and closes the severe half, so it is worth shipping on its own if
the rest waits.

## 7. Verification

Per bucket, against the local stack:

- Re-run the ACL audit query and confirm the bucket's functions no longer list a PUBLIC entry.
- Call one function from the bucket as `anon` and confirm `permission denied for function`.
- Call the same one as `authenticated` (or `service_role` for bucket B) and confirm it still works.
- After B1, invoke a `dispatch_*` job manually as `postgres` and confirm notifications still
  enqueue.
- Full Maestro e2e run before the hosted apply, since bucket C touches the chat, join and rating
  paths.

The audit query, for reuse:

```sql
select p.oid::regprocedure, array_to_string(p.proacl, ' ')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.prorettype <> 'trigger'::regtype
  and (
    p.proacl is null
    or exists (
      select 1 from aclexplode(p.proacl) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    )
  )
order by 1;
```

A null `proacl` means the function was never granted to anything explicitly, which in Postgres
means the default is still in force and PUBLIC can execute it. That case is easy to miss by
eyeballing grants, so it belongs in the query.

## 8. Not doing

- **Not** revoking PUBLIC on the 35 trigger functions. PostgREST does not expose them and the
  revoke would be noise.
- **Not** touching `security invoker` functions. RLS already applies to them, so PUBLIC execute
  costs nothing there.
- **Not** narrowing what bucket A returns. That surface was designed anon-safe on purpose
  (`20260820000100_game_preview_anon.sql`, `20260831000000_discover_anon.sql`) and changing it is a
  product decision, not a security one.
- **Not** rotating the anon key. It is publishable by design. The fix is that the functions behind
  it stop being callable, not that the key becomes a secret.
- **Not** adding the `upsert_places_venue` internal guard in this work. Flagged here, owned by
  venues-plan.md.
