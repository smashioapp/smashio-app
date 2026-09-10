// website-plan.md W3 — live data for the home page hero ticker (fixes D1: the hero used to show
// hand-written fake game cards). JSON endpoint rather than folding the whole home page into a
// server-rendered function like sydney.js/venue/[slug].js, because index.html is still a static
// file with no build step (D11/W9 — unifying it onto the shared shell is its own slice). Kept
// same-origin so the browser never touches the Supabase anon key directly (§5.5 T3).
const { callRpc } = require("./_venue-lib");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Highest-traffic live surface per plan §5.6.
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=86400");

  let games = [];
  try {
    games = await callRpc("games_seo_feed", { p_limit: 6 });
  } catch {
    games = [];
  }

  let stats = null;
  try {
    stats = await callRpc("city_seo_stats", {});
  } catch {
    stats = null;
  }

  return res.status(200).json({
    games: games.map((g) => ({
      venue_name: g.venue_name,
      venue_suburb: g.venue_suburb,
      starts_at: g.starts_at,
      skill_tier_label: g.skill_tier_label,
      open_spots: g.open_spots,
      cost_per_player_cents: g.cost_per_player_cents,
    })),
    stats,
  });
};
