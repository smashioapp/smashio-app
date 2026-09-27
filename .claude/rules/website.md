---
paths:
  - "website/**"
  - "docs/website-plan.md"
---
# Website

- Marketing + store links + read-only SEO/share pages only. **No in-app functionality on web** (no join/host/accounts, no indexed player profiles, no multi-city pages, no build step).
- Read [docs/website-plan.md](../../docs/website-plan.md) first. Before exposing **any** new data to anonymous callers read §5: SEO surfaces get their own column-allowlisted `security definer` RPCs, never reuse app RPCs like `nearby_games_public`. DEC1-DEC4 settled (§10), don't reopen.
- Gated, not shipped: W0 (Play console change), W5 (30-day disclosure window), W9 (design-brief pass), W11 (Nov store state).
- Smashimals website half (W0/W1, cast art, `404.html`) not built; see [docs/smashimals-plan.md](../../docs/smashimals-plan.md).
- Android CTAs: internal-testing link + email capture (`website/api/subscribe.js`, `web_signups`, sources `hero_android`/`get_app_android`). A human adds tester to Play allowlist; `subscribe.js` emails hello@smashio.com.au via Resend. **Never write copy claiming open Android access.**
