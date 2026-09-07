import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import { supabase } from "./supabase";
import { track } from "./analytics";

// notifications-v2-plan.md §6.1: one module for every "share a game" (and venue/post/profile/
// achievement/invite/referral) call site, replacing four separate implementations that each had
// their own copy and their own bugs. §6.5's rule stays: iOS surfaces `message` and `url` as two
// separate share items (a target that renders both shows the link twice if it's baked into the
// text too), Android gets one string with the link appended once.

export type ShareableGame = {
  id: string;
  venue: string;
  date: string;
  time: string;
  sportName?: string | null;
};

// §1.7: every sport string here used to be the literal "badminton" — an AGENTS.md violation
// (sport is a config/data concern). Cached in-module since it's the same lookup on every share.
let cachedSportName: string | null = null;
async function sportName(fallback?: string | null): Promise<string> {
  if (fallback) return fallback;
  if (cachedSportName) return cachedSportName;
  const { data } = await supabase.from("sports").select("name").eq("slug", "badminton").maybeSingle();
  cachedSportName = data?.name ?? "a game";
  return cachedSportName;
}

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// §6.3: every share link carries UTM-style attribution so a future pass can tell which surface
// actually acquires/re-engages users — reusing referral.ts's existing capture shape (`r` = sharer
// id) rather than inventing a second convention.
async function withAttribution(url: string, kind: string): Promise<string> {
  const sharerId = await currentUserId();
  const params = new URLSearchParams({ s: kind, ...(sharerId ? { r: sharerId } : {}) });
  return `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;
}

// https://smashio.com.au/game/<id> — Universal Link, not smashio:// custom scheme. Custom schemes
// aren't reliably tappable in share targets and dead-end with no app installed. The https link
// opens the app directly on iOS (associatedDomains + AASA at
// website/.well-known/apple-app-site-association) and falls back to the marketing site otherwise
// (website/vercel.json rewrites /game/:id -> /api/game/:id).
export async function shareGame(game: ShareableGame) {
  const sport = await sportName(game.sportName);
  const url = await withAttribution(`https://smashio.com.au/game/${game.id}`, "game");
  const text = `Come play ${sport} at ${game.venue}, ${game.date} ${game.time}.`;
  try {
    const result = await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text} — ${url}` }
    );
    if (result.action === Share.sharedAction) track("share_sent", { kind: "game", game_id: game.id });
  } catch {
    // Share.share rejects on user-cancel on some platforms — a normal dismissal, not an error.
  }
}

// design-brief Prompt 7a's host-only quick-invite chip: copies the same text the ordinary share
// sheet sends, then opens Share too — WhatsApp's own share target strips a bare link's preview
// card if it isn't already on the clipboard when the picker opens.
export async function copyGameLinkForWhatsApp(game: ShareableGame) {
  const sport = await sportName(game.sportName);
  const url = await withAttribution(`https://smashio.com.au/game/${game.id}`, "game_whatsapp");
  const text = `Come play ${sport} at ${game.venue}, ${game.date} ${game.time} — ${url}`;
  await Clipboard.setStringAsync(text);
  try {
    const result = await Share.share({ message: text });
    if (result.action === Share.sharedAction) track("share_sent", { kind: "game_whatsapp", game_id: game.id });
  } catch {}
}

export async function shareVenue(id: string, name: string) {
  const url = await withAttribution(`https://smashio.com.au/venue/${id}`, "venue");
  try {
    const result = await Share.share({ message: `Check out ${name} on Smashio`, url });
    if (result.action === Share.sharedAction) track("share_sent", { kind: "venue", venue_id: id });
  } catch {}
}

// §6.3: the feed's missing share surface — app has /post/:id, website gained /post/:id alongside
// this (website/api/post/[id].js).
export async function sharePost(id: string, excerpt?: string | null) {
  const url = await withAttribution(`https://smashio.com.au/post/${id}`, "post");
  const text = excerpt ? `"${excerpt.slice(0, 80)}" — on Smashio` : "Check out this post on Smashio";
  try {
    const result = await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text}: ${url}` }
    );
    if (result.action === Share.sharedAction) track("share_sent", { kind: "post", post_id: id });
  } catch {}
}

export async function shareProfile(id: string, displayName: string) {
  const url = await withAttribution(`https://smashio.com.au/player/${id}`, "profile");
  try {
    const result = await Share.share({ message: `${displayName} on Smashio`, url });
    if (result.action === Share.sharedAction) track("share_sent", { kind: "profile", profile_id: id });
  } catch {}
}

// F7's natural pairing — the only notification in the system whose correct call to action is
// "show someone". No dedicated web page for an achievement yet, so this shares the profile link
// with achievement-flavoured copy rather than a 404.
export async function shareAchievement(profileId: string, achievementLabel: string) {
  const url = await withAttribution(`https://smashio.com.au/player/${profileId}`, "achievement");
  try {
    const result = await Share.share({ message: `I just unlocked "${achievementLabel}" on Smashio`, url });
    if (result.action === Share.sharedAction) track("share_sent", { kind: "achievement" });
  } catch {}
}

// ReservedSpots' held-spot invite link — already minted server-side (createInvite), just needs
// the same copy-then-share shape as copyGameLinkForWhatsApp.
export async function shareInvite(link: string) {
  await Clipboard.setStringAsync(`Here's your spot: ${link}`);
  try {
    const result = await Share.share({ message: `Here's your spot: ${link}` });
    if (result.action === Share.sharedAction) track("share_sent", { kind: "invite" });
  } catch {}
}

// Carries the sharer's id so the link can be credited (profile-plan.md P5) — captured by
// onboarding/index.tsx and attributed on next sign-in (lib/referral.ts). No specific sport or
// game to name here, so the copy stays sport-agnostic rather than hardcoding one.
export async function shareReferral(referrerId: string) {
  const url = Linking.createURL("onboarding", { queryParams: { ref: referrerId } });
  const text = "Come play with me on Smashio — find local games and join in:";
  try {
    const result = await Share.share(
      Platform.OS === "ios" ? { message: text, url } : { message: `${text} ${url}` }
    );
    if (result.action === Share.sharedAction) track("share_sent", { kind: "referral" });
  } catch {}
}
