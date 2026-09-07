// Server-rendered per-post landing page for shared /post/:id links (notifications-v2-plan.md
// §6.3 — "Feed posts are unshareable"). Same pattern as api/game/[id].js: a single serverless
// function rendering real OG tags at request time, styled to the same dark/lime brand, noindex
// since this is a share-link card, not an SEO surface.
const { esc, callRpc, shell, ctaButtons } = require("../_venue-lib");

function kindLabel(kind) {
  if (kind === "question") return "Question";
  if (kind === "looking_for_players") return "Looking for players";
  return "Post";
}

function postHero(preview) {
  const excerpt = (preview.body || "").trim();
  const where = [preview.sport_name, preview.venue_name].filter(Boolean).join(" at ");

  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F; animation:smash-pulse 1.6s ease-in-out infinite"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">${esc(kindLabel(preview.kind))}${preview.author_display_name ? ` · ${esc(preview.author_display_name)}` : ""}</span>
    </div>

    <p class="rise rise-2" style="margin:0; max-width:46ch; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(22px,6vw,30px); line-height:1.25; letter-spacing:-.02em; text-wrap:balance">${esc(excerpt.slice(0, 220))}</p>

    ${where ? `<div class="rise rise-2" style="display:flex; align-items:center; gap:6px; color:#96969E; font-size:13.5px; font-weight:600"><ion-icon name="location-outline" style="font-size:14px; color:#7A7A82"></ion-icon><span>${esc(where)}${preview.venue_suburb ? `, ${esc(preview.venue_suburb)}` : ""}</span></div>` : ""}

    <div class="rise rise-3" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center">
      <span class="stat"><ion-icon name="chatbubble-outline" style="font-size:13px; color:#96969E"></ion-icon>${preview.reply_count ?? 0}</span>
      <span class="stat"><ion-icon name="heart-outline" style="font-size:13px; color:#96969E"></ion-icon>${preview.reaction_count ?? 0}</span>
    </div>

    <p class="rise rise-3" style="margin:6px 0 0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">Log in or create an account to reply and see the rest of the thread.</p>

    ${ctaButtons()}`;
}

function notFoundHero() {
  return `
    <img src="/assets/smashio-mark.svg" alt="" class="rise rise-1" style="width:48px; height:48px; object-fit:contain" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(26px,7vw,34px); line-height:1.1; letter-spacing:-.03em">This post isn't available anymore</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">It may have been removed. Smashio's feed has plenty more from players around Sydney.</p>
    ${ctaButtons()}`;
}

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || "";
  const canonicalUrl = `https://smashio.com.au/post/${id}`;

  if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
    return res.status(404).send(shell({
      title: "Smashio - Post not found",
      description: "Smashio's feed — badminton players around Sydney sharing games, questions and looking-for-players posts.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  let preview = null;
  try {
    const rows = await callRpc("post_preview", { p_post_id: id });
    preview = Array.isArray(rows) ? rows[0] : rows;
  } catch {
    // RPC unreachable — fall through to the not-found card rather than 500ing a share link.
  }

  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");

  if (!preview || preview.status !== "visible") {
    return res.status(200).send(shell({
      title: "Smashio - Post not found",
      description: "This post isn't available anymore. Smashio's feed has plenty more from players around Sydney.",
      canonicalUrl,
      indexable: false,
      ogType: "article",
      heroContent: notFoundHero(),
    }));
  }

  const excerpt = (preview.body || "").trim().slice(0, 140);
  const title = preview.author_display_name ? `${preview.author_display_name} on Smashio` : "A post on Smashio";

  return res.status(200).send(shell({
    title: `Smashio - ${title}`,
    description: excerpt || "See this post on Smashio.",
    canonicalUrl,
    indexable: false,
    heroContent: postHero(preview),
  }));
};
