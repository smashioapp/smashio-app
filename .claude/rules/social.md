---
paths:
  - "ui/app/(tabs)/feed*"
  - "ui/app/compose*"
  - "ui/app/post/**"
  - "ui/lib/queries/feed.ts"
  - "ui/lib/queries/follows.ts"
  - "docs/social-plan.md"
  - "docs/image-moderation-plan.md"
---
# Social / feed / moderation

- Read [docs/social-plan.md](../../docs/social-plan.md) §0 and §17 first (§17 = ten decisions, overrides body text). Nav order is `Discover | Feed | My Games | Profile`; don't re-propose moving My Games under Profile (§13.5) or a read-only checkpoint (§13.2).
- Feed shipped: `looking_for_players` + `question` posts only (plain `text` posts cut, `20260901110000`), replies + reactions shipped. Booking outreach (§12) deferred. C1+ stays behind the §1 trigger. Don't propose gear marketplaces, pro-content feeds or in-app booking without reading §16.
- `blocks`, `user_reports`, `profile_visibility` shipped in `20260822000000_profile_settings.sql` in a different shape than first proposed; §0 is the reconciliation.
- App Store 1.2 already applies via chat; posts widen an existing obligation.
- Image moderation ([docs/image-moderation-plan.md](../../docs/image-moderation-plan.md)): I1-I3, B3a (feed photo UI, up to 4/post) and avatar classification **shipped 2026-09-25** (smashioapp/smashio-app#11; migrations `20260925000000`-`000200`, `ai-proxy` v13, `purge-confirmations` v5, `delete-account` v6, app by OTA). B3b (`feed_profile`) still to build. Read its §9 for the deviations: one parallel 7 s classify call (`authenticated` has an 8 s statement timeout), `create_post` returns jsonb, `profiles.photo_path` only settable via `set_avatar_photo`. Read it before touching `post_media`, `post-media`/`chat-media` storage, `moderation_flags`, `messages.moderation_status`.
