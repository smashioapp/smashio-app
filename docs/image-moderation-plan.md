# Image moderation plan: one classifier for feed photos and chat photos

Written 2026-09-25. **Implemented 2026-09-25: I1, I2, I3, B3a and avatar classification (§8 Q3).**
§9 records what shipped, where it deviates from the body below, and the deploy order. B3b
(`feed_profile`) is still to build. Four owner decisions from 2026-09-25 are recorded in §7, and the
§8 answers are recorded in place.

Why this exists: [social-plan.md](social-plan.md) §13.4 held B3 (`post_media`, feed photos) on one
gate, which is that the §10 pre-publish filter only had a text path. On 2026-09-25 the owner
unheld B3 on condition that the image path gets built first, and asked for the classifier to have
its own plan, since it also covers chat photos. B3's feed-side build (the photo UI and
`feed_profile`) stays in social-plan. This doc owns the classifier, the storage, the queue, and
how each surface consumes the verdict.

Read social-plan §10 (moderation as a release gate) and §5.4 (one report queue) first.

---

## 0. What already exists

| Piece | Where | Relevance |
|---|---|---|
| Gemini vision call | `ai-proxy` `parseWithGemini` (`inline_data`, booking screenshots) | Image in, function-call out. The classifier is the same call with a different tool schema. |
| Server-side text classify | `classify_post_text()` → `ai-proxy` `mode: classify` via `http` + `ai_proxy_service_key` (`20260901070000`) | The enforcement pattern: `create_post` calls the classifier itself, so a direct RPC call can't skip it. |
| `moderation_flags` + `moderation_queue` view | `20260901050000_moderation.sql` | Service-role queue plus a dashboard view. Text-only today (`text not null`, no subject). |
| `user_reports.subject_type` | same | Already allows `'photo'` and `'message'`. No widening needed for reports. |
| Chat photos | `chat-media` bucket (`20260815000700`), `messages.approval_status` + host approval (`20260821000000`) | Private bucket keyed `{game_id}/{sender_id}/…`. Host approval is opt-in per game and is a social control, not a content filter. |
| Client downscale | `ui/lib/imagePrep.ts` (1600px long edge, JPEG 0.8) | The re-encode also drops EXIF, including GPS. Reuse it for feed photos. |
| Async HTTP from Postgres | `pg_net` (`net.http_post`) in `push_dispatch` | The pattern for chat's post-send classify. |
| Classify rate limit | `ai_proxy_classify_calls` (`20260912000600`) | Extend it to count image calls. |

What is **not** moderated by anything today: chat photos (outside the host-approval games), avatars,
venue photos (a moderation *status* exists, but no queue UI, per venues-plan A5). This plan covers
feed and chat. Avatars and venue photos are §8 open questions.

---

## 1. The classifier

New `ai-proxy` mode **`classify_image`**. It's server-to-server only (`x-service-key`, like the
`create_post` text path), with no client-facing branch, so a user can't get a photo marked clean
by calling it themselves.

Input: `{ mode: 'classify_image', bucket, paths: string[] (≤4), author_id, subject_type, subject_id? }`.
`ai-proxy` downloads each object with the service client, then classifies all of them **in parallel**
(one Gemini call per image, `Promise.all`), each under its own timeout.

Gemini tool `classify_image` returns, per image:

```
{ verdict: 'clean' | 'violating', category: 'sexual' | 'violence' | 'hate' | 'spam' | 'personal_info' | 'other' | null,
  confidence: number /* 0..1 */ }
```

`personal_info` covers photos of IDs, cards and other people's contact details. Spam covers
screenshots of scam text and QR codes to off-app payment. The prompt treats all image text as
untrusted, the same rule as the text classifier.

**Decision rule (owner, 2026-09-25): the AI decides first, and only low-confidence verdicts go to a
human.**

| Gemini says | Outcome | `media_status` |
|---|---|---|
| clean, confidence ≥ **0.8** | Shown | `visible` |
| violating, confidence ≥ **0.8** | Blocked, flag row written for the trail | `rejected` |
| either verdict, confidence < 0.8 | Hidden from others, queued for review | `review` |
| timeout / error / unreachable | Per surface, see §2 and §3 | n/a |

The 0.8 threshold is a starting point. §6 makes it tunable without a deploy (a row in a config
table read by `ai-proxy`), and the S8-style read-out in §6 is how it gets moved.

**Budget:** 4 s Gemini timeout per image (images run slower than text's 2 s), and the calling
Postgres `http` timeout is 10 s to leave margin. That's the same lesson as the text path, where a
Postgres timeout close to the internal one raced it and published flagged content.

---

## 2. Feed photos (B3 `post_media`), synchronous

Up to **4 photos** on `looking_for_players` and `question` posts (owner, 2026-09-25).

Flow:

1. The composer picks up to 4 photos, runs each through `imagePrep`, and uploads to a new private
   bucket **`post-media`** at `{author_id}/{uuid}.jpg`. The storage insert policy is
   own-folder-only, with a 5 MB object cap and `image/jpeg` only.
2. `create_post` gains `p_media_paths text[]`. It checks every path starts with
   `auth.uid()/`, that there are ≤4, and that each path is unused, then classifies the **text** (as
   today) and then the **images** in a single `classify_post_images()` call to `ai-proxy`.
3. Per the verdicts:
   - **Any image confidently `violating`:** the whole post is refused, same exception and copy
     as flagged text. A post that attaches a violating photo shouldn't publish its text either.
   - **Timeout, error or unreachable (owner: "only text gets posted"):** the post publishes with
     its text only. The photos aren't attached, a `moderation_flags` row records
     `classify_timeout`, and `create_post` returns `photos_dropped = true` so the composer says
     *"Posted, but we couldn't check your photos in time. Give them another go."* The
     uploaded objects are deleted by the orphan sweep (step 5).
   - **Otherwise:** a `post_media` row per image, `media_status` `visible` or `review`.
     `review` photos are shown to the author only, with a small "Being checked" state.
4. A reviewer's decision (§4) flips `review` → `visible` or `rejected`. Rejected photos are hidden
   from everyone, including the author, whose card shows *"One photo was removed, it didn't fit our
   guidelines."*
5. **Orphan sweep:** an hourly `pg_cron` job deletes `post-media` objects older than 24 h with no
   `post_media` row, and objects whose row is `rejected` after 30 days (kept that long for appeals
   and the trail).

`post_media` as social-plan §5.3 drafted it, plus `media_status text not null check (media_status
in ('visible','review','rejected'))`, `classifier_category`, `classifier_confidence`. Reading:
RLS allows the row, and a signed URL, when the parent post is readable (visible, not
`blocked_between`) **and** (`media_status = 'visible'` or the reader is the author). The storage
select policy mirrors that through a `security definer` helper, the same shape as chat-media's
`is_approved_player`.

Rate limit: the 10 posts/day limit already caps photos at 40/day/user. No new limit is needed on
the feed side.

---

## 3. Chat photos, asynchronous

Owner, 2026-09-25: yes, async. Chat send must not wait on Gemini. Chat is a roster of people who've
met or are about to, so a photo shown for a few seconds before classification is an acceptable
trade in exchange for sends staying instant.

1. `messages` gains `moderation_status text not null default 'unchecked' check (… in
   ('unchecked','clean','review','removed'))`. Only `kind = 'image'` rows ever leave `unchecked`.
2. An `AFTER INSERT` trigger on image messages calls `net.http_post` (fire and forget, as
   push-dispatch does) to `ai-proxy` `classify_image` with `subject_type='message'`,
   `subject_id=message.id`, `bucket='chat-media'`.
3. `ai-proxy` writes the verdict back with the service client:
   - confident clean → `clean`
   - confident violating → `removed`. The photo disappears for everyone except the sender, who
     sees *"Photo removed, it didn't fit our guidelines."* A flag row is written.
   - low confidence → `review`. **The photo stays visible** (it's already been seen, and pulling it
     would read as a bug) and is queued. A reviewer can still remove it.
   - timeout/error → stays `unchecked`, with a `classify_timeout` flag row. It doesn't get
     retried automatically: chat photos are short-lived and the queue is the backstop.
4. The messages select policy adds `and moderation_status <> 'removed'` to the non-sender branch.
   The client already subscribes to message updates over Realtime, so a removal lands live.
5. Host approval (`chat_photo_approval`) is unchanged and independent. A photo has to pass both
   gates to be seen by non-hosts.

Rate limit: 50 chat photos/day/user, counted in `ai_proxy_classify_calls` with a `kind` column.
Over the limit, the send is refused (*"That's a lot of photos today, try again tomorrow."*), which
also caps Gemini spend from a looping client.

---

## 4. The human queue

- `moderation_flags` becomes general: `text` becomes nullable, and it gains `subject_type`
  (`post`, `post_media`, `message`), `subject_id`, `storage_path`, `category`, `confidence`. Existing
  rows default to `subject_type='post'`.
- `moderation_queue` (the dashboard view) includes the new columns, so a reviewer can see what the
  flag is attached to and open the image (dashboard storage browser, service role).
- **Resolve action:** a service-role-only function `resolve_media_flag(p_flag_id, p_action in
  ('approve','remove'))` flips the subject's status and closes the flag. Callable from the SQL
  editor. No in-app admin UI yet, same as §10 item 5's text queue.
- **SLA:** the 24-hour target from social-plan §10 item 5 applies. Feed `review` photos are
  invisible to others until someone acts, so a slow queue only costs the author a photo, never
  exposes anyone.

---

## 5. Build order and effort

| # | Slice | Est. |
|---|---|---|
| I1 | `ai-proxy` `classify_image` mode + tests, threshold config row, `moderation_flags`/queue widening, `resolve_media_flag` | 1 d |
| I2 | Chat async path: `moderation_status`, trigger via `pg_net`, write-back, policy change, client "removed" state, 50/day limit | 1 d |
| I3 | `post-media` bucket + policies, `post_media` table, `create_post(p_media_paths)`, sync classify, orphan sweep cron | 1 d |
| B3a | Feed UI (social-plan): composer picker (4), card grid, full-screen viewer, "being checked"/"removed" states, report photo | 1.5 d |
| B3b | `feed_profile` + profile "Posts" section, `player_card` gating incl. host carve-out (social-plan §6.3, §7 rules) | 1 d |

About **5.5 d**. The order is I1 → I2 → I3 → B3a → B3b. I2 goes before I3 because chat photos
are already live and unmoderated, so that's the existing exposure to close first. B3a can't ship
before I3.

Deploy notes: every new function needs explicit grants (AGENTS.md 2026-09-14 default-privilege
rule). `classify_post_images` and `resolve_media_flag` get **no** `anon`/`authenticated` grant, and
the trigger helpers are `security definer`. `create_post` changes signature, so it's a drop and
recreate with a re-grant to `authenticated`. Account deletion (`delete-account`) must remove the
user's `post-media` objects, per social-plan B7's tombstoning rule.

---

## 6. Measure it

- `moderation_flags` already gives per-category counts. Add a weekly look at: share of images
  landing in `review` (if above ~10%, the threshold is too high or the prompt too twitchy),
  reviewer overturn rate on `review` items (if nearly all get approved, lower the threshold), and
  p95 classify latency from `ai-proxy` logs (if feed p95 goes above ~5 s, the
  "only text gets posted" path is firing too often).
- The threshold lives in a one-row `moderation_config` table (service-role only) so it can move
  without a deploy.

---

## 7. Decisions

**Taken 2026-09-25 (owner):**

| # | Decision |
|---|---|
| IM1 | The AI classifier decides first. Only low-confidence verdicts go to admin moderation. |
| IM2 | On a feed-post timeout, only the text gets posted. Photos are dropped and the author is told. |
| IM3 | Up to 4 photos per post, on both `looking_for_players` and `question`. `feed_profile` is in the same build. |
| IM4 | Chat photos get the classifier too, asynchronously. The classifier gets its own plan (this doc). |

---

## 8. Open questions

**Answered 2026-09-25 (owner):** Q1, Q2 and Q5 as recommended, Q3 yes (built in this round), Q4
not taken (venue photos stay held with A5).

1. **Threshold 0.8?** Recommend starting there and moving it off the §6 overturn rate.
   *Answered: 0.8, in `moderation_config`.*
2. **Chat `review` photos: stay visible (this doc) or hide pending review?** Recommend visible,
   since the roster has already seen it and pulling it looks broken. `removed` still hides.
   *Answered: visible.*
3. **Avatars.** A profile photo reaches every stranger who sees a game roster, which is a wider
   audience than chat. It isn't classified today. Recommend running the same classifier
   synchronously on avatar upload as a follow-up slice (~0.5 d), in scope for App Store 1.2.
   *Answered: yes, shipped with I1-I3, see §9.*
4. **Venue photos (venues-plan A5).** The queue UI was deferred. Recommend routing uploads through
   `classify_image` so the A5 queue only ever sees low-confidence items, then keeping A5 held.
   *Not taken this round.*
5. **Re-adding dropped photos.** IM2 drops photos on timeout. Should a post be editable to re-attach
   them, or does the author just post again? Recommend posting again for v1, since there's no
   post editing today. *Answered: post again.*

---

## 9. What shipped (2026-09-25)

Migrations `20260925000000_image_moderation_core.sql` (I1 + I2), `20260925000100_post_media.sql`
(I3), `20260925000200_avatar_moderation.sql` (avatars, `resolve_media_flag`, sweep).
`ai-proxy` gains the `classify_image` mode, `purge-confirmations` gains `type: 'media'`,
`delete-account` removes the user's `post-media` folder. App: composer photo picker (up to 4),
`PostPhotoGrid` on feed cards and question detail, full-screen viewer with "Report photo"
(`report_content`, subject `photo`), "Being checked" and "removed" states, chat "Photo removed"
for the sender, and avatar upload through `set_avatar_photo`. pgTAP coverage in
`supabase/tests/image_moderation_test.sql`.

**Deviations from the body:**

- **One 7 s call, not 10 s sequential (§1, §2).** Hosted `authenticated` runs with
  `statement_timeout = 8s`, and the classify call happens inside the `create_post` statement, so a
  10 s Postgres timeout could never be reached. `create_post` with photos makes one
  `classify_images()` call, and `ai-proxy` classifies the text and every image **in parallel**
  (2 s text, 4 s per image). The Postgres `http` timeout is 7 s. Posts with no photos still use
  `classify_post_text` unchanged.
- **IM2 is per photo.** If one photo times out and the others come back, the checked ones attach and
  only the unchecked ones drop. `photos_dropped` is a count, not a boolean. If `ai-proxy` itself
  is unreachable, every photo drops and the text posts (fails open with a flag, as before).
- **`create_post` returns jsonb** `{post_id, photos_dropped, photos_in_review}` instead of a uuid.
- **Avatars fail closed.** Unreachable classifier = `set_avatar_photo` returns `unavailable` and the
  old avatar stays. A low-confidence avatar stays off the profile until `resolve_media_flag`
  approves it (the path lives on the flag row, not on `profile_private`, which is client-writable).
  `profiles.photo_path` can now only be set by a security definer function (clients can still
  clear it). Avatar storage reads are limited to live avatars and your own folder, overwrites are
  gone, and re-uploading under a live name is refused (otherwise delete-then-reupload would skip
  the classifier).
- **Chat removal and signed URLs.** A removed photo can't get a new signed URL
  (`chat_media_is_removed` in the storage policy), but URLs minted before the removal stay valid
  until they expire (up to 1 h). Those readers had already loaded the photo. Realtime applies RLS
  to updates, so other readers don't get a live "removed" event; the row drops out on next fetch.
- **Chat rate limit counts `messages`**, not `ai_proxy_classify_calls` (it's a send limit, and the
  send is what gets refused). Image classify calls are still logged there with `kind = 'image'`.
- **Gemini safety block = review**, not reject or fail open: a refusal to look is a signal, so it
  goes to a human at confidence 0.5.
- **Orphan sweep via the Storage API.** SQL can't free a storage blob, so
  `media_sweep_candidates()` lists what to delete and `purge-confirmations` (`type: 'media'`,
  hourly pg_cron) removes it. Unattached uploads that carry a flag from the last 30 days are kept
  for the trail.
- **`ai_proxy_url` Vault override**, same pattern as `push_dispatch_url`, so a local stack can
  exercise both the text and image classifiers.

**Deploy order:** migrations first, then `ai-proxy` + `purge-confirmations` + `delete-account`,
then the app (OTA). Between the migration and the OTA, an old client's avatar upload fails
(overwrite of `avatar.jpg` and the direct `photo_path` write are both refused now) and the old
composer still works (the new `p_media_paths` has a default).

**Reviewer queue:** `select * from moderation_queue where storage_path is not null;`, open the
object in the dashboard storage browser, then `select resolve_media_flag('<flag id>', 'approve' |
'remove');`.
