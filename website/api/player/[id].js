// website-plan.md W10 — replaces the 31-line player.html stub. Every /player/:id share link
// from the app (ui/lib/share.ts shareProfile) used to land on a shell with no idea who or what it
// was about. This still can't show who — §5.4 puts display names, handles, avatars and photos on
// the "never on an anonymous page" side of the line, no exception for a share target — so the
// card stays aggregate-only: how long they've played, how many games, which sports. Always
// noindex and never in the sitemap (robots.txt also disallows /player/ explicitly): indexing an
// aggregate-only card with no name is thin content with nothing for a search result to say.
const { esc, callRpc, shell, ctaButtons } = require("../_venue-lib");

function notFoundHero() {
  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Shared profile link</span>
    </div>
    <img src="/assets/smashio-mark.svg" alt="" class="rise rise-2" style="width:48px; height:48px; object-fit:contain" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(26px,7vw,34px); line-height:1.1; letter-spacing:-.03em">Open this profile in Smashio</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">This link points to a player profile on Smashio, a badminton game-matching app for Sydney. Install the app to see who it is.</p>
    ${ctaButtons()}`;
}

function privateHero() {
  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Shared profile link</span>
    </div>
    <img src="/assets/smashio-mark.svg" alt="" class="rise rise-2" style="width:48px; height:48px; object-fit:contain" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(26px,7vw,34px); line-height:1.1; letter-spacing:-.03em">This is a Smashio player</h1>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">They've kept their profile visible to other players only. Sign in to the app to see it.</p>
    ${ctaButtons()}`;
}

function playerHero(p) {
  const sports = Array.isArray(p.sports) && p.sports.length > 0 ? p.sports.join(" & ") : "Badminton";
  return `
    <div class="rise rise-1" style="display:flex; align-items:center; gap:8px; background:rgba(214,255,63,.10); border:1px solid rgba(214,255,63,.22); padding:7px 14px; border-radius:100px">
      <span style="width:6px; height:6px; border-radius:50%; background:#D6FF3F"></span>
      <span style="font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#D6FF3F">Shared profile link</span>
    </div>
    <img src="/assets/smashio-mark.svg" alt="" class="rise rise-2" style="width:48px; height:48px; object-fit:contain" />
    <h1 class="rise rise-2" style="margin:0; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:clamp(26px,7vw,34px); line-height:1.1; letter-spacing:-.03em">A Smashio player since ${esc(p.member_since_year)}</h1>
    <div class="rise rise-3" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center">
      <span class="stat"><ion-icon name="podium-outline" style="font-size:14px; color:#96969E"></ion-icon>${esc(sports)}</span>
      <span class="stat"><ion-icon name="checkmark-done-outline" style="font-size:14px; color:#D6FF3F"></ion-icon><span style="color:#D6FF3F">${esc(p.games_played)} game${p.games_played === 1 ? "" : "s"} played</span></span>
    </div>
    <p class="rise rise-3" style="margin:0; max-width:42ch; font-size:14.5px; line-height:1.6; color:#96969E">Install Smashio to see their full profile, ratings, and games in common.</p>
    ${ctaButtons()}`;
}

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");

  if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
    return res.status(404).send(shell({
      title: "Smashio - Player not found",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  let p = null;
  try {
    p = await callRpc("player_seo", { p_id: id });
  } catch {
    // Supabase unreachable — fall through to the not-found card rather than 500ing a share link.
  }

  if (!p || !p.exists) {
    return res.status(200).send(shell({
      title: "Smashio - Player not found",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: notFoundHero(),
    }));
  }

  if (!p.visible) {
    return res.status(200).send(shell({
      title: "Smashio - Player profile",
      description: "Smashio finds badminton games happening near you tonight in Sydney.",
      indexable: false,
      heroContent: privateHero(),
    }));
  }

  return res.status(200).send(shell({
    title: "Smashio - Player profile",
    description: `A Smashio player since ${p.member_since_year}. Smashio finds badminton games happening near you tonight in Sydney.`,
    indexable: false,
    heroContent: playerHero(p),
  }));
};
