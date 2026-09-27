-- Pre-launch security review 2026-09-27, M1 part 2 (docs/security-audit-2026-09-27.md, local only).
-- Serves gtm-strategy.md §13 launch readiness.
--
-- Column-narrows profiles for REST reads. usual_nights + home_venue_id + home_suburb together
-- say where and when someone plays; referred_by says who invited whom. Other people's values
-- come through player_card (which applies show_suburb and visibility); your own row comes
-- through my_profile(), your referrals through my_referrals(), attribution through
-- set_referrer() (all added in _b).
--
-- DEPLOY ORDER: hosted push only AFTER the client OTA that switched useProfile to my_profile()
-- is live. Older bundles select("*") on profiles and would fail on these columns.

revoke select on public.profiles from anon, authenticated;
grant select (
  id, display_name, photo_path, reliability_score, created_at, deleted_at, timezone,
  profile_visibility, show_suburb, distance_units, avatar_key, follower_count, following_count,
  about_you, referral_code
) on public.profiles to authenticated;
